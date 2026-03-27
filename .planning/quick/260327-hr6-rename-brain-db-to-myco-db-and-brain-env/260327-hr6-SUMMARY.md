---
phase: quick
plan: 260327-hr6
subsystem: infra
tags: [rename, branding, env-vars, hooks]

requires: []
provides:
  - "Clean break from brain.db naming — all references now myco.db"
  - "BRAIN_DB_PATH fallback removed, BRAIN_CONSOLIDATION_MODEL renamed to MYCO_CONSOLIDATION_MODEL"
  - "Hook file renamed gsd-brain-episode.js to gsd-myco-episode.js"
affects: [all-packages, external-hooks, documentation]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/core/src/db.ts
    - packages/core/src/config.ts
    - packages/mcp-server/src/consolidator.ts
    - .claude/hooks/gsd-myco-episode.js
    - .claude/settings.json
    - packages/core/tests/db.test.ts
    - packages/mcp-server/tests/gsd-myco-episode.test.ts
    - README.md
    - GETTING-STARTED.md
    - QA-CHECKLIST.md
    - CHANGELOG.md
    - .env.example

key-decisions:
  - "Clean break: removed BRAIN_DB_PATH fallback entirely instead of keeping backwards compatibility"
  - "Removed BRAIN_DB_PATH test case from db.test.ts since fallback no longer exists"
  - "Updated external hooks at ~/.claude/hooks/ to remove all brain/mcpServers.brain checks"

requirements-completed: []

duration: 14min
completed: 2026-03-27
---

# Quick 260327-hr6: Rename brain.db to myco.db Summary

**Complete brain-to-myco rename across source, hooks, tests, and docs — clean break with no backwards compatibility**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-27T16:54:21Z
- **Completed:** 2026-03-27T17:08:14Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Renamed default database from brain.db to myco.db in all path resolution code
- Removed BRAIN_DB_PATH env var fallback from db.ts, config.ts, and all hooks
- Renamed BRAIN_CONSOLIDATION_MODEL to MYCO_CONSOLIDATION_MODEL in config.ts, consolidator.ts, and docs
- Renamed hook file gsd-brain-episode.js to gsd-myco-episode.js with updated settings.json reference
- Renamed test file gsd-brain-episode.test.ts to gsd-myco-episode.test.ts with updated logic
- Updated external hooks (~/.claude/hooks/) to remove brain references and mcpServers.brain checks
- Updated all documentation (README, GETTING-STARTED, QA-CHECKLIST, CHANGELOG, .env.example)
- All 96 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename brain references in source code and hooks** - `a31cbbb` (refactor)
2. **Task 2: Rename brain references in tests and docs** - `9752be5` (refactor)

## Files Created/Modified
- `packages/core/src/db.ts` - Default path now myco.db, removed BRAIN_DB_PATH fallback
- `packages/core/src/config.ts` - Removed BRAIN_DB_PATH fallback, renamed BRAIN_CONSOLIDATION_MODEL
- `packages/mcp-server/src/consolidator.ts` - Renamed BRAIN_CONSOLIDATION_MODEL to MYCO_CONSOLIDATION_MODEL
- `.claude/hooks/gsd-myco-episode.js` - Renamed from gsd-brain-episode.js, updated all internal references
- `.claude/settings.json` - Updated hook path reference
- `packages/core/tests/db.test.ts` - Removed BRAIN_DB_PATH fallback test, updated default path assertion
- `packages/mcp-server/tests/gsd-myco-episode.test.ts` - Renamed, removed BRAIN_DB_PATH test cases
- `README.md` - Updated architecture diagram, env vars table
- `GETTING-STARTED.md` - Updated architecture diagram, file locations, env vars
- `QA-CHECKLIST.md` - Updated db paths and env var references
- `CHANGELOG.md` - Updated BRAIN_CONSOLIDATION_MODEL mention
- `.env.example` - Removed BRAIN_DB_PATH, renamed consolidation model var
- `~/.claude/hooks/myco-session-start.js` - Removed brain.db, BRAIN_DB_PATH, hasBrainServer, mcpServers.brain
- `~/.claude/hooks/myco-auto-remember.js` - Removed mcpServers.brain checks, mcp__brain__ prefix

## Decisions Made
- Clean break: removed BRAIN_DB_PATH fallback entirely (no backwards compatibility layer)
- Removed the BRAIN_DB_PATH fallback test from db.test.ts since the feature no longer exists
- Updated external hooks at ~/.claude/hooks/ to only check mcpServers.myco (not mcpServers.brain)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## User Setup Required

**Important:** If you have an existing database at `~/.local/share/myco/brain.db`, rename it manually:
```bash
mv ~/.local/share/myco/brain.db ~/.local/share/myco/myco.db
```

If you were using `BRAIN_DB_PATH` or `BRAIN_CONSOLIDATION_MODEL` env vars, update them to `MYCO_DB_PATH` and `MYCO_CONSOLIDATION_MODEL`.

---
*Quick task: 260327-hr6*
*Completed: 2026-03-27*
