# Architecture: v4.0 Dashboard Feature Integration

**Project:** Myco v4.0 — Dashboard & Graph Experience
**Researched:** 2026-03-27
**Scope:** Integration patterns for animated timeline, cluster detection, growth charts,
particle effects, batch approvals, and neighborhood explorer into the existing React PWA.

---

## Current Architecture Map

```
packages/dashboard/src/
  routes/
    index.tsx          — Home page (stats, mini graph, activity, quick-approve)
    graph.tsx          — Full graph explorer (all graph features orchestrated here)
    approvals.tsx      — Approval queue (list, resolve individual items)
  components/
    graph-view.tsx     — ForceGraph2D canvas renderer, filtering, hover logic
    graph-toolbar.tsx  — Right-side toggle buttons (analytics, path, timeline, legend)
    graph-analytics.tsx — Floating panel: metrics, hubs, bridge nodes, confidence
    graph-legend.tsx   — Floating panel: entity type color key
    timeline-slider.tsx — Bottom-center scrub bar + play/pause
    entity-panel.tsx   — Right drawer: entity detail on node click
    activity-feed.tsx  — Episode log display (currently uses hardcoded slate-* classes)
    stat-card.tsx      — KPI card with glow-on-alert
    quick-approve.tsx  — Inline approve widget on home page
    approval-card.tsx  — Full approval card with confidence bar + edit
    merge-card.tsx     — Variant for merge-candidate approvals
    sidebar.tsx        — Navigation shell
  hooks/
    use-graph.ts       — TanStack Query wrapper for GET /api/graph
    use-dashboard.ts   — TanStack Query wrapper for GET /api/dashboard
    use-approvals.ts   — TanStack Query + mutation for approvals
  lib/
    api.ts             — Typed fetch wrappers + TypeScript interfaces

packages/api-server/src/routes/
    graph.ts           — GET /api/graph (nodes + links, optional ?project filter)
    dashboard.ts       — GET /api/dashboard (stats, episodes, topConnected, growthStats)
    entities.ts        — GET /api/entities, GET /api/entities/:id
    approvals.ts       — GET /api/approvals, PATCH /api/approvals/:id
    episodes.ts        — Episode routes
```

### Data Flow Baseline

```
SQLite → api-server (Hono, port 3001) → TanStack Query cache → React components
```

`/api/graph` returns all nodes and all links in a single payload. The dashboard's
`graph.tsx` route does all filtering (timeline cutoff, type filter, search opacity)
in-memory via `useMemo`. Cluster detection, neighborhood isolation, and confidence
filtering all fit this same client-side pattern — no new API endpoints needed for
those features.

---

## Feature Integration Map

### 1. Animated Timeline Playback (MODIFY `timeline-slider.tsx`)

**What exists:** `TimelineSlider` has play/pause, a range input, speed selector, and
a setInterval that advances `currentDate` by `dayMs * speed` every 100ms. The date
filter sits in `graph.tsx`'s `filteredData` useMemo.

**What's missing / what to change:**

- The play animation is functional but visually crude (native range input). Replace the
  native `<input type="range">` with a custom CSS-animated progress bar matching the
  deep-sea theme.
- Add a "node entry pulse" effect: when `filteredData` gains new nodes between ticks,
  briefly render those nodes with an expanded glow ring in `graph-view.tsx`'s
  `nodeCanvasObject`. Signal this via a new `newNodeIds?: Set<string>` prop on
  `GraphView`, computed in `graph.tsx` by diffing successive `filteredData.nodes`
  arrays with a `useRef<Set<string>>` tracking the previous frame's node IDs.
- The speed options (1x/2x/5x) should be kept; they're useful. Add `7x` for sparse graphs.

**Integration point:** `TimelineSlider` → `graph.tsx` (state) → `GraphView`
(new `newNodeIds` prop). No API changes.

---

### 2. Cluster Detection & Visualization (MODIFY `graph-analytics.tsx`, `graph-view.tsx`)

**What exists:** `graph-analytics.tsx` already computes connected components via
union-find inline and reports `componentCount`. `GraphView` renders nodes uniformly.

