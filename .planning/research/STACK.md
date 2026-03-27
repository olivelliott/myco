# Technology Stack — v4.0 Dashboard & Graph Experience

**Project:** Myco
**Milestone:** v4.0 — Bioluminescent Dashboard & Interactive Knowledge Graph
**Researched:** 2026-03-27
**Overall confidence:** HIGH (most findings verified via npm, official docs, and shadcn docs)

---

## Context: What's Already Validated

The following stack is in production in `packages/dashboard` — do NOT re-research or change:

| Technology | Version (installed) | Role |
|------------|--------------------|----|
| React | 19.2.0 | UI framework |
| Vite | 8.0.x | Build tool |
| Tailwind CSS | 4.2.x | Styling |
| shadcn/ui | latest (copy-paste) | Component primitives |
| TanStack Query | 5.91.2 | Server state |
| TanStack Router | 1.168.0 | Client-side routing |
| react-force-graph-2d | 1.29.0 | Force-directed graph canvas |
| date-fns | 3.6.0 | Date formatting |
| Hono | 4.x (api-server) | REST API |

This research covers **only what must be added** for v4.0 new capabilities.

---

## New Capability: Knowledge Growth Charts

### Recommendation: shadcn/ui Chart (Recharts) — already in shadcn ecosystem

**Add:** No new npm install required if using shadcn chart component via `npx shadcn add chart`.

**Rationale:**
- shadcn/ui ships a `Chart` component that wraps Recharts. It uses CSS variables for theming: all 53 built-in chart variants automatically adapt to dark mode via `--chart-1` through `--chart-5` variables. This eliminates a custom dark theme integration problem entirely.
- The knowledge growth use case (entities/observations/relationships over time) involves fewer than ~365 data points per series — well within SVG rendering comfort zone. Recharts SVG rendering is visually superior to canvas-based alternatives for low-density time series.
- Recharts is already the dependency behind shadcn charts; adding the `chart` component adds 0 new npm dependencies beyond what shadcn pulls in.
- Area charts with `type="monotone"` and gradient fills achieve the bioluminescent glow aesthetic with pure CSS, matching the design direction.

**Version:** Recharts 3.8.1 (pulled transitively by shadcn chart; latest as of March 2026)

**React 19 caveat:** Recharts 3.x resolved the React 19 peer dependency issue. Earlier 2.x versions required a `react-is` override. With 3.x this is no longer necessary. Verified: recharts 3.7.0 released January 21, 2026 with active maintenance.

**Bundle impact:** Recharts is ~40KB gzipped. Since it's a direct shadcn dependency, it co-locates with already-present Radix primitives — no additional bundle surprise.

**Installation:**
```bash
# In packages/dashboard
npx shadcn add chart
# Installs chart component files + recharts as a dep
```

**What NOT to use:**
- `chart.js` / `react-chartjs-2` — Canvas-based, no native SVG. Harder to theme with CSS variables. Unnecessary for < 1000 data points.
- `visx` — Low-level D3 primitives. More code, steeper curve, no pre-built dark mode. Only warranted if custom physics animations are needed in the chart.
- `nivo` — Good dark mode, but large bundle (~120KB gzipped), adds a separate theming system that conflicts with shadcn/Tailwind v4 CSS variables.
- `unovis` — Dark mode via CSS variables is a strength, but it's a full visualization system and an unnecessary scope increase when shadcn chart already provides what's needed.

---

## New Capability: Cluster Detection (Community Detection)

### Recommendation: graphology + graphology-communities-louvain

**Add:**
```bash
npm install graphology graphology-communities-louvain
```

**Rationale:**
- `graphology` (v0.26.0) is a robust, TypeScript-native graph data structure library with a rich standard library. It is not a visualization library — it is used purely for algorithms that operate on graph topology.
- `graphology-communities-louvain` (v2.0.2) implements the Louvain modularity-maximization algorithm. It takes a graphology `Graph` instance and returns a partition map `{ [nodeId]: communityId }`. This is exactly what's needed: run it on the knowledge graph data, get cluster assignments, then pass those assignments as node attributes to `react-force-graph-2d`.
- The Louvain algorithm is O(n log n) in practice. For a knowledge graph with < 10,000 entities, it runs in milliseconds in the main thread. No web worker needed.
- graphology's `graphology-library` is modular — install only what you need. The core `graphology` package is ~2.7MB installed on disk but tree-shakes significantly; the actual graph data structure adds ~15-20KB gzipped to the bundle.
- Verified active: `graphology-communities-louvain` v2.0.2 published ~9 months ago; the graphology ecosystem is stable with no deprecation signals.

