---
phase: 06-rename
plan: 03
subsystem: testing
tags: [rename, myco, tests, vitest, typescript, build]

# Dependency graph
requires:
  - phase: 06-01
    provides: MYCO_DB_PATH env var, @myco/core package name, myco directory path in db.ts
  - phase: 06-02
    provides: hook updated to MYCO_DB_PATH || BRAIN_DB_PATH, GETTING-STARTED.md Myco branding
provides:
  - All 3 test files updated to use myco names and MYCO_DB_PATH as primary env var
  - BRAIN_DB_PATH fallback coverage in both db.test.ts and gsd-brain-episode.test.ts
  - Full clean build verified (tsc --build exit 0)
  - 68 tests passing with renamed packages
  - Zero stale ai-workbots/brain-mcp/brain-cli references in source files
affects: [any future test work, ci pipeline, open source release readiness]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/core/tests/db.test.ts
    - packages/mcp-server/tests/server.test.ts
    - packages/mcp-server/tests/gsd-brain-episode.test.ts
    - GETTING-STARTED.md
    - .claude/settings.json

key-decisions:
  - "Stale tsbuildinfo files caused tsc --build to skip core package rebuild — cleared all tsbuildinfo files to force clean compilation"
  - "GETTING-STARTED.md directory path examples updated to myco (reflecting intended repo rename for open source release)"

patterns-established: []

requirements-completed: [REN-01, REN-02, REN-03, REN-04, REN-05, REN-06]

# Metrics
duration: 15min
completed: 2026-03-22
---

# Phase 06 Plan 03: Test Update and Final Verification Summary

**Test files updated to MYCO_DB_PATH primary with BRAIN_DB_PATH fallback, all 68 tests pass, zero stale ai-workbots references in source**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-22T12:50:00Z
- **Completed:** 2026-03-22T13:08:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Three test files updated: db.test.ts, server.test.ts, gsd-brain-episode.test.ts now all use `@myco/core`, `MYCO_DB_PATH` as primary, and `myco` path segments
- BRAIN_DB_PATH fallback explicitly tested in both db.test.ts (new test) and gsd-brain-episode.test.ts (preserved + expanded)
- Build clean: tsc --build exits 0 after clearing stale tsbuildinfo files
- All 68 tests pass (3 test files)
- Comprehensive grep confirms zero `ai-workbots`, `brain-mcp`, or `brain-cli` references in any .ts/.js/.json/.md source file outside .planning/ and dist/

## Task Commits

Each task was committed atomically:

1. **Task 1: Update test files for rename** - `ed9ef61` (feat)
2. **Task 2: Rebuild and run full verification sweep** - `a4a7715` (feat)

## Files Created/Modified

- `packages/core/tests/db.test.ts` - Temp dir prefix to myco-test-, env var tests to MYCO_DB_PATH, new BRAIN_DB_PATH fallback test, new default path myco assertion
- `packages/mcp-server/tests/server.test.ts` - Import from @myco/core, temp dir prefix to myco-mcp-test-
- `packages/mcp-server/tests/gsd-brain-episode.test.ts` - getDbPath() now checks MYCO_DB_PATH first then BRAIN_DB_PATH, path assertions to myco, expanded db path resolution test suite
- `GETTING-STARTED.md` - Updated directory path examples from ai-workbots to myco, fixed project-scoped hook description
- `.claude/settings.json` - Hook command path updated to myco directory

## Decisions Made

- Stale tsbuildinfo files were causing tsc --build to think core was up to date (skipping .d.ts generation). Fix: delete all tsbuildinfo files to force clean rebuild. This is a one-time issue from the in-place rename.
- GETTING-STARTED.md path examples updated to `myco` directory to reflect intended open-source repo name, even though the current disk directory is still `ai-workbots`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale tsbuildinfo caused missing .d.ts declaration files**
- **Found during:** Task 2 (Rebuild and run full verification sweep)
- **Issue:** After deleting dist/ dirs and running `npm run build`, tsc reported the core package was "up to date" (stale tsbuildinfo) but .d.ts files were missing from the new dist/. Downstream packages couldn't find type declarations for @myco/core.
- **Fix:** Deleted all tsconfig.tsbuildinfo files from packages/core, packages/mcp-server, packages/api-server to force a full rebuild. All .d.ts files regenerated correctly.
- **Files modified:** tsconfig.tsbuildinfo files (deleted, not tracked in git)
- **Verification:** Build passed; ls packages/core/dist/ shows all .d.ts files present
- **Committed in:** a4a7715 (Task 2 commit)

**2. [Rule 2 - Missing] Updated GETTING-STARTED.md path refs and .claude/settings.json hook path**
- **Found during:** Task 2 verification grep
- **Issue:** GETTING-STARTED.md still had 6 references to `ai-workbots` (path examples, project-scoped hook description, architecture diagram). .claude/settings.json hook command still pointed to ai-workbots directory.
- **Fix:** Updated all path examples to use `myco` directory name, fixed hook description to say "myco project", updated architecture diagram example list. Updated settings.json hook path.
- **Files modified:** GETTING-STARTED.md, .claude/settings.json
- **Verification:** grep confirms zero ai-workbots refs outside .planning/ and dist/
- **Committed in:** a4a7715 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes essential for build correctness and verification criteria. No scope creep.

## Issues Encountered

None beyond the stale tsbuildinfo issue documented above as a deviation.

## Next Phase Readiness

- Phase 06 rename is complete — all packages use @myco/* names, all tests pass, zero stale references
- Project is ready for open source packaging (Phase 07 or next milestone)
- The git repository directory is still named `ai-workbots` on disk — renaming it to `myco` would complete the external rename but is a separate user action

---
*Phase: 06-rename*
*Completed: 2026-03-22*
