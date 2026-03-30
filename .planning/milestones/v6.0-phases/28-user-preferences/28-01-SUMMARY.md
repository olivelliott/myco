---
phase: 28-user-preferences
plan: 01
subsystem: mcp-server/core
tags: [user-preferences, promotion, global-scope, prepared-statements, tdd]
dependency_graph:
  requires: []
  provides: [promotePreference, selectPreferencesByNameAcrossProjects, merged_into]
  affects: [packages/core/src/statements.ts, packages/mcp-server/src/tools.ts]
tech_stack:
  added: []
  patterns: [cross-project entity promotion, source_projects metadata accumulation]
key_files:
  created:
    - packages/mcp-server/tests/user-preferences.test.ts
  modified:
    - packages/core/src/schema.ts
    - packages/core/src/statements.ts
    - packages/mcp-server/src/tools.ts
decisions:
  - "Promotion is triggered by allProjects.size >= 2 (includes currentProject + entity's stored project + any prior source_projects), not by distinct entity count — because selectEntityByNameType is project-agnostic so 2+ projects always share one entity row"
  - "merged_into is nullable FK on entities table; added via try/catch migration (pattern matches existing migrations in schema.ts)"
  - "Inline db.prepare() used inside transaction for winner-obs update since we need fresh query against just-written observations (not pre-compiled)"
  - "Worktree node_modules/@myco/core symlink added to point to worktree packages/core instead of root symlink to main branch"
metrics:
  duration: 344s
  completed_date: "2026-03-29"
  tasks: 1
  files: 4
requirements: [PREF-01, PREF-02]
---

# Phase 28 Plan 01: Preference Promotion Logic Summary

Preference promotion via `promotePreference()` — preferences start project-scoped, promote to a single global entity with `source_projects` metadata when corroborated by 2+ distinct projects.

## What Was Built

### New Schema Column

`entities.merged_into TEXT DEFAULT NULL` — added via try/catch migration in `schema.ts`. Allows project-scoped entities to be marked as superseded by the global winner entity.

### New Prepared Statements (`packages/core/src/statements.ts`)

- `selectPreferencesByNameAcrossProjects` — finds all non-merged user_preference entities by name, groups observations per entity
- `updateEntityProject` — sets entity project to NULL (promoting to global)
- `updateEntityMetadata` — writes `source_projects` JSON into entity metadata
- `updateObservationMetadata` — writes `source_projects` JSON into observation metadata
- `setEntityMergedInto` — marks loser entities as merged into the winner
- `updateObservationEntityId2` — reassigns observations from loser to winner entity

### `promotePreference()` (`packages/mcp-server/src/tools.ts`)

Exported function called from `rememberEntity` after write, when `entity_type === 'user_preference'` and `project !== undefined`.

Logic:
1. Query all non-merged user_preference entities with the same name
2. Collect all distinct projects: entity's stored project + source_projects from metadata + incoming `currentProject`
3. If `allProjects.size >= 2` OR entity is already global (project=NULL) → promote
4. Winner: prefer existing global entity, else entity with most observations
5. Transaction: set winner project=NULL, update entity+observation metadata with `source_projects`, reassign loser observations to winner, set `merged_into` on losers
6. Return `{ promoted: true, globalEntityId, sourceProjects }`

Hooked into `rememberEntity` — returns promotion message when triggered.

### Integration Tests

6 tests in `packages/mcp-server/tests/user-preferences.test.ts`:
- Test 1: project-scoped storage for single project
- Test 2: cross-project promotion to global with source_projects metadata
- Test 3: merged_into set on loser entities after promotion
- Test 4: explicit project=undefined stores globally without promotion
- Test 5: third project added to source_projects on already-global entity
- Test 6: `promotePreference` returns `promoted: false` for single-project entity

## Key Design Decision

`selectEntityByNameType` finds entities by name+type without project filter. When project "beta" remembers a preference already stored under project "alpha", it hits the same entity row. `promotePreference` detects this by counting `allProjects` (entity.project + source_projects metadata + currentProject) — if size >= 2, it promotes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `valid_until` column references**
- **Found during:** Task 1 GREEN phase
- **Issue:** Plan's SQL used `o.valid_until IS NULL` but observations table has no `valid_until` column in this codebase
- **Fix:** Removed `valid_until` filter from `selectPreferencesByNameAcrossProjects` query and from inline observation lookup
- **Files modified:** `packages/core/src/statements.ts`, `packages/mcp-server/src/tools.ts`
- **Commit:** e7cb50b

**2. [Rule 3 - Blocking] Worktree resolves @myco/core from main branch's node_modules**
- **Found during:** Task 1 RED phase
- **Issue:** Git worktree under `.claude/worktrees/` has no local node_modules; npm workspace symlink in root points to main branch's `packages/core`, not worktree's
- **Fix:** Created `node_modules/@myco/core` symlink in worktree pointing to `../../packages/core` (worktree-relative)
- **Files modified:** `node_modules/@myco/core` (symlink, untracked)

**3. [Rule 2 - Enhancement] Added `updateObservationEntityId2` statement**
- **Found during:** Task 1 implementation
- **Issue:** `updateObservationEntityId` exists but plan's `promotePreference` also needs to move observations from loser to winner; rather than reuse the same statement name (different semantic context), named it `updateObservationEntityId2`
- **Fix:** Added statement to interface and factory
- **Files modified:** `packages/core/src/statements.ts`

## Known Stubs

None — preference promotion is fully wired end-to-end.

## Self-Check: PASSED

- packages/core/src/schema.ts — FOUND
- packages/core/src/statements.ts — FOUND
- packages/mcp-server/src/tools.ts — FOUND
- packages/mcp-server/tests/user-preferences.test.ts — FOUND
- commit e7cb50b — FOUND
