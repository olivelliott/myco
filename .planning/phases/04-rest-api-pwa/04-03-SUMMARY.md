---
phase: 04-rest-api-pwa
plan: "03"
subsystem: ui
tags: [react, tanstack-query, dashboard, stat-cards, activity-feed, quick-approve, optimistic-mutations, sonner]

# Dependency graph
requires:
  - phase: 04-rest-api-pwa
    plan: "01"
    provides: GET /api/dashboard, GET /api/approvals, PATCH /api/approvals/:id
  - phase: 04-rest-api-pwa
    plan: "02"
    provides: packages/dashboard scaffold, shadcn/ui components, TanStack Query setup, api.ts typed wrappers
provides:
  - Dashboard home view with 3 stat cards (Pending Approvals amber-500 first, Total Entities, Recent Episodes)
  - ActivityFeed component with date-grouped episodes and formatDistanceToNow relative timestamps
  - StatCard reusable component with configurable value color via valueClassName
  - useDashboard hook (queryKey ['dashboard'], 30s refetch)
  - useApprovals + useResolveApproval hooks with optimistic mutation + rollback
  - QuickApprove component: top 5 pending items with approve/reject icon buttons
  - Sidebar self-wired with pending count Badge (amber-500) from useDashboard
affects:
  - 04-04-PLAN.md (useApprovals + useResolveApproval hooks reused by approval queue view)
  - 04-05-PLAN.md (sidebar Badge pattern available)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-wired Sidebar: Sidebar fetches pending count directly via useQuery rather than accepting prop — eliminates prop-drilling"
    - "Optimistic mutation pattern: onMutate cancelQueries + snapshot, onError rollback, onSettled dual invalidation (['approvals'] + ['dashboard'])"
    - "useDashboard shared between DashboardPage and Sidebar — TanStack Query deduplicates the request (same queryKey)"

key-files:
  created:
    - packages/dashboard/src/hooks/use-dashboard.ts
    - packages/dashboard/src/components/stat-card.tsx
    - packages/dashboard/src/components/activity-feed.tsx
    - packages/dashboard/src/hooks/use-approvals.ts
    - packages/dashboard/src/components/quick-approve.tsx
  modified:
    - packages/dashboard/src/routes/index.tsx
    - packages/dashboard/src/components/sidebar.tsx

key-decisions:
  - "Sidebar removes pendingCount prop and self-fetches via useQuery — eliminates prop drilling through root layout"
  - "useApprovals was already scaffolded from a previous run; its .js import extension preserved per NodeNext module resolution pattern"
  - "useDashboard queryKey ['dashboard'] shared across Sidebar and DashboardPage — TanStack Query serves from cache (single network request)"

requirements-completed:
  - PWA-04

# Metrics
duration: 2min
completed: "2026-03-21"
---

# Phase 4 Plan 03: Dashboard Home View Summary

**Dashboard home view with 3 stat cards (amber-500 pending count first), date-grouped activity feed with relative timestamps, quick-approve list (top 5 with optimistic mutations), and self-wired sidebar pending badge**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-21T03:48:03Z
- **Completed:** 2026-03-21T03:50:15Z
- **Tasks:** 2
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- Dashboard home view renders 3 stat cards in responsive grid (1 col mobile, 3 col sm+): Pending Approvals (amber-500 number, first/leftmost per UI-SPEC focal point), Total Entities, Recent Episodes
- ActivityFeed groups episodes by `format(date, 'MMM d, yyyy')` date headings with Separator dividers; each row shows event_type Badge, agent_id, and `formatDistanceToNow` relative timestamp; empty state "No activity yet"
- StatCard component uses shadcn Card with `bg-slate-800 border-slate-800`, 28px/600 value, optional `valueClassName` for color overrides
- useDashboard hook with queryKey `['dashboard']` and 30s refetchInterval
- useApprovals + useResolveApproval hooks with full optimistic mutation: `cancelQueries` snapshot, `onError` rollback, `onSettled` dual invalidation (`['approvals']` + `['dashboard']`)
- QuickApprove shows top 5 pending items with Check (emerald-500) / X (red-500) icon buttons; loading skeleton (3 pulse rows); empty state "All caught up"
- Sidebar updated to self-wire pending count via `useQuery` + `fetchDashboard` — displays amber-500 Badge next to Approvals nav item when count > 0

## Task Commits

1. **Task 1: Stat cards, activity feed, and dashboard home view** - `7fef3c4` (feat)
2. **Task 2: Quick-approve list + pending count badge in sidebar** - `d71a317` (feat)

## Files Created/Modified

- `packages/dashboard/src/hooks/use-dashboard.ts` — TanStack Query hook, queryKey ['dashboard'], 30s refetchInterval
- `packages/dashboard/src/components/stat-card.tsx` — Reusable card with label/value/subtext, bg-slate-800, 28px semibold value
- `packages/dashboard/src/components/activity-feed.tsx` — Date-grouped episode list, formatDistanceToNow, Badge, Separator, empty state
- `packages/dashboard/src/hooks/use-approvals.ts` — useApprovals + useResolveApproval with optimistic mutation and toast feedback
- `packages/dashboard/src/components/quick-approve.tsx` — Top 5 pending items with approve/reject icon buttons, loading skeleton, empty state
- `packages/dashboard/src/routes/index.tsx` — Dashboard home: 3 stat cards + activity feed + quick-approve, error state
- `packages/dashboard/src/components/sidebar.tsx` — Self-wired pending count via useQuery, Badge component (amber-500)

## Decisions Made

- Sidebar removes `pendingCount` prop and self-fetches via `useQuery` + `fetchDashboard`. Root layout (`__root.tsx`) passes no props — eliminates prop drilling. TanStack Query deduplicates the network request since `DashboardPage` uses the same `['dashboard']` queryKey.
- `useApprovals.ts` was already scaffolded from a parallel plan execution — its `.js` import extension was preserved (NodeNext module resolution pattern established in plan 01).
- `useDashboard` is shared between `DashboardPage` and `Sidebar` via the same queryKey — one network request serves both.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Pre-existing Files

`src/hooks/use-approvals.ts` was already present (created by a parallel agent running plan 04-04). Content matched the plan spec exactly. Preserved as-is.

## Issues Encountered

None significant.

## User Setup Required

None — dashboard connects to local api-server via Vite proxy.

## Next Phase Readiness

- Plan 04-04: Approval queue view can reuse `useApprovals` and `useResolveApproval` hooks directly
- Plan 04-05: Knowledge graph explorer can follow the same useDashboard pattern for shared data
- Dev server: `cd packages/dashboard && npm run dev` — dashboard home is fully functional with live data

---
*Phase: 04-rest-api-pwa*
*Completed: 2026-03-21*
