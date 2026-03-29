---
phase: 20-relationship-strength-scoring
plan: 01
subsystem: database, api, ui
tags: [sqlite, better-sqlite3, upsert, hono, react-force-graph-2d, canvas]

# Dependency graph
requires:
  - phase: 18-schema-foundation
    provides: relationships table with strength and reinforcement_count columns (migration 001_baseline UNIQUE constraint on from_id, to_id, type)
provides:
  - Atomic upsert for insertRelationship — ON CONFLICT increments strength and reinforcement_count
  - selectGraphRelationships returns strength and reinforcement_count
  - /api/graph links include strength and reinforcement_count
  - Dashboard GraphLink type and GraphData.links carry strength fields
  - Edge width varies 1px (strength=1) to 5px (strength>=10) via linear clamp
  - Hover tooltip shows "Strength: N (reinforced N×)" below type label when strength > 1
affects: [consolidation, recall-filters, graph-view, approval-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ON CONFLICT(from_id, to_id, type) DO UPDATE for atomic upsert without losing the row ID"
    - "Strength-based linear clamp formula: Math.min(5, Math.max(1, 1 + (strength - 1) * (4 / 9)))"
    - "Canvas sub-label positioned below type label pill using same bezier midpoint cpX, cpY"

key-files:
  created: []
  modified:
    - packages/core/src/statements.ts
    - packages/api-server/src/routes/graph.ts
    - packages/dashboard/src/lib/api.ts
    - packages/dashboard/src/components/graph-view.tsx

key-decisions:
  - "ON CONFLICT targets (from_id, to_id, type) matching the existing UNIQUE constraint in migration 001_baseline — no new constraint needed"
  - "Strength sub-label rendered only when strength > 1 to avoid label noise on single-occurrence relationships"
  - "strengthWidth variable derived from strength field (not confidence) — completely decouples visual weight from semantic confidence"
  - "Strength changes do NOT trigger graph remount — computeGraphDataKey unchanged per plan directive"

patterns-established:
  - "Upsert pattern: INSERT ... ON CONFLICT DO UPDATE for relationship reinforcement"
  - "Strength display: linear clamp 1-5px maps strength range 1-10+"

requirements-completed: [STRENGTH-01, STRENGTH-02, STRENGTH-03]

# Metrics
duration: 8min
completed: 2026-03-27
---

# Phase 20 Plan 01: Relationship Strength Scoring Summary

**ON CONFLICT upsert for atomic relationship reinforcement with strength-based edge width (1-5px linear clamp) and hover tooltip in the force-graph canvas renderer**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T22:48:00Z
- **Completed:** 2026-03-27T22:56:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `insertRelationship` uses `ON CONFLICT(from_id, to_id, type) DO UPDATE` to atomically increment `strength` and `reinforcement_count` when the same relationship is remembered again
- `/api/graph` endpoint now returns `strength` and `reinforcement_count` on every link object
- Dashboard edge rendering replaced confidence-based width with a strength-based linear clamp (1px at strength=1, 5px at strength>=10)
- Canvas tooltip renders "Strength: N (reinforced N×)" below the type label pill when strength > 1

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend — Upsert SQL and API strength passthrough** - `4b2d7ad` (feat)
2. **Task 2: Dashboard — Strength types, edge width, and hover tooltip** - `1a17e34` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/core/src/statements.ts` - insertRelationship upsert SQL; selectGraphRelationships adds strength/reinforcement_count columns
- `packages/api-server/src/routes/graph.ts` - RelationshipRow interface and links mapping include strength + reinforcement_count
- `packages/dashboard/src/lib/api.ts` - GraphData.links array type adds strength and reinforcement_count fields
- `packages/dashboard/src/components/graph-view.tsx` - GraphLink type, GraphViewProps.links, width formula, and strength sub-label tooltip

## Decisions Made

- ON CONFLICT targets `(from_id, to_id, type)` matching the existing UNIQUE constraint from migration 001_baseline — no schema change required
- Strength sub-label only renders when `strength > 1` to keep the graph clean for unreinforced relationships
- `strengthWidth` replaces the confidence-based formula entirely — visual edge weight now reflects reinforcement frequency, not semantic confidence

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `packages/api-server` (missing @myco/core declaration file, db.ts null assignment) are unrelated to this plan's changes and existed before this work. Core package compiles cleanly; api-server errors are pre-existing infrastructure debt.

## Next Phase Readiness

- Relationship strength scoring is fully wired end-to-end: DB upsert -> API -> dashboard
- Phase 21 (memory importance decay) can now read `strength` and `reinforcement_count` from the relationships table for decay calculations
- No blockers

---
*Phase: 20-relationship-strength-scoring*
*Completed: 2026-03-27*
