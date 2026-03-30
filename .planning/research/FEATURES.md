# Feature Research: v6.0 Proactive Knowledge & Onboarding

**Domain:** MCP memory server — proactive context surfacing, guided onboarding, workflow rules, knowledge correction
**Researched:** 2026-03-27
**Milestone:** v6.0 Proactive Knowledge & Onboarding
**Confidence:** HIGH (MCP official docs + Claude Code hook research + competitive analysis: Mem0, Zep, LangChain agent builder, mcp-memory-service, LangMem)

---

## Context: Existing Features (Do Not Re-Implement)

v6.0 adds proactive and onboarding capabilities on top of what already shipped. This is the base:

| Capability | Where |
|------------|-------|
| `remember` / `recall` / `query` / `forget` / `log_episode` / `consolidate` MCP tools | `packages/mcp-server/src/tools.ts` |
| Project namespace isolation (nullable `project` column) | `schema.ts`, `tools.ts` |
| Semantic search via sqlite-vec KNN + FTS5 fallback | `tools.ts recallKnowledge()` |
| Nightly consolidation pipeline (episodes → LLM extraction → approval queue) | `consolidator.ts` |
| Human approval queue for low-confidence inferences | `tools.ts`, approval routes in api-server |
| Dedup classification (ADD/UPDATE/NOOP) — v5.0 | in v5.0 worktree |
| Temporal versioning (valid_from/valid_until, as_of) — v5.0 | in v5.0 worktree |
| Hono REST API on port 3001, React PWA dashboard | `packages/api-server/`, `packages/dashboard/` |
| GSD hook (SessionStart + PostToolUse) for auto-logging | separate package |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that users of a "proactive" memory layer expect. Missing these means the system is still pull-only — agents have to remember to ask, which defeats the purpose.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Automatic session-start recall** | Every memory system review in 2025–2026 cites "proactive surfacing" as the top gap between demo tools and production tools. Users expect memory to surface relevant context at session start without being asked — the same way CLAUDE.md injects context but dynamically, based on actual stored knowledge. | MEDIUM | Implemented as a Claude Code `SessionStart` hook: hook script runs `myco recall` with the cwd as project context, formats top N results, injects as `additionalContext` via stdout. Hook receives `cwd`, `session_id`, `hook_event_name`. MCP protocol itself does not push context proactively — the hook is the correct pattern for Claude Code. |
| **Working directory → project entity mapping** | Users expect that `cd /projects/myco && claude` automatically uses Myco's knowledge namespace, not a global dump. Every namespace-aware memory system (Mem0 scopes by user/app/agent, Zep by group) provides some form of context scoping. | LOW | Map `cwd` to project entity using git remote URL or directory name as lookup key. Store mapping in a lightweight `projects` config table or derive from existing `project` column. Recall tool already accepts `project` filter — just needs auto-resolution from cwd. |
| **Explicit knowledge correction flow** | Users expect to say "that's wrong, here's the updated fact" and have the system find the stale knowledge, show it, and supersede it in place. Without this, the graph accumulates contradictions and trust erodes. Zep's bi-temporal model exists specifically for this problem. Mem0 classifies every new memory as ADD/UPDATE/NOOP to handle corrections. | MEDIUM | Depends on v5.0 dedup classification (UPDATE action) already existing. The new piece is a `correct` or `update` MCP tool that: (1) searches for the entity/observation to update by natural language query, (2) presents the found observation text to the agent for confirmation, (3) applies the UPDATE action (supersedes via `valid_until` on old, inserts new with `valid_from`). Clean UX on top of existing machinery. |
| **User preference entity (global scope)** | Any memory system that does not distinguish "user preferences" from "project facts" conflates the two scopes. Mem0's entity-scoped memory explicitly maintains a user-level scope that persists across all project scopes. Users expect preferences like "I prefer TypeScript strict mode" to persist even when switching projects. | LOW | Already achievable with existing `project = NULL` (global) observations. The new piece is a convention: a reserved entity name (e.g., `"user:olive"` or just `"User"`) with entity_type `"user_preference"`. Preferences inferred during onboarding or remembered via explicit `remember` attach to this entity. Recall filters `entity_type = "user_preference"` for preference-only queries. |
| **`workflow_rule` entity type** | Research into how agent memory systems distinguish "instructions" from "facts" (LangChain COALA framework: procedural vs semantic memory; mcp-memory-service memory ontology) shows this distinction is load-bearing. Rules like "run tests before committing" should be surfaced reliably at session start, not buried in semantic search results mixed with factual observations. | LOW | Create a reserved `entity_type = "workflow_rule"` with a standard observation format: `{ instruction: string, triggers: string[], project?: string }`. Surfacing logic: always include workflow rules in session-start recall output, placed before semantic recall results. The cognitive distinction (procedural vs declarative) has a concrete implementation payoff — rules are always retrieved, facts are similarity-ranked. |

