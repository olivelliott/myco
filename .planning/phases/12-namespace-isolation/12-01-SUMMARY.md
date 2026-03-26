---
phase: 12-namespace-isolation
plan: 01
subsystem: core + mcp-server
tags: [schema-migration, namespace-isolation, project-scoping, sqlite, prepared-statements]
dependency_graph:
  requires: [10-01 (prepareStatements factory), 11-01 (recall filters), 11-02 (error handling)]
  provides: [project column on entities, insertEntity 11-param contract, functional project filtering on all MCP tools]
  affects: [packages/core/src/schema.ts, packages/core/src/types.ts, packages/core/src/statements.ts, packages/mcp-server/src/tools.ts]
tech_stack:
  added: []
  patterns: [idempotent ALTER TABLE migration, dynamic WHERE STMT-02 extension, DEFAULT NULL for backward compatibility]
key_files:
  created: []
  modified:
    - packages/core/src/schema.ts
    - packages/core/src/types.ts
    - packages/core/src/statements.ts
    - packages/mcp-server/src/tools.ts
    - packages/core/tests/statements.test.ts
    - packages/mcp-server/tests/recall-filters.test.ts
decisions:
  - DEFAULT NULL for project column — existing entities remain globally visible without migration
  - project ?? null passed to both insertEntity call sites (new entity + relation target)
  - Consolidation-approved facts remain global (resolve_approval handler intentionally omits project)
  - dist/ rebuild required during test run — stale @myco/core dist had old 10-param insertEntity SQL
metrics:
  duration_minutes: 25
  completed_date: "2026-03-26T18:20:28Z"
  tasks_completed: 2
  files_modified: 6
---

# Phase 12 Plan 01: Namespace Isolation — Schema + MCP Tools Summary

**One-liner:** Added `project TEXT DEFAULT NULL` column to entities via idempotent migration and wired project namespace filtering through all three MCP tools (remember stores, recall/query filter).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Schema migration, Entity type, insertEntity 11-param | 2979c90 |
| 2 | Wire project param through remember, recall, query MCP tools | 68e3880 |

## What Was Built

### Task 1 — Schema + Types + Statements

**`packages/core/src/schema.ts`:** Added two idempotent migration blocks after the existing approval_queue metadata migration:
- `ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL` — uses `DEFAULT NULL` per CONTEXT.md locked decision (not `DEFAULT 'default'` from REQUIREMENTS.md which was a draft)
- `CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)` — for project-scoped query performance

**`packages/core/src/types.ts`:** Added `project?: string | null` field to the `Entity` interface. Nullable because NULL means globally visible to all queries.

**`packages/core/src/statements.ts`:**
- Removed stale CRITICAL comment block that warned "No project column referenced here — that column does not exist until Phase 12"
- Updated `insertEntity` SQL from 10 to 11 positional params: added `project` column to the INSERT column list and a `?` placeholder to VALUES

### Task 2 — MCP Tool Wiring

**`packages/mcp-server/src/tools.ts`:**
- `RememberParams` interface gains `project?: string`
- `rememberEntity` destructures `project` from params; passes `project ?? null` as 11th arg to BOTH `insertEntity.run()` call sites (main entity creation at line 99, relation target creation at line 136)
- `recallKnowledge` warning block (Phase 11 no-op) fully removed; `project !== undefined` condition added to the dynamic WHERE `conditions` array — uses `e.project = ?` pattern consistent with other filters
- `queryEntities` gains `project?: string` in params type; adds `e.project = ?` condition (uses `if (project)` truthy check consistent with entity_name/entity_type pattern)
- `registerTools` remember tool: `project: z.string().optional().describe(...)` added to Zod schema and handler destructuring
- `registerTools` recall tool: description updated from "not yet supported — returns warning" to functional
- `registerTools` query tool: `project: z.string().optional()` added to Zod schema, handler destructuring, and `queryEntities` call

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale dist/ caused insertEntity param mismatch in tests**
- **Found during:** Task 2 test run
- **Issue:** Tests import `@myco/core` which resolves to `dist/index.js`. The `dist/statements.js` had the OLD 10-param `insertEntity` SQL (without `project`). When `rememberEntity` passed 11 args (including `project ?? null`) to the 9-`?` prepared statement, better-sqlite3 threw "Too many parameter values were provided"
- **Fix:** Ran `npx tsc -p packages/core/tsconfig.json` to rebuild `dist/`. The dist/ directory is gitignored and not committed — only source files are committed
- **Files modified:** `packages/core/dist/` (ephemeral, not committed)

**2. [Rule 1 - Bug] Direct insertEntity.run() calls in statements.test.ts used old 10-arg signature**
- **Found during:** Task 2 test run
- **Issue:** 8 direct `stmts.insertEntity.run()` calls in `packages/core/tests/statements.test.ts` passed 10 args but insertEntity now has 10 `?` placeholders (11 total columns, 2 hardcoded). Wait — these calls were passing 9 args before (the old SQL had 9 `?`) and now need 10. The calls needed `null` appended as the new `project` arg
- **Fix:** Added `null` as the final arg to all 8 direct `insertEntity.run()` calls in statements.test.ts
- **Files modified:** `packages/core/tests/statements.test.ts`
- **Commit:** 68e3880

**3. [Rule 1 - Bug] Test 4 in recall-filters.test.ts tested the old warning behavior**
- **Found during:** Task 2 test run
- **Issue:** Test 4 was "Test 4: project filter produces warning in metadata" — it expected `metadata.warnings` to contain "project filter is not yet supported". Since we removed the warning infrastructure entirely, this test failed with `AssertionError: expected undefined to be defined`
- **Fix:** Rewrote Test 4 to verify actual project filtering: stores one entity with `project: 'myco'` and one global (NULL project), then recalls with `project: 'myco'` and verifies only the scoped entity appears and no warnings are emitted
- **Additional fix needed:** Initial rewrite used `query: 'entity'` which FTS phrase-search couldn't match against content "MycoEntity is scoped...". Fixed by using `query: 'scoped knowledge'` and content "scoped knowledge belongs to myco namespace only" — exact word match for FTS5
- **Files modified:** `packages/mcp-server/tests/recall-filters.test.ts`
- **Commit:** 68e3880

## Test Results

- **Before:** 90 tests passing (pre-execution baseline)
- **After:** 90 tests passing
- No tests were removed — Test 4 was rewritten to test the actual feature, not the removed stub behavior

## Known Stubs

None. The project param is fully functional end-to-end:
- `remember` stores entities under the specified project namespace
- `recall` filters by project when provided, returns all when omitted
- `query` filters by project when provided
- Existing entities with NULL project remain accessible to all queries

## Self-Check

Checking file existence and commits before finalizing.
