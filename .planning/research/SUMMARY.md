# Project Research Summary

**Project:** Myco
**Domain:** MCP memory server — Proactive Knowledge & Onboarding (v6.0 milestone)
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

Myco v6.0 adds a proactive knowledge layer on top of a mature MCP memory server that already ships semantic recall, approval-gated consolidation, temporal versioning, and a React PWA dashboard. The core challenge is not building memory — it is making memory automatic. Research confirms that pull-only memory (agents call `recall` when they remember to) covers maybe 60% of the value; the remaining 40% requires the system to inject relevant context before the agent makes a decision. The correct mechanism for Claude Code is the `SessionStart` hook writing `additionalContext` to stdout — not MCP Resources (require explicit user `@` invocation), not MCP Sampling (wrong abstraction), and not any form of per-turn injection (too slow, too coupled). Everything else in v6.0 feeds this hook: `myco init` populates the graph, workflow rules get first-class storage, user preferences accumulate across projects, and the correction tool keeps injected knowledge trustworthy.

The recommended implementation adds exactly one new npm dependency (`ignore` for gitignore-aware file filtering during `myco init`) and one new database table (`project_paths` for CWD-to-project mapping). The rest of v6.0 is new TypeScript modules, three new MCP tools, two new CLI subcommands, and a standalone hook binary — all built on the existing `@myco/core` foundation. The stack research confirms this is achievable without adding infrastructure: `fast-glob`, `generateObject` from the Vercel AI SDK, and `retireObservation` from `dedup-resolver.ts` are already in place.

The primary risk is quality, not capability. Proactive systems that inject too much (context bloat), inject too often (repetition fatigue), inject wrong-project context (CWD mismatch), or inject stale facts (trust collapse) are actively worse than pull-only systems. All four failure modes have specific mitigations that must be built into the first implementation — they cannot be retrofitted without multi-component changes to the injection pipeline and schema simultaneously. Treat the token cap (1,500 tokens), novelty filter, read-only hook connection, and staged preference promotion as non-negotiable requirements, not polish.

## Key Findings

### Recommended Stack

The existing stack handles all v6.0 features without additions beyond `ignore`. The session-start hook binary (`myco-recall-hook`) is a standalone TypeScript compiled target that opens the SQLite database directly via `better-sqlite3` in read-only mode — the same direct-SQLite pattern already validated by the GSD hook. It must never call Ollama (cold start penalty) and must complete under 500ms. The `myco init` onboarding scanner reuses `fast-glob` (already installed), the `ignore` package (new), and `generateObject` from `ai@4.3.19` (already installed) to extract structured knowledge from README, CLAUDE.md, and package manifests.

**Core technologies (all existing):**
- `@myco/core` `openDatabase()` + `prepareStatements()` — hook binary's only database interface
- `better-sqlite3` in read-only mode — synchronous, sub-millisecond, safe for concurrent hook access under WAL mode
- `fast-glob` + `ignore` (new) — file discovery with gitignore filtering for `myco init`
- Vercel AI SDK `generateObject` — structured extraction during onboarding, reusing consolidation LLM infrastructure
- Claude Code `SessionStart` hook with `hookSpecificOutput.additionalContext` — the only mechanism for guaranteed proactive injection in Claude Code

**New dependency for v6.0:**
- `ignore@5.3.x` — gitignore-aware file filtering; used by ESLint and Prettier; pure JS, no native bindings

### Expected Features

**Must have (table stakes) — P1:**
- Working directory to project entity mapping — prerequisite for scoped session-start recall; `project_paths` table with directory walk-up resolution
- `workflow_rule` entity type + `remember_rule` MCP tool — establishes procedural/declarative distinction in the API; no schema change, free-text `entity_type` column already supports it
- Automatic session-start recall — `myco-recall-hook` binary injects workflow rules + top-K facts at session start; must use FTS5 only, no Ollama
- `myco init` codebase onboarding — scans README, CLAUDE.md, package manifests; LLM extracts non-obvious conventions; batch approval before graph commit

**Should have (differentiators) — P2:**
- Knowledge correction flow (`update_knowledge` tool) — semantic search to find stale facts, soft-retire via `valid_until`, create replacement; depends on v5.0 `retireObservation()` already exported
- User preference entity convention + staged cross-project accumulation — preferences start project-scoped, promote to global `User` entity only after 2+ project corroboration or explicit user confirmation
- Smart preference cross-project accumulation — reinforcement count via existing relationship strength scoring from v5.0

