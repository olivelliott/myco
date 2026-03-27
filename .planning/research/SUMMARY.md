# Project Research Summary

**Project:** Myco
**Domain:** Local-first MCP memory server — knowledge graph, temporal fact versioning, agent memory, REST API
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

Myco v5.0 is a feature parity and differentiation milestone for an already-working, production-grade local MCP memory server. The existing stack (better-sqlite3, sqlite-vec, Ollama, Vercel AI SDK, Hono, React 19 PWA) is fully validated and should not change. The v5.0 work is narrowly scoped: add 9 features using only 2 new npm dependencies (`fast-glob` and `p-queue`) — all other capabilities are schema migrations and new TypeScript classes layered over the existing foundation. The overall architecture is correct and the codebase audit is HIGH confidence because researchers read the actual source files rather than inferring from documentation.

The recommended approach is to build in strict dependency order: schema migrations first, then temporal versioning paired with dedup resolution (they share the `retireObservation` mechanism), then relationship strength and memory decay as independent parallel tracks, then the core refactor moving business logic from `mcp-server` into `packages/core` (the prerequisite for REST write routes), then auto-extraction and incremental consolidation together (both modify `logEpisode`), and finally codebase ingestion and import/export as pure additions on a stable foundation. ARCHITECTURE.md defines this as Phases A through H and that ordering should drive the roadmap directly.

The key risks are concentrated in two areas: (1) the dedup and temporal versioning subsystem, where a wrong entity merge is harder to undo than a missed one, and where LLM hallucination during auto-extraction can flood the graph with ghost entities if the approval gate is not enforced — these risks are fully mitigated by routing all auto-extracted and merge-candidate items through the human approval queue unconditionally; (2) the schema migration pattern, where the existing `try/catch ALTER TABLE` approach is already accumulating technical debt and will become a measurable startup bottleneck by the end of v5.0 unless a `schema_migrations` tracking table is introduced before the first feature phase begins.

## Key Findings

### Recommended Stack

The production stack is already in place and needs no architectural changes for v5.0. All 9 features are implemented via SQLite schema migrations, new TypeScript classes, and extensions to existing pipelines. The only additions are `fast-glob@3.3.3` (file discovery for `codify`) and `p-queue@8.1.0` (serialized async job queue for incremental consolidation). Both are ESM-compatible with the monorepo's `"type": "module"` setting and have no native bindings.

**New dependencies (only 2):**
- `fast-glob@3.3.3`: File discovery for `codify` tool — stable, no native bindings, .gitignore-aware, already a transitive dependency via Vite
- `p-queue@8.1.0`: Incremental consolidation job queue — serializes LLM calls; `p-limit` (already present as a transitive dep) is insufficient because it drops excess work rather than serializing it

**Explicitly rejected additions:**
- `tree-sitter` (native bindings + version gap vs Node 22) — TypeScript Compiler API is already installed as `typescript@5.9`
- `compromise` / `wink-nlp` / `natural` (rule-based NLP, cannot handle tech-specific entities) — use `generateObject` via existing Vercel AI SDK
- `ts-fsrs` / spaced-repetition libraries (designed for explicit user feedback loops) — SQL exponential decay is the correct model for passive automated decay
- Any cloud vector DB — violates local-first constraint; sqlite-vec handles the scale
- `ai-sdk-ollama@3.x` — requires Vercel AI SDK v6; project is locked to `ai@4.3.19` + `ollama-ai-provider@1.2.0`; do not upgrade in v5.0

### Expected Features

See `.planning/research/FEATURES.md` for full codebase audit and competitive analysis.

**Must have — P1 (table stakes, closes competitive gaps against Mem0 and mcp-memory-service):**
- JSON export / import — backup, portability, unblocks user trust
- Import from Anthropic reference server JSONL format — migration path for existing users
- REST API audit + OpenAPI documentation — required for LangGraph, CrewAI, AutoGen clients
- Conflict resolution at observation level (ADD / UPDATE / NOOP) — prevents graph bloat on repeated agent sessions
- Memory importance decay — keeps graph fresh, prevents stale facts competing with current ones in recall
- Relationship strength scoring — enriches graph, enables weighted recall and visual edge thickness

