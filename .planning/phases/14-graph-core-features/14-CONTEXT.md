# Phase 14: Graph Core Features - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The knowledge graph becomes a fully interactive, stable visualization with mode-driven interactions, cluster awareness, confidence filtering, entity search, neighborhood exploration, and performant rendering at scale. This phase delivers the core graph experience — the centerpiece of the Myco dashboard.

</domain>

<decisions>
## Implementation Decisions

### Interaction Modes & Navigation
- Graph uses a mode system with 4 modes: explore (default), path, neighborhood, search
- Active mode shown via toolbar chips — active in teal, others dimmed. Extends existing toolbar pattern.
- Double-click a node to enter neighborhood mode — shows 1-2 hop subgraph. Press Escape or click "Exit" to return to explore mode.
- Neighborhood depth defaults to 1 hop with a small toggle to switch to 2 hops
- Search auto-zooms: camera animates to the first matching node via `fgRef.current.centerAt()` + `fgRef.current.zoom()`, dims non-matches. Clear search to return.
- Path tracing mode joins the mode system as one of the 4 modes (same toolbar, same escape-to-exit pattern)

### Cluster Visualization
- Clusters auto-detected via Louvain community detection (graphology + graphology-communities-louvain)
- Cluster boundaries rendered as translucent convex hulls — filled with dominant type color at 8% opacity, border at 15% opacity
- Hulls drawn via canvas `onRenderFramePost` callback (NOT DOM overlays — those block pointer events)
- Each cluster has a centered label showing the most common entity type at low opacity
- Convex hulls computed via d3-polygon

### Confidence Filter
- Horizontal slider in the toolbar area, range 0-100%
- Nodes below threshold fade to near-invisible (opacity 0.05) rather than fully disappearing — preserves graph structure
- Filter applies to both nodes and their labels

### Level of Detail (LOD)
- Automatic LOD at zoom-out: when globalScale < 0.5, skip gradients/specular highlights, use solid circles, skip labels
- Smooth visual transition — no jarring pop between detail levels

### Hover Physics & Graph Stability
- Freeze simulation after cooldown: set cooldownTicks to 0 after initial layout via onEngineStop. Only reheat on structural data changes (add/remove nodes).
- Separate structural from visual state: memoize graphData by node/link IDs only. Visual changes (opacity, color from timeline/search/confidence) stored in useRef, read by canvas painter. No React re-renders for visual-only changes.
- graphData reference identity is the root cause of reheat — fix this FIRST before any other graph work

### Package Installation
- Install: graphology, graphology-communities-louvain, d3-polygon in dashboard package
- motion v12 added for future phases but NOT used in Phase 14

### Claude's Discretion
- Exact position/style of the confidence slider within the toolbar
- Cluster label font size and positioning algorithm
- LOD threshold tuning (0.5 is starting point, adjust based on visual testing)
- GraphInteractionMode TypeScript type structure

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `neighborMap` already computed in graph-view.tsx — reuse for neighborhood explorer
- `isHighlighted` / `isLinkHighlighted` callbacks — extend for mode-aware highlighting
- `fgRef` provides access to d3 force simulation and camera controls
- `nodePointerAreaPaint` already handles hit area sizing

### Established Patterns
- Components use inline `style={{ color: 'var(--text-primary)' }}` for theme
- Graph state managed in graph.tsx route, passed down as props to GraphView
- Toolbar buttons use the ToolbarButton component pattern (from Phase 13 refactor)

### Integration Points
- graph-view.tsx: add mode prop, cluster data, confidence filter, LOD logic
- graph.tsx: manage mode state, neighborhood state, search zoom
- graph-toolbar.tsx: add mode chips, confidence slider
- graph-analytics.tsx: share cluster data computed from graphology
- New: install graphology + d3-polygon packages

</code_context>

<specifics>
## Specific Ideas

- Research says Obsidian's local graph is its most-used feature — neighborhood explorer is highest-value
- The analytics panel already exceeds competitors (bridge nodes, relationship breakdown) — no changes needed there
- `onRenderFramePost` availability in react-force-graph-2d v1.29.0 needs verification before implementation. Fallback: draw hulls in `onRenderFramePre` (renders under nodes).

</specifics>

<deferred>
## Deferred Ideas

- Betweenness centrality computation (O(VE) freeze risk — anti-feature per research)
- 3D graph view toggle (navigation penalty exceeds visual benefit)
- Canvas-based graph editing (high complexity for read-and-approve interface)

</deferred>
