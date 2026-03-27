---
phase: 14-graph-core-features
plan: "01"
subsystem: dashboard/graph
tags: [graph, performance, mode-system, typescript, react-force-graph-2d]
dependency_graph:
  requires: []
  provides: [graph-types.ts, stable-graphData, frozen-simulation, LOD-rendering, mode-toolbar]
  affects: [graph-view.tsx, graph.tsx, graph-toolbar.tsx]
tech_stack:
  added: [graphology@0.26.0, graphology-communities-louvain@2.0.2, d3-polygon@3.0.1]
  patterns: [discriminated-union-mode-state, graphData-key-memoization, LOD-canvas-rendering]
key_files:
  created:
    - packages/dashboard/src/lib/graph-types.ts
  modified:
    - packages/dashboard/package.json
    - packages/dashboard/src/components/graph-view.tsx
    - packages/dashboard/src/routes/graph.tsx
    - packages/dashboard/src/components/graph-toolbar.tsx
decisions:
  - "computeGraphDataKey memoizes by sorted node/link ID sets — only structural changes reheat simulation"
  - "cooldownTicks(0) set in handleEngineStop to permanently freeze simulation after initial layout"
  - "LOD threshold at globalScale < 0.5 skips radial gradients, specular, labels for solid circle"
  - "GraphModeState discriminated union replaces pathMode boolean — single source of truth for all modes"
  - "ModeChip component handles mode selection; clicking active chip returns to explore"
metrics:
  duration: "~6 minutes"
  completed: "2026-03-27"
  tasks: 2
  files: 5
---

# Phase 14 Plan 01: Graph Core Features Foundation Summary

GraphInteractionMode type system, stable graphData memoization, frozen simulation after cooldown, LOD rendering at low zoom, and 4-mode toolbar replacing pathMode boolean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install packages and create GraphInteractionMode type system | f807d06 | package.json, graph-types.ts |
| 2 | Fix graphData identity, freeze sim, add LOD, wire mode system | 200599b | graph-view.tsx, graph.tsx, graph-toolbar.tsx |

## What Was Built

**graph-types.ts (new):** Defines `GraphInteractionMode` union type (`explore | path | neighborhood | search`), `GraphModeState` discriminated union with per-mode payload, `DEFAULT_MODE_STATE` constant, and `computeGraphDataKey()` utility that produces a deterministic string key from sorted node/link ID sets.

**graph-view.tsx changes:**
- Import `computeGraphDataKey` from `../lib/graph-types`
- `graphDataKey` memo: computes stable string key from node/link ID sets — changes only on structural additions/removals
- `stableGraphData` memo: depends only on `graphDataKey`, not on `decoratedNodes` directly — prevents Pitfall 1 reheat
- `handleEngineStop`: calls `fgRef.current.cooldownTicks(0)` after initial layout — freezes simulation, prevents hover drift (GRPH-01)
- `nodeCanvasObject`: LOD branch at top — when `globalScale < 0.5`, draws solid circle and returns early, skipping 2 radial gradients, specular highlight, hover rings, labels (GRPH-08)
- Pass `graphData={stableGraphData}` instead of inline object

**graph.tsx changes:**
- Import `GraphModeState`, `GraphInteractionMode`, `DEFAULT_MODE_STATE` from `../lib/graph-types`
- Replace `pathMode`, `pathSource`, `pathTarget` state with single `modeState: GraphModeState`
- `handleNodeClick`: dispatches mode-aware actions via `modeState.type` switch
- Escape key handler: exits any non-explore mode via `setModeState(DEFAULT_MODE_STATE)`
- `pathResult`/`pathInfo`: read from `modeState.source`/`modeState.target` instead of separate state
- `GraphToolbar`: passes `activeMode={modeState.type}` and `onModeChange` handler

**graph-toolbar.tsx changes:**
- Replace `pathMode: boolean` + `onTogglePathMode` with `activeMode: GraphInteractionMode` + `onModeChange`
- New `ModeChip` component renders 4 mode buttons (Explore, Trace Path, Neighborhood, Search)
- Active chip: teal background + teal border; inactive: `--bg-surface` + `--border-subtle`
- Clicking active chip calls `onModeChange` with same mode → parent returns to explore
- Panel toggles (Analytics, Timeline, Legend) remain below a visual divider

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all mode logic is fully wired. Neighborhood mode entry via double-click is explicitly deferred to Plan 03 per the plan spec (toolbar chip activates indicator only, returns to explore since no centerId is available from toolbar click alone).

## Self-Check: PASSED

- `packages/dashboard/src/lib/graph-types.ts` — EXISTS
- `f807d06` — EXISTS (git log confirms)
- `200599b` — EXISTS (git log confirms)
- `npx tsc --noEmit` — ZERO ERRORS
- `graphData={stableGraphData}` — CONFIRMED in graph-view.tsx:303
- `cooldownTicks(0)` — CONFIRMED in graph-view.tsx:198
- `isLOD` — CONFIRMED in graph-view.tsx:338,342
- `GraphInteractionMode` in graph-toolbar.tsx — CONFIRMED lines 2,5,6,117,118,121
- `useState<GraphModeState>` in graph.tsx — CONFIRMED (no old `pathMode` useState)