**Integration pattern with react-force-graph-2d:**
```typescript
import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

// Build graphology graph from API data
const g = new Graph();
nodes.forEach(n => g.addNode(n.id));
edges.forEach(e => g.addEdge(e.source, e.target));

// Detect communities — returns { nodeId: communityId }
const communities = louvain(g);

// Pass community as color group to react-force-graph-2d
const coloredNodes = nodes.map(n => ({
  ...n,
  community: communities[n.id],
}));
```

**Cluster boundary rendering:** Use `d3-polygon` (v3.0.1) for convex hull computation around cluster members. `react-force-graph-2d` exposes an `onRenderFramePre` callback that receives the canvas 2D context — draw filled/stroked hull polygons behind nodes on each frame.

```bash
npm install d3-polygon
# Types included in @types/d3-polygon if needed
```

`d3-polygon` is tiny: ~3KB gzipped, 2.6M weekly downloads, part of the d3 family already likely partially present via react-force-graph-2d's transitive deps.

**What NOT to use:**
- `jLouvain` / `js-louvain` — Older, unmaintained forks. No TypeScript types. Graphology's implementation is better maintained and integrates with the broader graphology ecosystem.
- Sigma.js — Full graph rendering library that competes with react-force-graph-2d. Using both would be redundant. Sigma is paired with graphology for sigma-specific projects; here graphology is used only for algorithms.
- A custom Louvain implementation — The algorithm has subtleties (resolution parameter tuning, randomness seeds). Use the library.

---

## New Capability: Particle & Glow Effects (Bioluminescent Theme)

### Recommendation: CSS + Canvas API (no new library)

**Add:** Nothing. Native browser capabilities are sufficient.

**Rationale:**

**For glow effects on graph nodes:** `react-force-graph-2d` exposes `nodeCanvasObject(node, ctx, globalScale)` — a per-node custom drawing callback called every animation frame. The Canvas 2D API's `ctx.shadowBlur` and `ctx.shadowColor` produce hardware-accelerated glow. No library needed:

```typescript
nodeCanvasObject={(node, ctx) => {
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#00ffcc';
  ctx.beginPath();
  ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#00ffcc';
  ctx.fill();
  ctx.shadowBlur = 0; // reset to avoid bleed
}}
```

**For CSS glow on UI elements:** Tailwind v4 supports arbitrary values and CSS custom properties. A bioluminescent glow is achievable with `box-shadow` and `drop-shadow` utilities. Define theme tokens in the Tailwind CSS config:

```css
/* In app.css global layer */
:root {
  --glow-teal: 0 0 12px #00ffcc, 0 0 24px rgba(0, 255, 204, 0.3);
  --glow-blue: 0 0 12px #0080ff, 0 0 24px rgba(0, 128, 255, 0.3);
}
```

**For animated particle backgrounds:** Pure CSS `@keyframes` with multiple pseudo-element layers (2-3 layers) is sufficient for subtle ambient particles. Avoid heavy particle libraries for a background effect.

**What NOT to use:**
- `tsParticles` / `@tsparticles/react` — 200KB+ gzipped. Built for full-screen particle fields (confetti, fireworks). Extreme overkill for ambient background texture on a data dashboard. The performance cost conflicts with the canvas-heavy graph rendering already on screen.
- `sparticles` — Similar overkill issue. Canvas particle loop competes with react-force-graph-2d's render loop.
- Any Three.js / WebGL solution — Wrong abstraction level for a 2D dashboard.

**Motion animation for UI transitions:** Use `motion` (formerly framer-motion) v12.x with `LazyMotion` to keep bundle impact minimal.

```bash
npm install motion
```

Import from `motion/react` (not `framer-motion`). Use `LazyMotion` + `domAnimation` feature bundle (~15KB gzipped) rather than the full `motion` component (34KB). This handles:
- Confidence bar fill animations (animate on mount/value change)
- Approval card stagger enter/exit animations
- Panel slide transitions

**Bundle:** With `LazyMotion + domAnimation`: ~15KB gzipped. Full `motion` component: ~34KB. Use `LazyMotion` wrapper at app root.

**React 19 compatibility:** Confirmed — Motion v12 fully supports React 19 and is compatible with the React Compiler. Import: `import { motion, LazyMotion, domAnimation } from 'motion/react'`.

**What NOT to use:**
- `react-spring` — Different API paradigm, less ergonomic for the stagger/entrance patterns needed. Motion's `AnimatePresence` is better for approval queue item removal.
- `anime.js` / `gsap` — Imperative APIs that work against React's declarative model. Fine for non-React contexts.

---

## New Capability: Enhanced Graph Interactions

### Recommendation: Extend existing react-force-graph-2d — no new library

**Timeline scrub / animated playback:** Pure state + `requestAnimationFrame` via React's `useRef`. Filter graph data by a timestamp threshold, advance threshold on each frame. No animation library needed at the data level — Motion handles the scrubber UI chrome.

