---
phase: 06-rename
plan: 01
subsystem: infra
tags: [rename, packages, mcp-server, npm, typescript, sqlite]

# Dependency graph
requires: []
provides:
  - "@myco/* package namespace across all four packages"
  - "myco and myco-cli binary entries in mcp-server"
  - "All cross-package imports use @myco/core"
  - "MCP server identity is 'myco'"
  - "Default DB path is ~/.local/share/myco/brain.db"
  - "MYCO_DB_PATH primary env var with BRAIN_DB_PATH fallback"
affects: [06-02, 06-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@myco/* npm namespace for all workspace packages"
    - "Dual env var fallback pattern: MYCO_DB_PATH ?? BRAIN_DB_PATH"

key-files:
  created: []
  modified:
    - package.json
    - packages/core/package.json
    - packages/mcp-server/package.json
    - packages/api-server/package.json
    - packages/dashboard/package.json
    - packages/core/src/db.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/cli.ts
    - packages/mcp-server/src/tools.ts
    - packages/mcp-server/src/consolidator.ts
    - packages/api-server/src/db.ts
    - packages/api-server/src/routes/approvals.ts
    - packages/api-server/src/routes/dashboard.ts
    - packages/api-server/src/routes/episodes.ts
    - packages/api-server/src/routes/entities.ts

key-decisions:
  - "Database filename stays brain.db — only the directory changes from ai-workbots to myco"
  - "BRAIN_DB_PATH preserved as fallback env var so existing users are not broken by the rename"

patterns-established:
  - "Dual env var pattern: MYCO_DB_PATH ?? BRAIN_DB_PATH ?? getDefaultDbPath() for migration-safe env var renaming"

requirements-completed: [REN-01, REN-02, REN-03, REN-04, REN-05]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 06 Plan 01: Rename Package Identities Summary

**All four packages renamed to @myco/* namespace, binaries renamed to myco/myco-cli, DB path moved to ~/.local/share/myco/brain.db with BRAIN_DB_PATH fallback preserved**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T16:50:04Z
- **Completed:** 2026-03-22T16:50:56Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- All four package.json files now use @myco/* naming (core, mcp-server, api-server, dashboard)
- Root workspace renamed from ai-workbots to myco
- Binary entries renamed from brain-mcp/brain-cli to myco/myco-cli
- All TypeScript source files updated: 9 files with cross-package imports now use @myco/core
- MCP server identity changed from ai-workbots-brain to myco
- CLI strings updated from brain-cli to myco-cli throughout
- Tool descriptions updated to reference Myco instead of brain
- Default DB directory changed from ai-workbots to myco; MYCO_DB_PATH added as primary env var

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename package identities and cross-package imports** - `4be63a5` (feat)
2. **Task 2: Update database path and environment variable** - `301e10d` (feat)

## Files Created/Modified

- `package.json` - Root workspace renamed from ai-workbots to myco
- `packages/core/package.json` - Package renamed to @myco/core
- `packages/mcp-server/package.json` - Package renamed to @myco/mcp-server; bins myco/myco-cli; dep @myco/core
- `packages/api-server/package.json` - Package renamed to @myco/api-server; dep @myco/core
- `packages/dashboard/package.json` - Package renamed to @myco/dashboard
- `packages/core/src/db.ts` - Default path uses myco dir; MYCO_DB_PATH primary env var; BRAIN_DB_PATH fallback
- `packages/mcp-server/src/index.ts` - Server name myco; import from @myco/core; startup log updated
- `packages/mcp-server/src/cli.ts` - All CLI strings updated to myco-cli; import from @myco/core
- `packages/mcp-server/src/tools.ts` - Imports from @myco/core; tool descriptions reference Myco
- `packages/mcp-server/src/consolidator.ts` - Import from @myco/core
- `packages/api-server/src/db.ts` - Import from @myco/core
- `packages/api-server/src/routes/approvals.ts` - Import from @myco/core
- `packages/api-server/src/routes/dashboard.ts` - Import from @myco/core
- `packages/api-server/src/routes/episodes.ts` - Import from @myco/core
- `packages/api-server/src/routes/entities.ts` - Import from @myco/core

## Decisions Made

- Database filename stays `brain.db` — only the containing directory changes from `ai-workbots` to `myco`. No reason to rename the file itself.
- `BRAIN_DB_PATH` preserved as a fallback env var so existing users with this set in their environment are not broken by the rename.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Existing users with `BRAIN_DB_PATH` set will continue to work; new installations will use `MYCO_DB_PATH`.

## Next Phase Readiness

- Package naming complete; cross-package imports all resolve to @myco/core
- Ready for Phase 06-02 (documentation and README updates referencing Myco)
- Ready for Phase 06-03 (license, CONTRIBUTING.md, open source packaging)

---
*Phase: 06-rename*
*Completed: 2026-03-22*
