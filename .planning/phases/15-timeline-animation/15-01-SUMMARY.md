---
phase: 15-timeline-animation
plan: "01"
subsystem: dashboard/graph
tags: [timeline, animation, canvas, performance, react-force-graph]
dependency_graph:
  requires: [14-02]
  provides: [GRPH-06]
  affects: [graph-view, graph-toolbar, timeline-slider]
tech_stack:
  added: []
  patterns:
    - requestAnimationFrame loop for timeline playback (replaces setInterval)
    - useRef cutoff as shared bridge between slider and canvas painter
    - Pre-computed timestamps on decorated nodes to avoid per-frame Date parsing
    - entryTimesRef Map for 800ms entry pulse animation tracking
    - prevCutoffRef for backward-scrub detection and entry time reset
key_files:
  created: []
  modified:
    - packages/dashboard/src/components/timeline-slider.tsx
    - packages/dashboard/src/routes/graph.tsx
    - packages/dashboard/src/components/graph-view.tsx
decisions:
  - "rAF loop in TimelineSlider writes to cutoffRef.current; canvas painter reads ref directly — zero React re-renders during auto-play"
  - "displayMs useState updated at ~4fps throttle (250ms interval) for date label only, not for canvas"
  - "timelineCutoffRef initialized to dateRange.min when timeline enables, Infinity when disabled"
  - "nodeCanvasObject early-return for future nodes (nodeMs > cutoffMs) — graphData reference never modified"
  - "Entry pulse uses entryTimesRef Map (useRef, not useState) per Pitfall 4 — no render feedback loop"
  - "created_at_ms pre-computed on decoratedNodes to avoid new Date() per node per frame at 60fps"
  - "Timeline rAF loop in GraphView calls fgRef.refresh() at 60fps when timelineActive=true to force canvas repaints after simulation freeze"
metrics:
  duration: "5 minutes"
  completed: "2026-03-27T19:25:35Z"
  tasks: 2
  files_modified: 3
  commits: 2
---

# Phase 15 Plan 01: Timeline Animation Summary

**One-liner:** rAF-driven timeline playback with useRef cutoff bridge eliminating 10x/sec graphData reheat — canvas painter controls node/link visibility with 800ms entry pulse animation.

## What Was Built

Rewrote the timeline feature from a `setInterval` + React state pattern (Pitfalls 1 and 2) to a `requestAnimationFrame` + `useRef` pattern that keeps `graphData` stable during playback.

**TimelineSlider** (`timeline-slider.tsx`): Completely rewritten with new props interface (`minMs`, `maxMs`, `cutoffRef`, `onScrub`). A rAF loop advances `cutoffRef.current` each frame using real-elapsed-time × speed × `daysPerMs` conversion. `displayMs` state for the date label updates at ~4fps (250ms throttle). Manual scrub pauses playback, sets the ref, and calls `onScrub`. Cleanup cancels rAF on unmount.

**graph.tsx**: Removed `filteredData` useMemo that was creating new graphData references 10x/sec. All data passes directly to GraphView. `timelineCutoffRef = useRef<number>(Infinity)` created at page level. Timeline enable/disable sets cutoff to `dateRange.min` or `Infinity`. Passes `timelineCutoffRef` and `timelineActive` to GraphView.

**GraphView** (`graph-view.tsx`):
- `timelineCutoffRef` and `timelineActive` props added to `GraphViewProps`
- `GraphNode` type extended with `created_at_ms: number` (pre-computed)
- `decoratedNodes` useMemo computes `created_at_ms` once per data change
- `entryTimesRef` Map tracks first-appearance time per node during playback
- `prevCutoffRef` detects backward scrub and clears entry times on rewind
- `nodeCanvasObject`: early-return for `nodeMs > cutoffMs` before any drawing
- Entry pulse ring: 800ms expanding ring drawn when `elapsed < 800ms`
- `linkCanvasObject`: skips links where source, target, or link's own timestamp exceeds cutoff
- `onRenderFramePost`: excludes future nodes from cluster hull position map
- Timeline rAF loop `useEffect`: calls `fgRef.refresh()` at 60fps when `timelineActive=true`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data paths are wired. Timeline visibility is fully controlled by the canvas painter reading `timelineCutoffRef.current`.

## Self-Check: PASSED

Files exist:
- packages/dashboard/src/components/timeline-slider.tsx — FOUND
- packages/dashboard/src/routes/graph.tsx — FOUND
- packages/dashboard/src/components/graph-view.tsx — FOUND

Commits:
- e68f798 — Task 1: TimelineSlider rAF rewrite + graph.tsx filteredData removal
- 066608a — Task 2: GraphView cutoff visibility + entry pulse animation
