---
phase: 18-schema-foundation
plan: "01"
subsystem: core
tags: [migrations, schema, database, infrastructure]
dependency_graph:
  requires: []
  provides: [migration-framework, schema_migrations-table]
  affects: [packages/core]
tech_stack:
  added: []
  patterns: [versioned-migrations, schema_migrations-tracking-table, idempotent-up-functions]
key_files:
  created:
    - packages/core/src/migrations.ts
  modified:
    - packages/core/src/schema.ts
    - packages/core/src/db.ts
    - packages/core/src/index.ts
decisions:
  - "Migration up() functions use try/catch on ALTER TABLE ADD COLUMN to handle existing databases that already have these columns from the old pattern — the schema_migrations INSERT happens after success so next startup skips them"
  - "runMigrations wraps each migration in db.transaction() so partial failures leave no partial state"
metrics:
  duration: "1 minute"
  completed: "2026-03-27"
  tasks_completed: 1
  files_modified: 4
---

# Phase 18 Plan 01: Schema Migration Framework Summary

**One-liner:** Versioned schema migration framework with schema_migrations tracking table, replacing 4 existing try/catch ALTER TABLE blocks with numbered idempotent migrations.

## What Was Built

A lightweight migration framework in `packages/core/src/migrations.ts` that:

- Defines a `Migration` interface `{ id: number; name: string; up: (db) => void }`
- Creates a `schema_migrations` table (id, name, applied_at) on first run
- Reads already-applied migration IDs and skips them on subsequent startups
- Wraps each migration's `up()` in `db.transaction()` for atomicity
- Logs each applied migration to stderr: `[myco] Applied migration N: name`

Four existing try/catch ALTER TABLE blocks from `schema.ts` were absorbed into numbered migrations:

| ID | Name | Change |
|----|------|--------|
| 1 | add_needs_embedding | `observations.needs_embedding INTEGER NOT NULL DEFAULT 0` + partial index |
| 2 | add_consolidated_at | `episodes.consolidated_at TEXT` + partial index |
| 3 | add_approval_metadata | `approval_queue.metadata TEXT` |
| 4 | add_entity_project | `entities.project TEXT DEFAULT NULL` + index |

`schema.ts` now contains only `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements — no migration logic.

`db.ts` calls `runMigrations(db)` immediately after `applySchema(db)`.

`index.ts` exports `runMigrations` and the `Migration` type.

## Verification

- TypeScript compiles cleanly: `npx tsc -p packages/core/tsconfig.json --noEmit` — no errors
- `grep -c "try {" packages/core/src/schema.ts` returns 0
- All 4 migrations present in migrations.ts
- `schema_migrations` table defined and queried in runMigrations

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `packages/core/src/migrations.ts` — EXISTS
- `packages/core/src/schema.ts` — EXISTS (try/catch blocks removed)
- `packages/core/src/db.ts` — EXISTS (runMigrations call added)
- `packages/core/src/index.ts` — EXISTS (runMigrations exported)
- Commit 227f24b — EXISTS
