---
phase: 10-prepared-statements
plan: 02
subsystem: api
tags: [better-sqlite3, prepared-statements, hono, api-server, performance]

# Dependency graph
requires:
  - phase: 10-prepared-statements/10-01
    provides: prepareStatements factory and MycoStatements interface in @myco/core
provides:
  - api-server fully refactored to use prepared statements for all 5 route groups
  - getStatements() lazy-caching singleton in api-server/db.ts
  - 18 new statements added to MycoStatements covering dashboard aggregates, paginated queries, graph data, and approval listing
affects:
  - 11-query-filters (route handler patterns established for stmts usage)
  - 12-namespace-isolation (MycoStatements will need project column extensions to existing statements)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route factory signature: (db: Database.Database, stmts: MycoStatements): Hono — db kept for transaction() access, stmts used for all queries"
    - "Statement naming convention: countX for aggregate COUNT queries, selectXPaginated for LIMIT/OFFSET queries, selectXById for single-row lookups"

key-files:
  created: []
  modified:
    - packages/core/src/statements.ts
    - packages/api-server/src/db.ts
    - packages/api-server/src/index.ts
    - packages/api-server/src/routes/approvals.ts
    - packages/api-server/src/routes/dashboard.ts
    - packages/api-server/src/routes/entities.ts
    - packages/api-server/src/routes/episodes.ts
    - packages/api-server/src/routes/graph.ts

key-decisions:
  - "db kept as first parameter in all route factories — needed for db.transaction() calls in the approvals PATCH handler; not used for direct queries"
  - "18 new statements added to core statements.ts rather than declaring route-local prepares — keeps all SQL in one place"
  - "selectConnectedEntities takes 3 identical id parameters matching the original query (CASE WHEN from_id=? THEN to_id ELSE from_id END with WHERE from_id=? OR to_id=?)"

patterns-established:
  - "Route factory pattern: factory accepts (db, stmts) and uses stmts for all queries; db only for transaction() wrapper"
  - "Aggregate statement naming: countX (no args), countXAfter (1 arg: timestamp)"
  - "Paginated statement naming: selectXPaginated (2 args: limit, offset) or selectXPaginated (1 arg: limit)"

requirements-completed: [STMT-01, STMT-02]

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 10 Plan 02: API Server Prepared Statements Summary

**All 5 API route groups refactored to use pre-compiled prepared statements; 18 new dashboard/query statements added to the @myco/core factory**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-25T21:40:00Z
- **Completed:** 2026-03-25T21:43:22Z
- **Tasks:** 2 of 2
- **Files modified:** 8

## Accomplishments

- Added `getStatements()` lazy-caching function to `api-server/src/db.ts` that compiles statements once and caches them for the process lifetime
- Extended `MycoStatements` interface and `prepareStatements()` factory with 18 new statements covering all API server query patterns (dashboard aggregates, paginated entity/episode listings, entity detail lookups, graph node/relationship queries, approval listing)
- Refactored all 5 route files (approvals, dashboard, entities, episodes, graph) — zero inline `db.prepare()` calls remain in any route handler
- All 85 tests pass, TypeScript compiles cleanly across all 3 packages

## Task Commits

1. **Task 1: Update API server db.ts and index.ts** - `e733ec4` (feat)
2. **Task 2: Refactor all API route files to use prepared statements** - `4ac9779` (feat)

## Files Created/Modified

- `packages/core/src/statements.ts` — Extended with 18 new statements: 10 dashboard aggregates (countPendingApprovals, countEntities, countRelationships, countObservations, selectRecentEpisodes, selectTopConnected, selectTypeBreakdown, countEntitiesAfter, countObservationsAfter, countRelationshipsAfter) and 8 route-specific queries (selectAllPendingApprovals, selectEntitiesPaginated, selectEntityById, selectObservationsByEntity, selectConnectedEntities, selectGraphNodes, selectGraphRelationships, selectEpisodesPaginated)
- `packages/api-server/src/db.ts` — Added `getStatements()` with `_stmts` lazy cache; imports `prepareStatements` and `MycoStatements` from `@myco/core`
- `packages/api-server/src/index.ts` — Calls `getStatements()` at startup; passes `stmts` as second argument to all 5 route factory calls
- `packages/api-server/src/routes/approvals.ts` — Signature updated to `(db, stmts)`; all `db.prepare()` calls replaced with `stmts.*`; `db` retained for `db.transaction()` wrapper
- `packages/api-server/src/routes/dashboard.ts` — 10 inline prepare calls replaced with corresponding `stmts.*` properties
- `packages/api-server/src/routes/entities.ts` — 3 inline prepare calls replaced with `stmts.selectEntitiesPaginated`, `stmts.selectEntityById`, `stmts.selectObservationsByEntity`, `stmts.selectConnectedEntities`
- `packages/api-server/src/routes/episodes.ts` — 1 inline prepare call replaced with `stmts.selectEpisodesPaginated`
- `packages/api-server/src/routes/graph.ts` — 2 inline prepare calls replaced with `stmts.selectGraphNodes`, `stmts.selectGraphRelationships`

## Decisions Made

- `db` kept as first parameter in route factory signatures even though it's no longer used for direct queries — it's required for `db.transaction()` in the approvals PATCH handler. Removing it would require rewriting the transaction pattern.
- All 18 new SQL statements were added to `packages/core/src/statements.ts` rather than being declared locally in api-server. This keeps all SQL in one auditable location and makes the "no inline db.prepare()" guarantee meaningful.
- The `selectConnectedEntities` statement correctly passes the entity ID three times (`all(id, id, id)`) matching the original query structure which uses `?` for CASE WHEN, WHERE from_id, and WHERE to_id.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- TypeScript compilation failed on first attempt after writing route files — the api-server was referencing the cached `.d.ts` for `@myco/core` which didn't yet include the new statements. Required `npx tsc --build packages/core/tsconfig.json` to regenerate declaration files. This is expected behavior with project references — not a bug.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Prepared statement migration is complete across all packages (mcp-server in Plan 01, api-server in Plan 02)
- Zero inline `db.prepare()` calls remain in any hot-path route handler — only the 2 STMT-02 exceptions (dynamic WHERE in `queryEntities`, dynamic IN() in `markBatchConsolidated`) remain by design
- Phase 11 (query filters + error handling) can use the same `stmts` pattern for any new filter statements it needs to add

---
*Phase: 10-prepared-statements*
*Completed: 2026-03-25*
