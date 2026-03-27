---
phase: 14-graph-core-features
plan: 02
subsystem: ui
tags: [react, canvas, graphology, louvain, d3-polygon, convex-hull, confidence-filter, cluster-visualization]

requires:
  - phase: 14-graph-core-features
    plan: 01
    provides: GraphModeState discriminated union, computeGraphDataKey stable graphData memoization, graph-types.ts exports

provides:
  - Louvain community detection via graphology + graphology-communities-louvain (graph-clusters.ts)
  - Convex hull computation via d3-polygon with centroid-based padding
  - Canvas cluster hull rendering via onRenderFramePost (fills at 8% opacity, stroke at 15%)
  - Confidence threshold slider in toolbar (0-100%, fades below-threshold nodes to 0.05 opacity)
  - Clusters toggle button (Hexagon icon) in toolbar

affects: [14-03-neighborhood, 14-04-timeline-performance, future-graph-phases]

tech-stack:
  added: []
  patterns:
    - "Cluster hulls drawn via onRenderFramePost (canvas layer, not DOM overlay) — avoids pointer-event capture (Pitfall 3)"
    - "Confidence threshold applies opacity 0.05 (fade not remove) to preserve graph topology structure"
    - "Louvain community detection is toggle-gated — computed only when clustersEnabled is true"
    - "Position map rebuilt each frame in onRenderFramePost from stableGraphData.nodes for accurate hull positions"

key-files:
  created:
    - packages/dashboard/src/lib/graph-clusters.ts
  modified:
    - packages/dashboard/src/components/graph-view.tsx
    - packages/dashboard/src/components/graph-toolbar.tsx
    - packages/dashboard/src/components/graph-analytics.tsx
    - packages/dashboard/src/routes/graph.tsx

key-decisions:
  - "Hulls rendered via onRenderFramePost not DOM overlays — prevents pointer event blocking per Pitfall 3"
  - "Confidence filter fades to 0.05 opacity rather than removing nodes — preserves graph structure per CONTEXT.md"
  - "Cluster detection lazy: only computed when clustersEnabled=true to avoid Louvain overhead on every render"
  - "onRenderFramePost confirmed available in react-force-graph-2d v1.29.0 before implementation (Pitfall 14)"

requirements-completed: [GRPH-03, GRPH-04]

duration: 18min
completed: 2026-03-27
---

# Phase 14 Plan 02: Cluster Visualization and Confidence Filter Summary

**Louvain community detection with canvas convex hull visualization (8%/15% opacity fills/borders) and a confidence threshold slider that fades nodes below threshold to 0.05 opacity**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-27T19:47:00Z
- **Completed:** 2026-03-27T20:05:00Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Created `graph-clusters.ts` — pure utility with `detectCommunities` (Louvain via graphology), `buildClusterInfos` (dominant type per cluster), and `computeClusterHull` (d3-polygon convex hull with centroid-based padding)
- Added `onRenderFramePost` callback to graph-view.tsx that draws filled + stroked cluster hulls with centroid labels on the canvas layer (not DOM overlays — Pitfall 3 avoided)
- Implemented confidence threshold filter in `decoratedNodes` useMemo: nodes below threshold receive `opacity: 0.05` (fade not remove, preserving graph topology)
- Added Clusters toggle button (Hexagon icon) and confidence slider to graph-toolbar.tsx
- Wired cluster + confidence state in graph.tsx: `clustersEnabled`, `confidenceThreshold`, and `clusterInfos` useMemo

## Task Commits

1. **Task 1: Create graph-clusters.ts with Louvain detection and hull computation** - `51af580` (feat)
2. **Task 2: Wire cluster hulls into canvas and add confidence slider to toolbar** - `09aed9f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `packages/dashboard/src/lib/graph-clusters.ts` — Louvain community detection, cluster info building, convex hull computation (pure utility, no React)
- `packages/dashboard/src/components/graph-view.tsx` — Added `clusterInfos`/`confidenceThreshold` props; `onRenderFramePost` hull rendering; confidence-aware `decoratedNodes` opacity
- `packages/dashboard/src/components/graph-toolbar.tsx` — Added Clusters toggle (Hexagon), confidence slider with gradient fill
- `packages/dashboard/src/components/graph-analytics.tsx` — Added comment pointing to graph-clusters.ts for Louvain detection
- `packages/dashboard/src/routes/graph.tsx` — Added `clustersEnabled`/`confidenceThreshold` state, `clusterInfos` useMemo, props wired to GraphView + GraphToolbar

## Decisions Made
- **onRenderFramePost over DOM overlay:** Hulls drawn directly on canvas to avoid capturing pointer events (Pitfall 3). Verified `onRenderFramePost` exists in react-force-graph-2d v1.29.0 before implementing (Pitfall 14).
- **Fade not remove for confidence filter:** Opacity 0.05 preserves graph topology so users can see the connected structure even when filtering out low-confidence noise.
- **Lazy cluster computation:** `clusterInfos` useMemo only runs when `clustersEnabled=true`, avoiding Louvain overhead when the feature is unused.
- **Position map rebuilt per frame:** The `onRenderFramePost` callback reads `stableGraphData.nodes` for current `x`/`y` positions, so hulls track nodes correctly during drag/pan without React state.

## Deviations from Plan

None — plan executed exactly as written. The file had been modified by Plan 01 work (neighborhoodData, search zoom, pulse ring) beyond the plan snapshot, but all additions were additive and compatible.

## Issues Encountered
- File modification conflicts from parallel Plan 01 executor: the `graph-view.tsx` and `graph.tsx` files were further expanded by Plan 01 (683 lines vs 625, with `neighborhoodData`, `useNeighborhood`, search zoom, pulse ring). Required re-reading before each edit to get current state. All additions were compatible — no conflicts, just more context to preserve.

## Known Stubs
None — cluster hulls render from live Louvain data, confidence slider wires to live node opacity.

## Next Phase Readiness
- Plan 14-03 (neighborhood explorer) can use `neighborhoodData` prop already in GraphView
- Cluster hulls will automatically show correct communities as graph data changes
- Confidence slider is immediately functional with any nodes that have `confidence` < 1.0

## Self-Check: PASSED
- graph-clusters.ts: FOUND
- 14-02-SUMMARY.md: FOUND
- Commit 51af580: FOUND
- Commit 09aed9f: FOUND

---
*Phase: 14-graph-core-features*
*Completed: 2026-03-27*
