---
phase: 04-rest-api-pwa
plan: "05"
subsystem: ui
tags: [react, force-directed-graph, react-force-graph-2d, canvas, tanstack-query, shadcn, knowledge-graph]

# Dependency graph
requires:
  - phase: 04-rest-api-pwa
    provides: GET /api/graph (nodes + links), GET /api/entities/:id (observations + connected)
  - phase: 04-rest-api-pwa plan 02
    provides: dashboard scaffold, shadcn/ui components (badge, button, separator, scroll-area, select, input), typed API client

provides:
  - packages/dashboard/src/hooks/use-graph.ts — TanStack Query hook for /api/graph with 60s refetch
  - packages/dashboard/src/components/graph-view.tsx — ForceGraph2D wrapper with entity-type color map, Canvas node rendering, search opacity filter, type filter
  - packages/dashboard/src/components/entity-panel.tsx — slide-in entity detail panel (320px desktop / full-screen mobile) with observations + connected entities
  - packages/dashboard/src/routes/graph.tsx — Knowledge Graph page wiring graph view + entity panel with empty/error states

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ForceGraph2D nodeCanvasObject: custom circle + conditional label at globalScale > 1.5 for clean zoom UX"
    - "Entity-type color map via TYPE_COLORS Record — unknown types fall back to DEFAULT_COLOR indigo-500"
    - "Search filter: opacity 0.2 for non-matching nodes (nodes stay in graph, just faded)"
    - "Type filter: removes nodes from graphData entirely (and filters orphaned links)"
    - "Entity panel: requestAnimationFrame for mount-then-animate pattern to trigger CSS transition"
    - "Entity panel Escape key: document-level keydown listener cleaned up in useEffect return"

key-files:
  created:
    - packages/dashboard/src/hooks/use-graph.ts
    - packages/dashboard/src/components/graph-view.tsx
    - packages/dashboard/src/components/entity-panel.tsx
  modified:
    - packages/dashboard/src/routes/graph.tsx

key-decisions:
  - "Search filtering uses opacity 0.2 (not node removal) — keeps graph topology stable while indicating non-matches"
  - "Type filtering removes nodes from graphData + filters orphaned links — cleaner than opacity for categorical filtering"
  - "Entity panel uses requestAnimationFrame before setVisible(true) to guarantee the translate-x-full initial state is painted before the translate-x-0 transition fires"
  - "ForceGraph2D width/height set to undefined — lets parent div (w-full h-full) control sizing via CSS"

patterns-established:
  - "Graph canvas fills remaining viewport height via h-[calc(100vh-theme(spacing.12))]"
  - "Panel mount animation: mount immediately (no conditional render), animate-in via useEffect + requestAnimationFrame"

requirements-completed:
  - PWA-03

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 4 Plan 05: Knowledge Graph Explorer Summary

**ForceGraph2D knowledge graph explorer with entity-type color mapping, search/filter controls, and slide-in entity detail panel using Canvas custom rendering and TanStack Query**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-21T03:48:15Z
- **Completed:** 2026-03-21T03:52:00Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- Force-directed graph with per-entity-type node colors (cyan/violet/amber/emerald/indigo), node size proportional to observation count (sqrt(val)*2), and Canvas labels at zoom > 1.5
- Search filtering fades non-matching nodes to 20% opacity while preserving graph topology; type filter removes nodes + orphaned links entirely
- Entity detail panel slides in from right on node click: 320px desktop / full-screen mobile, 300ms ease-out, dismisses on Escape, click-away backdrop, or X button
- TanStack Query hook (`useGraph`) polls every 60 seconds; entity detail fetched lazily on click with `enabled: !!nodeId`

## Task Commits

1. **Task 1: ForceGraph2D wrapper with custom node rendering, search, and type filter** - `775acb5` (feat)
2. **Task 2: Entity detail side panel with observations and connected entities** - `7243fb4` (feat)

**Plan metadata:** (created in this commit)

## Files Created/Modified

- `packages/dashboard/src/hooks/use-graph.ts` — useGraph() with queryKey ['graph'], refetchInterval 60_000
- `packages/dashboard/src/components/graph-view.tsx` — ForceGraph2D with TYPE_COLORS map, nodeCanvasObject, search/type filter state, filtered links computation
- `packages/dashboard/src/components/entity-panel.tsx` — slide-in panel with fetchEntityDetail, Escape/click-away handlers, ScrollArea observations, connected entities list, animate-pulse skeleton
- `packages/dashboard/src/routes/graph.tsx` — replaced stub: useGraph data, GraphView + EntityPanel wiring, "Graph is empty" and "Cannot reach API server" states

## Decisions Made

- Search filtering uses opacity 0.2 (nodes stay in graphData) — keeps graph layout stable while showing non-matches are filtered. Type filtering removes nodes entirely for cleaner categorical view.
- `requestAnimationFrame` before `setVisible(true)` in EntityPanel ensures initial `translate-x-full` is applied before CSS transition fires, producing a reliable slide-in animation.
- `ForceGraph2D` width/height left as `undefined` — the component fills its parent container via CSS (w-full h-full on parent div).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `grep -q "opacity.*0.2"` verify pattern failing due to multi-line assignment**
- **Found during:** Task 1 verification
- **Issue:** Plan's inline code had opacity assignment split across 3 lines — the automated verify pattern `grep -q "opacity.*0.2"` required them on one line
- **Fix:** Condensed to single-line: `opacity: search && !n.name.toLowerCase().includes(search.toLowerCase()) ? 0.2 : 1`
- **Files modified:** packages/dashboard/src/components/graph-view.tsx
- **Verification:** Verify command returned PASS after fix
- **Committed in:** 775acb5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (code formatting to satisfy verify pattern)
**Impact on plan:** Zero scope creep. Functionally equivalent, single line is also more readable.

## Issues Encountered

None significant. TypeScript check (`tsc --noEmit`) passed with zero errors after both tasks.

## User Setup Required

None — no external service configuration required. Graph explorer connects to api-server via Vite proxy at /api/graph and /api/entities/:id.

## Next Phase Readiness

- Knowledge graph explorer is fully functional: force-directed visualization, search/filter, entity detail panel
- Phase 4 plans 01-05 are all complete — the REST API + PWA dashboard phase is done
- Dev stack: `npm run api` (port 3001) + `cd packages/dashboard && npm run dev` (port 5173)

---
*Phase: 04-rest-api-pwa*
*Completed: 2026-03-21*

## Self-Check: PASSED

- FOUND: packages/dashboard/src/hooks/use-graph.ts
- FOUND: packages/dashboard/src/components/graph-view.tsx
- FOUND: packages/dashboard/src/components/entity-panel.tsx
- FOUND: .planning/phases/04-rest-api-pwa/04-05-SUMMARY.md
- FOUND commit: 775acb5 (Task 1)
- FOUND commit: 7243fb4 (Task 2)
