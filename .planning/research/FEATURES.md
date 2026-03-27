# Feature Landscape: Knowledge Graph Dashboard UX

**Domain:** Personal knowledge graph visualization dashboard (agent memory + knowledge graph explorer)
**Researched:** 2026-03-27
**Milestone:** v4.0 Dashboard & Graph Experience
**Confidence:** HIGH (codebase audit + multi-source competitive research)

---

## What Is Already Shipped (Do Not Re-Implement)

Before categorizing features, this is a complete inventory of what exists in `packages/dashboard` as of v3.0:

| Feature | Component | Status |
|---------|-----------|--------|
| Force-directed graph with type-color nodes | `graph-view.tsx` | Shipped |
| Neighbor illumination on hover (dim all non-neighbors) | `graph-view.tsx` | Shipped |
| Hover rings (double-ring on hovered node) | `graph-view.tsx` | Shipped |
| Relationship label on hover + deep zoom | `graph-view.tsx` | Shipped |
| Gradient-colored links between different types | `graph-view.tsx` | Shipped |
| Dashed links for auto-discovered relationships | `graph-view.tsx` | Shipped |
| Search with opacity fade (non-matching nodes to 0.15) | `graph-view.tsx` | Shipped |
| Entity type filter dropdown | `graph-view.tsx` | Shipped |
| Drag-to-pin nodes (fx/fy set on drag) | `graph-view.tsx` | Shipped |
| Right-click to unpin | `graph-view.tsx` | Shipped |
| Pin indicator (amber dot at top-right of pinned node) | `graph-view.tsx` | Shipped |
| Path tracing via BFS (highlight shortest path) | `graph.tsx` | Shipped |
| Timeline slider with play/pause + speed (1x/2x/5x) | `timeline-slider.tsx` | Shipped |
| Analytics panel: node/edge/type counts, density, avg degree | `graph-analytics.tsx` | Shipped |
| Analytics panel: confidence bands (high/mid/low bars) | `graph-analytics.tsx` | Shipped |
| Analytics panel: type distribution with mini-bars | `graph-analytics.tsx` | Shipped |
| Analytics panel: top hubs (clickable, zooms to node) | `graph-analytics.tsx` | Shipped |
| Analytics panel: bridge nodes (multi-type connectors) | `graph-analytics.tsx` | Shipped |
| Analytics panel: relationship type breakdown + auto-discovery % | `graph-analytics.tsx` | Shipped |
| Analytics panel: hovered-node context (degree, obs, confidence) | `graph-analytics.tsx` | Shipped |
| Entity detail panel (slide-in, observations list) | `entity-panel.tsx` | Shipped |
| Graph toolbar (path mode, timeline toggle, analytics toggle) | `graph-toolbar.tsx` | Shipped |
| Graph legend (entity type → color mapping) | `graph-legend.tsx` | Shipped |
| Approval queue (per-item approve/reject/edit) | `approvals.tsx` + `approval-card.tsx` | Shipped |
| Merge resolution card | `merge-card.tsx` | Shipped |
| Activity feed | `activity-feed.tsx` | Shipped |
| Stat cards | `stat-card.tsx` | Shipped |
| Zoom-to-fit on engine stop | `graph-view.tsx` | Shipped |
| Stable physics (tuned d3 forces, velocity decay 0.4) | `graph-view.tsx` | Shipped |

---

## Table Stakes

Features users expect from a knowledge graph dashboard. Missing = product feels incomplete or broken.

### 1. Stable Hover Without Node Drift
**Why expected:** Any graph tool that makes nodes fly away on hover is immediately untrustworthy. Users cannot explore if the graph reorganizes during interaction.
**Current state:** PARTIALLY SHIPPED. Physics tuned (charge -120, distanceMax 300, velocityDecay 0.4), but hover still re-heats simulation via `onNodeHover`. The issue is that `onNodeHover` does not re-heat, but node drag does. Hover physics should be verified stable — if nodes still drift, the fix is `cooldownTicks: 0` after initial layout, not during interaction.
**Complexity:** Low — configuration change + test
**Dependencies:** `graph-view.tsx` d3 force config; `d3VelocityDecay`, `d3AlphaDecay` props
**Reference:** react-force-graph docs — `cooldownTime` and `cooldownTicks` after engine stop freeze layout; hover itself does not reheat unless `onNodeHover` calls `fgRef.current.d3ReheatSimulation()`