**Should have — P2 (differentiators, go beyond what competitors ship):**
- Temporal fact versioning — point-in-time queries (`as_of` parameter), `valid_from`/`valid_until` on observations
- Incremental consolidation — sub-24-hour knowledge formation rather than nightly-only
- Auto-dedup sweep (scheduled job) — cleanup for existing graph noise
- `extract` MCP tool — passive entity capture from raw text without explicit `remember` calls

**Defer to v5.1+ — P3:**
- Codebase-to-graph ingestion (`codify`) — highest complexity, unique differentiator, but depends on all memory quality features being stable first
- Auto-entity extraction from raw episode text (fully passive, always-on) — risk of graph noise too high without proven conflict resolution

**Anti-features confirmed (do not build):**
- Full bi-temporal transaction-time tracking — `created_at` already serves as transaction time; valid-time only is sufficient
- Cloud sync / multi-machine access — violates local-first constraint by project definition
- Multi-model embedding support — requires full re-embed; deferred until migration tooling exists
- Real-time WebSocket updates in dashboard — short-interval TanStack Query polling is sufficient
- Natural language-to-graph queries — `recall` (semantic) + `query` (structured) already cover realistic patterns
- Codebase ingestion at full AST depth — graph becomes a code search tool; surface-level only

### Architecture Approach

The existing 4-package monorepo (`core`, `mcp-server`, `api-server`, `dashboard`) is the correct architecture and is not changing structurally. The single refactor required by v5.0 is moving `embed-client.ts` and the core write/read functions (`rememberEntity`, `recallKnowledge`, `queryEntities`, `forgetEntity`, `logEpisode`) from `packages/mcp-server/src/tools.ts` into a new `packages/core/src/memory-ops.ts`. This resolves the circular dependency that currently prevents the REST API from sharing business logic with the MCP server. After the refactor, both `tools.ts` and the new `routes/memory.ts` are thin adapters over shared functions in `@myco/core`.

**Major components and their v5.0 changes:**
1. `packages/core` — Schema migrations (4 blocks), new `memory-ops.ts` and `decay.ts`, updated `statements.ts` (~15 new prepared statements; `insertRelationship` changes from `INSERT OR IGNORE` to upsert on line 159)
2. `packages/mcp-server` — New modules: `auto-extractor.ts`, `dedup-resolver.ts`, `consolidation-trigger.ts`, `codebase-ingester.ts`, `import-export.ts`; `tools.ts` becomes a thin MCP adapter registering 4 new tools
3. `packages/api-server` — New write-path routes (`/api/memory/*`), optional API key auth middleware, export/import endpoints
4. `packages/dashboard` — Relationship `strength` as `linkWidth` in force graph, temporal timeline filter for history view

**Key architectural patterns established by research:**
- Lazy decay computation: `effective_confidence` computed at read time from `last_accessed_at`, never written back to DB — avoids write storms and race conditions
- Fire-and-forget async for all LLM calls: `setImmediate(() => extractAndStoreEpisode(...))` — MCP tool responses must never block on Ollama latency
- Shared business logic in `packages/core`: single source of truth for write operations; avoids duplicate logic between MCP and REST paths
- Migration-safe schema evolution: `try/catch ALTER TABLE` with safe `DEFAULT` values, but a `schema_migrations` table must be introduced before v5.0 adds more columns (SQLite `ALTER TABLE` cannot use non-constant `DEFAULT` expressions)

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full detail, sources, and recovery strategies. Top five:

