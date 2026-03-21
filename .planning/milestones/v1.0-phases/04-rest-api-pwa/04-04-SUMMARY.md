---
phase: 04-rest-api-pwa
plan: "04"
subsystem: ui
tags: [react, approval-queue, shadcn, tanstack-query, optimistic-mutations, accessibility]

# Dependency graph
requires:
  - phase: 04-rest-api-pwa
    plan: "01"
    provides: PATCH /api/approvals/:id with approve/reject/merge handling
  - phase: 04-rest-api-pwa
    plan: "02"
    provides: packages/dashboard scaffold with shadcn components, TanStack Query, sonner
provides:
  - packages/dashboard/src/components/approval-card.tsx — approval card with approve/reject/edit + exit animation
  - packages/dashboard/src/components/merge-card.tsx — entity merge candidate card with side-by-side layout
  - packages/dashboard/src/routes/approvals.tsx — full approval queue page
  - packages/dashboard/src/hooks/use-approvals.ts — useApprovals + useResolveApproval hooks with optimistic updates
affects:
  - sidebar pending badge (wired in plan 03)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exit animation: setExiting(true) then setTimeout onResolve 300ms — opacity-0 translate-x-8 duration-300"
    - "Reason badge colors via lookup object keyed by reason string (contradiction/low_confidence/merge_candidate/cross_session)"
    - "Inline edit mode: editing boolean state, Textarea replaces observation preview, Save & Approve replaces action buttons"
    - "MergeCard grid: grid-cols-1 md:grid-cols-2 with border-r on desktop, border-b on mobile"

key-files:
  created:
    - packages/dashboard/src/components/approval-card.tsx
    - packages/dashboard/src/components/merge-card.tsx
    - packages/dashboard/src/hooks/use-approvals.ts
  modified:
    - packages/dashboard/src/routes/approvals.tsx

key-decisions:
  - "use-approvals.ts created here (not plan 03) due to parallel execution — plan 03 ran concurrently and hooks/ dir was absent when this plan started (Rule 3 auto-fix)"
  - "Merge Entities button maps to status=approved, Keep Separate maps to status=rejected — API handles merge logic on approve"
  - "Cancel button added to edit mode alongside Save & Approve for better UX (not in plan spec, but required for correctness)"

requirements-completed:
  - PWA-01
  - PWA-02

# Metrics
duration: 2min
completed: "2026-03-21"
---

# Phase 4 Plan 04: Approval Queue View Summary

**Full approval queue page with ApprovalCard and MergeCard components, inline edit, exit animations, optimistic mutations, and accessible aria-labels — the primary human control surface for reviewing agent-extracted knowledge**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-21T03:48:19Z
- **Completed:** 2026-03-21T03:50:30Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- ApprovalCard with entity name, 2-line-clamped observation, confidence % badge, reason badge (4 colors), expandable evidence blockquote, Approve/Reject/Edit actions with exit animation (opacity-0 + translate-x-8 / 300ms)
- Inline edit mode: Textarea pre-filled with observation, Save & Approve + Cancel buttons, Escape key exits edit
- MergeCard with side-by-side grid layout (stacked on mobile, columns on desktop), primary entity vs merge candidate IDs, Merge Entities (indigo-500) + Keep Separate (slate-700) with exit animation
- Approvals route: conditional rendering ApprovalCard vs MergeCard by merge_candidate_ids, loading skeleton (3 animate-pulse), empty "All caught up" state, "Cannot reach API server" error state
- useApprovals + useResolveApproval hooks with optimistic removal, rollback on error, toast on success/failure

## Task Commits

1. **Task 1: Approval card component with approve/reject/edit actions** - `be99da3` (feat)
2. **Task 2: Approval queue page with merge cards and list rendering** - `7e1beb2` (feat)

## Files Created/Modified

- `packages/dashboard/src/components/approval-card.tsx` - Full approval card with all states (default, editing, exiting), badge colors, evidence toggle
- `packages/dashboard/src/components/merge-card.tsx` - Entity merge card with side-by-side layout and Merge/Keep Separate actions
- `packages/dashboard/src/hooks/use-approvals.ts` - TanStack Query hooks: useApprovals (30s refetch) + useResolveApproval (optimistic update + rollback)
- `packages/dashboard/src/routes/approvals.tsx` - Full approval queue page wiring cards to mutation hooks

## Decisions Made

- `use-approvals.ts` created in this plan rather than plan 03 due to parallel execution — the hooks/ directory was absent when this plan started, so it was created here as a Rule 3 auto-fix
- "Keep Separate" triggers `status=rejected` — the API treats rejection of a merge_candidate as "keep separate" without any graph write
- A Cancel button was added in edit mode alongside "Save & Approve" — the plan spec only required Escape key, but an explicit Cancel button is essential for mouse/touch users

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created use-approvals.ts hook (parallel execution — plan 03 had not yet committed it)**
- **Found during:** Task 1 setup
- **Issue:** `packages/dashboard/src/hooks/` directory did not exist; `use-approvals.ts` hook referenced in plan interfaces was absent
- **Fix:** Created hooks directory and `use-approvals.ts` with `useApprovals` + `useResolveApproval` matching the plan's interface spec
- **Files modified:** packages/dashboard/src/hooks/use-approvals.ts
- **Commit:** be99da3 (included in Task 1 commit)

**2. [Rule 2 - Missing Critical] Added Cancel button in edit mode**
- **Found during:** Task 1 implementation
- **Issue:** Plan spec only mentioned Escape key to exit edit mode — no explicit Cancel button. Without a visible Cancel button, mouse/touch users have no obvious escape path
- **Fix:** Added Cancel button alongside Save & Approve in edit mode
- **Files modified:** packages/dashboard/src/components/approval-card.tsx
- **Commit:** be99da3

## Issues Encountered

None significant. All plan-specified behavior implemented without regressions.

## User Setup Required

None — approval queue connects to the running api-server via Vite proxy (set up in plan 02).

## Next Phase Readiness

- Approval queue fully functional — plan 05 (knowledge graph explorer) can proceed independently
- Toast messages from useResolveApproval hook will trigger correctly when cards are actioned
- Pending count badge in sidebar will update via `invalidateQueries(['dashboard'])` after each resolve

---
*Phase: 04-rest-api-pwa*
*Completed: 2026-03-21*