**Defer to v6.1+:**
- Trigger-aware rule surfacing — surface only commit rules before `git commit` via PostToolUse hook analysis
- Onboarding re-run / refresh — `myco init --refresh` diffing against existing graph state
- Live codebase indexing via `chokidar` — explicit non-goal for v6.0; `myco init` is intentionally one-shot

**Confirmed anti-features (do not build):**
- Full codebase source file ingestion — anchoring bias, ghost entities, 2-3% task success degradation per research
- Auto-extracting CLAUDE.md into rules — two-source-of-truth problem with the live file Claude reads directly
- MCP Resources for proactive context — requires explicit user invocation, not automatic
- Mid-conversation injection — per-turn latency, brittle coupling to Claude Code internals

### Architecture Approach

The architecture adds two new source files and modifies five existing ones across the four-package monorepo. The key structural decision is that the hook binary is a completely separate compiled target from the MCP server: hooks are shell subprocesses that cannot communicate over MCP stdio, so `recall-hook.ts` reads SQLite directly using `@myco/core` in read-only mode. The onboarding scanner (`onboarding-scanner.ts`) is a new module in `@myco/mcp-server` that reuses the existing approval queue, `rememberEntity()`, and the Vercel AI SDK extraction pattern from `consolidator.ts`. Three new tools (`remember_rule`, `update_knowledge`, `init_project`) are thin wrappers in `tools.ts`. One new schema element: migration 9 adds the `project_paths` table.

**Major components:**
1. `recall-hook.ts` — standalone binary; reads `cwd` from stdin JSON, queries `project_paths` + workflow rules + recent observations + user preferences, writes `additionalContext` JSON to stdout; FTS5-only, no Ollama, must complete under 500ms
2. `onboarding-scanner.ts` — `ProjectScanner.scan()` reads bounded file set, calls `generateObject` for structured extraction, routes high-confidence facts to `rememberEntity()` and low-confidence to the approval queue (or batch summary)
3. `project_paths` table (migration 9) — index from absolute filesystem path to project name string; walk-up resolution handles monorepos and subdirectories
4. Three new MCP tools in `tools.ts` — `remember_rule` (thin wrapper over `rememberEntity` with `entity_type='workflow_rule'`), `update_knowledge` (find + retire + replace using existing `retireObservation()`), `init_project` (wrapper over `ProjectScanner`)

### Critical Pitfalls

1. **Context window bloat from uncapped session-start injection** — hard cap injection at 1,500 tokens (6,000 characters); build the cap into the query (priority-ordered retrieval), not as end-truncation; inject entity summaries, not full observation text; if over cap, add "More context available — call `myco recall`" note

2. **CWD mismatch kills context scoping** — the MCP server's `process.cwd()` is the server's launch directory, not the active session; the hook script must pass `$PWD` explicitly as a CLI argument; degrade gracefully to global-only context when no project matches; test with subdirectory launch and monorepo scenarios

3. **Onboarding scans that are slow or noisy** — limit `myco init` to README, CLAUDE.md, and package manifests only (no source files in v6.0); hard 30-second timeout; all inferences default to `confidence=0.6` and appear in a batch approval summary — never route 60+ items to the existing approval queue one at a time

4. **Stale knowledge harder to fix than missing knowledge** — the `update_knowledge` tool is a first-class v6.0 requirement, not a nice-to-have; incorrect injected context is actively adversarial (the agent acts confidently on wrong facts); add `last_verified_at` to observations before any knowledge is injected so age is always surfaced

5. **Repetition fatigue — the helpful assistant who won't shut up** — track `injected_count` and `last_injected_at`; after 3 sessions with no graph changes, injection should show "No changes since last session" rather than re-injecting the full corpus; provide `MYCO_QUIET=1` escape hatch

6. **Hook subprocess must open read-only connection** — the hook must never hold a write lock; open with `new Database(path, { readonly: true })`; degrade with a fallback message if the database is unavailable within 200ms (e.g., during consolidation)

7. **Preference cross-project contamination** — preferences inferred from one project must start as `scope: "project"` and be promoted to the global `User` entity only after 2+ project corroboration or explicit user confirmation; display source project in session-start injection for each preference

## Implications for Roadmap

Research identifies five discrete implementation phases with hard dependency ordering. The key insight from the dependency graph: session-start recall is the visible payoff, but everything it shows is created by the other phases. Build the infrastructure first, then the injection, then the knowledge population.

### Phase A: Schema Foundation

**Rationale:** Migration 9 (`project_paths` table) unblocks recall-hook, `myco init`, and the `link-project` CLI subcommand. Zero-risk additive schema change with no behavioral changes. Must land first because the walk-up path resolution algorithm lives here.

