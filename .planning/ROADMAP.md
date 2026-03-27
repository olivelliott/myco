# Roadmap: Myco

## Milestones

- ✅ **v1.0 AI Workbots Brain** — Phases 1-5 (shipped 2026-03-21)
- ✅ **v2.0 Open Source Release** — Phases 6-8 (shipped 2026-03-22)
- ✅ **v3.0 Performance & Architecture Optimization** — Phases 9-12 (shipped 2026-03-26)
- ✅ **v4.0 Dashboard & Graph Experience** — Phases 13-17 (shipped 2026-03-27)
- 🚧 **v5.0 Feature Parity & Differentiation** — Phases 18-24 (in progress)

## Phases

<details>
<summary>✅ v1.0 AI Workbots Brain (Phases 1-5) — SHIPPED 2026-03-21</summary>

- [x] Phase 1: Storage Foundation (2/2 plans) — completed 2026-03-20
- [x] Phase 2: MCP Server + Memory (2/2 plans) — completed 2026-03-21
- [x] Phase 3: Consolidation + Approval (3/3 plans) — completed 2026-03-21
- [x] Phase 4: REST API + PWA (5/5 plans) — completed 2026-03-21
- [x] Phase 5: GSD Integration (2/2 plans) — completed 2026-03-21

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Open Source Release (Phases 6-8) — SHIPPED 2026-03-22</summary>

- [x] Phase 6: Rename (3/3 plans) — completed 2026-03-22
- [x] Phase 7: Tech Debt (1/1 plans) — completed 2026-03-22
- [x] Phase 8: Open Source Packaging (2/2 plans) — completed 2026-03-22

Full details: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.0 Performance & Architecture Optimization (Phases 9-12) — SHIPPED 2026-03-26</summary>

- [x] Phase 9: Config + Embedding Performance (2/2 plans) — completed 2026-03-25
- [x] Phase 10: Prepared Statements (2/2 plans) — completed 2026-03-25
- [x] Phase 11: Query Filters + Error Handling (2/2 plans) — completed 2026-03-25
- [x] Phase 12: Namespace Isolation (2/2 plans) — completed 2026-03-26

Full details: `.planning/milestones/v3.0-ROADMAP.md`

</details>

<details>
<summary>✅ v4.0 Dashboard & Graph Experience (Phases 13-17) — SHIPPED 2026-03-27</summary>

- [x] Phase 13: Theme + Language Foundation (1/1 plans) — completed 2026-03-27
- [x] Phase 14: Graph Core Features (3/3 plans) — completed 2026-03-27
- [x] Phase 15: Timeline Animation (1/1 plans) — completed 2026-03-27
- [x] Phase 16: Home Page Enhancements (2/2 plans) — completed 2026-03-27
- [x] Phase 17: Approvals Overhaul (2/2 plans) — completed 2026-03-27

Full details: `.planning/milestones/v4.0-ROADMAP.md`

</details>

### 🚧 v5.0 Feature Parity & Differentiation (In Progress)

**Milestone Goal:** Close competitive gaps against Mem0, Zep, and mcp-memory-service and add differentiating features — temporal fact versioning, conflict-aware dedup, memory decay, relationship strength, REST API with OpenAPI docs, import/export, and incremental consolidation with passive auto-extraction.

- [x] **Phase 18: Schema Foundation** - Versioned migration framework and all v5.0 schema columns added safely before any feature phase begins (completed 2026-03-27)
- [x] **Phase 19: Temporal Versioning + Dedup Resolution** - Observations track valid_from/valid_until; new memories route through ADD/UPDATE/NOOP classification before write (completed 2026-03-27)
- [x] **Phase 20: Relationship Strength Scoring** - Relationship edges gain strength scores reinforced on every re-assertion; edge thickness reflects strength in the dashboard (completed 2026-03-27)
- [x] **Phase 21: Memory Importance Decay** - Unreinforced facts fade via lazy decay at read time; recall ranking factors in effective confidence (completed 2026-03-27)
- [ ] **Phase 22: Core Refactor + REST Write Routes + Import/Export** - Business logic moves to packages/core; Hono server gains write endpoints, OpenAPI docs, API key auth, and export/import tools
- [ ] **Phase 23: Auto-Extraction + Incremental Consolidation** - Episodes trigger passive entity extraction and micro-consolidation on log_episode without blocking MCP responses

## Phase Details