1. **Schema migration accumulation** — The existing `try/catch ALTER TABLE` pattern runs every migration on every startup. v5.0 adds 10+ new columns across 4 tables. Introduce a `schema_migrations` table (run-once semantics) as the very first deliverable before any feature adds columns. SQLite `ALTER TABLE` also cannot use non-constant `DEFAULT` expressions — columns with temporal defaults must be added as `NULL` and backfilled immediately after `ALTER TABLE`.

2. **LLM hallucination creating ghost entities** — Auto-extraction removes the human "I explicitly asked to remember this" signal. Without gating, a 5% hallucination rate produces 1-2 ghost entities per nightly run that permanently pollute recall. Mitigation is unconditional: all auto-extracted entities route to the approval queue at confidence < 0.7; `evidence_quote` must be a verifiable substring of the source text; `source_type: 'auto_extracted'` is mandatory for retroactive cleanup.

3. **Wrong entity merges are irreversible without soft-delete** — The existing Levenshtein-only dedup (`isMergeCandidate`) will merge `"Vite"` and `"Vim"` (distance = 2). Merge candidates must require both Levenshtein ≤ 2 AND cosine similarity > 0.92. All merge proposals must route through the approval queue — no auto-approve threshold applies to merges. Add a `merged_into` column (soft-delete) before enabling any auto-dedup.

4. **Incremental consolidation race conditions** — If the nightly cron and an incremental trigger both select the same unconsolidated episodes before either marks them as processed, the same episodes get processed twice and produce duplicates that bypass dedup. Implement a `consolidation_lock` table with an exclusive-lock row and a 5-minute expiry before enabling any incremental triggers.

5. **Write amplification on recall from relationship strength** — Updating `strength` and `last_reinforced_at` synchronously on every `recall` converts a ~5ms read-only operation into a write-path operation. Under concurrent agent sessions, recall latency climbs to ~50ms and WAL file size grows continuously. Update relationship strength only on `remember` (explicit re-assertion) and in the nightly consolidation batch via a `reinforcement_events` staging table.

## Implications for Roadmap

Based on research, the architecture file defines a clear 8-phase build order (Phases A–H) where each boundary is determined by a hard dependency or isolation requirement. That ordering should be adopted directly for the roadmap.

### Phase 1: Schema Foundation

**Rationale:** Every subsequent feature depends on correct column types and a reliable migration framework. Zero functional change to the running system — safe to ship and validate in isolation.
**Delivers:** `schema_migrations` tracking table; all v5.0 columns added with safe defaults (temporal, decay, relationship strength); `SourceType` union extended; TypeScript interfaces updated in `core/types.ts`; `config.ts` additions (`consolidationThreshold`, `apiKey`, `decayHalfLifeDays`)
**Addresses:** Schema migration accumulation pitfall (Pitfall 5 in PITFALLS.md)
**Avoids:** Non-constant DEFAULT expression failure in `ALTER TABLE`; startup delay from 15+ migration attempts per boot

### Phase 2: Temporal Versioning + Dedup Resolution

**Rationale:** These two features share the `retireObservation()` mechanism — temporal versioning creates it, dedup resolution uses it. Shipping one without the other leaves the write path in a broken intermediate state where an UPDATE conflict decision has no retirement target. They must ship atomically.
**Delivers:** `valid_from`/`valid_until` columns active on all observation writes; `retireObservation()` prepared statement; `dedup-resolver.ts` gating all `rememberEntity()` writes with ADD/UPDATE/NOOP/QUEUE decisions; `as_of` parameter on `recall` tool for point-in-time queries
**Addresses:** Temporal fact versioning (P2 differentiator), conflict resolution at observation level (P1 table stakes)
**Avoids:** Unsynchronized writes creating version history without a supersession mechanism; SQLite `CURRENT_TIMESTAMP` instability (all `valid_from` values generated in application code before transactions open)

### Phase 3: Relationship Strength Scoring

