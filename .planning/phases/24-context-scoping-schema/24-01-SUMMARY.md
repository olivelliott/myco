---
phase: 24-context-scoping-schema
plan: "01"
subsystem: core
tags: [schema, migrations, prepared-statements, context-scoping, sqlite]
dependency_graph:
  requires: []
  provides: [project_paths-table, selectProjectForPath-walk-up, ProjectPath-type]
  affects: [packages/core, phase-25-session-start-recall, phase-26-myco-init]
tech_stack:
  added: [migrations.ts migration framework with schema_migrations tracking]
  patterns: [named-parameter-prepared-statements, slash-boundary-LIKE-walk-up]
key_files:
  created:
    - packages/core/src/migrations.ts
    - packages/core/tests/project-paths.test.ts
  modified:
    - packages/core/src/schema.ts
    - packages/core/src/statements.ts
    - packages/core/src/types.ts
    - packages/core/src/index.ts
decisions:
  - "Migration framework (migrations.ts + schema_migrations table) added alongside existing try/catch ALTER TABLE pattern in schema.ts — new tables use migration tracking, legacy column additions keep try/catch"
  - "selectProjectForPath uses named $path parameter with two conditions: exact match OR slash-boundary LIKE (directory_path || '/%') — prevents false prefix matches like /a/bx matching /a/b"
  - "runMigrations() called at end of applySchema() to maintain single entry point for DB initialization"
metrics:
  duration: "2 minutes"
  completed: "2026-03-29"
  tasks_completed: 2
  files_created: 2
  files_modified: 4
---

# Phase 24 Plan 01: Context Scoping Schema Summary

**One-liner:** project_paths table with slash-boundary walk-up resolution, migration framework with schema_migrations tracking, and ProjectPath type exported from @myco/core.

## What Was Built

Foundation for Phase 25 (session-start recall) and Phase 26 (myco init): any downstream feature can now resolve a working directory to a project entity via `stmts.selectProjectForPath.get({ path: '/some/dir' })`.

### New Files

**`packages/core/src/migrations.ts`**
- `Migration` interface and `migrations` array (id, name, up callback)
- `runMigrations(db)` — creates `schema_migrations` tracking table, runs pending migrations idempotently
- Migration 9: `CREATE TABLE IF NOT EXISTS project_paths` with columns: id TEXT PK, project_name TEXT NOT NULL, directory_path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
- Index: `idx_project_paths_directory` on `directory_path`

**`packages/core/tests/project-paths.test.ts`** (12 tests, all passing)
- Table structure and UNIQUE constraint tests
- Walk-up resolution: exact match, single ancestor, nearest ancestor wins
- Slash-boundary edge case: `/a/bx` does NOT match `/a/b`
- deleteProjectPath CRUD round-trip
- selectAllProjectPaths ordering
- Migration idempotency: reopen database without error
- schema_migrations row: id=9, name='create_project_paths'

### Modified Files

**`packages/core/src/schema.ts`** — imports and calls `runMigrations(db)` at end of `applySchema()`

**`packages/core/src/statements.ts`** — four new statements added:
- `insertProjectPath` — positional params (id, project_name, directory_path, created_at)
- `deleteProjectPath` — by directory_path
- `selectProjectForPath` — named `$path` param, slash-boundary LIKE, ORDER BY LENGTH DESC LIMIT 1
- `selectAllProjectPaths` — ordered by directory_path

**`packages/core/src/types.ts`** — `ProjectPath` interface added (Phase 24 context scoping section)

**`packages/core/src/index.ts`** — `ProjectPath` added to type exports

## Walk-up Resolution Design

```sql
SELECT id, project_name, directory_path, created_at
FROM project_paths
WHERE ($path = directory_path OR $path LIKE directory_path || '/%')
ORDER BY LENGTH(directory_path) DESC
LIMIT 1
```

- Exact match: `/a/b` finds `/a/b`
- Subdirectory match: `/a/b/c/d` finds `/a/b` (and `/a` if registered — longest wins)
- Slash boundary: `/a/bx` does NOT match `/a/b` (the `/%` requires a `/` separator)

## Commits

| Hash | Description |
|------|-------------|
| 62ba959 | test(24-01): add failing tests for project_paths walk-up resolution |
| b545ec7 | feat(24-01): project_paths table, walk-up resolution, ProjectPath type |

## Deviations from Plan

**1. [Rule 1 - Architecture] Migration framework added alongside existing try/catch ALTER TABLE pattern**
- **Found during:** Task 1 — `migrations.ts` referenced in plan did not exist; codebase used `schema.ts` with inline try/catch migrations
- **Issue:** Plan specified a `migrations.ts` but the file didn't exist and the schema pattern differed from what the plan described
- **Fix:** Created `migrations.ts` with `runMigrations()` + `schema_migrations` tracking. Existing try/catch migrations in `schema.ts` were left untouched (backward compatible). New `project_paths` table is added via the new migration framework, giving it proper tracking.
- **Files modified:** `packages/core/src/migrations.ts` (new), `packages/core/src/schema.ts`
- **Commits:** b545ec7

**2. [Rule 2 - Pre-emptive] Slash-boundary LIKE applied in Task 1 implementation**
- **Found during:** Task 1 — plan warned about LIKE pattern false-match in Task 2 description
- **Fix:** Applied the correct `$path = directory_path OR $path LIKE directory_path || '/%'` query from the start, and included the edge-case test in the initial test file rather than as a separate Task 2 commit
- **Result:** Task 1 and Task 2 were effectively combined into a single coherent implementation pass

## Known Stubs

None.

## Self-Check: PASSED

- [x] `packages/core/src/migrations.ts` exists
- [x] `packages/core/tests/project-paths.test.ts` exists
- [x] `grep create_project_paths migrations.ts` — found at line 16
- [x] `grep selectProjectForPath statements.ts` — found at lines 77 and 381
- [x] `grep ProjectPath types.ts` — found at line 96
- [x] `grep ProjectPath index.ts` — found at line 18
- [x] All 12 project-paths tests pass
- [x] All 35 existing core tests pass (no regressions)
- [x] Commits 62ba959 and b545ec7 exist