### Differentiators (Competitive Advantage)

Features that go beyond what comparable tools offer. These make Myco the only MCP memory server with guided onboarding and first-class workflow rule support.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **`myco init` guided codebase onboarding** | No MCP memory server currently has guided onboarding. The pattern in the Claude Code ecosystem is `/init` → generate AGENTS.md — but research (Addy Osmani, 2026) shows that auto-generated codebase overviews are low-value and degrade agent performance by 2–3% while increasing cost by 20%. Myco's differentiator is to scan for things agents *cannot* discover themselves: tooling choices, naming conventions, gotchas, user preferences from git config/package.json, non-obvious constraints — and present them for human approval before committing. Human-in-the-loop prevents the anchoring bias problem of static AGENTS.md files. | HIGH | Implementation: CLI command `myco init [path]`. Scans: package.json (name, dependencies, scripts, engines), tsconfig.json (strict settings), .eslintrc (rule overrides), git config (user.name, user.email), CLAUDE.md/AGENTS.md if present (existing human instructions — do not duplicate), README summary. LLM prompt: "Given this project metadata, what are the non-obvious conventions and user preferences that an agent cannot discover by reading the source code?" Output: proposed entities (project entity, user_preference observations, workflow_rule observations). Present diff for human approval before writing to graph. |
| **Smart preference cross-project accumulation** | When `myco init` runs on a new project and detects "TypeScript strict mode" or "prefers named exports", it checks whether this preference already exists on the global user entity. If yes, it reinforces it (adds evidence from new project). If no, it creates it with the new project as first evidence. Over time, the user entity accumulates a reliable preference profile without manual curation. This is the "personalization gradient" that Mem0 is building toward but hasn't achieved in a local-first context. | MEDIUM | Uses the existing `remember` flow but with explicit cross-scoping logic: when an observation is classified as a "preference" (heuristic: entity_type=user_preference), write it to both the project entity (with project= project_name) and the global user entity (project=NULL). Track `evidence_projects` as a JSON array in the observation metadata. Reinforce existing preference observations on the user entity by incrementing a `reinforcement_count` (from v5.0 relationship strength scoring). |
| **`remember_rule` MCP tool (workflow rule capture)** | Competitors store rules as regular memories, losing them in semantic recall noise. A dedicated tool makes the cognitive distinction explicit in the API surface, not just the data model. Agent calls `remember_rule({ instruction: "update CHANGELOG before committing", triggers: ["commit", "git push"] })` — no LLM inference required, no consolidation delay, immediately available in session-start recall. | LOW | Thin wrapper over `rememberEntity` that sets `entity_type = "workflow_rule"` and structures the observation JSON. The triggers field enables future smart surfacing (e.g., surface only commit rules when agent is about to commit). No new schema needed — uses existing flexible observation text. |
| **Proactive rule surfacing in session-start recall** | The research distinction between procedural memory (rules) and semantic memory (facts) has a direct performance payoff: rules should always be in context, facts should be similarity-ranked. mcp-memory-service's "Phase 1: Session Memory Injection" uses a 4-factor scoring algorithm. Myco's simpler, more predictable approach: always inject all workflow_rules for the current project + global, then add top-K semantic recall results. Agents see their rules every session without having to ask. | LOW | Modify the SessionStart hook script: fetch workflow_rules first (SELECT all where entity_type='workflow_rule' AND project IN (current, NULL)), then run semantic recall for top 5 contextual facts. Format both sections clearly: "## Workflow Rules" then "## Project Context". Ensures rules are never missed due to semantic similarity ranking. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full codebase ingestion at `myco init` (line-by-line)** | "Index everything so agents never have to read files." | Research shows LLM-generated codebase overviews describing things agents can discover themselves reduce task success by 2–3% (anchoring bias) while increasing cost 20%+. Indexing every function creates thousands of graph entities — noise drowns signal, recall degrades. | Scan only what agents cannot discover: tooling choices, non-obvious conventions, user preferences from config files. Surface-level only. The graph is a knowledge tool, not a code search index. |
| **Automatic rules extraction from CLAUDE.md / AGENTS.md** | "Myco should read my existing instructions and store them as rules." | CLAUDE.md is already read by Claude Code directly. Duplicating it in Myco creates a two-source-of-truth problem. When the user updates CLAUDE.md, the stale Myco copy contradicts the live file. | Let agents call `remember_rule` explicitly when they want to promote a CLAUDE.md instruction to persistent memory. Do not mirror static config files. |
| **MCP Resources for proactive context (push via resources primitive)** | "Use MCP Resources to push context without a hook." | MCP Resources are application-controlled, not model-controlled. The host application must explicitly fetch resources — they are not pushed to the LLM automatically. Claude Code does not auto-inject resources into context. The SessionStart hook pattern is the correct and tested mechanism for proactive context injection in Claude Code. | Use Claude Code `SessionStart` hooks with `additionalContext` stdout injection. This is confirmed working (Claude Code 2.1.0+). |
| **MCP Sampling for session-start context** | "Use MCP sampling to trigger memory injection." | Sampling lets servers request LLM completions — it does not inject context at session start. Sampling is a server-to-client request that creates a new LLM call, not context injection. Misusing sampling for this adds latency and complexity. | SessionStart hooks are the right primitive for this use case. |
| **Real-time "intelligent memory triggers" (semantic pattern detection)** | "Detect when agent is about to do something relevant and inject memories proactively mid-conversation." | mcp-memory-service implements this with 85%+ accuracy for its narrow pattern set. Mid-conversation injection requires watching every tool call and user message — high coupling to Claude Code internals, brittle, and adds per-turn latency. | Session-start injection + explicit `recall` calls from agents covers 95% of the value. Agents are already good at calling recall when they need context. The "triggers" problem is agent behavior, not memory server behavior. |
| **User onboarding wizard in the PWA** | "Walk the user through setting up Myco preferences via a web UI." | The target user is a developer using Claude Code in the terminal. A web UI onboarding adds development complexity and is orthogonal to the MCP-native workflow. | `myco init` as a CLI command is the right onboarding surface. It fits the terminal workflow where users actually work. |
| **`myco init` auto-commits without review** | "For convenience, just write what was inferred directly to the graph." | The research pitfall of static AGENTS.md files is anchoring bias — wrong inferences become persistent truth. Human approval before commit is Myco's core value proposition (already applies to consolidation). Skipping it for onboarding creates a class of hard-to-trace errors. | Always present the proposed entities as a diff for approval. The approval can be fast (just `y` to accept all), but the human must be in the loop. |

