# Pitfalls Research

**Domain:** Proactive knowledge & onboarding — adding automatic session-start recall, project onboarding scanning, workflow rules, smart context scoping, user preference accumulation, and knowledge correction to an existing MCP memory server
**Project:** Myco v6.0 Proactive Knowledge & Onboarding
**Researched:** 2026-03-27
**Confidence:** HIGH (pitfalls derived from verified MCP hook behavior, existing Myco codebase constraints, published research on agent memory UX, and documented MCP protocol limitations)
**Scope:** Adding proactive features to the existing better-sqlite3 + sqlite-vec + Ollama + Hono system. Existing system has: remember/recall/query/forget tools, project namespace column, approval queue, entity/observation/relationship graph, SessionStart hooks (via .gsd hooks), WAL mode SQLite.

---

## Critical Pitfalls

Mistakes that cause user abandonment, context window exhaustion, or trust collapse in the proactive system.

---

### Pitfall 1: Context Window Bloat from Uncapped Session-Start Injection

**What goes wrong:**
The `myco_context` SessionStart hook reads the current project from the working directory, queries the graph for relevant entities/preferences/rules, and writes to stdout, which Claude Code injects verbatim into every new session context. If the project graph has grown over weeks of use (200+ entities, 50+ workflow rules, 30+ preferences), the injected block can consume 8,000-20,000 tokens before the user writes a single character. This eats into the effective context window for actual work, increases cost per session, and — critically — triggers "context rot" where Claude starts ignoring injected information buried deep in a long context.

Research on LLM context degradation confirms that models exhibit measurable performance drops when relevant information is distributed across very long contexts. The injected block becomes invisible noise rather than useful signal.

**Why it happens:**
The hook is designed to be "comprehensive" — "more context = better recall" feels intuitively correct. Developers query broadly and dump everything. There is no token budget enforced at the query level.

**How to avoid:**
- Hard cap the session-start injection at **1,500 tokens** (approximately 6,000 characters). This is a design constraint, not an implementation detail — build the cap into the query that feeds the hook, not as a truncation at the end.
- Prioritize by recency and relevance: workflow rules first (most actionable), then preferences (most persistent value), then top 5 project facts by recent access. Never dump full observation text — use entity name + summary only.
- If the project has more than the cap allows, surface a one-line "More context available — call `myco recall` for details" note instead of silently truncating.
- Keep the hook fast: the `SessionStart` hook documentation explicitly warns it runs on every session start. SQLite query latency for the injected context must be under 50ms. Use prepared statements and indexed queries only.

**Warning signs:**
- Sessions feel sluggish after onboarding populates the graph — startup hook is doing expensive embedding searches.
- The user's first assistant turn contains an apology for having forgotten something that was in the injected block — context rot has kicked in.
- `wc -c` on hook output exceeds 8,000 bytes.

**Phase to address:** Automatic Session-Start Recall phase. The token budget and priority ordering must be defined in the design spec before any injection query is written. This cannot be retrofitted easily — changing what gets injected requires re-evaluating all downstream behavior.

---

### Pitfall 2: Wrong Working Directory Kills Context Scoping

**What goes wrong:**
Smart context scoping assumes `process.cwd()` in the SessionStart hook reflects the Claude Code session's working directory. This assumption breaks in multiple real-world scenarios:

1. **Global MCP server processes**: The Myco MCP server is a long-running background process started once. Its `process.cwd()` is wherever it was launched (often `$HOME`), not the current project directory.
2. **Hook subprocess CWD**: The SessionStart hook script inherits the CWD from the Claude Code launcher, but this is the Claude Code binary's launch directory — not necessarily the project the user is working in.
3. **Claude Code passed an explicit path**: `claude --project /path/to/myco` — the hook CWD may be different from the project path.

Multiple open issues in the MCP ecosystem confirm this is a known failure mode: MCP servers launched via package managers (uvx, npx) run inside sandbox processes with `~/.cache/...` as their CWD, not the user's project.

**Why it happens:**
Developers test the hook in a single-project scenario where they always `cd` to the project before launching Claude. Multi-project reality breaks the assumption. The MCP protocol provides no standard mechanism for the client to pass its working directory to the server.