**Rationale:** Independent of Phase 2 — only touches `insertRelationship` prepared statement and `selectGraphRelationships`. Can be developed in parallel with Phase 2 if bandwidth allows; must land after Phase 1 schema is in place.
**Delivers:** `strength` and `reinforcement_count` on relationships; `INSERT OR IGNORE` replaced with upsert `ON CONFLICT DO UPDATE`; edge thickness in dashboard force graph via `linkWidth`
**Addresses:** Relationship strength scoring (P1 table stakes)
**Avoids:** Write amplification on recall (Pitfall 9) — strength updated only on `remember`, not `recall`; `INSERT OR IGNORE` silently discarding reinforcement events

### Phase 4: Memory Importance Decay

**Rationale:** Independent of Phases 2 and 3. New `decay.ts` module in `packages/core` is purely additive. Access tracking columns (M2-M3) already exist from Phase 1. Lazy read-time computation means no new write paths in the hot path.
**Delivers:** `computeEffectiveConfidence()` and `decayFactor()` in `core/decay.ts`; `last_accessed_at` bumped on every recall; `decay_exempt` entity types defined (preference, constraint, decision, architecture); nightly consolidation decay sweep surfacing dormant entities to approval queue (not auto-deleted)
**Addresses:** Memory importance decay (P1 table stakes)
**Avoids:** Decaying important architectural facts (Pitfall 8) — decay applied only to `auto_extracted` source type in v5.0 initially; explicit memories are exempt; decay floor of 0.1 enforced to prevent floating-point underflow

### Phase 5: Core Refactor (memory-ops.ts)

**Rationale:** The REST write routes cannot be added to `api-server` until business logic moves from `mcp-server/tools.ts` to `packages/core/memory-ops.ts`. This refactor has no user-visible effect — it is a structural prerequisite for Phase 6. Isolated as its own phase so the full test suite validates correctness before dependent features build on it.
**Delivers:** `packages/core/src/memory-ops.ts` with all write/read functions; `embed-client.ts` moved to `core`; `tools.ts` becomes a thin MCP adapter importing from `@myco/core`; all existing tests continue passing
**Addresses:** REST API architectural prerequisite; business logic duplication anti-pattern
**Avoids:** Circular imports between `mcp-server` and `api-server`

### Phase 6: REST API Write Routes

**Rationale:** Builds directly on Phase 5. Extends the existing Hono API server with write-path routes and optional API key auth. Opens Myco to LangGraph, CrewAI, and AutoGen clients — closes the most critical competitive gap against cloud-based alternatives.
**Delivers:** `POST /api/memory/*` route group (remember, recall, query, forget, log-episode, consolidate); optional `MYCO_API_KEY` auth middleware; REST API audit confirming existing read routes cover CRUD; OpenAPI documentation
**Addresses:** REST API for non-MCP access (P1 table stakes)
**Avoids:** REST API breaking MCP stdio transport (Pitfall 6) — separate processes maintained; `busy_timeout = 5000` on both DB connections; bulk import wrapped in single transaction

### Phase 7: Auto-Extraction + Incremental Consolidation

**Rationale:** Both features modify `logEpisode()` via `setImmediate`. Shipping them together avoids two sequential modifications to the same function. Auto-extraction depends on the stable write path from Phases 2-4 (dedup, decay, temporal versioning must all be in place before extracted entities flow through them).
**Delivers:** `auto-extractor.ts` (LLM extraction on `log_episode`, fire-and-forget via `setImmediate`); `consolidation-trigger.ts` (threshold-based micro-consolidation on episode insert); `extract` MCP tool for on-demand passive capture; `consolidation_lock` table preventing race conditions; `source_type: 'auto_extracted'` mandatory approval queue routing
**Addresses:** Auto-entity extraction (P2), incremental consolidation (P2), `extract` MCP tool (P2)
**Avoids:** LLM hallucination ghost entities (Pitfall 2) — approval queue mandatory for all auto-extracted facts, `evidence_quote` substring verification required; race conditions in incremental consolidation (Pitfall 3) — lock mechanism built first

