# Mycelium Upgrade — Self-Enhancing Knowledge Web + Dashboard Overhaul

**Date:** 2026-03-22
**Status:** Approved

## Overview

Two interleaved tracks that transform Myco from a functional knowledge store into a living, self-enhancing knowledge web with a bioluminescent mycelium-themed dashboard.

**Track A: Self-Enhancing Knowledge Web** — Algorithms that automatically discover and create relationships between entities, making the graph denser and more useful over time.

**Track B: Mycelium Dashboard** — Visual overhaul with organic, glowing aesthetics, rich graph interactions, and a command-center dashboard.

---

## Step 1: Self-Enhancing Algorithms + API Enrichment

### 1A. Auto-Relationship Discovery in `remember()`

**File:** `packages/mcp-server/src/tools.ts` → `rememberEntity()`

Currently, relationships are only created when agents explicitly pass a `relations` array. Most `remember()` calls don't include relations, so the graph stays sparse.

**New behavior:** After storing the observation, scan existing entities for potential connections:

1. **Name-mention scanning** — Search the new observation text for existing entity names. If "React" is mentioned in an observation about "Vite", create a `related_to` relationship.
   - Query: `SELECT id, name FROM entities` — cached in a module-level `Map<string, string[]>` (name→ids). Invalidated on every entity INSERT by incrementing a generation counter; `discoverRelationships()` checks the counter and rebuilds if stale. Entity names shorter than 3 characters are excluded from scanning to avoid false positives.
   - Match: case-insensitive match using `new RegExp('\\b' + escapeRegex(name) + '\\b', 'i')`. For names with special characters (hyphens, dots like "Node.js" or "better-sqlite3"), `escapeRegex()` escapes regex metacharacters so the match works correctly.
   - Relationship type: `related_to` with confidence 0.7

2. **Semantic similarity** — Embed the new observation via Ollama, then KNN search existing observations (k=5, threshold < 0.25 cosine distance). For each match on a *different* entity, create a `semantically_related` relationship.
   - Only create if entities don't already have a relationship
   - Relationship confidence: `1.0 - distance` (closer = more confident)
   - Cap at 3 new relationships per `remember()` call to avoid noise

**Implementation:**
- New function: `discoverRelationships(db, entityId, content, embedding)` in a new file `packages/mcp-server/src/relationship-discovery.ts`
- Called at the end of `rememberEntity()` after the observation is stored
- Wraps relationship creation in try/catch — failures don't block the `remember()` call
- All auto-discovered relationships use `source_type: 'auto_discovery'`
- The semantic similarity KNN query reuses the embedding already computed for the observation (passed as parameter) — no additional Ollama call. The KNN query against sqlite-vec is fast (sub-millisecond for <100k vectors) so no async deferral needed.

**Schema change:** Add `'auto_discovery'` to the `SourceType` union in `packages/core/src/types.ts`.

### 1B. Back-Linking on Entity Creation

**File:** `packages/mcp-server/src/relationship-discovery.ts`

When a *new* entity is created (not an upsert), search existing observations for mentions of the new entity's name using the FTS5 index.

- Query: `SELECT o.entity_id, o.id FROM fts_observations fts JOIN observations o ON o.id = fts.observation_id WHERE fts_observations MATCH ? LIMIT 100` — uses the existing FTS5 index instead of scanning all observations in memory.
- For each match on a *different* entity, create a `related_to` relationship from the mentioning entity to the new entity.
- Relationship confidence: 0.6, source_type: `'auto_discovery'`
- Deduplicate: only one relationship per entity pair (skip if relationship already exists)

This fires only on entity creation (the `!existingEntity` branch in `rememberEntity()`), so it's a one-time cost.

### 1C. Semantic Clustering During Consolidation

**File:** `packages/mcp-server/src/consolidator.ts`

After the main consolidation loop completes, run a clustering pass:

1. For each entity that was touched in this consolidation run (either created or had observations added):
   - Get all observation embeddings for this entity from `vec_embeddings`, compute an average vector as the entity-level representation
   - KNN search this average vector against all other entity average vectors (k=10)
   - For entities within cosine distance < 0.2 that don't already have a relationship, create a `cluster_related` relationship
   - Note: entity-level averaging is computed on-the-fly from observation embeddings — no new storage needed

2. **Entity summary generation** — For entities with 5+ observations that don't already have a summary, generate one using the consolidation LLM:
   - Prompt: "Summarize these observations about {entity_name} in 1-2 sentences"
   - Store in `entities.summary` column (currently NULL for all entities)
   - Batch summaries: collect all eligible entities and generate summaries in a single LLM call with all entities listed (reduces overhead from N calls to 1)
   - This summary improves recall quality and entity panel display