**Delivers:** `project_paths` table + index, `selectProjectForPath` prepared statement with directory walk-up, `insertProjectPath` prepared statement, `selectCurrentObservationsByEntityId` prepared statement (for `update_knowledge` tool)

**Addresses:** CWD scoping prerequisite for all other features; pitfall 2 (wrong working directory)

**Avoids:** Schema retrofitting mid-feature-development; the directory walk-up algorithm is load-bearing and must be tested in isolation

### Phase B: Automatic Session-Start Recall

**Rationale:** Delivers visible value immediately even before the graph is populated. Global knowledge and any existing project knowledge surface at every session start. This phase validates the hook infrastructure end-to-end before the onboarding scanner populates the graph.

**Delivers:** `recall-hook.ts` binary compiled to `myco-recall-hook`, `~/.claude/settings.json` hook configuration template, FTS5-only querying (workflow rules + recent observations + user preferences), 1,500-token hard cap with priority ordering, novelty filtering (`last_injected_at` tracking), read-only database connection with 200ms TTL fallback

**Addresses:** Automatic session-start recall (P1 feature); pitfalls 1 (context bloat), 7 (repetition), 9 (process lifetime/CWD mismatch)

**Research flag:** STANDARD PATTERNS — hook binary pattern already validated by GSD hook in this codebase; well-documented Claude Code hook format

### Phase C: Project Onboarding

**Rationale:** Populates the graph that the recall-hook surfaces. Depends on Phase A for path registration (`insertProjectPath`). This is the highest-complexity feature (1-2 weeks) but the output is what makes session-start recall valuable beyond day one.

**Delivers:** `onboarding-scanner.ts` with `ProjectScanner.scan()`, `myco init` CLI subcommand, `init_project` MCP tool wrapper, batch approval summary UX (separate from the existing per-item approval queue), streaming progress output, gitignore-aware file filtering via `ignore` package, 30-second scan timeout

**Addresses:** `myco init` codebase onboarding (P1 feature); pitfall 3 (slow/noisy scans), pitfall 8 (approval queue bottleneck)

**Avoids:** Full source file ingestion (anti-feature), auto-committing without review (anti-pattern confirmed by research)

**Research flag:** NEEDS DEEPER RESEARCH during planning — batch approval UX pattern is novel (not the existing queue); LLM extraction prompt engineering for onboarding needs iteration; confidence threshold tuning (0.85 auto-approve, 0.5 queue, middle = batch summary) needs validation against real projects

### Phase D: Workflow Rules and Knowledge Correction

**Rationale:** These two tools are independent of Phases B and C (no hard dependencies) and can be developed in parallel. They close the feedback loop: rules provide deterministic session-start content, and `update_knowledge` prevents trust collapse from stale facts.

**Delivers:** `remember_rule` MCP tool (thin wrapper, `entity_type='workflow_rule'`, `decay_exempt=1`, `confidence=1.0`), `update_knowledge` MCP tool (semantic search to find active observation, `retireObservation()`, then `rememberEntity()`), `last_verified_at` and `active` columns on workflow rule observations

**Addresses:** Workflow rule entity type + `remember_rule` tool (P1); knowledge correction flow (P2); pitfalls 4 (stale knowledge), 5 (vague/rigid rules)

**Research flag:** STANDARD PATTERNS — `retireObservation()` already exported from `dedup-resolver.ts`; `rememberEntity()` call pattern well-established; this is primarily wiring

### Phase E: User Preferences and Dashboard Polish

**Rationale:** Additive features that enhance the value of what earlier phases built. User preferences require the `project_paths` infrastructure and the entity type conventions from Phase D. Dashboard changes (Rules filter, preference visibility) require data in the graph from Phases C and D.

**Delivers:** `entity_type='person'` with `project=null` convention for global user entity, 2-project corroboration logic before preference promotion, `conflicting_evidence` flag for contradictory preferences, source project display in session-start injection, Dashboard Rules filter tab, session-start injection source attribution

**Addresses:** User preference entity convention (P2); smart cross-project preference accumulation (P2); pitfall 6 (preference cross-contamination)

**Research flag:** MEDIUM complexity — preference promotion logic (2-project corroboration) has no existing implementation to reference; test cases needed before shipping

### Phase Ordering Rationale

- Phases A through B through C are a strict dependency chain: schema enables hook, hook validates injection before graph is populated, scanner populates graph
- Phase D is parallel-safe: `remember_rule` and `update_knowledge` can be built alongside B or C without conflict
- Phase E depends on D's entity type conventions and C's onboarding data being in the graph
- The build order respects that injection infrastructure must be validated before knowledge population begins — avoids discovering hook limitations only after filling the graph with data