---

## Feature Dependencies

```
Automatic session-start recall
    └──requires──> Working directory → project entity mapping (needs cwd→project resolution)
    └──requires──> SessionStart hook infrastructure (already exists in GSD hook package)
    └──uses──> recall tool with project filter (already exists)
    └──uses──> workflow_rule entity type (new, but additive — hook works without it)

Working directory → project entity mapping
    └──uses──> existing project column on entities (already exists)
    └──uses──> existing git integration (git remote URL as stable project key)

`myco init` codebase onboarding
    └──uses──> rememberEntity() (already exists)
    └──uses──> approval queue (already exists — onboarding proposals route through it)
    └──uses──> workflow_rule entity type (creates rule entities from discovered conventions)
    └──uses──> user_preference entity type (creates preference observations on user entity)
    └──enhances──> smart preference cross-project accumulation (init is the write path)

`remember_rule` MCP tool
    └──uses──> rememberEntity() with entity_type='workflow_rule' (thin wrapper)
    └──enhances──> proactive rule surfacing (rules in graph → surfaced at session start)
    └──independent of──> myco init (can be used without ever running init)

Smart preference cross-project accumulation
    └──requires──> myco init (primary write path for preferences)
    └──uses──> global user entity convention (project=NULL, entity_type='user_preference')
    └──enhances──> session-start recall (user preferences surfaced alongside project rules)
    └──depends on (nice-to-have)──> v5.0 relationship strength reinforcement_count

Knowledge correction flow (`correct` / `update` tool)
    └──requires──> v5.0 dedup classification (UPDATE action with valid_until supersession)
    └──uses──> recall tool (find the observation to correct)
    └──uses──> temporal versioning valid_from/valid_until (creates version trail)
    └──independent of──> myco init (works for any entity in the graph)
```

### Dependency Notes

- **Session-start recall requires cwd mapping first:** Without resolving which project the working directory maps to, recall returns global results only — useful but not scoped. Implement mapping before or alongside session-start recall.
- **`workflow_rule` entity type is additive:** It requires no schema migration (uses existing flexible observation text). It is a naming convention enforced by tools, not a structural change.
- **`myco init` depends on approval queue infrastructure, which already ships:** The onboarding output is just another batch of pending approvals. No new approval plumbing needed.
- **Knowledge correction requires v5.0:** The `correct` tool needs UPDATE action logic and temporal versioning from v5.0. Do not implement correction in v6.0 if v5.0 is not merged first — or implement a degraded version that simply replaces rather than supersedes.
- **Smart preference accumulation is a v6.0 differentiator but not a blocker:** Session-start recall and `myco init` deliver value without cross-project preference reinforcement. Accumulation can be added after the core onboarding loop is working.

