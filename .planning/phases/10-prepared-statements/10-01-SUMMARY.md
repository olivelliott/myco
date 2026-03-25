---
phase: 10-prepared-statements
plan: 01
subsystem: database
tags: [better-sqlite3, prepared-statements, sqlite, mcp-server, performance]

# Dependency graph
requires:
  - phase: 09-config-embedding-performance
    provides: Config module, embed client, openDatabase entry point pattern
provides:
  - Typed prepared statement factory (prepareStatements) in @myco/core
  - MycoStatements interface covering all hot-path queries
  - MCP server fully refactored to use pre-compiled statements
affects:
  - 10-02 (api-server prepared statements — factory already available)
  - 11-query-filters (stmts pattern established for new filter statements)
  - 12-namespace-isolation (MycoStatements interface will need project column extensions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "prepareStatements(db) factory pattern — compile all statements once at startup, pass stmts object through call chain"
    - "STMT-02 exception comment pattern for dynamic WHERE/IN clauses that cannot be pre-compiled"
    - "MycoStatements typed interface — all statement keys named by domain and operation (selectEntityByNameType, insertObservation, etc.)"

key-files:
  created:
    - packages/core/src/statements.ts
    - packages/core/tests/statements.test.ts
  modified:
    - packages/core/src/index.ts
    - packages/mcp-server/src/tools.ts
    - packages/mcp-server/src/consolidator.ts
    - packages/mcp-server/src/relationship-discovery.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/cli.ts
    - packages/mcp-server/tests/server.test.ts

key-decisions:
  - "Dynamic WHERE in queryEntities and dynamic IN() in markBatchConsolidated are STMT-02 exceptions — kept as inline db.prepare() with comment"
  - "stmts passed as explicit parameter through call chain (not a module-level singleton) — keeps functions testable with any DB instance"
  - "MycoStatements interface defined in statements.ts and exported from @myco/core index for use by api-server in Plan 02"

patterns-established:
  - "Statement factory pattern: compile once at startup (index.ts/cli.ts), pass stmts down through registerTools, runConsolidation, discoverRelationships"
  - "STMT-02 exception documentation: inline db.prepare() is allowed only for dynamic SQL — must be marked with comment"

requirements-completed: [STMT-01, STMT-02]

# Metrics
duration: 0min
completed: 2026-03-25
---

# Phase 10 Plan 01: Prepared Statement Factory Summary

**`prepareStatements(db)` factory in @myco/core centralizes all 32 hot-path SQL statements; MCP server refactored to compile statements once at startup instead of per-request**

## Performance

- **Duration:** ~0 min (both tasks completed in prior session — verified clean)
- **Started:** 2026-03-25T21:36:39Z
- **Completed:** 2026-03-25
- **Tasks:** 2 of 2
- **Files modified:** 9

## Accomplishments

- Created `packages/core/src/statements.ts` with typed `MycoStatements` interface (32 named statements across 7 domains: entity, observation, relationship, embedding/vector, FTS, episode, approval)
- Refactored all MCP server source files (tools.ts, consolidator.ts, relationship-discovery.ts, index.ts, cli.ts) to use the factory — no inline `db.prepare()` in hot paths
- Statement factory called once after `openDatabase()` at each entry point; `stmts` object passed explicitly through the call chain
- 85 tests passing with zero behavioral regression

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prepared statement factory with tests** - `9b2c886` (test: RED), `aae8f19` (feat: GREEN — statement factory + server refactor combined)

## Files Created/Modified

- `packages/core/src/statements.ts` — `prepareStatements(db)` factory + `MycoStatements` interface (32 statements, 7 domains)
- `packages/core/tests/statements.test.ts` — 5 behavioral tests (keys present, valid Statement objects, fresh DB, no-crash on empty query, insert+select round-trip)
- `packages/core/src/index.ts` — exports `prepareStatements` and `MycoStatements`
- `packages/mcp-server/src/tools.ts` — all hot-path `db.prepare()` replaced with `stmts.*`; STMT-02 exception documented for `queryEntities`
- `packages/mcp-server/src/consolidator.ts` — `runConsolidation` and helpers accept `stmts`; STMT-02 exception documented for `markBatchConsolidated`
- `packages/mcp-server/src/relationship-discovery.ts` — all inline prepare calls replaced with `stmts.*`
- `packages/mcp-server/src/index.ts` — `prepareStatements(db)` called after `openDatabase()`; `stmts` passed to `registerTools`
- `packages/mcp-server/src/cli.ts` — `prepareStatements(db)` called in each subcommand
- `packages/mcp-server/tests/server.test.ts` — test setup updated to call `prepareStatements(db)` and pass `stmts` to function calls

## Decisions Made

- Dynamic WHERE clause in `queryEntities` and dynamic IN() list in `markBatchConsolidated` are legitimate STMT-02 exceptions — cannot be pre-compiled because SQL structure varies at query time. Documented with inline comments.
- `stmts` passed as an explicit function parameter rather than a module-level singleton — keeps each function independently testable with any Database instance.
- `MycoStatements` exported from `@myco/core` so Plan 02 (api-server refactor) can import and reuse the same interface without redeclaring types.

## Deviations from Plan

None — plan executed exactly as written. Both tasks were completed in the prior session; this session verified all acceptance criteria and created the SUMMARY.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `prepareStatements` factory and `MycoStatements` type are available in `@myco/core` for Plan 02 (api-server refactor)
- No blockers — 85 tests passing, zero inline `db.prepare()` in MCP server hot paths

---
*Phase: 10-prepared-statements*
*Completed: 2026-03-25*
