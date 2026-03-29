---
phase: 19-temporal-versioning-dedup-resolution
plan: 03
subsystem: mcp-server
tags: [temporal, as_of, history, recall, query, sqlite, tdd]

# Dependency graph
requires:
  - 19-01 (valid_from/valid_until columns, retireObservation, classifyObservation)
  - 18-01 (versioned migration framework that adds valid_from/valid_until columns)
provides:
  - as_of parameter on recall tool (point-in-time observations)
  - as_of + history parameters on query tool
  - valid_until IS NULL on all default query paths (KNN, FTS, direct select)
  - selectAllObservationsByEntityId for full version history
affects:
  - 20-decay-engine (temporal queries used by decay reads)
  - all consumers of queryEntities and recallKnowledge

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fast path guard: useDefaultTemporalOnly — prepared stmts used when no filters beyond default temporal"
    - "Temporal filter always applied first in conditions[] before entity/confidence/project filters"
    - "KNN/FTS/direct SELECT all have valid_until IS NULL baked into prepared stmts (default path)"
    - "Dynamic WHERE used for as_of: valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)"
    - "history=true uses selectAllObservationsByEntityId prepared stmt (all versions, no filter)"
    - "as_of path uses inline db.prepare() (STMT-02 exception: runtime SQL construction)"
    - "valid_from/valid_until fields only included in output when history or as_of is specified"

key-files:
  created:
    - packages/mcp-server/tests/temporal-query.test.ts
  modified:
    - packages/core/src/statements.ts
    - packages/mcp-server/src/tools.ts

key-decisions:
  - "valid_until IS NULL added to JOIN clause (not WHERE) for knnSearchObservations and ftsSearchObservations — filters at join time before entity lookup"
  - "useDefaultTemporalOnly guard: fast-path prepared stmts already have temporal filter baked in; dynamic path only used when as_of or other filters present"
  - "history output always includes valid_from/valid_until; default output never does — keeps backward compatibility clean"
  - "as_of FTS path uses dynamic WHERE (temporal conditions prepended to conditions array); fast path skipped when as_of is set"

requirements-completed: [TEMP-02]

# Metrics
duration: 7min
completed: 2026-03-27
---

# Phase 19 Plan 03: Temporal Query Filtering Summary

**Temporal as_of and history query filtering added to recall and query tools with valid_until IS NULL on all default query paths**

## Performance

- **Duration:** 7 min
- **Completed:** 2026-03-27
- **Tasks:** 2 (feat + TDD tests)
- **Files modified:** 3

## Accomplishments

- Added `valid_until IS NULL` to `knnSearchObservations`, `ftsSearchObservations`, `knnSearchForContradiction`, and `selectObservationsByEntityId` — all default paths now exclude retired observations
- Added `selectAllObservationsByEntityId` prepared statement (history view: all versions with `valid_from`/`valid_until`, ordered by `valid_from DESC`)
- Added `as_of?: string` parameter to `recallKnowledge` — point-in-time filtering via dynamic WHERE: `valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)`
- Added `as_of?: string` and `history?: boolean` parameters to `queryEntities` — three-way branch: default/as_of/history
- Updated `recall` Zod schema with `as_of` (`z.string().datetime({ offset: true }).optional()`)
- Updated `query` Zod schema with `as_of` and `history` (`z.boolean().default(false)`)
- Fast path preserved: `useDefaultTemporalOnly` guard ensures prepared statements used when no additional filters
- Backward compatible: calling without `as_of`/`history` behaves identically to pre-plan behavior
- 15 integration tests covering all temporal query paths: current-only, history, point-in-time (two timestamps), FTS exclusion of retired observations

## Task Commits

1. **Task 1: Temporal filter implementation** - `39031d4` (feat)
2. **Task 2: Integration tests** - `57a1675` (test)

## Files Created/Modified

- `packages/core/src/statements.ts` — `valid_until IS NULL` on KNN/FTS/direct-select fast paths; new `selectAllObservationsByEntityId`; updated `MycoStatements` interface
- `packages/mcp-server/src/tools.ts` — `as_of`/`history` on `recallKnowledge` and `queryEntities`; updated Zod schemas; updated tool handler call sites
- `packages/mcp-server/tests/temporal-query.test.ts` — 15 tests: prepared statement current-only, history view, queryEntities default/history/as_of, FTS temporal filtering

## Decisions Made

- `valid_until IS NULL` added to JOIN clause for KNN and FTS statements — filters at join time before entity lookup, slightly more efficient than WHERE clause filter
- `useDefaultTemporalOnly` guard — preserves fast path when no extra filters; any additional filter (as_of, entity_type, etc.) forces dynamic WHERE
- History output includes `valid_from`/`valid_until` fields; default output omits them — keeps backward compatibility and avoids schema leakage in default responses
- `as_of` for `queryEntities` uses inline `db.prepare()` (STMT-02 exception) — different SQL structure at runtime

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files verified:
- `packages/mcp-server/tests/temporal-query.test.ts` — exists (234 lines)
- `packages/core/src/statements.ts` — `valid_until IS NULL` in 4 statements, `selectAllObservationsByEntityId` present
- `packages/mcp-server/src/tools.ts` — `as_of` on recallKnowledge, `as_of`/`history` on queryEntities, Zod schemas updated
- Commits: 39031d4, 57a1675 — both present
- Tests: 137 passing (122 existing + 15 new)

---
*Phase: 19-temporal-versioning-dedup-resolution*
*Completed: 2026-03-27*