### 2. Search with Auto-Zoom to Result
**Why expected:** Neo4j Bloom, Obsidian, every production graph tool — typing a name and pressing Enter should zoom the camera to the matched node. Current behavior: matching nodes glow but camera does not move.
**Current state:** PARTIAL — opacity fade on search exists; zoom-to-result does NOT.
**Complexity:** Low — call `fgRef.current.centerAt(x, y, 400)` then `fgRef.current.zoom(2, 400)` on first match; coordinates are on the GraphNode after layout
**Dependencies:** `graph-view.tsx` search state + `fgRef`; requires node to have x/y set (available after engine stabilizes)

### 3. Confidence Threshold Filter
**Why expected:** Confidence is a core data attribute in Myco. Users need to hide low-confidence noise and see only high-confidence facts. Neo4j Bloom uses property sliders; yfiles guide recommends filter-on-attribute as essential.
**Current state:** NOT SHIPPED. Confidence data exists on nodes (`GraphNode.confidence`), analytics panel shows confidence bands, but no filter slider.
**Complexity:** Low — add a range input to toolbar; filter `decoratedNodes` by `n.confidence >= threshold`
**Dependencies:** `graph-toolbar.tsx` (add slider), `graph-view.tsx` `decoratedNodes` useMemo (add confidence filter gate)

### 4. Neighborhood Explorer (Ego Graph)
**Why expected:** Obsidian's Local Graph is its most-used feature — isolating a node's 1-hop or 2-hop subgraph to reduce visual clutter. Neo4j Bloom, Kumu, and every serious graph tool has this. Without it, dense graphs become unusable at 100+ nodes.
**Current state:** NOT SHIPPED. Neighbor illumination (dim non-neighbors) exists but does not isolate — all nodes remain rendered.
**Complexity:** Medium — when a node is "focused", filter `decoratedNodes` to only include that node + its N-hop neighbors; add depth slider (1 or 2 hops); provide "exit neighborhood" button
**Dependencies:** `graph.tsx` state management; `neighborMap` already computed in `graph-view.tsx`; needs a new `focusedNodeId` + `neighborDepth` prop pair

### 5. Empty State / Onboarding Explanation
**Why expected:** First-time users see an empty graph with no explanation of what Myco is, what the approval queue is, or what to do. Research from 2025 shows 69% of top-tier retention products have strong first-session experiences. The approvals page shows "All caught up" with zero context.
**Current state:** PARTIAL — approvals page has a minimal "All caught up" message; graph has no empty state
**Complexity:** Low — two empty-state components with explanatory copy and a suggested next action
**Dependencies:** `approvals.tsx`, `index.tsx` (home page)

### 6. Batch Approve/Reject in Approval Queue
**Why expected:** When 20 low-confidence items accumulate after a consolidation run, individual approve/reject is tedious. Batch actions are standard in any queue-style UI (email, moderation tools).
**Current state:** NOT SHIPPED — each item requires an individual action
**Complexity:** Medium — checkbox selection state, "Select All" / "Approve Selected" / "Reject Selected" actions, bulk mutation
**Dependencies:** `approvals.tsx`, `use-approvals` hook, API endpoint for bulk resolve (may need backend addition)

---

## Differentiators

Features that set Myco apart from generic graph tools. Not expected, but valued by the target user (developer/power user who thinks in systems).

### 1. Cluster Visualization with Auto-Detected Boundaries
**What it does:** Automatically detects connected components (already computed in analytics as `componentCount`) and draws a soft convex hull or ellipse boundary around each cluster, with a subtle fill color and label.
**Value:** Kumu's clustering is its standout feature — users immediately see macro-structure ("these 12 nodes form the 'TypeScript projects' cluster"). Without visual grouping, users must mentally trace connections.
**Complexity:** Medium-High — cluster detection is already done (union-find in `computeMetrics`); rendering hulls on Canvas requires computing convex hull per component or using d3's `d3-polygon` convex hull; label placement is tricky
**Dependencies:** Cluster membership must propagate from `computeMetrics` (in analytics panel) back to `GraphView` — currently these are separate calculations. Requires a shared `clusterMap: Map<nodeId, clusterId>` computed once and passed as prop.
**Reference:** Kumu clustering docs; d3-polygon `polygonHull()`; Gephi community detection uses modularity — for Myco, connected-component grouping is sufficient (no need for Louvain algorithm)