### Phase 18: Schema Foundation
**Goal**: The database migration system runs each migration exactly once and all v5.0 schema columns are present with safe defaults before any feature code touches them
**Depends on**: Phase 17 (v4.0 complete)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. The server starts on a fresh database and on an existing v3.0/v4.0 database without errors, data loss, or duplicate ALTER TABLE execution
  2. A `schema_migrations` table exists in the database and contains one row per migration that has been applied, with a timestamp
  3. All v5.0 columns (`valid_from`, `valid_until`, `last_accessed_at`, `decay_exempt`, `strength`, `reinforcement_count`, `merged_into`) exist on their respective tables after startup
  4. TypeScript interfaces in `packages/core/src/types.ts` reflect the new columns — no `any` casts required to access them
**Plans**: 1 plan
Plans:
- [x] 18-01-PLAN.md — Migration framework + v5.0 schema columns + TypeScript types

### Phase 19: Temporal Versioning + Dedup Resolution
**Goal**: Facts carry version history so the graph is never silently overwritten, and every incoming memory is classified as a new addition, an update to an existing fact, or a duplicate before it is committed
**Depends on**: Phase 18
**Requirements**: TEMP-01, TEMP-02, TEMP-03, DEDUP-01, DEDUP-02, DEDUP-03, DEDUP-04
**Success Criteria** (what must be TRUE):
  1. After calling `remember` with an updated fact about an entity, the old observation has a non-null `valid_until` timestamp and the new observation has `valid_from` set to the current time
  2. Calling the recall tool with an `as_of` timestamp returns only observations that were valid at that point in time, not the current versions
  3. When the same observation is submitted twice, the second call is classified as NOOP and does not create a duplicate row in the observations table
  4. When a conflicting fact is submitted (different value for same attribute), the old observation is soft-retired and the new one is inserted in a single atomic operation
  5. Entity merges use a `merged_into` column soft-delete — after a merge, the source entity still exists in the database with its `merged_into` field set, and prior observations remain queryable
**Plans**: 3 plans
Plans:
- [x] 19-01-PLAN.md — Dedup classification pipeline + rememberEntity integration
- [x] 19-02-PLAN.md — Entity merge soft-delete (merged_into)
- [x] 19-03-PLAN.md — Temporal query filtering (as_of + history params)

### Phase 20: Relationship Strength Scoring
**Goal**: Every relationship in the knowledge graph carries a strength score that grows each time it is reinforced by a `remember` call, and the dashboard graph visualizes edge weight via line thickness
**Depends on**: Phase 18
**Requirements**: STRENGTH-01, STRENGTH-02, STRENGTH-03
**Success Criteria** (what must be TRUE):
  1. Calling `remember` with the same entity relationship multiple times increases the relationship's `strength` score and `reinforcement_count` — a single `remember` does not reset the count to 1
  2. The upsert is idempotent — calling `remember` for a relationship that already exists updates strength rather than creating a duplicate relationship row
  3. The dashboard knowledge graph renders edges with varying line thickness proportional to relationship strength — a newly created relationship is visually thinner than a reinforced one
**Plans**: 1 plan
Plans:
- [x] 20-01-PLAN.md — Upsert SQL, API strength passthrough, dashboard edge width + tooltip
**UI hint**: yes

### Phase 21: Memory Importance Decay
**Goal**: Recall results account for how recently and how often a fact has been accessed, so stale unreinforced memories rank lower than actively reinforced ones — without any write overhead in the hot path
**Depends on**: Phase 18
**Requirements**: DECAY-01, DECAY-02, DECAY-03
**Success Criteria** (what must be TRUE):
  1. Two observations with the same base confidence score rank differently in recall results if one was accessed recently and the other has not been accessed in 30+ days
  2. The `computeEffectiveConfidence` function takes `last_accessed_at` and `reinforcement_count` as inputs and returns a value without reading from or writing to the database — it is a pure computation
  3. Entities marked as `decay_exempt` (preference, constraint, decision, architecture types) return their base confidence score unchanged regardless of access recency
**Plans**: 2 plans
Plans:
- [x] 21-01-PLAN.md — Pure decay function (computeEffectiveConfidence) + unit tests + core export
- [x] 21-02-PLAN.md — Integrate decay scoring into recall/query pipelines + lazy last_accessed_at write