### Phase 8: Codebase Ingestion + Import/Export

**Rationale:** Pure additions on top of the stable write path from Phases 1-7. No dependencies on each other — can be developed in parallel within the phase. Codebase ingestion is the highest-complexity feature and is correctly deferred until the memory quality foundation is solid.
**Delivers:** `codify` MCP tool (`codebase-ingester.ts`, TypeScript Compiler API + `fast-glob`); `export_graph` and `import_graph` MCP tools; CLI `export`/`import` subcommands; `GET /api/export` + `POST /api/import` REST endpoints; Mem0 and reference server import adapters with dry-run + execute two-phase approach
**Addresses:** Codebase-to-graph ingestion (P3); import/export (P1 table stakes)
**Avoids:** Codebase ingestion scope explosion (Pitfall 7) — surface-level only (packages, public exports, conventions); clean-slate re-ingestion via `source_type: 'codebase'` delete-before-insert; destructive import without dry-run (Pitfall 10) — two-phase dry-run + execute is mandatory

### Phase Ordering Rationale

- Phase 1 must be first: all other phases rely on the migration framework and correct column types; the `try/catch ALTER TABLE` debt must be paid before adding more columns
- Phases 2, 3, and 4 have no ordering constraint between them after Phase 1; Phases 3 and 4 can be done concurrently if two tracks are available
- Phase 2 must precede Phase 7: auto-extraction adds entities that must flow through dedup resolution (`dedup-resolver.ts` from Phase 2)
- Phase 5 must precede Phase 6: the refactor is the only prerequisite for REST write routes; no other features depend on this ordering
- Phase 7 must follow Phases 2-4: all memory quality features (dedup, decay, temporal versioning) must be in place before auto-extracted entities begin entering the graph
- Phase 8 must follow Phase 7: codebase ingestion routes through the same write path as auto-extraction; import uses the conflict resolution established in Phase 2

### Research Flags

Phases requiring careful implementation attention (high integration complexity despite established patterns):

- **Phase 2 (Temporal + Dedup):** The atomic retirement of old observations + insertion of new ones must be tested against concurrent writes. SQLite `CURRENT_TIMESTAMP` instability (Pitfall 1) requires application-side timestamp generation at all write sites — audit every call to `insertObservation` before shipping.
- **Phase 5 (Core Refactor):** Moving functions between packages in a monorepo is mechanical but must not break the MCP stdio contract. Run the full test suite after the move before any Phase 6 work begins. Do not start Phase 6 until tests are green.
- **Phase 7 (Auto-Extraction):** Extraction prompt quality determines approval queue noise level. Plan for prompt iteration — the first version will have higher rejection rates. The `evidence_quote` substring verification is load-bearing, not a nice-to-have.

Phases with well-established patterns (standard execution, no additional research needed):

- **Phase 1 (Schema Foundation):** Pure SQLite DDL with safe defaults; `schema_migrations` table pattern is well-documented
- **Phase 3 (Relationship Strength):** Single prepared statement change from `INSERT OR IGNORE` to upsert; minimal risk
- **Phase 4 (Memory Decay):** Pure TypeScript function; lazy computation; no new write paths
- **Phase 6 (REST API):** Extending an existing Hono router; follows existing route group patterns in `api-server`
- **Phase 8 (Import/Export):** JSON serialization with better-sqlite3; no novel patterns; TypeScript Compiler API is stable public API

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack is in production; only 2 new deps needed and both confirmed stable. Vercel AI SDK version lock explicitly documented — do not upgrade in v5.0. |
| Features | HIGH | Multi-source competitive research (Mem0, Zep/Graphiti, mcp-memory-service, Neo4j agent-memory) + direct codebase audit; P1/P2/P3 prioritization is well-reasoned with dependency analysis |
| Architecture | HIGH | Based on direct source file analysis of all 4 packages; `insertRelationship` upsert change confirmed on specific line number (line 159 in statements.ts); circular dependency problem confirmed by architecture researcher |
| Pitfalls | HIGH | 10 pitfalls with prevention strategies derived from known SQLite constraints + verified against current codebase behavior; recovery paths documented for each |