### Research Flags

**Needs research during planning:**
- Phase C (Project Onboarding): Batch approval UX pattern design — how to present 20-30 inferred entities for one-shot review without overwhelming the user; no existing reference implementation in the codebase
- Phase C: LLM extraction prompt engineering for onboarding — what prompt structure reliably extracts non-obvious conventions from README + CLAUDE.md without ghost entities
- Phase E: Preference cross-project corroboration — the "2+ projects" rule is well-motivated but the implementation (when to trigger promotion, how to handle borderline cases) needs a design decision before code

**Standard patterns (skip research-phase):**
- Phase A: SQLite migration pattern is well-established in this codebase (migration 8 is current; migration 9 follows the same pattern in `schema.ts` + `migrations.ts`)
- Phase B: Hook binary follows the validated GSD hook pattern exactly; Claude Code hook format confirmed in official docs
- Phase D: `retireObservation()` + `rememberEntity()` wiring is copy-pattern from existing dedup-resolver logic

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | One new dependency (`ignore`); all other stack decisions rely on existing validated production dependencies. Version compatibility confirmed. |
| Features | HIGH | MCP protocol behavior (Resources vs hooks vs sampling) verified against official docs. Competitive analysis (Mem0, Zep, mcp-memory-service) confirms the feature set. Anti-features are well-documented with research citations. |
| Architecture | HIGH | Build order derived from hard dependency analysis of existing codebase. Hook binary separation validated by existing GSD hook. SQLite WAL read-only concurrency pattern confirmed. |
| Pitfalls | HIGH | Pitfalls derived from verified Claude Code hook behavior, existing codebase constraints (GSD hook anti-patterns documented), and published research (arXiv 2603.19935, context rot studies). Nine critical pitfalls with specific prevention criteria and test verification steps. |

**Overall confidence:** HIGH

### Gaps to Address

- **Batch approval UX design:** Research identifies the need but does not prescribe a specific UX pattern for batch onboarding review. This needs a design decision in Phase C planning — specifically, whether to build a new dashboard route or a terminal-interactive flow (consistent with `myco init` being a CLI command).

- **Token cap enforcement strategy:** The 1,500-token cap is well-motivated but the specific SQL query structure for priority-ordered retrieval with a hard cap needs to be designed during Phase B planning. SQLite does not have a native "stop at N tokens" mechanism — the cap must be enforced at the application layer with careful query ordering.

- **Novelty filtering implementation:** Tracking `last_injected_at` per entity at session-hook speed requires either a write during hook invocation (contends with read-only constraint) or a deferred write during the session (complexity). The implementation strategy for this tracking needs a decision: append-only `injection_log` table vs. deferred consolidation update.

- **`myco init` idempotency:** Re-running `myco init` on the same project must not duplicate entities. The dedup classification from v5.0 handles this for single observations but the batch approval flow for onboarding may need a separate "already seen this entity" check. Needs design before Phase C implementation.

## Sources

### Primary (HIGH confidence)
- Claude Code hooks documentation (code.claude.com/docs/en/hooks) — SessionStart hook format, `additionalContext` field, `cwd` field in hook input, timeout behavior
- MCP Client Concepts (modelcontextprotocol.io/docs/learn/client-concepts) — Resources require explicit client request; confirmed NOT auto-injected
- Existing Myco codebase direct reads — `tools.ts`, `schema.ts`, `migrations.ts`, `dedup-resolver.ts`, `consolidator.ts` (migration 8 is current schema baseline)
- npm `ignore@5.3.x` — pure JS, no native bindings, full gitignore spec compliance, 2.3M weekly downloads

### Secondary (MEDIUM confidence)
- LangChain Agent Builder memory system — COALA framework (procedural vs semantic memory distinction)
- Mem0 entity-scoped memory docs — user/session/agent scope model
- mcp-memory-service SessionStart implementation — 4-factor scoring algorithm reference
- Zep temporal knowledge graph (bi-temporal invalidation) — arXiv:2501.13956
- Addy Osmani: Stop Using /init for AGENTS.md (March 2026) — research on LLM-generated codebase overviews reducing task success 2-3%
- Memori: A Persistent Memory Layer for Efficient Context-Aware LLM Agents — arXiv:2603.19935 (naive injection instability)
- modelcontextprotocol/python-sdk #1520 — CWD unavailable inside MCP server subprocess (confirmed failure mode)

### Tertiary (LOW confidence)
- Claude-Mem hooks architecture docs — third-party implementation of cwd to project detection pattern via SessionStart hook; consistent with official docs but not authoritative

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
