---
phase: 22-core-refactor-rest-write-routes-import-export
plan: "01"
subsystem: core
tags: [refactor, core, mcp-server, business-logic, architecture]
dependency_graph:
  requires: []
  provides: [memory-ops-in-core, embed-client-in-core, dedup-in-core, relationship-discovery-in-core]
  affects: [mcp-server, api-server-plan-02]
tech_stack:
  added: [ollama dependency in @myco/core]
  patterns: [thin-wrapper pattern for MCP tools, barrel re-export with subpath exports]
key_files:
  created:
    - packages/core/src/memory-ops.ts
    - packages/core/src/embed-client.ts
    - packages/core/src/dedup.ts
    - packages/core/src/relationship-discovery.ts
  modified:
    - packages/core/src/index.ts
    - packages/core/package.json
    - packages/mcp-server/src/tools.ts
    - packages/mcp-server/src/consolidator.ts
    - packages/mcp-server/src/cli.ts
    - packages/mcp-server/tests/server.test.ts
    - packages/mcp-server/tests/recall-filters.test.ts
    - packages/mcp-server/tests/dedup.test.ts
    - packages/mcp-server/tests/relationship-discovery.test.ts
    - packages/mcp-server/tests/temporal-query.test.ts
    - packages/api-server/src/db.ts
  deleted:
    - packages/mcp-server/src/embed-client.ts
    - packages/mcp-server/src/dedup.ts
    - packages/mcp-server/src/relationship-discovery.ts
decisions:
  - "@myco/core/embed-client subpath export added to package.json so vi.spyOn works in tests — memory-ops.js imports embed-client.js directly, not through barrel"
  - "cli.ts updated to import rememberEntity from @myco/core (was from ./tools.js)"
  - "consolidator.ts updated to import rememberEntity and embedText from @myco/core"
  - "Pre-existing TypeScript null assertion bug fixed in api-server/src/db.ts (type cast to Database.Database)"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_modified: 14
---

# Phase 22 Plan 01: Core Refactor — Move Business Logic to @myco/core Summary

Extracted four core business logic functions (remember, recall, query, forget) plus supporting modules from `packages/mcp-server/src/tools.ts` into `packages/core/src/memory-ops.ts`. MCP tool handlers are now thin wrappers that call `@myco/core`. This is the prerequisite for the REST API (Plan 02) to share identical business logic without duplication.

## What Was Built

**New core modules:**
- `packages/core/src/memory-ops.ts` — `rememberEntity`, `recallKnowledge`, `queryEntities`, `forgetEntity`, `logEpisode`, `reEmbedPending`
- `packages/core/src/embed-client.ts` — `embedText`, `embedBatch` (moved from mcp-server verbatim)
- `packages/core/src/dedup.ts` — `classifyObservation`, `retireObservation`, `NEAR_DUP_DISTANCE_THRESHOLD` (imports updated to relative)
- `packages/core/src/relationship-discovery.ts` — `discoverRelationships`, `createBackLinks`, `invalidateEntityCache` (imports updated to relative)

**Updated barrel:** `packages/core/src/index.ts` re-exports all new modules.

**Thin wrapper:** `packages/mcp-server/src/tools.ts` reduced from ~1,100 lines to ~280 lines — only `registerTools` and Zod schemas remain.

**Deleted from mcp-server:** `embed-client.ts`, `dedup.ts`, `relationship-discovery.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript null assertion in api-server/src/db.ts**
- **Found during:** Task 2 build
- **Issue:** `getDb()` returns `Database.Database` but `_db` is typed `Database.Database | null` — TypeScript correctly flagged this as an error (`Type 'null' is not assignable to type 'Database'`). Pre-existing issue exposed when full `tsc --build` ran.
- **Fix:** Added `as Database.Database` cast after the null guard
- **Files modified:** `packages/api-server/src/db.ts`
- **Commit:** f133329

**2. [Rule 1 - Bug] Fixed TypeScript narrowing for merge_candidate_ids in tools.ts**
- **Found during:** Task 2 build
- **Issue:** `meta.merge_candidate_ids` typed as `string[] | undefined` but used inside loop without definite narrowing after the `&&` check
- **Fix:** Extracted to `const mergeCandidates = meta.merge_candidate_ids ?? []` before the conditional
- **Files modified:** `packages/mcp-server/src/tools.ts`
- **Commit:** f133329

**3. [Rule 2 - Missing functionality] Added @myco/core/embed-client subpath export**
- **Found during:** Task 2 test fixing
- **Issue:** `vi.spyOn(embedClient, 'embedText')` in tests needed to spy on the exact same ESM module instance that `memory-ops.js` imports internally. Without a subpath export, tests couldn't import `@myco/core/dist/embed-client.js` by package name.
- **Fix:** Added `"./embed-client": { "import": "./dist/embed-client.js" }` to `packages/core/package.json` exports. Tests now use `import * as embedClient from '@myco/core/embed-client'`.
- **Files modified:** `packages/core/package.json`, all 5 test files
- **Commit:** f133329

**4. [Rule 3 - Blocking] Updated cli.ts and consolidator.ts imports**
- **Found during:** Task 2 build
- **Issue:** `cli.ts` imported `rememberEntity` from `./tools.js` (no longer exported from there). `consolidator.ts` imported `rememberEntity` from `./tools.js` and `embedText` from `./embed-client.js` (deleted).
- **Fix:** Updated both to import from `@myco/core`
- **Files modified:** `packages/mcp-server/src/cli.ts`, `packages/mcp-server/src/consolidator.ts`
- **Commit:** f133329

## Verification Results

1. `npm run build` (tsc --build) — PASS
2. `npm test` — 147 tests passing across 10 test files (0 failures)
3. `grep -c "export.*function" packages/core/src/memory-ops.ts` — 6 (rememberEntity, recallKnowledge, queryEntities, logEpisode, reEmbedPending, forgetEntity)
4. `grep -c "import.*@myco/core" packages/mcp-server/src/tools.ts` — 1

## Known Stubs

None. All functions are fully wired — no placeholder data or stub implementations.

## Self-Check: PASSED