**What's missing:** Visual cluster boundaries on the canvas, and cluster-aware sections
in the analytics panel.

**Approach — client-side only:**

Extract the union-find into a shared utility:

```
lib/graph-clusters.ts
  export function detectClusters(nodes, links): Map<string, string>
  // Returns nodeId -> clusterRootId
```

`GraphView` receives a `clusterMap?: Map<string, string>` prop (optional, off by
default). When present, draw cluster boundary circles on the canvas during each frame.
Each cluster's bounding circle = centroid of member node x/y positions + max member
radius. Compute per-frame since physics simulation moves nodes continuously.

Use `onRenderFramePre` (ForceGraph2D exposes this as a canvas callback) to draw
cluster overlays before nodes render. Fill: dominant entity type color at 4% opacity;
stroke: same color at 15% opacity, 1px dashed.

**Toolbar toggle:** Add "Clusters" toggle button to `GraphToolbar` with an
`onToggleClusters` prop. `graph.tsx` owns `clustersEnabled` boolean state and passes
`clusterMap` (or `null`) down.

**Integration point:** New `lib/graph-clusters.ts`. Modify `graph-view.tsx` (new prop
+ canvas overlay). Modify `graph-toolbar.tsx` (new button). Modify `graph-analytics.tsx`
to import from shared utility. Modify `graph.tsx` (state + wiring). No API changes.

---

### 3. Neighborhood Explorer (MODIFY `graph.tsx`, `graph-view.tsx`)

**What exists:** Hover illumination in `GraphView` already dims non-neighbors to
`alpha=0.06`. `EntityPanel` shows connected entities as a flat list. There is no mode
that locks the view to a single node's local subgraph.

**Approach:**

New hook `hooks/use-neighborhood.ts`:
```typescript
export function useNeighborhood(
  focalId: string | null,
  nodes: GraphNode[],
  links: GraphLink[],
  depth: 1 | 2
): { nodes: GraphNode[], links: GraphLink[] } | null
```

Returns BFS-expanded subgraph. Returns `null` when `focalId` is null (full graph shown).

`GraphView` receives `neighborhoodData?: { nodes, links } | null`. When set, use it
instead of the full `decoratedNodes`/`filteredLinks`. This makes neighborhood mode
composable with the existing timeline filter (apply both).

Entry: "Explore neighborhood" button on `EntityPanel` (calls lifted
`onFocusNeighborhood(nodeId)` callback). Depth toggle (1-hop vs 2-hop) on `EntityPanel`
or a small control on `GraphToolbar`.

Exit: Escape key handler (already present in `graph.tsx` for path mode — extend it).
Toolbar shows a "Neighborhood: NodeName [x]" dismiss badge when active, similar to
the existing path trace info display.

**Integration point:** New `hooks/use-neighborhood.ts`. Modify `graph-view.tsx`
(new prop). Modify `graph-toolbar.tsx` (neighborhood dismiss display). Modify
`graph.tsx` (state + wiring). Modify `entity-panel.tsx` (Focus button). No API changes.

---

### 4. Confidence Filter Slider (MODIFY `graph-view.tsx`, `graph.tsx`)

**What exists:** `GraphView` has type filter and search. Confidence data is present on
every node (`confidence: number`). No confidence threshold filter exists yet.

**Approach:**

Add `confidenceThreshold: number` prop to `GraphView` (default `0`). The
`decoratedNodes` useMemo already filters by type and computes opacity — add:
```typescript
.filter(n => (n.confidence ?? 1) >= confidenceThreshold)
```

Slider UI lives alongside the existing search bar in `GraphView`'s top-left controls.
The home page mini graph passes `confidenceThreshold={0}` so no slider appears.

`graph.tsx` holds `confidenceThreshold` state and passes it down.

**Integration point:** Modify `graph-view.tsx`. Modify `graph.tsx` (state + prop
passing). No new components. No API changes.

---

### 5. Search with Animated Highlight and Auto-Zoom (MODIFY `graph-view.tsx`)

**What exists:** Search already sets `opacity: 0.15` on non-matching nodes. There is
no zoom-to-match behavior or pulse animation on matched nodes.

