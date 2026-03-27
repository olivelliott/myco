---
phase: 14-graph-core-features
plan: "03"
subsystem: dashboard/graph
tags: [graph, neighborhood, search, interaction, canvas]
dependency_graph:
  requires: [14-01]
  provides: [neighborhood-explorer, search-auto-zoom]
  affects: [graph-view, graph-toolbar, entity-panel, graph-route]
tech_stack:
  added: []
  patterns:
    - BFS subgraph extraction via useNeighborhood hook
    - Search auto-zoom via fgRef.centerAt + zoom with debounce
    - Canvas pulse ring using Math.sin for animated search match indicator
    - Double-click detection via lastClickRef timestamp comparison (400ms window)
    - neighborhoodData prop pattern: GraphView receives filtered subgraph from parent
key_files:
  created:
    - packages/dashboard/src/hooks/use-neighborhood.ts
  modified:
    - packages/dashboard/src/components/graph-view.tsx
    - packages/dashboard/src/components/entity-panel.tsx
    - packages/dashboard/src/components/graph-toolbar.tsx
    - packages/dashboard/src/routes/graph.tsx
decisions:
  - "Double-click detected via lastClickRef timestamp (400ms) rather than native dblclick — consistent with ForceGraph2D's custom canvas event model"
  - "activeNodes/activeLinks derived from neighborhoodData in GraphView rather than in graph.tsx — keeps filtering co-located with rendering logic"
  - "neighborMap recomputed from activeLinks so hover illumination works correctly in neighborhood mode"
  - "useNeighborhood uses generic type params <N, L> to support future callers beyond GraphNode/GraphLink"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-27"
  tasks_completed: 2
  files_changed: 5
---

# Phase 14 Plan 03: Neighborhood Explorer and Search Auto-Zoom Summary

**One-liner:** BFS neighborhood explorer (1-2 hop subgraph isolation via double-click) and search auto-zoom (camera animates to first match with 300ms debounce and pulsing ring).

## What Was Built

**Task 1: useNeighborhood hook and search auto-zoom in GraphView**

Created `packages/dashboard/src/hooks/use-neighborhood.ts` — a generic React hook that takes a focal node ID, the full node/link arrays, and a depth (1 or 2), then performs BFS to collect all nodes within that many hops. Returns `{ nodes, links }` filtered to the subgraph, or `null` when no focal node is set.

Updated `graph-view.tsx`:
- Added `neighborhoodData` prop — when provided, GraphView uses it as `activeNodes`/`activeLinks` instead of the full decorated data
- `neighborMap` now computed from `activeLinks` so hover illumination is correct within the subgraph
- `hasZoomedRef` resets when neighborhood mode enters/exits so view re-zooms to fit the subgraph
- Search auto-zoom: 300ms debounce via `searchZoomTimerRef`, calls `fgRef.current.centerAt(x, y, 400)` then `fgRef.current.zoom(3, 400)` on first matching node
- Search pulse ring: `Math.sin(Date.now() / 300)` animates ring radius on matching nodes
- Refresh interval (50ms, ~20fps) keeps pulse alive when simulation is frozen

**Task 2: Wire neighborhood mode into graph.tsx, entity-panel, and toolbar**

Updated `graph.tsx`:
- Imports `useNeighborhood` hook
- Derives `neighborhoodCenterId` and `neighborhoodDepth` from `modeState`
- Calls `useNeighborhood` to get `neighborhoodData`
- Double-click detection via `lastClickRef` — two clicks on same node within 400ms enter neighborhood mode with `{ type: 'neighborhood', centerId: node.id, depth: 1 }`
- Passes `neighborhoodData` to GraphView
- Wires `onExploreNeighborhood` callback to EntityPanel (enters neighborhood mode, closes panel)
- Passes neighborhood props to GraphToolbar

Updated `entity-panel.tsx`:
- Added optional `onExploreNeighborhood?: (nodeId: string) => void` prop
- Renders "Explore neighborhood" button with Focus icon when callback is provided

Updated `graph-toolbar.tsx`:
- Added `neighborhoodCenter`, `neighborhoodDepth`, `onNeighborhoodDepthChange`, `onExitNeighborhood` props
- Renders neighborhood indicator badge (teal border, Focus icon, node name, depth toggle button showing `1h`/`2h`, X exit button) when `neighborhoodCenter` is non-null

## Verification

All plan verification checks passed:
1. `npx tsc --noEmit` — zero errors
2. `useNeighborhood` imported in graph.tsx
3. `centerAt` present in graph-view.tsx (search zoom)
4. `onExploreNeighborhood` in entity-panel.tsx
5. `neighborhoodCenter` prop in graph-toolbar.tsx
6. `lastClickRef` double-click detection in graph.tsx

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All neighborhood mode interactions are fully wired: double-click enters, depth toggle switches 1h/2h, Escape and X exit, entity panel button enters from panel context.

## Self-Check: PASSED