---

## MVP Definition for v6.0

### Launch With (Core Proactive Layer)

Minimum set that makes Myco proactively useful in every session — not just reactive when agents call `recall`.

- [ ] **Working directory → project entity mapping** — prerequisite for scoped session-start recall. Git remote URL or directory name lookup. LOW complexity.
- [ ] **`workflow_rule` entity type + `remember_rule` MCP tool** — establishes the procedural/declarative distinction in the API. Enables deterministic rule surfacing. LOW complexity.
- [ ] **Automatic session-start recall** — SessionStart hook that injects workflow rules + top-K semantic recall. Requires hook infrastructure (already exists) + cwd mapping. MEDIUM complexity.
- [ ] **`myco init` codebase onboarding (MVP)** — scan package.json, tsconfig, git config, existing CLAUDE.md. LLM infer non-obvious conventions. Present for approval. HIGH complexity but core to the milestone goal.

### Add After Core Loop is Working

- [ ] **Knowledge correction flow (`correct` tool)** — requires v5.0 to be merged. High value but blocked on v5.0 UPDATE action.
- [ ] **User preference entity convention + smart cross-project accumulation** — additive to `myco init`. Lower risk to defer until init is stable.

### Future Consideration (v6.1+)

- [ ] **Trigger-aware rule surfacing** — surface only rules relevant to current agent action (e.g., commit rules only before `git commit`). Requires PostToolUse hook analysis. Interesting but adds complexity.
- [ ] **Onboarding re-run / refresh** — `myco init --refresh` that detects what has changed since last init and proposes updates. Requires diffing against existing graph state.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| cwd → project entity mapping | HIGH | LOW | P1 |
| `workflow_rule` entity type + `remember_rule` tool | HIGH | LOW | P1 |
| Automatic session-start recall (hook) | HIGH | MEDIUM | P1 |
| `myco init` codebase onboarding | HIGH | HIGH | P1 |
| Knowledge correction flow (`correct` tool) | HIGH | MEDIUM | P2 (blocked on v5.0) |
| User preference entity convention | MEDIUM | LOW | P2 |
| Smart cross-project preference accumulation | MEDIUM | MEDIUM | P2 |
| Trigger-aware rule surfacing | MEDIUM | HIGH | P3 |
| Onboarding re-run / refresh | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Core proactive layer — must have for v6.0
- P2: Enhances the core loop — ship in v6.0 if P1 is solid
- P3: Future milestone

---

## Competitor Feature Analysis

| Feature | Mem0 | Zep | mcp-memory-service | LangChain Agent Builder | Myco v5.0 | Myco v6.0 target |
|---------|------|-----|--------------------|------------------------|-----------|-----------------|
| Automatic session-start context injection | Yes (API call) | Yes (context block) | Yes (SessionStart hook, 4-factor scoring) | Yes (in-hot-path) | No | P1 (SessionStart hook) |
| Working directory → project scoping | Via user/agent IDs | Via group graphs | Via agent ID header | Via agent memory scope | Partial (project= column) | P1 (cwd resolution) |
| Workflow rules as first-class entities | No (mixed with facts) | No (mixed with facts) | No (memory ontology but not rules-specific) | Yes (AGENTS.md = procedural) | No | P1 (entity_type='workflow_rule') |
| Dedicated "remember rule" API | No | No | No | Via AGENTS.md file edit | No | P1 (`remember_rule` tool) |
| Guided codebase onboarding (`init`) | No | No | No | Via `/init` (AGENTS.md only, no graph) | No (`codify` in roadmap) | P1 (`myco init`) |
| Human approval before onboarding commits | No | No | No | No | Yes (approval queue) | Yes (route init proposals through queue) |
| Cross-project user preference accumulation | Yes (user-level scope) | Partial | No | No | No | P2 |
| Knowledge correction / supersession | Yes (ADD/UPDATE/NOOP) | Yes (temporal invalidation) | No | No | Yes (v5.0 dedup classification) | P2 (correct tool wrapping v5.0) |
| Local-first, no cloud | No | No | Yes | No | Yes | Yes (keep advantage) |

---

## MCP Proactive Context: What the Protocol Actually Supports

This is a critical implementation clarification, as the question specifically asked about resources vs tool responses vs sampling.