**What to add:**

When search resolves to exactly one matching node, call:
```typescript
fgRef.current.centerAt(node.x, node.y, 400)
fgRef.current.zoom(3, 400)
```
after a 300ms debounce (so typing doesn't thrash the camera).

For the animated highlight: matched nodes get a pulsing outer ring using
`Date.now() / 300` as the sine argument. `nodeCanvasObject` already runs per-frame.
Compute `pulseScale = 1 + 0.3 * Math.sin(Date.now() / 300)` for matched nodes and
multiply the glow radius. When the simulation has cooled, trigger
`fgRef.current.refresh()` on each search change to keep the animation loop running.

**Integration point:** Modify `graph-view.tsx` only. No new components, hooks, or API
changes.

---

### 6. Knowledge Growth Chart (NEW component, NEW API endpoint)

**What exists:** `DashboardStats` has `growthStats` with three 7-day delta counts.
This is a point-in-time snapshot, not a time series.

**What's needed:** Daily entity/observation/relationship counts for 30–90 days.

**New API endpoint required:**

```
GET /api/stats/growth?days=30
Response: { series: Array<{ date: string, entities: number, observations: number, relationships: number }> }
```

Implementation in `packages/api-server/src/routes/stats.ts`:
```sql
SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count
FROM entities
WHERE created_at > datetime('now', '-30 days')
GROUP BY date ORDER BY date
```
Three separate queries (entities, observations, relationships), merged by date key in
JavaScript. Index on `created_at` already exists for all three tables. Register under
`/api/stats` in `api-server/src/index.ts`.

**New component:** `components/growth-chart.tsx`

Custom Canvas sparkline (~60 lines). Use `useRef<HTMLCanvasElement>` and draw filled
area charts with `createLinearGradient` from the glow color to transparent — identical
pattern to `graph-view.tsx`'s node glow. Three overlaid lines: teal (entities), violet
(observations), amber (relationships). No charting library dependency.

**New hook:** `hooks/use-growth.ts` — TanStack Query wrapper, `staleTime: 5 * 60_000`.

**New type in `api.ts`:**
```typescript
export interface GrowthSeries {
  series: Array<{ date: string; entities: number; observations: number; relationships: number }>
}
export function fetchGrowth(days?: number): Promise<GrowthSeries>
```

**Integration point:** New `packages/api-server/src/routes/stats.ts`. Register in
`index.ts`. New `growth-chart.tsx` component. New `use-growth.ts` hook. Modify
`routes/index.tsx` to import and render the chart. Modify `api.ts`.

---

### 7. Particle Effects (MODIFY `graph-view.tsx`)

**What exists:** The canvas renderer already uses `nodeCanvasObject` and
`linkCanvasObject`. The physics simulation continuously redraws the canvas. No particle
system exists.

**Approach — no new library:**

Particles stored in `useRef<Particle[]>`:
```typescript
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
```

Spawn particles from nodes on:
- Node click: burst of 8 particles in the node's glow color
- New nodes appearing during timeline playback (`newNodeIds` prop): 4 particles from
  each newly appeared node

In ForceGraph2D's `onRenderFramePre` callback (called each frame before node/link
rendering, receives `ctx: CanvasRenderingContext2D`):
1. Update particle positions (`x += vx`, `y += vy`, life decrements by 0.025)
2. Draw live particles as small glowing circles (`ctx.arc`, radial gradient)
3. Splice dead particles from array

Cap particle pool at 200 entries to prevent runaway allocation.

When particles are alive but simulation is cooled: call `fgRef.current.refresh()` to
force continued canvas redraws. Stop calling `refresh()` when pool is empty.

**Integration point:** Modify `graph-view.tsx` only. No new components, hooks, or API
changes.

---

### 8. Batch Approvals (MODIFY `approvals.tsx`, `approval-card.tsx`, `use-approvals.ts`, NEW API endpoint)

**What exists:** `ApprovalCard` already has `selectable`, `selected`, and
`onToggleSelect` props defined in its TypeScript interface — these are currently never
passed from `approvals.tsx`. The `PATCH /api/approvals/:id` endpoint handles one item
at a time.

