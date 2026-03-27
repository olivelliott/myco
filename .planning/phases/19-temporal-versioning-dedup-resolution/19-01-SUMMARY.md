---
phase: 19-temporal-versioning-dedup-resolution
plan: 01
subsystem: mcp-server
tags: [dedup, temporal, sqlite, classification, tdd]

# Dependency graph
requires:
  - 18-schema-foundation (valid_from/valid_until columns on observations)
provides:
  - classifyObservation function (ADD/UPDATE/NOOP) in dedup.ts
  - retireObservation function setting valid_until
  - NEAR_DUP_DISTANCE_THRESHOLD = 0.08 constant
  - valid_from set on every new observation insert
  - rememberEntity wired to classification pipeline
affects:
  - 19-02 (temporal query as_of parameter — reads valid_from/valid_until)
  - 20-decay-engine (decay reads valid_from, strength, reinforcement_count)
  - all consumers of insertObservation (parameter count changed +1)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: failing test commit (RED) before implementation commit (GREEN)"
    - "STMT-02 exception: inline db.prepare() for KNN near-dup query (dynamic entity filter)"
    - "Atomic retire+insert via db.transaction() for UPDATE classification"
    - "Embedding fetched before classification — classifier needs it for near-dup check"
    - "Application-side now timestamp: new Date().toISOString() passed to both created_at and valid_from"

key-files:
  created:
    - packages/mcp-server/src/dedup.ts
    - packages/mcp-server/tests/dedup.test.ts
  modified:
    - packages/core/src/statements.ts
    - packages/mcp-server/src/tools.ts
    - packages/api-server/src/routes/approvals.ts
    - packages/core/tests/statements.test.ts

key-decisions:
  - "Embedding fetched BEFORE classifyObservation call — KNN near-dup check needs embedding upfront, avoids second async call"
  - "KNN near-dup query uses inline db.prepare() (STMT-02 exception) — dynamic entity_id and valid_until IS NULL filter require runtime SQL"
  - "UPDATE transaction wraps only retire+FTS insert — vec embedding insert happens after transaction (no nested transaction needed)"
  - "NOOP updates entity timestamp but skips observation insert — keeps entity freshness while preventing duplicates"
  - "valid_from = now for both created_at and valid_from on new observations — they're the same value at insert time"

requirements-completed: [TEMP-01, TEMP-03, DEDUP-01, DEDUP-02, DEDUP-04]

# Metrics
duration: 4min
completed: 2026-03-27
---

# Phase 19 Plan 01: Dedup Classification Pipeline Summary

**Dedup classification pipeline (ADD/UPDATE/NOOP) wired into rememberEntity write path with valid_from timestamps on all new observations**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-27T21:40:05Z
- **Completed:** 2026-03-27T21:43:40Z
- **Tasks:** 2 (TDD: 3 commits — RED, GREEN, wiring)
- **Files modified:** 6

## Accomplishments

- Created `dedup.ts` with `classifyObservation` (ADD/UPDATE/NOOP), `retireObservation`, and `NEAR_DUP_DISTANCE_THRESHOLD = 0.08`
- 10 dedup tests covering all classification paths, retired-observation exclusion, and most-recent near-dup selection
- Updated `insertObservation` and `insertObservationWithEmbeddingFlag` SQL to include `valid_from` column (10 params, was 9)
- Wired `classifyObservation` into `rememberEntity`: embedding fetched first, then classify, then branch ADD/UPDATE/NOOP
- UPDATE path atomically retires old observation and inserts new in a single `db.transaction()`
- NOOP path skips observation insert entirely (still processes relations)
- Updated all call sites: `approvals.ts`, `statements.test.ts` (3 sites)
- All 122 tests pass (10 new + 112 existing), zero regressions

## Task Commits

Each task committed atomically (TDD pattern):

1. **Task 1 RED: failing dedup tests** - `0466c3e` (test)
2. **Task 1 GREEN: implement dedup.ts** - `d26f42f` (feat)
3. **Task 2: statements + tools wiring** - `0c2283b` (feat)

## Files Created/Modified

- `packages/mcp-server/src/dedup.ts` — `classifyObservation`, `retireObservation`, `NEAR_DUP_DISTANCE_THRESHOLD`
- `packages/mcp-server/tests/dedup.test.ts` — 10 tests: ADD/UPDATE/NOOP, retired-obs exclusion, most-recent near-dup
- `packages/core/src/statements.ts` — `insertObservation` and `insertObservationWithEmbeddingFlag` now include `valid_from`
- `packages/mcp-server/src/tools.ts` — imports classifyObservation/retireObservation; rememberEntity uses classification pipeline
- `packages/api-server/src/routes/approvals.ts` — `insertObservationWithEmbeddingFlag.run` updated with `valid_from` arg
- `packages/core/tests/statements.test.ts` — 3 `insertObservation.run` calls updated with `valid_from` arg

## Decisions Made

- Embedding fetched BEFORE `classifyObservation` call — KNN near-dup check needs the embedding; fetching after would require two async calls
- KNN near-dup query uses inline `db.prepare()` (STMT-02 exception) — filter by entity_id and `valid_until IS NULL` requires runtime-constructed SQL
- `db.transaction()` wraps only retire + observation insert + FTS insert — vec embedding insert happens outside transaction (no nesting needed, and sqlite-vec handles this correctly)
- NOOP path still updates entity timestamp — keeps entity freshness while skipping duplicate observation
- `valid_from = now` matches `created_at = now` — at insert time both timestamps are the same; temporal queries use `valid_from` for history

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files verified:
- `packages/mcp-server/src/dedup.ts` — exists
- `packages/mcp-server/tests/dedup.test.ts` — exists
- Commits: 0466c3e, d26f42f, 0c2283b — all present

---
*Phase: 19-temporal-versioning-dedup-resolution*
*Completed: 2026-03-27*