**How to avoid:**
- The SessionStart hook script should pass `$PWD` (the shell's CWD at hook invocation time) explicitly as a command argument to the `myco` CLI, not rely on `process.cwd()` inside the Node.js process.
- Design the project detection to gracefully degrade: if no project matches the CWD, inject global preferences only (zero project-scoped context). Never fail or inject wrong-project context.
- Add a `MYCO_PROJECT` environment variable override that takes precedence over CWD-based detection. Users can set this in `.envrc` files for complex project structures.
- Test with a monorepo scenario: `CWD = /path/to/monorepo/packages/frontend` should match the `myco-monorepo` project, not fail to match.

**Warning signs:**
- User reports Myco is "injecting the wrong project's rules" — CWD detection is matching a parent directory or adjacent project.
- The hook injects global-only context even when working inside a known project — CWD is not being passed to the detection logic.
- Running `myco status` from the project directory returns a different project than the hook injects at session start.

**Phase to address:** Smart Context Scoping phase. CWD detection must be validated end-to-end in the hook execution environment before any session-start injection feature ships. Test in: bare terminal launch, `claude .` in project root, `claude .` in subdirectory, and launched from a different directory with an explicit path.

---

### Pitfall 3: Onboarding Scans That Are Slow, Noisy, or Both

**What goes wrong:**
The `myco init` onboarding walkthrough scans the codebase to infer project knowledge. Two failure modes exist and they pull in opposite directions:

**Too slow**: Reading all files with Ollama embedding + LLM extraction takes minutes for a medium project (100+ files). The user walks away or kills it. Real-world codebase indexing tools note that startup performance is a common failure point — systems that process the Linux kernel (28M LOC) in 3 minutes use RAM-first processing with LZ4 compression, a level of optimization far beyond a first implementation.

**Too noisy**: An LLM scanning code produces ghost entities (hallucinated architectural claims), brittle version-number facts ("uses React 18.2.0"), and micro-observations that pollute the graph ("src/utils/helpers.ts exports 3 functions"). These are worse than missing knowledge because they actively mislead recall.

The v5.0 PITFALLS research already documents the ghost entity problem for auto-extraction. Onboarding scans apply the same risk to a larger input surface.

**Why it happens:**
- "More scanning = more knowledge" feels correct. Developers scan everything.
- LLM extraction prompts are tuned for accuracy on clean text, not code. Code has unusual token distributions — import statements, version strings, and variable names all look like entity candidates.
- The initial implementation does not set quality thresholds because "it's just a first pass."

**How to avoid:**
- Limit `myco init` scanning to three artifact types: README files, CLAUDE.md / project instruction files, and package.json/pyproject.toml manifest files. These contain human-written, high-signal project knowledge. Skip source files entirely in v6.0.
- Set a hard scan timeout of 30 seconds. Surface partial results with a "scan incomplete" flag rather than running indefinitely.
- All onboarding-inferred entities must default to `confidence = 0.6` and route through the approval queue for human review before entering the graph. Never auto-approve onboarding inferences.
- Present the inferred knowledge as a batch summary for one-shot approval, not as hundreds of individual queue items. The user reviews the whole set and approves or rejects by category.

**Warning signs:**
- `myco init` takes more than 60 seconds on a TypeScript project with 200 files — scope is too broad.
- After onboarding, `recall "architecture"` returns function names and import paths — extraction granularity is too fine.
- The approval queue has 80+ items after a single `myco init` run — the user will abandon the queue entirely.

**Phase to address:** Project Onboarding phase. The scan scope constraints must be in the design spec before scanning code is written. Expanding scan scope later (adding source file analysis) is a separate feature addition, not scope creep recovery.

---

### Pitfall 4: Stale/Wrong Knowledge Is Harder to Fix Than Missing Knowledge

**What goes wrong:**
An agent using Myco will act on injected context confidently. If a workflow rule says "run tests before committing" but the project switched to a CI-only test model six months ago, the agent will keep running local tests unnecessarily. The user does not notice until they see wasted time and ask "why is it doing that?" At that point they must: (1) know the rule exists, (2) know where to find it, (3) know how to supersede it, and (4) trust that it's actually gone. This is a 4-step friction path for every piece of stale knowledge.

The deeper problem: an incorrect preference (e.g., "user prefers verbose comments") applied across all projects generates actively harmful output in projects where terse code is the convention. Missing knowledge is neutral — the agent falls back to defaults. Wrong knowledge is adversarial — the agent confidently does the wrong thing with no obvious signal that memory is the cause.

Published research on agent memory confirms this failure mode: "the system's confidence becomes inversely correlated with its reliability" when stale retrieved context is used in personalization.

**Why it happens:**
- Knowledge correction is designed after the fact, once the system is already populating the graph. The correction UX is treated as a secondary feature.
- Superseded observations remain in the graph with `valid_until` set but still appear in some query paths when filters are too permissive.
- There is no "last verified" timestamp on facts — knowledge becomes stale silently with no indicator.

**How to avoid:**
- Treat knowledge correction as a first-class v6.0 requirement, not a nice-to-have. The `myco update` / "I changed my mind" flow must be designed before proactive injection ships, because injecting uncorrectable knowledge is worse than injecting nothing.
- The correction flow must: (a) semantically search for related entities/observations, (b) show matching facts with their source and age, (c) allow the user to mark selected facts as superseded in a single command. Minimum viable: `myco update "I no longer use verbose comments"` → shows matching observations → user confirms → they are soft-retired.
- Add `last_verified_at` and `verified_by` columns to observations. Onboarding-inferred facts start with `last_verified_at = NULL` (unverified). Facts explicitly confirmed by the user get `last_verified_at = now`. Session-start injection should surface the age of injected knowledge ("This rule was last verified 47 days ago").
- For workflow rules specifically, add an `active: boolean` flag. Rules can be disabled without deletion, making "turn this off" a one-step action rather than a search-and-supersede flow.

**Warning signs:**
- The user reports "it keeps doing X even though I told it to stop" — the old observation was superseded in text but the entity remains in a retrieval path.
- Onboarding-inferred facts have no `last_verified_at` timestamp — there is no way to know how stale they are.
- A `recall "preferences"` returns contradictory facts (old preference + new preference both visible) — the supersession mechanism is not filtering correctly.

**Phase to address:** Knowledge Correction & Evolution phase — but the `last_verified_at` column and `active` flag for workflow rules must be added in the Onboarding phase schema work, before any knowledge is injected. Retrofitting audit timestamps onto existing observations requires a migration and backfill.

---

### Pitfall 5: Workflow Rules That Are Too Rigid or Too Vague to Be Actionable

**What goes wrong:**
Workflow rules stored as graph entities must be precise enough to be acted on without being so prescriptive that they break when context changes. Two failure modes:

**Too vague**: "Follow best practices for this project" or "Be careful with database changes" — the agent cannot operationalize these. They consume tokens in the session-start injection with zero behavioral change.

**Too rigid**: "Always run `npm run test:unit` before every commit" — when the project switches to a monorepo with package-level test commands, this rule is incorrect. The agent either follows it blindly (wrong behavior) or detects the conflict and stops to ask (workflow interruption).

**Why it happens:**
- Onboarding scanning infers rules from README and CLAUDE.md content. READMEs are written for humans and use natural, vague language. LLM extraction does not normalize vagueness.
- Rule storage is a simple text observation — there is no structured schema for rules that would enforce actionability.
- Users write rules once and never revisit them, so initially-correct rules drift as the project evolves.

**How to avoid:**
- Workflow rules should be stored as a distinct entity type (`type: "workflow_rule"`) with a structured schema: `{ trigger: string, action: string, scope: "global" | "project", active: boolean }`. Free-text rules stored as generic observations cannot be reliably filtered, prioritized, or disabled.
- During `myco init` rule extraction, apply a validation heuristic: rules must contain an action verb + a specific artifact (file, command, tool). Rules that fail this heuristic are flagged as "vague" in the approval queue with a prompt to refine.
- Rules surfaced at session start should include their scope and trigger: "Before committing: run `npm test`" is far more actionable than "run tests".
- Add a `last_triggered_at` timestamp that records when the agent last acted on the rule. Rules not triggered in 90 days are flagged as potentially stale in the dashboard.

**Warning signs:**
- The session-start injection contains workflow rules that are complete English sentences with no verb + artifact structure — they are decoration, not instruction.
- A `recall "workflow rules"` returns 15+ items — the user has accumulated vague meta-rules that shadow actionable ones.
- The agent asks clarifying questions about a workflow rule's intent — the rule is too vague to execute.

**Phase to address:** Workflow Rules phase. The structured schema (`type: "workflow_rule"`, trigger/action fields) must be designed before the first rule is stored. Using generic observations for rules and adding structure later requires a data migration across all existing rule entities.

---

### Pitfall 6: User Preference Drift Across Projects — Cross-Contamination

**What goes wrong:**
The design goal is that user preferences inferred from any project attach to a global `User` entity, with the originating project as evidence. This is valuable when the preference is universal ("user prefers TypeScript over JavaScript"). It is harmful when the preference is project-local ("user prefers single-letter variable names" — inferred from a golf-score-optimized competitive coding project, then applied to a production codebase).

Cross-project preference contamination is subtle because it is not obviously wrong — it is a plausible generalization that happens to be incorrect in context. The agent behaves strangely, the user is baffled, and tracing the cause requires understanding Myco's preference scoping model.

Published research on preference drift in agent memory confirms: "contemporary LLMs struggle to infer implicit preferences accurately and apply them consistently across conversational turns, particularly when intervening dialogues introduce unrelated topics as contextual token noise."

**Why it happens:**
- Preference inference is optimistic: a single observation of a behavior is treated as a preference signal.
- The "global User entity with project evidence" model assumes the developer can easily distinguish global vs. local preferences at inference time. LLMs frequently cannot.
- There is no review step between "preference inferred" and "preference applied globally." The inference goes directly to the global entity.

**How to avoid:**
- User preferences must be staged before globalization: new preferences start as `scope: "project"` on the originating project entity. They are only promoted to `scope: "global"` (attached to the User entity) after human confirmation or after the same preference is observed in 2+ distinct projects.
- During session-start injection, display the source project for each injected preference: "Prefers verbose comments (from: myco, gsd-tools)". This makes cross-contamination visible rather than invisible.
- Add a confidence decay for preferences inferred from a single observation: `confidence = 0.5`. Explicit user confirmation or multi-project corroboration raises confidence. This prevents low-signal inferences from being injected with full authority.
- Global preferences should have a `conflicting_evidence` flag: if project A says "prefers tabs" and project B says "prefers spaces", this is a project-local preference masquerading as a global one. The conflict should be surfaced for user resolution, not silently resolved by recency.

**Warning signs:**
- A preference from project A appears in session-start injection for project B — the scope promotion happened prematurely.
- Two contradictory preferences exist for the same user ("prefers verbose" and "prefers terse") — neither has been resolved because the conflict detection is not running.
- The approval queue shows a user preference with a single-project observation source and `confidence = 0.8` — the confidence is too high for a single-observation inference.

**Phase to address:** User Preference Accumulation phase. The `scope: "project" → "global"` promotion logic and the 2-project corroboration rule must be built into the first version of preference storage. Retrofitting scope constraints onto already-global preferences requires re-reviewing all previously stored preferences.

---

### Pitfall 7: The "Helpful Assistant Who Won't Shut Up" Anti-Pattern

**What goes wrong:**
Proactive recall that fires at session start is valuable once. It becomes noise the second time and actively annoying by the fifth session on the same project. If every session for the same project injects the same 20 workflow rules and 15 preferences, the user learns to ignore the injected block entirely. At that point, the feature provides zero value while consuming tokens on every session.

The same problem applies to correction suggestions: if Myco notices a potential conflict between what the agent just did and a stored rule, it should surface this once — not on every subsequent action. A "helpful" system that surfaces the same observation repeatedly is an intrusive system.

Research on proactive AI assistants found that effective systems "adapt suggestions and timing as they interact with the user" and "the user should be able to accept and reject suggestions, and the decision to accept or reject should influence future decisions." Early versions of consumer apps (Uber notifications) had to reduce proactive pings significantly after user complaints about repetition.

**Why it happens:**
- Session-start injection is stateless: each session queries the graph fresh and injects the same high-priority items regardless of how many times they've been injected.
- There is no feedback loop between "injected this session" and "should inject next session."
- "More context is better" thinking ignores the user's cognitive load and familiarity with their own project.

**How to avoid:**
- Track injection frequency per entity: add `injected_count` and `last_injected_at` to workflow rules and preferences. Items injected in the last 3 sessions on the same project should be deprioritized in favor of new/recently-changed items.
- Design the session-start injection to surface **changes since last session**, not the full corpus every time. "New since last session: 1 workflow rule" is far more valuable than re-injecting 15 known rules.
- Provide an explicit opt-out: `MYCO_QUIET=1` environment variable suppresses session-start injection entirely for users who have internalized their rules and prefer to call `myco recall` on demand.
- Conflict detection for workflow rules should fire once per conflict, not on every related action. Mark conflicts as `surfaced_at` and do not re-surface for 7 days unless the underlying rule changes.

**Warning signs:**
- The user sets up a SessionStart hook that ignores the Myco block — they have learned to skip it.
- Session-start injection content is identical across 5 consecutive sessions — no novelty or recency filtering is applied.
- A user reports "it keeps reminding me of the same thing" — the `surfaced_at` tracking is not working.

**Phase to address:** Automatic Session-Start Recall phase. Novelty filtering and the `injected_count` / `last_injected_at` tracking must be in the initial injection implementation. Adding novelty filtering after the fact requires changing the injection query and the session-start hook output format simultaneously — a multi-component change.

---

### Pitfall 8: The Approval Queue Becomes the Onboarding Bottleneck

**What goes wrong:**
The `myco init` onboarding walkthrough is designed to produce a human-reviewed summary before committing anything to the graph. If the scan produces 60 candidate entities and preferences, and each requires an individual approval in the queue, the onboarding flow is dead on arrival. A user who spends 15 minutes reviewing individual approval items for a project they understand perfectly will not run `myco init` again, and will not recommend Myco to others.

The existing approval queue (v4.0) is designed for nightly consolidation outputs — low-volume, high-consequence items (entity merges, conflicting facts). Onboarding produces a fundamentally different pattern: high-volume, lower-consequence items where most should be approved and a few should be rejected or edited.

**Why it happens:**
- The approval queue is the existing human review mechanism. It is natural to route onboarding outputs through it.
- "Human review before committing" is correct in principle. The implementation assumes one-at-a-time review, which is wrong for batch onboarding.

**How to avoid:**
- Onboarding outputs must use a separate batch approval UX, not the existing approval queue. The `myco init` summary should present all inferred knowledge grouped by category (workflow rules, preferences, project facts) in a single interactive view with "approve all" / "reject all" / "edit individual" actions.
- Implement `myco init --auto-approve` for CI or advanced users who trust the inference. Never make this the default, but provide the escape hatch.
- The existing approval queue should only receive onboarding items that the system genuinely cannot categorize with reasonable confidence — items that fall below `confidence = 0.5`. Everything above that threshold should appear in the batch onboarding summary, not the queue.
- Add a "snooze" action to the batch summary: "skip for now, ask me again next session." This is better than forcing a decision at onboarding time.

**Warning signs:**
- The approval queue shows 60+ items immediately after `myco init` completes — the batch summary flow is not working.
- Users abandon the approval queue after the first `myco init` run — queue volume is too high.
- `myco init` reports "18 items added to your approval queue" — the UX is treating onboarding outputs as nightly-consolidation-style items.

**Phase to address:** Project Onboarding phase. The batch approval UX must be designed before `myco init` produces any output. Building `myco init` to feed the existing approval queue and then replacing it with a batch UX later means changing the output contract of the scan midway — a disruptive refactor.

---

### Pitfall 9: MCP Server Process Lifetime vs. Session Hook CWD Mismatch

**What goes wrong:**
The MCP server is a long-running process (started once, shared across many Claude Code sessions via stdio). The SessionStart hook runs as a separate subprocess with the current session's CWD. These two processes have different execution contexts:

- The MCP server has no knowledge of the Claude Code session's current directory.
- The hook subprocess has no persistent database connection — it must open and close a database connection on every hook invocation.
- Changes made to the graph by the MCP server (remember, forget) are not automatically reflected in the hook's injected context for the current session — the injection already happened.

This creates a coherence problem: if the user calls `myco remember "new convention"` early in a session, the session-start injection for the next session correctly includes it. But mid-session, the agent has no way to "refresh" its injected context without starting a new session.

**Why it happens:**
- The SessionStart hook is a one-shot injection mechanism — it fires once and is done. Developers design it as if it were a continuous memory connection.
- MCP server state and hook output are conflated. They are independent systems that share a database but not execution context.

**How to avoid:**
- Design the session-start injection as a "starting state" only. Mid-session context updates happen via explicit `myco recall` tool calls, not via hook re-injection.
- Document this limitation explicitly in `myco init` and in the CLAUDE.md template that `myco init` generates for projects: "Myco injects context at session start. For mid-session context, call `myco recall <topic>`."
- The hook must open a database connection, execute a single prepared query, and close the connection cleanly — no connection pooling, no shared state with the MCP server process. Use `better-sqlite3` in read-only mode from the hook subprocess to avoid write contention.
- Add a session-start TTL: if the hook cannot query the database within 200ms (e.g., the MCP server holds a write lock during consolidation), inject a fallback message "Myco context temporarily unavailable — call `myco recall` for project context" rather than hanging.

**Warning signs:**
- The hook subprocess times out during a nightly consolidation window — the MCP server holds the write lock while consolidation runs.
- The user expects mid-session context updates to appear "automatically" — they do not understand the one-shot injection model.
- The hook opens a database connection and never closes it — resource leak across many hook invocations.

**Phase to address:** Automatic Session-Start Recall phase. The hook architecture (separate process, read-only connection, TTL fallback) must be designed before the first line of hook code is written. The temptation to share connection state between the hook and the MCP server is strong — it must be explicitly ruled out in the design spec.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store workflow rules as generic observations (no structured type) | No schema change needed | Cannot filter, disable, or prioritize rules independently; cannot add `last_triggered_at` without schema migration | Never — rules need a distinct entity type from day one |
| Inject full entity observation text in session-start hook | Complete context without summary generation | Context window bloat; tokens wasted on boilerplate that the agent does not act on | Never — inject entity summaries only |
| Auto-promote single-project preferences to global scope | Richer global user entity | Cross-project preference contamination; trust collapse when agent acts on wrong preference | Never — require 2+ project corroboration or explicit user confirmation |
| Route all onboarding output through the existing approval queue | Reuses existing UI | Queue becomes unusable; users abandon the review flow | Acceptable only during development/testing; must be replaced with batch UX before user-facing release |
| Use `process.cwd()` inside the MCP server to determine current project | Simple implementation | MCP server CWD is fixed at launch time; wrong project context injected | Never — pass CWD explicitly from the hook script |
| Skip novelty filtering in session-start injection | Simpler query | Same content injected every session; users learn to ignore the block | Acceptable in MVP for first session only; must be added before second-session UX is evaluated |

---

## Integration Gotchas

Common mistakes when connecting v6.0 proactive features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SessionStart hook + MCP server process | Assuming the hook can call MCP tools — it cannot, hooks are shell subprocesses | Hook must use direct SQLite reads via the `myco` CLI binary, same pattern as the existing GSD hook |
| Onboarding scan + approval queue | Sending 60+ items to the existing queue | Separate batch approval flow for onboarding; only `confidence < 0.5` items go to the standard queue |
| Workflow rules + entity/observation schema | Storing rules as generic `type: "concept"` observations | Add `type: "workflow_rule"` as a distinct entity type with `active`, `trigger`, `scope` fields from the start |
| Preference globalization + project namespaces | Adding a preference to the global User entity when it should stay project-scoped | Stage preferences at project scope; promote to global only after 2+ project corroboration |
| Knowledge correction + temporal versioning | Deleting old observations instead of soft-retiring them | Use `valid_until = now` on superseded observations (same pattern as v5.0 temporal versioning) |
| Hook subprocess + SQLite WAL mode | Hook opens a write connection, blocks MCP server | Hook must use read-only mode: `new Database(path, { readonly: true })`; hook should never write |
| Session-start injection + MCP Resources protocol | Trying to use MCP Resources to serve context (adds complexity, not supported by Claude Code hooks) | Keep injection in the SessionStart hook stdout; MCP Resources are for on-demand reads, not session initialization |

---

## Performance Traps

Patterns that work in development but fail with a populated graph.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Embedding-based recall inside SessionStart hook | Hook takes 2-5 seconds; user sees delay at every session start | Session-start injection must use indexed SQL queries only (entity type, project, recency) — no embedding lookup | From the first production session; embedding calls block the hook |
| Scanning all source files during `myco init` | `myco init` takes 3+ minutes; user abandons | Limit scan to README, CLAUDE.md, package manifests; skip source code in v6.0 | At first medium-sized project (100+ files) |
| Re-querying the graph on every agent message to check workflow rules | `recall` latency adds up across a 50-message session | Session-start injection handles rules once; trust the agent to apply injected rules without per-message checks | At 20+ messages per session |
| Storing `injected_count` as a column update on every session start | Every session causes a write on all injected entities | Batch the update into the consolidation cycle; or use a separate `injection_log` append-only table | At 10+ sessions per day |
| CWD-to-project matching using fuzzy string search over all entity names | Matching is slow and ambiguous for deeply nested paths | Index project entities by `canonical_path` and use exact prefix matching | At 20+ projects in the graph |

---

## Security Mistakes

Domain-specific security issues for proactive knowledge injection.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Injecting session-start context that includes user credentials or API keys remembered accidentally | Keys injected into every session context, potentially logged or leaked in transcripts | Scan injected observations for credential patterns before outputting; reject observations that match `sk-`, `ghp_`, `Bearer `, etc. |
| Allowing `myco init` to read `.env` files during onboarding scan | Secrets enter the knowledge graph as observations | Explicitly exclude `.env`, `.envrc`, `*.pem`, `*.key`, `*secret*`, `*credential*` from all scanning paths |
| MCP server prompt injection via stored observations | A malicious observation stored in the graph could inject instructions when surfaced at session start | Observations injected at session start should be rendered as data (quoted, labeled), not as raw text that could be mistaken for system instructions |
| Hook script accepts arbitrary project names without validation | Path traversal or injection in the `myco hook` command | Validate that `project` parameter matches `[a-zA-Z0-9_-]` before using in any file path or query |

---

## UX Pitfalls

Common user experience mistakes specific to proactive memory features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Proactive injection with no visible source | Agent follows a rule the user doesn't know exists; user is confused | Every injected item must include its source entity name and age: "Rule: run tests before commit (workflow_rule, 14d old)" |
| No way to see what was injected this session | User cannot audit what context the agent has; debugging is impossible | Add `myco session` command that shows exactly what was injected at the start of the current session |
| Knowledge correction requires knowing graph IDs | Users cannot fix wrong facts without technical knowledge of entity IDs | `myco update "old statement"` must do semantic search and present matching facts with plain-language confirmation, never require IDs |
| All preferences treated as equally important | High-confidence, multi-project preferences compete with single-observation guesses | Show confidence level and source count for each preference in the session-start summary |
| `myco init` produces no output until complete | User does not know if it is running, stuck, or complete | Stream progress: "Scanning README... found 3 workflow rules. Scanning CLAUDE.md... found 5 preferences." |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Session-start injection:** The hook outputs context — but verify (a) the output is under 1,500 tokens for a graph with 200+ entities, (b) items are sorted by priority (rules first, then preferences, then facts), and (c) the output includes "last verified" age for each item.
- [ ] **CWD-to-project mapping:** The hook detects the project — but verify it works when Claude is launched from a project subdirectory, not the root, and when the MCP server was started from a different directory.
- [ ] **Workflow rules:** Rules are stored and injected — but verify (a) they use `type: "workflow_rule"` (not generic observations), (b) they have an `active` flag, and (c) `myco disable-rule` works without deleting the rule.
- [ ] **User preferences:** Preferences are inferred — but verify they start as project-scoped and require 2+ project evidence OR explicit user confirmation before appearing in the global User entity.
- [ ] **Knowledge correction:** `myco update` finds the old fact — but verify that the old observation is soft-retired (temporal `valid_until`) rather than deleted, and the new version is linked to the old one via `supersedes` relationship.
- [ ] **Onboarding scan:** `myco init` produces output — but verify that (a) it completes in under 30 seconds on a 100-file project, (b) all output is routed to the batch approval UX (not the standard queue), and (c) re-running `myco init` on the same project does not duplicate entities.
- [ ] **Novelty filtering:** Session-start injection fires — but verify that after 3 consecutive sessions with no graph changes, the injection summary shows "No changes since last session" rather than re-injecting the same items.
- [ ] **Hook read-only mode:** The hook subprocess runs — but verify it opens the database in read-only mode and that a hook invocation during active consolidation degrades gracefully (fallback message within 200ms) rather than timing out.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Session-start injection bloat — context window exhausted | LOW | Edit the hook config to reduce injected entity count; run `myco trim-session-context --max-tokens 1500` to enforce the cap going forward |
| Wrong project context injected — cross-project rules applied | LOW | `myco project set <correct-project>` override; add `MYCO_PROJECT=<name>` to project's `.envrc` file |
| Onboarding flooded the approval queue (60+ items) | MEDIUM | `myco queue clear --source onboarding` to bulk-reject all onboarding queue items; re-run `myco init` after the batch approval UX is fixed |
| Wrong preference globalized — applied across all projects | LOW | `myco update "old preference"` correction flow; move observation back to project scope via `myco scope-preference <id> --project <name>` |
| Stale workflow rule causing bad agent behavior | LOW | `myco disable-rule <name>` (immediate); then `myco update "rule description"` to supersede with the correct version |
| Cross-contamination of project-local preferences into global User entity | MEDIUM | Query `SELECT * FROM observations WHERE entity_id = (SELECT id FROM entities WHERE type = 'User') AND source_project = '<specific-project>'`; soft-retire incorrectly-globalized observations; re-review the globalization criteria |
| Onboarding extracted secrets into the graph | HIGH | `myco forget --pattern "sk-*"` to bulk-remove credential-matching observations; audit the onboarding scan exclude list; rotate any secrets that appeared in the graph |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Context window bloat from injection | Automatic Session-Start Recall | Test: graph with 300 entities produces hook output under 6,000 characters (≈1,500 tokens) |
| Wrong working directory kills scoping | Smart Context Scoping | Test: hook invoked from project subdirectory injects correct project context; invoked from unrelated dir injects global-only |
| Slow/noisy onboarding scan | Project Onboarding | Test: `myco init` on a 150-file TypeScript project completes in under 30 seconds and produces fewer than 30 candidate items |
| Stale knowledge harder to fix than missing | Knowledge Correction & Evolution | Test: `myco update "old fact"` semantic search finds the matching observation; soft-retires it; the old observation no longer appears in `myco recall` results |
| Vague/rigid workflow rules | Workflow Rules phase | Test: a rule stored without trigger + action verb is flagged as "vague" and routed for human refinement before storage |
| Preference cross-project contamination | User Preference Accumulation | Test: a preference inferred from project A does not appear in session-start injection for project B until confirmed or corroborated by a second project |
| "Helpful assistant won't shut up" | Automatic Session-Start Recall | Test: after 3 sessions with no graph changes, injection shows "No changes since last session" not the full corpus |
| Approval queue bottleneck for onboarding | Project Onboarding | Test: `myco init` output appears in batch summary UI, not the standard approval queue |
| MCP process lifetime vs. hook CWD mismatch | Automatic Session-Start Recall | Test: hook subprocess opens and closes database connection in under 50ms with no shared state with MCP server process |

---

## Sources

- [Claude Code Hooks Reference — official Anthropic documentation](https://code.claude.com/docs/en/hooks) — SessionStart hook behavior, stdout injection, performance warning
- [SessionStart Hook Verification (Classmethod, 2025)](https://dev.classmethod.jp/en/articles/claude-code-session-start-hook-verification/) — Confirmed stdout added as system-reminder context; no size limit documented
- [SessionStart hook stdout silently dropped — Claude Code GitHub Issue #13650](https://github.com/anthropics/claude-code/issues/13650) — Known fragility of hook stdout parsing
- [How to access CWD when MCP server launched via uvx — modelcontextprotocol/python-sdk #1520](https://github.com/modelcontextprotocol/python-sdk/issues/1520) — CWD unavailable inside MCP server subprocess
- [MCP server uses wrong working directory in multi-module projects — aws-toolkit-jetbrains #6173](https://github.com/aws/aws-toolkit-jetbrains/issues/6173) — Confirmed real-world CWD mismatch pattern
- [Feature Request: Auto-activate project based on MCP client CWD — serena #895](https://github.com/oraios/serena/issues/895) — Confirmation that project auto-detection via CWD is a common request with known failure modes
- [Understanding LLM performance degradation — Context Window limits (Demiliani, 2025)](https://demiliani.com/2025/11/02/understanding-llm-performance-degradation-a-deep-dive-into-context-window-limits/) — "Context rot" research; performance degrades with very long injected contexts
- [Memori: A Persistent Memory Layer for Efficient, Context-Aware LLM Agents (arXiv 2603.19935)](https://arxiv.org/html/2603.19935) — Naively injecting all past interactions leads to growing context windows and instability
- [The Problem with AI Agent Memory — Dan Giannone, Medium](https://medium.com/@DanGiannone/the-problem-with-ai-agent-memory-9d47924e7975) — Stale knowledge creates confidence-reliability inversion
- [When AI Remembers Too Much — Unit 42 / Palo Alto Networks](https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/) — Security risk of proactive memory injection; context poisoning pattern
- [Need Help? Designing Proactive AI Assistants for Programming — CHI 2025 (ACM)](https://dl.acm.org/doi/10.1145/3706598.3714002) — Proactive assistants must adapt timing, allow rejection, influence future suggestions based on user feedback
- [Why users ignore notifications — LogRocket UX Blog](https://blog.logrocket.com/ux-design/notification-blindness-ux-strategies/) — Notification fatigue pattern; over-injection causes users to ignore the entire channel
- [PERMA: Benchmarking Personalized Memory Agents (arXiv 2603.23231)](https://arxiv.org/html/2603.23231) — Preference drift and temporal drift challenges in personalized agent memory
- [Preference-Aware Memory Update for Long-Term LLM Agents (arXiv 2510.09720)](https://arxiv.org/pdf/2510.09720) — Models struggle with cross-context preference inference consistency
- [Codebase Memory MCP — DeusData](https://deusdata.github.io/codebase-memory-mcp/) — Real-world codebase scanning performance; startup timeout as primary concern; RAM-first processing required for large repos
- Existing Myco codebase: `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/tools.ts`, `packages/core/src/schema.ts` — GSD hook pattern (direct SQLite write from shell, not via MCP tools) confirmed as the correct hook architecture
- Myco v5.0 PITFALLS.md — Ghost entity / auto-extraction pitfalls apply equally to onboarding scanning; temporal versioning patterns apply to knowledge correction

---
*Pitfalls research for: Myco v6.0 — adding project onboarding, automatic session-start recall, workflow rules, smart context scoping, user preference accumulation, and knowledge correction to an existing MCP memory server*
*Researched: 2026-03-27*
