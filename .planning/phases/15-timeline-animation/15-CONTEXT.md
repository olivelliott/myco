# Phase 15: Timeline Animation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — technical execution phase)

<domain>
## Phase Boundary

Smooth, animated timeline playback that lets users watch the knowledge graph grow from its earliest entity to the present day. Uses requestAnimationFrame-driven rendering with useRef-based cutoff timestamp to avoid React re-render overhead.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion. Key constraints from research:

- Drive timeline playback via requestAnimationFrame loop, NOT setInterval (Pitfall 2 from research)
- Store current cutoff timestamp in useRef, not useState — canvas painter reads ref directly
- Do NOT filter nodes out of graphData during playback — control visibility via nodeCanvasObject opacity based on cutoff ref
- Only update React state when user manually scrubs the slider, not during auto-play
- When auto-play reaches end, sync back to React state for slider UI
- The stableGraphData pattern from Phase 14 is already in place — do not break it
- Node entry pulse: brief expanding ring effect when a node first appears during playback

</decisions>

<code_context>
## Existing Code Insights

### Key Files
- timeline-slider.tsx already exists with play/pause/speed controls
- graph-view.tsx has stableGraphData (Phase 14), nodeCanvasObject for rendering
- graph.tsx manages timelineEnabled/timelineDate state and filteredData memo

### Critical Issue
- Current filteredData creates new graphData reference 10x/sec during playback (Pitfall 1)
- Fix: timeline visibility controlled via useRef cutoff in nodeCanvasObject, not graphData filtering

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond research findings.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
