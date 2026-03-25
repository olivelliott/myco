# Roadmap: Myco

## Milestones

- ✅ **v1.0 AI Workbots Brain** — Phases 1-5 (shipped 2026-03-21)
- ✅ **v2.0 Open Source Release** — Phases 6-8 (shipped 2026-03-22)
- 🚧 **v3.0 Performance & Architecture Optimization** — Phases 9-12 (in progress)

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

### 🚧 v3.0 Performance & Architecture Optimization (In Progress)

**Milestone Goal:** Harden the MCP server with performance optimizations, flexible configuration, richer query capabilities, and project isolation — informed by audit against Chroma MCP and comparable repos.

- [x] **Phase 9: Config + Embedding Performance** — dotenv configuration, singleton embedding client with health-check cooldown, and batch embedding support (completed 2026-03-25)
- [ ] **Phase 10: Prepared Statements** — Statement factory pattern extracts all inline db.prepare() calls to startup, eliminating per-request compilation overhead
- [ ] **Phase 11: Query Filters + Error Handling** — Typed filter parameters on recall, Zod validation on API routes, and consistent error response format
- [ ] **Phase 12: Namespace Isolation** — Schema migration adds project column to entities, enabling per-project logical partitioning with full backward compatibility

## Phase Details

### Phase 9: Config + Embedding Performance
**Goal**: The MCP server starts with a reproducible, logged configuration and the embedding client is resilient — singleton-managed, health-cached, and batch-capable
**Depends on**: Phase 8
**Requirements**: CONFIG-01, CONFIG-02, CONFIG-03, EMBED-01, EMBED-02, EMBED-03, EMBED-04
**Success Criteria** (what must be TRUE):
  1. Running `myco` with a .env file containing OLLAMA_HOST causes that host to be used without modifying code
  2. The server prints resolved configuration values to stderr at startup (visible in MCP server logs)
  3. A .env.example file exists at the project root documenting all supported environment variables
  4. Embedding calls during a consolidation run share a single Ollama client instance (no repeated initialization)
  5. When Ollama is unreachable, subsequent embedding calls within 30 seconds return a fast-fail error instead of attempting reconnection
**Plans**: 2 plans
Plans:
- [x] 09-01-PLAN.md — Config layer: dotenv loading, config module, .env.example, entry point wiring
- [x] 09-02-PLAN.md — Embedding client: singleton, health cooldown, batch API, reEmbedPending batch

### Phase 10: Prepared Statements
**Goal**: All hot-path database queries are compiled once at startup, eliminating per-request statement preparation overhead
**Depends on**: Phase 9
**Requirements**: STMT-01, STMT-02
**Success Criteria** (what must be TRUE):
  1. No db.prepare() call appears inside any tool handler or request handler function (auditable via grep)
  2. The MCP server starts up and all tools function correctly using the pre-compiled statement set
**Plans**: 2 plans
Plans:
- [ ] 09-01-PLAN.md — Config layer: dotenv loading, config module, .env.example, entry point wiring
- [x] 09-02-PLAN.md — Embedding client: singleton, health cooldown, batch API, reEmbedPending batch

### Phase 11: Query Filters + Error Handling
**Goal**: The recall tool accepts typed filter parameters that narrow results, and all API routes and MCP tools return structured, consistently-formatted errors
**Depends on**: Phase 10
**Requirements**: QUERY-01, QUERY-02, QUERY-03, QUERY-04, ERR-01, ERR-02, ERR-03
**Success Criteria** (what must be TRUE):
  1. Calling recall with entity_type="technology" returns only entities of that type
  2. Calling recall with min_confidence=0.8 excludes entities below that threshold
  3. An invalid API request body returns a JSON error response with the appropriate HTTP status code (400/422) and a human-readable message
  4. An MCP tool error returns a structured response with consistent shape (not an unhandled exception or freeform string)
**Plans**: 2 plans
Plans:
- [ ] 09-01-PLAN.md — Config layer: dotenv loading, config module, .env.example, entry point wiring
- [ ] 09-02-PLAN.md — Embedding client: singleton, health cooldown, batch API, reEmbedPending batch

### Phase 12: Namespace Isolation
**Goal**: Entities can be scoped to a named project, and existing data remains fully accessible without specifying a project — enabling true multi-project use without data leakage
**Depends on**: Phase 11
**Requirements**: NS-01, NS-02, NS-03, NS-04
**Success Criteria** (what must be TRUE):
  1. Calling remember with project="myco" stores the entity under that project namespace
  2. Calling recall with project="myco" returns only entities from that project
  3. Calling recall without a project filter returns entities across all projects (backward-compatible behavior)
  4. Existing entities stored before this migration remain accessible with no data loss
**Plans**: 2 plans
Plans:
- [ ] 09-01-PLAN.md — Config layer: dotenv loading, config module, .env.example, entry point wiring
- [ ] 09-02-PLAN.md — Embedding client: singleton, health cooldown, batch API, reEmbedPending batch

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
| 9. Config + Embedding Performance | v3.0 | 2/2 | Complete   | 2026-03-25 |
| 10. Prepared Statements | v3.0 | 0/TBD | Not started | - |
| 11. Query Filters + Error Handling | v3.0 | 0/TBD | Not started | - |
| 12. Namespace Isolation | v3.0 | 0/TBD | Not started | - |