**New API endpoint required:**

```
POST /api/approvals/batch
Body: { ids: string[], status: 'approved' | 'rejected' }
Response: { resolved: number, failed: number }
```

Implementation: add to the existing `approvalsRoutes` Hono app in `approvals.ts`.
Wrap the existing single-approve logic in a loop inside `db.transaction()`. Batch
rejections are trivially fast; batch approvals run the full approve transaction per
ID — acceptable for queues of ~20 items.

**Dashboard changes in `approvals.tsx`:**
1. `selectedIds: Set<string>` state
2. Pass `selectable={true}`, `selected={selectedIds.has(item.id)}`,
   `onToggleSelect={() => toggleId(item.id)}` to each card
3. Sticky batch action bar: "X selected — Approve All / Reject All / Clear"
4. "Select All / None" shortcut buttons

**New hook in `use-approvals.ts`:**
```typescript
export function useBatchResolveApprovals()
// useMutation with optimistic removal of all selected IDs from cache
```

**Integration point:** Add `POST /batch` to `approvals.ts`. Modify `approvals.tsx`
(state + batch bar). Modify `use-approvals.ts` (mutation hook). Modify `api.ts`
(new function). `ApprovalCard` requires no interface changes — just activation.

---

### 9. Inline Mini-Graph Preview in Approvals (NEW component)

**What exists:** `ApprovalCard` shows entity name, observation, confidence bar, and
evidence quote. The approval item's `metadata.fact.related_entities` already contains
enough data to render a synthetic subgraph.

**Approach:**

New `components/approval-mini-graph.tsx`. Props:
```typescript
interface ApprovalMiniGraphProps {
  entityName: string
  entityType: string
  relatedEntities: Array<{ name: string; type: string; relation_type: string }>
}
```

Constructs synthetic `nodes` and `links` entirely from props — no API call. Renders
`<GraphView mini nodes={syntheticNodes} links={syntheticLinks} onNodeClick={noop} />`.

Rendered inside `ApprovalCard` behind a collapsible "Preview in graph" toggle (off by
default). Use a `max-h` CSS transition for expand/collapse animation.

**Integration point:** New `approval-mini-graph.tsx`. Import into `approval-card.tsx`.
No API changes. No new hooks.

---

### 10. Approvals Onboarding Banner (NEW component)

**What exists:** The approvals page shows an empty state when the queue is empty, but
no explanation of what the queue is or how items appear. All "brain" language should
become "Myco" language.

**Approach:**

New `components/approvals-onboarding.tsx`. Dismissable card rendered at top of
`approvals.tsx` when `localStorage.getItem('myco-approvals-onboarded')` is falsy.
Content: what Myco's consolidation cycle does, why items need review (low confidence,
contradictions, merges), what approve/reject means for the knowledge graph.

Dismiss stores the localStorage flag. A `useState` initializer reads the flag once.
No global state management needed.

**Integration point:** New `approvals-onboarding.tsx`. Import into `approvals.tsx`.
No API changes.

---

## New vs Modified Components Summary