**New function:** `clusterAndSummarize(db, touchedEntityIds)` called after `runConsolidation()`. Limited to entities touched in this run (not all entities), keeping the cost proportional to the consolidation batch size.

### 1D. Relationship Type Taxonomy

Currently, relationship types are freeform strings. Standardize with a recommended taxonomy while keeping the schema open:

```typescript
const RELATIONSHIP_TYPES = {
  // Explicit (agent or LLM provided)
  'uses': 'A uses B',
  'depends_on': 'A depends on B',
  'is_part_of': 'A is part of B',
  'created_by': 'A was created by B',
  'related_to': 'A is related to B',
  // Auto-discovered
  'semantically_related': 'A and B have similar observations',
  'cluster_related': 'A and B cluster together semantically',
} as const;
```

This is advisory, not enforced — the schema still accepts any string.

### 1E. Enriched Graph API

**File:** `packages/api-server/src/routes/graph.ts`

Current API returns minimal data. Enrich for the new graph features:

```typescript
// GET /api/graph
{
  nodes: Array<{
    id: string
    name: string
    type: string
    val: number          // observation count (exists)
    confidence: number   // entity confidence (exists but not sent)
    summary: string | null  // entity summary (NEW)
    created_at: string   // for timeline feature (NEW)
  }>
  links: Array<{
    source: string
    target: string
    type: string         // relationship type (exists)
    confidence: number   // relationship confidence (NEW)
    source_type: string  // how it was created (NEW)
    created_at: string   // for timeline filtering (NEW)
  }>
}
```

### 1F. Dashboard Stats API Enrichment

**File:** `packages/api-server/src/routes/dashboard.ts`

Add richer stats for the command-center dashboard:

```typescript
// GET /api/dashboard
{
  pending: number           // exists
  entities: number          // exists
  relationships: number     // NEW
  observations: number      // NEW
  recentEpisodes: [...]     // exists
  topConnected: Array<{     // NEW — top 5 most-connected entities
    id: string
    name: string
    type: string
    connection_count: number
  }>
  typeBreakdown: Array<{    // NEW — entity count by type
    type: string
    count: number
  }>
  growthStats: {             // NEW
    entitiesLast7d: number
    observationsLast7d: number
    relationshipsLast7d: number
  }
}
```

---

## Step 2: Mycelium Graph Visualization

### 2A. Bioluminescent Node Rendering

**File:** `packages/dashboard/src/components/graph-view.tsx`

Replace the current flat circle rendering with glowing mycelium nodes:

**Node rendering (Canvas):**
- **Outer glow:** Radial gradient from type color at center to transparent, radius = `nodeSize * 3`
- **Core circle:** Solid fill with type color, radius = `nodeSize`
- **Inner highlight:** Slightly lighter center dot for depth, radius = `nodeSize * 0.4`
- **Size:** `Math.sqrt(val) * 2.5` (slightly larger than current)
- **Labels:** Always visible for nodes within viewport (remove the `globalScale > 1.5` gate). Font: 10px, color matches node type color at 80% opacity. White text shadow for readability.

**Color palette update** (bioluminescent):
```typescript
const TYPE_COLORS: Record<string, string> = {
  person:     '#06ffc8',  // bioluminescent teal
  agent:      '#06ffc8',
  project:    '#a78bfa',  // soft violet
  codebase:   '#a78bfa',
  concept:    '#fbbf24',  // warm amber
  topic:      '#fbbf24',
  tool:       '#34d399',  // emerald glow
  library:    '#34d399',
  technology: '#60a5fa',  // electric blue
  decision:   '#f472b6',  // pink
}
const DEFAULT_COLOR = '#818cf8'  // indigo glow
```

**Link rendering:**
- Color: type-color of the source node at 30% opacity
- Width: `1 + (link.confidence * 2)` — higher confidence = thicker line
- Auto-discovered links (`source_type: 'auto_discovery'`): dashed pattern
- Curvature: slight curve (`linkCurvature={0.15}`) to distinguish overlapping links

**Background:** `#050510` (near-black with subtle blue tint, darker than current `#0f172a`)

### 2B. Hover Illumination

When hovering a node:
1. **Brighten** the hovered node's glow (increase outer radius to `nodeSize * 5`)
2. **Brighten** all directly connected nodes and links
3. **Dim** everything else to 15% opacity
4. **Show relationship labels** on illuminated links (rendered as text along link midpoint)

Implementation: Track `hoveredNodeId` state. In `nodeCanvasObject`, check if the node is hovered or a neighbor of the hovered node. Use `onNodeHover` callback.

### 2C. Relationship Labels on Links

**On hover illumination:** Show relationship type text at link midpoint.
- Font: 9px, same color as link but at 90% opacity
- Background: dark semi-transparent pill behind text for readability
- Only for links connected to the hovered node (not all links — too noisy)

