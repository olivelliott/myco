---
phase: 18-schema-foundation
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, migrations, schema, typescript]

# Dependency graph
requires: []
provides:
  - versioned migration framework (runMigrations) replacing ad-hoc try/catch ALTER TABLE pattern
  - schema_migrations table tracking 9 applied migrations with timestamps
  - v5.0 schema columns: valid_from, valid_until, last_accessed_at, decay_exempt, strength, reinforcement_count on observations; merged_into on entities; strength, reinforcement_count on relationships
  - updated TypeScript interfaces for all new columns
affects:
  - 19-temporal-observations
  - 20-decay-engine
  - 21-entity-merging
  - 22-relationship-strength
  - all v5.0 feature phases (schema prerequisite)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration runner: ordered MIGRATIONS array + schema_migrations table, per-migration transactions, columnExists guards for idempotent upgrades"
    - "TDD: failing tests committed before implementation (RED -> GREEN)"

key-files:
  created:
    - packages/core/src/migrations.ts
    - packages/core/tests/migrations.test.ts
  modified:
    - packages/core/src/db.ts
    - packages/core/src/index.ts
    - packages/core/src/types.ts
    - packages/core/tests/db.test.ts

key-decisions:
  - "columnExists() guards in migrations 002-005 handle v4.0 databases that already have those columns but lack schema_migrations table — avoids duplicate column errors without try/catch"
  - "Per-migration db.transaction() wrappers isolate failures; each migration is atomic and independently rollback-safe"
  - "schema.ts applySchema export removed from index.ts but file not deleted — plan specifies cleanup later"
  - "NOT NULL columns with DEFAULT (decay_exempt, strength, reinforcement_count) typed as required number in TypeScript; nullable columns (valid_from, valid_until, last_accessed_at, merged_into) typed as optional string | null"

patterns-established:
  - "Migration pattern: add to MIGRATIONS array with columnExists guard for any ALTER TABLE on existing tables"
  - "New columns with safe DB defaults need no INSERT statement changes — downstream phases update INSERT signatures when needed"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 3min
completed: 2026-03-27
---

# Phase 18 Plan 01: Schema Foundation Summary

**Versioned SQLite migration framework (9 migrations, schema_migrations table) replacing try/catch ALTER TABLE, with v5.0 columns for temporal versioning, decay, entity merges, and relationship strength**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-27T21:08:11Z
- **Completed:** 2026-03-27T21:11:12Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `migrations.ts` with `runMigrations()`: 9 ordered migrations, `schema_migrations` tracking table, `columnExists()` guards for v4.0 upgrade compatibility
- Wired migration framework into `db.ts`/`index.ts`, replacing `applySchema()` with `runMigrations()`
- Added all v5.0 schema columns (temporal, decay, merge, strength) to observations, entities, and relationships tables
- Updated TypeScript interfaces in `types.ts` for all 7 new columns across 3 interfaces
- 51 core tests passing (38 new + 13 existing), all regressions clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration framework (RED)** - `015e5d6` (test)
2. **Task 1: Create migration framework (GREEN)** - `14d558e` (feat)
3. **Task 2: Wire migration framework into db.ts, update index.ts and types.ts** - `39e86a2` (feat)

_Note: TDD task has two commits (test RED → feat GREEN)_

## Files Created/Modified

- `packages/core/src/migrations.ts` — Migration runner + 9 ordered migrations with columnExists guards
- `packages/core/tests/migrations.test.ts` — 10 tests: fresh DB, idempotency, v5.0 columns, v4.0 upgrade path
- `packages/core/src/db.ts` — Replaced applySchema() with runMigrations()
- `packages/core/src/index.ts` — Exports runMigrations instead of applySchema
- `packages/core/src/types.ts` — Added merged_into to Entity; temporal/decay fields to Observation; strength/reinforcement_count to Relationship
- `packages/core/tests/db.test.ts` — Added 6 tests verifying schema_migrations table and v5.0 columns

## Decisions Made

- `columnExists()` guards in migrations 002-005 handle v4.0 databases that already have those columns but lack a `schema_migrations` table — avoids duplicate column errors without reverting to try/catch
- Per-migration `db.transaction()` wrappers isolate failures; a partial failure rolls back only that migration, not prior work
- `schema.ts` file left on disk (only its export removed from `index.ts`) — plan specifies cleanup is deferred
- NOT NULL columns with DB defaults (`decay_exempt`, `strength`, `reinforcement_count`) typed as required `number` in TypeScript; nullable columns typed as `?: string | null`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Migration framework is complete and wired — all v5.0 phases can proceed
- Phase 19 (temporal observations) can now read/write `valid_from` and `valid_until` columns
- Phase 20 (decay engine) can use `last_accessed_at`, `decay_exempt`, `strength`, `reinforcement_count`
- Phase 21 (entity merging) can use `merged_into` column on entities
- Phase 22 (relationship strength) can use `strength` and `reinforcement_count` on relationships
- Blocker noted in STATE.md: `valid_from` values must be generated in application code before transactions open (not CURRENT_TIMESTAMP in SQL) — applies to Phase 19

---
*Phase: 18-schema-foundation*
*Completed: 2026-03-27*