| Component | Status | Feature(s) |
|-----------|--------|-----------|
| `graph-view.tsx` | MODIFY | Timeline entry pulses (`newNodeIds` prop), cluster boundary overlay (`clusterMap` prop), confidence filter (`confidenceThreshold` prop), animated search highlight + auto-zoom, neighborhood subgraph filtering (`neighborhoodData` prop), particle system (`onRenderFramePre`) |
| `graph-toolbar.tsx` | MODIFY | Clusters toggle button, neighborhood dismiss badge, confidence slider |
| `graph-analytics.tsx` | MODIFY | Import cluster utility from `lib/graph-clusters.ts` instead of inline union-find |
| `graph.tsx` (route) | MODIFY | `clustersEnabled` state, `neighborhoodNodeId` state, `confidenceThreshold` state, `newNodeIds` computation, wire all new props |
| `timeline-slider.tsx` | MODIFY | Styled progress track replacing native range input, speed options extended |
| `activity-feed.tsx` | MODIFY | Replace hardcoded `slate-*` classes with CSS variable theme |
| `approval-card.tsx` | MODIFY | Activate `selectable`/`selected` props (interface already defined), add "Preview in graph" toggle |
| `approvals.tsx` (route) | MODIFY | `selectedIds` state, batch action bar, pass selectable props, onboarding banner |
| `use-approvals.ts` | MODIFY | Add `useBatchResolveApprovals` mutation hook |
| `api.ts` | MODIFY | Add `GrowthSeries` type, `fetchGrowth()`, `batchResolveApprovals()` |
| `lib/graph-clusters.ts` | NEW | Shared union-find: `detectClusters(nodes, links) => Map<nodeId, clusterRootId>` |
| `hooks/use-neighborhood.ts` | NEW | BFS subgraph extraction at depth 1 or 2 |
| `hooks/use-growth.ts` | NEW | TanStack Query wrapper for `/api/stats/growth` |
| `components/growth-chart.tsx` | NEW | Canvas sparkline: entities/observations/relationships over time |
| `components/approval-mini-graph.tsx` | NEW | Synthetic mini-graph from approval metadata (no API) |
| `components/approvals-onboarding.tsx` | NEW | Dismissable onboarding card |
| `api-server/routes/stats.ts` | NEW | `GET /api/stats/growth` |
| `api-server/routes/approvals.ts` | MODIFY | Add `POST /api/approvals/batch` |

---

## New API Endpoints

### GET /api/stats/growth

```
Query params: days=30 (default 30, max 90)
Response: { series: Array<{ date: string, entities: number, observations: number, relationships: number }> }
```

Three SQLite `GROUP BY strftime('%Y-%m-%d', created_at)` queries, merged by date in JS.
The `created_at` index already exists on all three tables. Mount at `/api/stats` in
`api-server/src/index.ts`.

### POST /api/approvals/batch

```
Body: { ids: string[], status: 'approved' | 'rejected' }
Response: { resolved: number, failed: number }
```

Added to the existing `approvalsRoutes` Hono app. Wraps single-approve logic in an
outer `db.transaction()` loop.

---

## Build Order (Dependency-Aware)

### Phase 1 — Theme Foundation (no feature dependencies, unblocks accurate visual QA)
1. Apply bioluminescent CSS variables to `activity-feed.tsx` (currently `slate-*`),
   `approvals.tsx` heading, and any remaining hardcoded colors in sidebar.

### Phase 2 — Graph Core Features (each builds on stable `GraphView` from prior step)
2. **Confidence filter** — Trivial prop addition to `GraphView`. Establishes the
   pattern for props that modify `decoratedNodes` filtering.
3. **Cluster detection** — Extract `lib/graph-clusters.ts`. Wire to `GraphView` and
   `GraphToolbar`. Update `GraphAnalytics` to import from it.
4. **Search auto-zoom + animated highlight** — Self-contained inside `GraphView`.
5. **Neighborhood explorer** — New `hooks/use-neighborhood.ts`, state in `graph.tsx`,
   button in `EntityPanel`, dismiss in `GraphToolbar`.

### Phase 3 — Timeline and Particles (requires Phase 2 GraphView to be stable)
6. **Timeline animated playback** — Restyle `TimelineSlider`, add `newNodeIds` prop
   to `GraphView`.
7. **Particle effects** — Add particle system to `GraphView` using `onRenderFramePre`.
   Safest to add after all other `GraphView` changes are merged.

### Phase 4 — Growth Chart (API work first, then UI)
8. **Stats API endpoint** — Add `routes/stats.ts` and mount in `index.ts`. Independent
   of all dashboard changes.
9. **Growth chart** — Requires endpoint. Add `use-growth.ts` and `growth-chart.tsx`,
   wire into `routes/index.tsx`.

### Phase 5 — Approvals Overhaul (relatively independent, only needs Phase 1 theme)
10. **Approvals onboarding** — localStorage toggle, zero dependencies.
11. **Batch approvals** — API endpoint first (`POST /api/approvals/batch`), then
    `useBatchResolveApprovals` hook, then `approvals.tsx` UI. `ApprovalCard` selectable
    props need no interface changes.