**Overall confidence:** HIGH

### Gaps to Address

- **Auto-extraction prompt quality:** The `generateObject` prompt for entity/relationship extraction is not defined in research. Plan for 1-2 prompt iteration cycles during Phase 7 implementation. The prompt is the highest-variance element of the feature — start with a constrained schema and expand.
- **Consolidation lock mechanism details:** The `consolidation_lock` table design (row structure, expiry logic, atomic check-and-lock SQL pattern) is described conceptually but not fully specified. Design this explicitly before starting Phase 7 to prevent the race condition pitfall.
- **Decay parameter tuning:** The half-life constant (`MYCO_DECAY_HALF_LIFE_DAYS`, default 30) and decay floor (0.1) are reasonable starting values but require empirical tuning. Build decay observability into the dashboard from day one — surface effective_confidence distributions so tuning is data-driven.
- **`codify` abstraction level contract:** Research recommends "surface-level only" but the exact filtering rules (what counts as a public export vs. internal symbol, depth limits) are not fully specified. Define the abstraction level contract in the Phase 8 plan before writing any ingestion code to prevent scope creep.

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis: `packages/core/src/schema.ts` — confirmed existing columns, migration pattern, all table structures
- Direct codebase analysis: `packages/core/src/statements.ts` — confirmed `INSERT OR IGNORE` on line 159, `MycoStatements` interface, all 88 prepared statements
- Direct codebase analysis: `packages/mcp-server/src/tools.ts` — confirmed `rememberEntity()`, `recallKnowledge()`, all MCP tool registrations
- Direct codebase analysis: `packages/mcp-server/src/consolidator.ts` — confirmed `extractFacts()`, `detectContradiction()`, `findMergeCandidates()` available for reuse
- Direct codebase analysis: `packages/api-server/src/index.ts` — confirmed existing 5 route groups, currently read-only
- npm: fast-glob@3.3.3 — last published January 5, 2025; stable; 10k+ dependents
- npm: p-queue@8.1.0 — Sindresorhus, 10M+ weekly downloads; ESM-only, Node.js 22 compatible
- TypeScript wiki: Using the Compiler API — `createSourceFile` confirmed stable public API
- SQLite documentation: `ON CONFLICT DO UPDATE` (upsert) syntax; WAL mode; `julianday()` for date arithmetic
- Vercel AI SDK docs: `generateObject` with Zod schema — confirmed with existing `ai@4.3.19`

### Secondary (MEDIUM confidence)

- GitHub: tree-sitter/tree-sitter issue #5334 — npm v0.25 gap vs v0.26 core; Node 24 requirement (issue thread, March 2026)
- DEV Community: "I built memory decay for AI agents using the Ebbinghaus forgetting curve" (2025) — decay formula pattern for MCP servers
- GitHub: gannonh/memento-mcp — memory decay + reinforcement reference implementation
- Zep/Graphiti GitHub + arXiv 2501.13956 (Jan 2025) — bi-temporal modeling approach
- Mem0 paper arXiv 2504.19413 (Apr 2025) — conflict resolution as core value, 20-40% noise reduction from dedup
- mcp-memory-service GitHub (doobidoo) — competitive feature comparison
- SQLite Forum: temporal tables discussion — confirms `try/catch ALTER TABLE` limitation for non-constant defaults

### Tertiary (LOW confidence)

- npm: compromise@14.15.0 — English-only NLP limitation confirmed; rejected from stack (no further validation needed)
- Mem0 export format schema `{ memories: [{ id, content, metadata, created_at }] }` — inferred from docs, not tested against a live export

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