### Phase 22: Core Refactor + REST Write Routes + Import/Export
**Goal**: Business logic is accessible to both MCP tools and REST clients from a shared `packages/core/memory-ops.ts` module, the REST API exposes full write operations with OpenAPI documentation and optional auth, and users can export or import their entire knowledge graph via MCP tool or HTTP endpoint
**Depends on**: Phase 19, Phase 20, Phase 21
**Requirements**: API-01, API-02, API-03, IO-01, IO-02, IO-03, IO-04
**Success Criteria** (what must be TRUE):
  1. A LangGraph or CrewAI client can call `POST /api/memory/remember`, `POST /api/memory/recall`, and `POST /api/memory/forget` over HTTP and receive the same results as using the MCP tools directly
  2. Navigating to `/api/docs` (or equivalent) in a browser displays interactive OpenAPI documentation covering all write endpoints
  3. An agent with a valid `MYCO_API_KEY` configured can authenticate write requests; requests without the key are rejected with 401 when auth is enabled
  4. Calling the `export_graph` MCP tool or `GET /api/export` produces a JSON file that, when imported with `import_graph` or `POST /api/import`, restores the exact same set of entities, observations, and relationships with no data loss or duplication
  5. The import tool accepts a Mem0-format JSON or the Anthropic reference server JSONL format and successfully loads its entries into the Myco knowledge graph
**Plans**: 1 plan
Plans:
- [ ] 22-XX-PLAN.md — [To be planned]

### Phase 23: Auto-Extraction + Incremental Consolidation
**Goal**: Every `log_episode` call passively captures entities and relationships from the conversation context via LLM extraction without blocking the response, and high-confidence episodes trigger a micro-consolidation immediately rather than waiting for the nightly 2am cycle
**Depends on**: Phase 19, Phase 20, Phase 21
**Requirements**: EXTRACT-01, EXTRACT-02, EXTRACT-03, CONSOL-01, CONSOL-02, CONSOL-03
**Success Criteria** (what must be TRUE):
  1. After calling `log_episode` with a conversation mentioning entities, new pending approval items appear in the approval queue within seconds — the MCP tool response itself is not delayed
  2. All auto-extracted entities appear in the approval queue with `source_type: 'auto_extracted'` before any of them become permanent knowledge — none are auto-approved directly into the graph
  3. Calling `log_episode` 10 times in rapid succession results in exactly one consolidation run, not 10 — the consolidation lock prevents duplicate processing
  4. After the nightly cron fires, the consolidation log shows relationship inference and contradiction detection steps that do not appear in the incremental micro-consolidation output
  5. When both an incremental trigger and the nightly cron attempt to consolidate simultaneously, one waits for the lock and runs after — no episodes are processed twice
**Plans**: 1 plan
Plans:
- [ ] 23-XX-PLAN.md — [To be planned]

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Storage Foundation | v1.0 | 2/2 | Complete | 2026-03-20 |
| 2. MCP Server + Memory | v1.0 | 2/2 | Complete | 2026-03-21 |
| 3. Consolidation + Approval | v1.0 | 3/3 | Complete | 2026-03-21 |
| 4. REST API + PWA | v1.0 | 5/5 | Complete | 2026-03-21 |
| 5. GSD Integration | v1.0 | 2/2 | Complete | 2026-03-21 |
| 6. Rename | v2.0 | 3/3 | Complete | 2026-03-22 |
| 7. Tech Debt | v2.0 | 1/1 | Complete | 2026-03-22 |
| 8. Open Source Packaging | v2.0 | 2/2 | Complete | 2026-03-22 |
| 9. Config + Embedding Performance | v3.0 | 2/2 | Complete | 2026-03-25 |
| 10. Prepared Statements | v3.0 | 2/2 | Complete | 2026-03-25 |
| 11. Query Filters + Error Handling | v3.0 | 2/2 | Complete | 2026-03-25 |
| 12. Namespace Isolation | v3.0 | 2/2 | Complete | 2026-03-26 |
| 13. Theme + Language Foundation | v4.0 | 1/1 | Complete | 2026-03-27 |
| 14. Graph Core Features | v4.0 | 3/3 | Complete | 2026-03-27 |
| 15. Timeline Animation | v4.0 | 1/1 | Complete | 2026-03-27 |
| 16. Home Page Enhancements | v4.0 | 2/2 | Complete | 2026-03-27 |
| 17. Approvals Overhaul | v4.0 | 2/2 | Complete | 2026-03-27 |
| 18. Schema Foundation | v5.0 | 1/1 | Complete    | 2026-03-27 |
| 19. Temporal Versioning + Dedup Resolution | v5.0 | 3/3 | Complete    | 2026-03-27 |
| 20. Relationship Strength Scoring | v5.0 | 1/1 | Complete    | 2026-03-27 |
| 21. Memory Importance Decay | v5.0 | 2/2 | Complete   | 2026-03-27 |
| 22. Core Refactor + REST Write Routes + Import/Export | v5.0 | 0/? | Not started | - |
| 23. Auto-Extraction + Incremental Consolidation | v5.0 | 0/? | Not started | - |