12. **Inline mini-graph preview** — Requires `GraphView` to be stable (Phase 2).
    Synthetic data, no new API work.

### Phase 6 — Analytics Panel Enhancement (requires cluster utility from Phase 2)
13. Add cluster-aware sections to `GraphAnalytics`. Final polish pass.

---

## Anti-Patterns to Avoid

### Fetching Cluster Data from the Server
All cluster detection is computable client-side from the graph payload already fetched.
Adding a `/api/graph/clusters` endpoint would be a server round-trip for work that
takes <2ms in the browser with union-find on a graph of <10k nodes.

### Lifting Timeline State into a React Context
`timelineEnabled` and `timelineDate` are local to the graph route. There is no reason
to put them in Context or a global store. The only consumer is `graph.tsx` and its
children. Context adds indirection without benefit here.

### Splitting GraphView into Subcomponents
`graph-view.tsx` is ~600 lines. Splitting it into `GraphCanvas`, `GraphControls`,
`GraphOverlay`, etc. is tempting but counterproductive: ForceGraph2D's imperative ref
must be colocated with all canvas callbacks (`nodeCanvasObject`, `onRenderFramePre`,
etc.). Splitting the ref responsibility creates either prop-drilling or ref-forwarding
complexity that outweighs the organizational gain. Add new props to the existing
component.

### Using a Charting Library for the Growth Chart
Recharts, Nivo, and Chart.js each add >200KB to the bundle. The growth chart is two
or three simple area sparklines. A ~60-line Canvas implementation matches the
bioluminescent aesthetic better than any default charting theme, adds zero bundle
weight, and follows the same `hexToRgba` + `createLinearGradient` pattern already
established in `graph-view.tsx`.

### Adding a Particle Library
The existing canvas system in `graph-view.tsx` already renders at 60fps. A separate
particle library (framer-motion particles, tsParticles) would create two competing
animation loops targeting the same canvas. Implement particles natively in
`onRenderFramePre`.

---

## Data Flow Changes Summary

```
Before (v3.0):
  /api/graph      → useGraph     → graph.tsx (timeline filter) → GraphView

After (v4.0):
  /api/graph          → useGraph     → graph.tsx
                                          ↓ (multiple new props)
                                       GraphView (+ clusterMap, confidenceThreshold,
                                                    neighborhoodData, newNodeIds)

  /api/stats/growth   → useGrowth    → index.tsx → GrowthChart

  /api/approvals      → useApprovals → approvals.tsx
                                          → ApprovalCard (selectable activated)
                                          → ApprovalMiniGraph (synthetic, no API)
                                          → ApprovalsOnboarding (localStorage)

  /api/approvals/batch → useBatchResolveApprovals → approvals.tsx (batch bar)
```

---

## Sources

- Source code read directly from codebase (HIGH confidence — current production code):
  `graph-view.tsx`, `graph-toolbar.tsx`, `graph-analytics.tsx`, `timeline-slider.tsx`,
  `entity-panel.tsx`, `activity-feed.tsx`, `approval-card.tsx`, `approvals.tsx`,
  `use-approvals.ts`, `api.ts`, `routes/graph.ts`, `routes/dashboard.ts`,
  `routes/approvals.ts`, `core/schema.ts`
- ForceGraph2D `onRenderFramePre`, `centerAt()`, `zoom()`, `refresh()` APIs: in-use
  patterns (`onEngineStop`, `nodeCanvasObject`, imperative ref) confirmed from existing
  code; named callbacks confirmed as part of the library's documented API surface
  (MEDIUM confidence — requires verification against current react-force-graph-2d docs
  before implementation)
- SQLite `strftime` GROUP BY pattern: confirmed in schema.ts that `created_at` is
  stored as ISO text string; standard SQLite function (HIGH confidence)
- `ApprovalCard` selectable props (`selectable`, `selected`, `onToggleSelect`) confirmed
  present in the TypeScript interface but not passed from `approvals.tsx` (HIGH
  confidence — read both files)
