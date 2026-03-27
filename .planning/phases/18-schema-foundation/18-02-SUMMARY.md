---
phase: 18-schema-foundation
plan: "02"
subsystem: core
tags: [migrations, schema, database, types, statements, v5.0]
dependency_graph:
  requires: [18-01]
  provides: [v5.0-schema-columns, temporal-columns, decay-columns, relationship-strength, entity-merged-into]
  affects: [packages/core]
tech_stack:
  added: []
  patterns: [idempotent-alter-table-migrations, soft-delete-merged-into, temporal-validity-columns]
key_files:
  created: []
  modified:
    - packages/core/src/migrations.ts
    - packages/core/src/types.ts
    - packages/core/src/statements.ts
decisions:
  - "Each ALTER TABLE in its own try/catch because SQLite stops at the first error in a multi-statement exec — wrapping each ALTER individually allows subsequent columns to be added even if earlier ones already exist"
  - "All new interface fields are optional (?) to avoid breaking existing consumers — feature phases 19-21 will populate them"
  - "Merged entities excluded at the query layer (merged_into IS NULL) rather than a deleted flag — preserves graph history while hiding merged nodes from all active consumers"
metrics:
  duration: "2 minutes"
  completed: "2026-03-27"
  tasks_completed: 2
  files_modified: 3
---

# Phase 18 Plan 02: v5.0 Schema Columns Summary

**One-liner:** Four migrations (5-8) add all v5.0 columns — temporal validity, decay tracking, relationship strength, and soft-delete merge tracking — with TypeScript interfaces and prepared statements updated to match.

## What Was Built

### Migrations 5-8 (packages/core/src/migrations.ts)

Four new migrations appended to the framework established by Plan 01:

| ID | Name | Changes |
|----|------|---------|
| 5 | add_temporal_columns | `observations.valid_from TEXT`, `observations.valid_until TEXT` + 2 indexes |
| 6 | add_decay_columns | `observations.last_accessed_at TEXT`, `observations.decay_exempt INTEGER DEFAULT 0`, `observations.reinforcement_count INTEGER DEFAULT 1` + 1 index |
| 7 | add_relationship_strength | `relationships.strength REAL DEFAULT 1.0`, `relationships.reinforcement_count INTEGER DEFAULT 1` |
| 8 | add_entity_merged_into | `entities.merged_into TEXT DEFAULT NULL` + partial index |

Each ALTER TABLE is wrapped in its own try/catch (separate statements, not batched) to handle existing databases. CREATE INDEX statements run unconditionally with IF NOT EXISTS.

### TypeScript Interfaces (packages/core/src/types.ts)

All three domain interfaces updated with optional new fields:

- `Entity`: added `merged_into?: string | null`
- `Observation`: added `valid_from?`, `valid_until?`, `last_accessed_at?`, `decay_exempt?`, `reinforcement_count?`
- `Relationship`: added `strength?`, `reinforcement_count?`

All fields are optional (`?`) — existing code paths don't populate them yet.

### Prepared Statements (packages/core/src/statements.ts)

12 targeted statement updates:

1. `selectGraphRelationships` — adds `strength` to SELECT
2. `selectGraphNodes` — adds `WHERE e.merged_into IS NULL`
3. `selectObservationsByEntityId` — adds `valid_from, valid_until, last_accessed_at, reinforcement_count` to SELECT
4. `countEntities` — adds `WHERE merged_into IS NULL`
5. `selectEntitiesPaginated` — adds `WHERE merged_into IS NULL`
6. `selectTopConnected` — adds `WHERE e.merged_into IS NULL`
7. `selectTypeBreakdown` — adds `WHERE merged_into IS NULL`
8. `selectConfidenceDistribution` — adds `WHERE merged_into IS NULL`
9. `countOrphanedEntities` — adds `e.merged_into IS NULL AND`
10. `selectRecentActivity` — adds `WHERE e.merged_into IS NULL`
11. `selectAllEntityNames` — adds `WHERE merged_into IS NULL`

INSERT statements are unchanged — new columns have DEFAULT values and will be wired by feature phases 19-21.

## Verification

- TypeScript compiles cleanly: `npx tsc -p packages/core/tsconfig.json --noEmit` — no errors
- 8 new-column lines in types.ts (>= 7 required)
- 9 `merged_into IS NULL` filters in statements.ts (>= 5 required)
- 4 migrations 5-8 present in migrations.ts

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `packages/core/src/migrations.ts` — EXISTS, contains add_temporal_columns, add_decay_columns, add_relationship_strength, add_entity_merged_into
- `packages/core/src/types.ts` — EXISTS, contains valid_from, merged_into, strength
- `packages/core/src/statements.ts` — EXISTS, contains merged_into IS NULL filters and strength column
- Commit 79e73d2 (migrations) — EXISTS
- Commit de3098e (types + statements) — EXISTS