### 2. Timeline Playback with Animated Node Entry
**What it does:** When timeline is scrubbed or playing, nodes that become visible at the current timestamp fade in with a brief glow burst rather than snapping into existence. The graph smoothly grows.
**Value:** Neo4j Bloom's "Slicer" is explicitly called out as a standout feature. Temporal animation makes the knowledge accumulation story visceral — users see the graph grow from first agent session to present.
**Current state:** Timeline slider exists and plays; nodes snap in/out (binary opacity change). Missing: entry animation.
**Complexity:** Medium — requires tracking "newly appeared" nodes (compare previous timestamp's node set to current) and rendering them with an animated alpha ramp using `requestAnimationFrame` or a timestamp-based opacity in `nodeCanvasObject`
**Dependencies:** `graph-view.tsx` node rendering; `timeline-slider.tsx`; need a `newlyAppearedNodeIds: Set<string>` prop + a per-frame alpha tracker

### 3. Inline Mini-Graph Preview in Approval Queue
**What it does:** When reviewing an approval item (a new entity or relationship), a small embedded graph shows where the proposed entity would connect in the existing knowledge graph — its 1-hop neighborhood in the current graph.
**Value:** The approval queue currently shows text (entity name, type, observations). Adding spatial context lets users make faster, more confident decisions. "Should I approve this 'React' entity?" is easier when you can see it would connect to 'TypeScript', 'Vite', 'shadcn'.
**Complexity:** Medium — reuse `GraphView` with `mini={true}` (already supported); pass a filtered subgraph of the entity's predicted neighborhood; requires a graph data query by entity name or type
**Dependencies:** `approval-card.tsx`; `GraphView` mini mode (already exists); API endpoint to fetch neighborhood by entity ID or predicted name

### 4. Knowledge Growth Chart on Home Page
**What it does:** A line or area chart showing entities, observations, and relationships added over time — the "heartbeat" of the knowledge base.
**Value:** Makes the value of Myco visible. Users see "I've accumulated 847 facts over 3 months of agent usage." This is motivating and diagnostic (flat line = agents not using brain tools).
**Complexity:** Medium — requires a time-series API endpoint (`/api/stats/growth?interval=day`); chart with recharts or a lightweight canvas approach
**Dependencies:** `api-server` stats route (may need new endpoint); `packages/core` needs a growth query; React chart component

### 5. Entity Detail Panel: Confidence Visualization with Source Evidence
**What it does:** The entity panel shows observations as a list. Enhanced version: each observation shows its confidence score as a color-coded badge (teal = high, amber = medium, rose = low), plus the source agent/session that created it, with a link to the relevant episode log.
**Value:** Makes the epistemological provenance visible. Users understand why Myco believes something and can reject low-confidence observations directly from the panel.
**Current state:** Entity panel shows observations as text list; no confidence badge, no agent/session attribution
**Complexity:** Medium — data is available (`observation.confidence`, `observation.created_at`, provenance links); UI enhancement only
**Dependencies:** `entity-panel.tsx`; provenance data from `packages/core` via API

### 6. Right-Click Context Menu on Nodes
**What it does:** Right-clicking a node opens a context menu: "Explore neighborhood", "Pin here", "Unpin", "Find paths to...", "View entity details", "Copy name".
**Value:** Power users in every graph tool (Neo4j Bloom, Gephi, yEd) expect a context menu. Right-click currently only unpins — this is undiscoverable and wastes the interaction.
**Current state:** `onNodeRightClick` unpins but shows no UI feedback
**Complexity:** Medium — requires a canvas-positioned floating menu (not a native context menu — those don't work well with canvas); track right-click position, render a div overlay
**Dependencies:** `graph-view.tsx`; new `NodeContextMenu` component; needs to surface `onNeighborhoodExplore`, `onPathFrom` callbacks

### 7. "Myco" Language and Branded Empty States
**What it does:** Replace all "brain" language with "Myco" throughout. Write empty states that explain the product in mycorrhizal-network metaphor language. First-time approvals page should say something like "Your knowledge web is quiet — once agents start remembering, inferences will surface here for your review."
**Value:** Consistency and brand coherence. "brain" language is the old name. Empty states in the Slack/Pinterest pattern are proven to improve week-1 retention.
**Current state:** Approvals page: "All caught up / No pending items. The next consolidation run will populate this queue." — functional but cold
**Complexity:** Low — copy changes + empty-state component design
**Dependencies:** All route files, any remaining "brain" strings in dashboard

---

## Anti-Features

Features to explicitly NOT build for v4.0.

### 1. Betweenness Centrality / PageRank Computation in Browser
**Why avoid:** Betweenness centrality is O(VE) — for a graph of 500 nodes and 1000 edges, this is 500,000 operations per render. Gephi computes this offline as a batch process. Running it on the main thread in a React component will freeze the UI.
**What to do instead:** The analytics panel already surfaces "top hubs" (degree-based) and "bridge nodes" (type-diversity-based) — these are O(V+E) and feel analytically similar to the user. If true betweenness centrality is needed in a future milestone, compute it in a Web Worker or in the API server.

### 2. 3D Graph View
**Why avoid:** react-force-graph-3d exists, but 3D graphs are uniformly harder to navigate than 2D for exploratory knowledge graph use. Obsidian's 3D graph plugin is cited as "visually impressive but practically useless" in community forums. The bioluminescent deep-sea aesthetic works better in 2D with glow effects — depth is implied through lighting, not 3D perspective.
**What to do instead:** Invest in 2D glow quality, node sizing by observation count, and cluster hull visuals. These give depth without the navigation penalty of 3D.

### 3. Graph Editing Directly on Canvas
**Why avoid:** Clicking a canvas to add edges, rename nodes, and edit relationships sounds powerful but requires significant UX complexity (mode switching, undo/redo, accidental clicks). Neo4j Bloom has this and it is one of its most-complained-about features.
**What to do instead:** All graph mutations happen through MCP tools (agents write the graph), manual `brain remember` commands, or the approval queue. The dashboard is a read-and-approve interface, not an editor.

### 4. Full-Text Semantic Search in Dashboard
**Why avoid:** Semantic search requires embedding queries via Ollama + vector similarity lookup. This is a server-side operation. Adding a semantic search input in the dashboard implies an API endpoint that blocks on Ollama inference, which may be slow (200ms–2s per query), and Ollama may not be running.
**What to do instead:** The existing name-based search (client-side substring match with opacity fade) is fast, reliable, and offline-capable. The MCP `recall` tool handles semantic search for agents. If semantic search in the dashboard becomes a priority, it belongs in a future milestone with proper loading states and Ollama health awareness.

### 5. Undo/Redo in Approval Queue
**Why avoid:** Approval decisions are durable writes to the knowledge graph. An undo system requires tombstoning or soft-delete, which adds schema complexity. The approval queue already has a low error rate (each item shows full context before action).
**What to do instead:** Add a confirmation toast that shows what was approved/rejected with a brief "Undo" window (5 seconds, in-memory only) — if the user doesn't click undo within 5s, the write commits. This is the Gmail pattern: low complexity, high perceived safety.

### 6. Export to External Graph Tools (GraphML, GEXF)
**Why avoid:** Out of scope for v4.0. Myco's value is the local SQLite store + agent integration. Export workflows fragment the knowledge base and create maintenance burden.
**What to do instead:** The SQLite file is portable — power users can access it directly with any SQLite tool. Defer export to a future milestone if user demand emerges.

---

## Feature Dependencies

```
Cluster visualization ──────────────────────────→ shared clusterMap (analytics → graph-view)
Neighborhood explorer ──────────────────────────→ focusedNodeId state + N-hop filter
Search auto-zoom ────────────────────────────────→ node x/y available post-layout + fgRef.centerAt
Confidence filter ───────────────────────────────→ graph-toolbar slider + decoratedNodes filter
Timeline entry animation ────────────────────────→ newlyAppearedNodeIds prop + per-frame alpha
Inline mini-graph in approvals ──────────────────→ GraphView mini mode (exists) + neighborhood API
Growth chart (home page) ────────────────────────→ new /api/stats/growth endpoint
Entity panel confidence badges ──────────────────→ observation confidence data via API
Right-click context menu ────────────────────────→ canvas overlay + callback props
Batch approvals ─────────────────────────────────→ checkbox state + bulk API endpoint (may need backend)
```

---

## Competitive Analysis: What Each Tool Does Well

### Neo4j Bloom
- **Slicer**: Property-driven timeline playback — similar to what Myco's timeline slider does, but animates node entry (Myco: snap-in)
- **Perspectives**: Save named "views" with different filter/layout combinations — not needed for v4.0 (single-user, single graph)
- **Natural language search**: "Find all technologies used by projects" — too complex for v4.0; the MCP recall tool handles this for agents
- **Scene-level expand**: Right-clicking a node offers "Expand" to pull in connected nodes — similar to neighborhood explorer

### Obsidian Graph View
- **Local Graph**: The most-valued feature by far — click a note, switch to local view showing only connected notes at configurable depth. This is the neighborhood explorer.
- **Node filters**: Tag-based, folder-based, link-type filtering alongside the global view — Myco equivalent is entity type filter (already exists) + confidence filter (not yet built)
- **Depth slider**: 1, 2, 3, or 4 hops from selected node in local graph — Myco's neighborhood explorer should include a depth control
- **Community feedback**: "The global graph is decorative; the local graph is useful" — validates neighborhood explorer over full-graph aesthetics

### Kumu.io
- **Clustering**: Turn any profile attribute into automatic cluster nodes — Myco's entity type is a natural cluster axis
- **Lens system**: Switch between different visual rules (size by degree, color by confidence, etc.) — advanced; defer beyond v4.0
- **Focus**: Click an element to "focus" it, dimming everything outside its neighborhood — this is the neighborhood explorer pattern
- **Sidebar**: Rich element profile panel — similar to Myco's EntityPanel

### Gephi
- **Modularity / community detection**: Louvain algorithm for cluster detection — O(n log n), runs offline. For v4.0, connected-component grouping is sufficient
- **Filter panel**: Multi-attribute filter composition (degree range, attribute value, etc.) — Myco only needs confidence threshold for v4.0
- **Statistics**: All graph metrics in one panel — Myco's GraphAnalytics panel already covers the relevant subset

### Roam Research
- **Sidebar multi-panel**: Open multiple nodes side-by-side — not relevant for Myco's use case (single-focus explorer)
- **Linked references**: Every node shows backlinks — Myco's EntityPanel should show "entities that reference this entity" (relationships where this entity is target), not just outgoing relationships. Currently PARTIAL.

### yfiles Knowledge Graph Guide
- **Badges for confidence**: Display confidence as a small badge overlay on the node (colored dot or percentage). Myco currently encodes confidence in the analytics panel but not on the node itself. Node-level confidence badge is recommended.
- **Progressive disclosure**: Start collapsed, expand on click — Myco's click-to-open EntityPanel implements this correctly
- **Lens tools**: Focus+context view — equivalent to neighborhood explorer

---

## MVP Recommendation for v4.0

Prioritize in this order:

**Must ship (table stakes gaps):**
1. Hover stability verification (low effort, high trust impact)
2. Search auto-zoom (low effort, standard expectation)
3. Confidence threshold filter slider (low effort, data already exists)
4. Neighborhood explorer (medium effort, highest exploration value)
5. Batch approve/reject (medium effort, queue usability)

**Should ship (differentiators with good ROI):**
6. Cluster visualization with hull rendering (medium-high effort, signature visual)
7. Timeline entry animation (medium effort, makes temporal story vivid)
8. Confidence badges on entity panel observations (medium effort, epistemic transparency)
9. "Myco" language pass + branded empty states (low effort, brand consistency)

**Defer to v4.1 or later:**
- Growth chart (requires new backend endpoint)
- Inline mini-graph in approvals (requires neighborhood API endpoint)
- Right-click context menu (nice to have, not critical path)
- Node-level confidence badge overlay (visual polish, post-cluster work)

---

## Sources

- Neo4j Bloom product page and documentation — https://neo4j.com/product/bloom/
- Neo4j graph visualization guide — https://neo4j.com/docs/getting-started/graph-visualization/graph-visualization/
- Visual graph analytics with Bloom (Feb 2026) — https://shrawansaproo.medium.com/visual-graph-analytics-using-neo4j-bloom-to-watch-your-data-come-to-life-31cb5a49a314
- Obsidian graph view documentation — https://help.obsidian.md/plugins/graph
- Obsidian graph view community usage thread — https://forum.obsidian.md/t/whats-the-point-of-the-graph-view-how-are-you-using-it/71316
- Obsidian 3D graph view analysis — https://noduslabs.com/featured/obsidian-3d-graph-view-plugin-with-network-science-insights/
- Kumu clustering documentation — https://docs.kumu.io/guides/clustering
- Kumu tour and features — https://kumu.io/tour
- yfiles knowledge graph visualization guide — https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs
- react-force-graph documentation — https://vasturiano.github.io/react-force-graph/
- react-force-graph GitHub — https://github.com/vasturiano/react-force-graph
- Gephi network analysis guide — https://medium.com/eni-digitalks/network-analysis-with-gephi-a-practical-guide-e2f5287fa6c3
- Mem0 graph memory blog (Jan 2026) — https://mem0.ai/blog/graph-memory-solutions-ai-agents
- Empty state / onboarding research — https://raw.studio/blog/empty-states-error-states-onboarding-the-hidden-ux-moments-users-notice/
- Cambridge Intelligence: social network analysis centrality — https://cambridge-intelligence.com/keylines-faqs-social-network-analysis/
- Codebase audit: packages/dashboard/src/ — direct source read, HIGH confidence