**Neighborhood explorer:** `graphology` (already added for community detection) provides `neighbors()` traversal. Build subgraph by BFS from selected node, filter `react-force-graph-2d` data prop to that subgraph.

**Search with auto-zoom:** `react-force-graph-2d` exposes a `centerAt(x, y, duration)` method via `useRef` on the component. Combine with the existing node filter to highlight + zoom.

**Stable hover physics:** Set `d3Force('charge').strength(-30)` and freeze hovered node position by temporarily setting `node.fx = node.x; node.fy = node.y` on hover. Release on mouseout. No library needed.

---

## Complete Additions Summary

| Library | Version | Purpose | Install |
|---------|---------|---------|---------|
| shadcn chart | (via CLI) | Knowledge growth charts, wraps Recharts | `npx shadcn add chart` |
| recharts | 3.8.1 | Pulled by shadcn chart component | Automatic with above |
| graphology | 0.26.0 | Graph data structure for cluster algorithms | `npm install graphology` |
| graphology-communities-louvain | 2.0.2 | Louvain community detection | `npm install graphology-communities-louvain` |
| d3-polygon | 3.0.1 | Convex hull for cluster boundary rendering | `npm install d3-polygon` |
| motion | 12.x | UI transition animations (confidence bars, cards) | `npm install motion` |

**Total new bundle impact (gzipped estimate):**
- recharts: ~40KB (via shadcn chart, most tree-shakable)
- graphology: ~15-20KB (tree-shaken, data structure only)
- graphology-communities-louvain: ~8KB
- d3-polygon: ~3KB
- motion (LazyMotion/domAnimation): ~15KB

**Estimated total new payload: ~81-86KB gzipped**

---

## What NOT to Add

| Library | Why Not | What to Use Instead |
|---------|---------|-------------------|
| `tsParticles` / `@tsparticles/react` | 200KB+ for ambient particles; competes with graph canvas render loop | CSS `@keyframes` + `box-shadow` glow |
| `nivo` | ~120KB gzipped, separate theming system clashes with Tailwind v4 CSS vars | shadcn chart (Recharts) |
| `chart.js` / `react-chartjs-2` | Canvas-only, no CSS variable theming, harder dark mode | shadcn chart (Recharts SVG) |
| `visx` | Low-level primitives, too much custom code for standard time series | shadcn chart (Recharts) |
| `sigma.js` | Full competing graph renderer, redundant with react-force-graph-2d | graphology (algorithms only) |
| `jLouvain` / `js-louvain` | Unmaintained, no TypeScript, multiple unmaintained forks | graphology-communities-louvain |
| `Three.js` / `@react-three/fiber` | Wrong level of abstraction; 3D for a 2D dashboard | Canvas 2D API via nodeCanvasObject |
| `react-spring` | Less ergonomic for AnimatePresence exit animations on approval queue | motion (motion/react) |
| Full `motion` component (no LazyMotion) | 34KB vs 15KB with LazyMotion; no reason for the full bundle | `LazyMotion` + `domAnimation` |
| `graphology-library` (full bundle) | Installs all graphology packages; only need core + louvain | Targeted installs |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|----------------|-------|
| recharts 3.8.1 | React 19 | React 19 support resolved in 3.x; no react-is override needed |
| graphology 0.26.0 | Node.js 18+, any modern bundler | TypeScript types included |
| graphology-communities-louvain 2.0.2 | graphology 0.x | Peer dep: `graphology` |
| d3-polygon 3.0.1 | ES modules, any bundler | Ships ESM + CJS |
| motion 12.x | React 18+, React 19 fully supported | Import from `motion/react` not `framer-motion` |
| shadcn chart | Recharts 3.x, Tailwind v4, React 19 | Uses CSS vars, auto dark mode |

---

## Sources

- npm: recharts — v3.8.1 confirmed, last published 2 days ago (2026-03-25 area)
- GitHub issue: recharts/recharts #4558 — React 19 support in peerDependencies
- shadcn/ui docs: https://ui.shadcn.com/docs/components/radix/chart — CSS variables, dark mode, 53 chart variants
- npm: graphology — v0.26.0, MIT license
- npm: graphology-communities-louvain — v2.0.2, last published ~9 months ago (MEDIUM confidence on "actively maintained" — but the Louvain algorithm doesn't require ongoing updates)
- motion.dev docs: https://motion.dev/docs/react-reduce-bundle-size — LazyMotion bundle sizes confirmed
- npm: motion — v12.9.1 confirmed (November 2025)
- GitHub: vasturiano/react-force-graph — nodeCanvasObject API confirmed, `ctx.shadowBlur` glow pattern validated
- d3/d3-polygon — v3.0.1, 2.6M weekly downloads, convex hull via `polygonHull()`
- WebSearch: Vite 8 / React 19 ecosystem compatibility — all additions verified compatible