**Resources (application-controlled):** URI-addressable data that the host application fetches and provides to the LLM. The *application* decides when to fetch — resources are not pushed to the LLM automatically. Claude Code does not auto-inject MCP resources into context. Using resources for session-start injection would require Claude Code to call `resources/read` on every session start, which it does not do.

**Tool responses (model-controlled):** The LLM decides to call a tool, gets the result back as context. This is the existing `recall` pattern — works well when the agent proactively calls it, but agents forget to call it at session start or when switching context. Not the right pattern for guaranteed proactive injection.

**Sampling (server-to-client LLM request):** Allows the MCP server to initiate an LLM completion via the client. This is for servers that need LLM reasoning internally, not for injecting context into the host's conversation. Misusing it for session-start injection adds a full extra LLM round-trip.

**Conclusion:** For Claude Code specifically, the `SessionStart` hook with `additionalContext` stdout injection is the only supported, tested, zero-latency mechanism for guaranteed proactive context surfacing. This is confirmed in Claude Code docs and multiple community implementations (Claude-Mem, mcp-memory-service). The hook receives `cwd` and injects content before Claude processes any user message.

---

## Implementation Complexity Notes

### Low complexity (0.5–1 day each)
- **cwd → project mapping:** Git remote URL lookup via `git remote get-url origin`. Fallback to `basename(cwd)`. Store in a `cwd_project_map` SQLite table or derive from existing entity names. Single function, called by hook script.
- **`workflow_rule` entity type convention:** Naming convention enforced by new `remember_rule` tool wrapper. No schema change. Documents itself.
- **`remember_rule` MCP tool:** ~20 lines — validates input, calls `rememberEntity` with `entity_type='workflow_rule'`, returns confirmation.
- **User preference entity convention:** Document the `user_preference` entity_type. Add to `remember` tool examples. No schema change.

### Medium complexity (2–4 days each)
- **Automatic session-start recall (hook):** Modify existing GSD hook to add a `session_start_recall.sh` script. Query workflow_rules + top-5 semantic recall. Format as markdown. Write to stdout. Test with Claude Code hook mechanism.
- **Knowledge correction tool:** Wrap existing UPDATE dedup classification. Add a `correct` MCP tool: (1) recall to find candidate, (2) return candidate for agent confirmation, (3) apply UPDATE. Requires v5.0 merged.
- **Smart cross-project preference accumulation:** Logic in `rememberEntity` for `entity_type='user_preference'`: always write to global user entity (project=NULL) as well as project-scoped entity. Deduplicate against existing global preferences.

### High complexity (1–2 weeks)
- **`myco init` codebase onboarding:** CLI command. File scanning (package.json, tsconfig, .eslintrc, git config, CLAUDE.md). LLM prompt for non-obvious inferences (reuses consolidation LLM client). Diff presentation. Route proposals through approval queue. Error handling for missing files, LLM failures. Integration tests.

---

## Sources

- MCP Architecture docs (official, March 2026) — https://modelcontextprotocol.io/docs/learn/architecture
- Claude Code hooks documentation — https://code.claude.com/docs/en/hooks-guide
- Claude Code SessionStart hook behavior (2.1.0+) — https://claudefa.st/blog/tools/hooks/session-lifecycle-hooks
- Addy Osmani: Stop Using /init for AGENTS.md (March 2026) — https://addyosmani.com/blog/agents-md/
- LangChain Agent Builder memory system — COALA framework (procedural vs semantic) — https://blog.langchain.com/how-we-built-agent-builders-memory-system/
- Mem0 entity-scoped memory (user vs session vs agent scope) — https://docs.mem0.ai/platform/features/entity-scoped-memory
- mcp-memory-service SessionStart + project detection — https://github.com/doobidoo/mcp-memory-service
- Zep temporal knowledge graph (bi-temporal invalidation pattern) — https://arxiv.org/abs/2501.13956
- AI Agent Memory Systems comparison 2026 (Mem0 vs Zep vs others) — https://yogeshyadav.medium.com/ai-agent-memory-systems-in-2026-mem0-zep-hindsight-memvid-and-everything-in-between-compared-96e35b818da8
- Agentic patterns: codebase Q&A onboarding — https://agentic-patterns.com/patterns/agent-powered-codebase-qa-onboarding/
- Martian-Engineering agent-memory: supersedes pattern — https://github.com/Martian-Engineering/agent-memory
- Claude Code hooks mastery — https://github.com/disler/claude-code-hooks-mastery

---
*Feature research for: Myco v6.0 — Proactive Knowledge & Onboarding*
*Researched: 2026-03-27*
