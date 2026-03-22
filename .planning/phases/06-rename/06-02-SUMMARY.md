---
phase: 06-rename
plan: 02
subsystem: ui
tags: [branding, pwa, dashboard, react, docs]

# Dependency graph
requires: []
provides:
  - Dashboard PWA manifest with Myco name and short_name
  - HTML title updated to Myco
  - Sidebar and dashboard heading updated to Myco branding
  - GSD hook db path updated to ~/.local/share/myco/brain.db with BRAIN_DB_PATH fallback
  - GETTING-STARTED.md updated throughout with Myco names, paths, and commands
  - CLAUDE.md project name updated to Myco
affects: [all future dashboard work, docs, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - packages/dashboard/vite.config.ts
    - packages/dashboard/index.html
    - packages/dashboard/src/routes/index.tsx
    - packages/dashboard/src/components/sidebar.tsx
    - .claude/hooks/gsd-brain-episode.js
    - GETTING-STARTED.md
    - CLAUDE.md

key-decisions:
  - "BRAIN_DB_PATH preserved as fallback in hook alongside new MYCO_DB_PATH to avoid breaking existing installations"

patterns-established: []

requirements-completed: [REN-06]

# Metrics
duration: 1min
completed: 2026-03-22
---

# Phase 06 Plan 02: User-Facing Branding and Docs Rename Summary

**Dashboard PWA manifest, HTML title, sidebar, and heading updated to Myco; hook default db path moved to ~/.local/share/myco with BRAIN_DB_PATH fallback; GETTING-STARTED.md and CLAUDE.md updated throughout**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-22T16:48:18Z
- **Completed:** 2026-03-22T16:50:11Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Dashboard PWA manifest name and short_name now read "Myco" (was "AI Workbots Brain"/"Brain")
- HTML title, main heading, and sidebar title all say "Myco" / "Myco Dashboard"
- GSD hook getDbPath() now checks MYCO_DB_PATH first, then BRAIN_DB_PATH fallback, defaults to ~/.local/share/myco/brain.db
- GETTING-STARTED.md updated: title, binary references (brain-cli → myco-cli), architecture diagram, file locations table, env vars table, all path references
- CLAUDE.md project name updated from "AI Workbots Brain" to "Myco"

## Task Commits

Each task was committed atomically:

1. **Task 1: Update dashboard branding and PWA manifest** - `a458e0c` (feat)
2. **Task 2: Update hooks, GETTING-STARTED.md, and CLAUDE.md** - `208e860` (feat)

## Files Created/Modified

- `packages/dashboard/vite.config.ts` - PWA manifest name, short_name, description updated to Myco
- `packages/dashboard/index.html` - Title changed from "Brain Dashboard" to "Myco"
- `packages/dashboard/src/routes/index.tsx` - Dashboard h1 changed to "Myco Dashboard"
- `packages/dashboard/src/components/sidebar.tsx` - Sidebar brand changed from "Brain" to "Myco"
- `.claude/hooks/gsd-brain-episode.js` - DB path updated: MYCO_DB_PATH || BRAIN_DB_PATH, default myco dir
- `GETTING-STARTED.md` - Full rename throughout: title, binary names, paths, env vars, architecture diagram
- `CLAUDE.md` - Project name updated from "AI Workbots Brain" to "Myco"

## Decisions Made

- Preserved BRAIN_DB_PATH as a fallback env var in the GSD hook to avoid breaking existing installations that already have the variable set. New default path is ~/.local/share/myco/brain.db.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All user-facing branding updated to Myco
- Documentation reflects new names throughout
- Ready for any remaining rename work (package names, binary names in package.json scripts, etc.)

---
*Phase: 06-rename*
*Completed: 2026-03-22*