**Always visible:** When zoomed in past `globalScale > 2.5`, show labels on all visible links.

### 2D. Click to Expand Rich Detail Panel

The existing entity panel gets upgraded (see Step 4's entity panel section for details). The graph interaction stays the same: click → panel opens.

### 2E. Path Tracing Mode

New interaction mode activated by a toolbar button:

1. User clicks "Path Trace" button in graph toolbar
2. First node click selects source (highlighted ring)
3. Second node click selects target (highlighted ring)
4. BFS shortest path computed client-side on the graph data
5. Path highlighted with animated pulse along the links
6. Info bar shows: "{source} → {intermediary} → ... → {target}" with relationship types
7. Click anywhere else or press Escape to exit path mode

**Implementation:**
- State: `pathMode: boolean`, `pathSource: string | null`, `pathTarget: string | null`
- BFS in `useMemo` on filtered graph data. Note: `react-force-graph-2d` mutates link `source`/`target` from string IDs to object references after init. BFS must handle both: `typeof link.source === 'string' ? link.source : (link.source as any).id`
- Animated highlight: `requestAnimationFrame` loop drawing pulse particles along path links
- New toolbar component alongside search/filter controls

### 2F. Cluster Grouping (Visual Hulls)

Draw soft, translucent background regions behind clusters of tightly-connected nodes:

1. After graph layout stabilizes, identify clusters using the `cluster_related` relationships
2. For each cluster, compute convex hull of member node positions
3. Draw filled region with cluster color at 8% opacity, border at 20% opacity
4. Smooth the hull edges with bezier curves

**Implementation:**
- Compute clusters from link data (group nodes connected by `cluster_related` links)
- Draw hulls in `onRenderFramePre` callback (renders before nodes/links)
- Recompute hull positions only after 1 second of user idle (no drag/zoom) to avoid visual lag during interaction. Cache hull paths and redraw from cache during active interaction.

### 2G. Timeline Slider

A slider at the bottom of the graph view that filters nodes/links by creation date:

1. Range: earliest `created_at` to now
2. Dragging the slider shows only nodes/links created before that date
3. As you drag forward, new nodes "appear" with a brief glow animation
4. Play button auto-advances the slider to show growth over time
5. Speed control: 1x, 2x, 5x

**Implementation:**
- Filter `decoratedNodes` and `filteredLinks` by `created_at <= sliderDate`
- Slider component below the graph canvas
- Play: `setInterval` advancing the date by 1 day per tick (adjusted by speed)
- New nodes get a brief "bloom" animation (enlarged glow for 500ms)

---

## Step 3: Theme Overhaul

### 3A. Global Color Palette

Carry the mycelium aesthetic across the entire app. Update `app.css` and all components:

**CSS custom properties:**
```css
:root {
  --bg-void: #050510;        /* deepest background */
  --bg-surface: #0a0a1f;     /* cards, panels */
  --bg-elevated: #111133;    /* hover states, active items */
  --border-subtle: #1a1a3a;  /* borders */
  --border-glow: #2a2a5a;    /* active borders */

  --text-primary: #e8e8f0;   /* primary text */
  --text-secondary: #8888aa; /* secondary text */
  --text-muted: #555577;     /* muted text */

  --glow-teal: #06ffc8;      /* primary accent */
  --glow-violet: #a78bfa;    /* secondary accent */
  --glow-amber: #fbbf24;     /* warning/pending */
  --glow-emerald: #34d399;   /* success/approve */
  --glow-rose: #f472b6;      /* error/reject */
}
```

### 3B. Sidebar Redesign

- Background: `--bg-surface` with subtle border glow
- Logo: "Myco" with teal glow text effect (`text-shadow: 0 0 20px var(--glow-teal)`)
- Active nav item: left border with glow + background highlight
- Nav icons: type-colored glow on active state
- Version badge: teal dim text

### 3C. Card & Surface Styling

- Cards: `--bg-surface` with `--border-subtle` border
- Hover: border transitions to `--border-glow`
- Shadows: replace box-shadow with subtle glow (`box-shadow: 0 0 20px rgba(6, 255, 200, 0.05)`)
- Badges: semi-transparent backgrounds with glow text

### 3D. Typography

Keep the system font stack but adjust:
- Headings: slightly lighter weight, add subtle letter-spacing
- Monospace elements: use a dedicated mono font for IDs, dates
- Body: increase line-height slightly to 1.6 for readability

---

## Step 4: Dashboard Enrichment

### 4A. Stat Cards Upgrade

Replace the basic number cards with richer metric tiles:

- **Entities**: Count + sparkline showing 7-day growth + type breakdown mini bar chart
- **Observations**: Total count + recent additions count
- **Relationships**: Total count + "web density" metric (relationships / entities ratio)
- **Pending Approvals**: Count with amber glow pulse animation if > 0

Each card uses the mycelium color palette with subtle glow accents.

### 4B. Mini Knowledge Graph

A small (300x200) force-directed graph preview on the dashboard home page:

- Shows the 20 most-connected entities
- Same mycelium rendering but simplified (no labels, smaller nodes)
- Gently animated (slow force simulation, never stops)
- Click to navigate to full graph view
- Positioned in the stats area or as a hero element

**Implementation:** Reuse `GraphView` component with a `mini` prop that disables search/filter controls, limits node count, and adjusts sizing.

### 4C. Activity Feed Upgrade

Currently shows `event_type` badges and timestamps. Upgrade to:

- **Richer episode cards**: Show a summary of what was learned (parse payload for meaningful display)
- **Knowledge delta indicator**: "3 entities created, 5 observations added, 2 relationships discovered"
- **Expandable detail**: Click to see full payload
- **Filter bar**: By agent_id, event_type, date range
- **Grouping**: Group by session (collapsible session headers)

### 4D. Approval Queue Polish

**Contradiction visualization:**
- Side-by-side display: existing observation (left) vs proposed observation (right)
- Color-coded diff highlighting what's different
- Confidence bars comparing the two

**Merge preview:**
- Before/after graph snippet showing which nodes will merge
- List of observations that will be combined
- "Preview merge" button shows the result before committing

**Batch actions:**
- Select multiple items with checkboxes
- "Approve All Selected" / "Reject All Selected" buttons
- Keyboard shortcuts: `a` to approve, `r` to reject, `j/k` to navigate

### 4E. Entity Detail Panel Upgrade

Enrich the slide-out panel (triggered by graph node click):

- **Summary section**: Show entity summary (from Step 1C) at the top
- **Observations timeline**: Show observations chronologically with source badges
- **Relationship graph mini-view**: Small force-directed graph showing just this entity and its direct connections
- **Provenance info**: Who created this entity, when, confidence history
- **Related observations**: Semantically similar observations from other entities
- **Edit capabilities**: Deferred to a future release. Requires new PATCH/DELETE API endpoints on the entities router which are out of scope for this upgrade.

---

## Step 5: Advanced Graph Features

### 5A. Graph Toolbar

A floating toolbar in the graph view with mode buttons:

- **Default mode**: Pan/zoom/click
- **Path trace mode**: Click two nodes to find shortest path
- **Filter mode**: Active search + type filter (moved from absolute positioning)
- **Cluster toggle**: Show/hide cluster hulls
- **Timeline toggle**: Show/hide timeline slider
- **Fullscreen toggle**: Expand graph to full viewport

### 5B. Legend

A collapsible legend showing:
- Entity type → color mapping
- Relationship line styles (solid = explicit, dashed = auto-discovered)
- Node size meaning (observation count)
- Confidence indicator

---

## File Change Summary

### New Files
- `packages/mcp-server/src/relationship-discovery.ts` — Auto-relationship algorithms
- `packages/dashboard/src/components/graph-toolbar.tsx` — Graph mode controls
- `packages/dashboard/src/components/graph-legend.tsx` — Color/type legend
- `packages/dashboard/src/components/timeline-slider.tsx` — Time scrubber
- `packages/dashboard/src/components/mini-graph.tsx` — Dashboard preview graph
- `packages/dashboard/src/components/stat-card-rich.tsx` — Enhanced stat cards

### Modified Files
- `packages/core/src/types.ts` — Add `'auto_discovery'` to SourceType
- `packages/mcp-server/src/tools.ts` — Call `discoverRelationships()` in `rememberEntity()`
- `packages/mcp-server/src/consolidator.ts` — Add `clusterAndSummarize()` post-consolidation
- `packages/api-server/src/routes/graph.ts` — Enrich node/link data
- `packages/api-server/src/routes/dashboard.ts` — Add stats endpoints
- `packages/dashboard/src/components/graph-view.tsx` — Mycelium rendering, hover, interactions
- `packages/dashboard/src/components/entity-panel.tsx` — Rich detail panel
- `packages/dashboard/src/components/sidebar.tsx` — Theme update
- `packages/dashboard/src/routes/index.tsx` — Dashboard enrichment
- `packages/dashboard/src/routes/graph.tsx` — Toolbar, timeline, path mode
- `packages/dashboard/src/routes/approvals.tsx` — Batch actions, better cards
- `packages/dashboard/src/app.css` — Mycelium theme variables
- `packages/dashboard/src/lib/api.ts` — Updated types for enriched API

### Type Changes (No DB Schema Changes)
The `SourceType` TypeScript union in `packages/core/src/types.ts` must be updated to include `'auto_discovery'`. The database `source_type` column is freeform TEXT so no DDL migration is needed. All new relationship data fits the existing `relationships` table. Entity summaries use the existing `summary` column (currently NULL).
