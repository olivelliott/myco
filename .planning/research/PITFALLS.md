# Domain Pitfalls

**Domain:** Interactive knowledge graph dashboard — animated timeline, cluster visualization, particle effects, bioluminescent theme
**Project:** Myco v4.0 Dashboard & Graph Experience
**Researched:** 2026-03-27
**Scope:** Adding these features to an existing react-force-graph-2d + React 19 + canvas system

---

## Critical Pitfalls

Mistakes that cause rewrites, broken interactions, or complete simulation collapse.

---

### Pitfall 1: graphData Reference Identity — The Silent Reheat Trap

**What goes wrong:** Every time React re-renders and passes a new object reference for `graphData` (even with identical content), react-force-graph-2d resets the simulation from scratch. Layout positions are lost, nodes fly back to origin, and the simulation re-heats with full energy. This is the most common cause of "nodes fly away" reports.

**Why it happens:** The library compares `graphData` by reference, not by value. Any upstream `useMemo` that has a dependency that changes frequently (like the full `data` object from TanStack Query) will produce a new reference on every render. The current code has `filteredData` depending on `data`, `timelineEnabled`, and `timelineDate` — any one of these changing recreates the object.

**Consequences:** Nodes leap to new positions mid-interaction. User-pinned nodes (`fx`/`fy`) are cleared. The stabilized layout is lost every time the timeline slider moves.

**Prevention:**
- Memoize `graphData` so that `nodes` and `links` array references only change when the actual set of node/link IDs changes — not when visual properties change.
- For timeline playback, do NOT filter nodes out of `graphData`. Instead, pass all nodes and control their `opacity` or `color` via `nodeCanvasObject` based on a `timelineCutoff` ref. This keeps the graph structure stable while only changing how nodes are painted.
- Separate structural changes (add/remove nodes) from visual changes (opacity, color, size). Structural changes are the only ones that should trigger a new `graphData` reference.
- Use `useRef` for display-only state that the canvas painter reads. This avoids triggering React re-renders at all.

**Detection:** Add a `console.count('graphData changed')` in the memoization chain. If it fires faster than once per second during timeline playback, you have a reference leak.

**Current code risk (HIGH):** `filteredData` in `graph.tsx` creates a new `{ nodes, links }` object on every `timelineDate` change. During timeline playback at the current 100ms interval, this fires 10 times per second, reheating the simulation continuously.

---

### Pitfall 2: Timeline Playback — setInterval Fights requestAnimationFrame

**What goes wrong:** The current `TimelineSlider` uses `setInterval(..., 100)` to advance the timeline date. Each interval fires a React state update, which causes a re-render, which produces a new `graphData` reference, which reheats the force simulation. At 10 updates/second, the simulation never settles. The graph looks like a vibrating mess rather than a smooth playback.

**Why it happens:** `setInterval` and the canvas render loop are unsynchronized. The canvas runs at 60fps via `requestAnimationFrame`. Injecting 10 React state changes per second into that loop causes cascading re-renders that fight the animation frame pipeline.

**Consequences:** Choppy, janky playback. Nodes perpetually drift because the simulation never cools. CPU spikes during playback. On slower machines (or mobile), the browser drops frames or freezes briefly on each interval tick.

**Prevention:**
- Drive timeline playback through a `requestAnimationFrame` loop rather than `setInterval`.
- Store the current cutoff timestamp in a `useRef` (not `useState`). The canvas `nodeCanvasObject` painter reads the ref directly — no React re-renders occur during auto-play.
- Only update React state (which triggers re-renders) when the user manually scrubs the slider, not during auto-play.
- When auto-play reaches the end, transition back to React state for the final date to sync the slider UI.
- Alternative lower-effort fix: keep `setInterval` but throttle it to once per second (1x speed = 1 day/second rather than 1 day/100ms), reducing reheat frequency to tolerable levels.

**Detection:** Profile with React DevTools. If the component re-renders more than 5 times per second during playback, the pattern is wrong.

---

### Pitfall 3: Cluster Visualization — Drawing on the Wrong Canvas Layer

**What goes wrong:** Cluster convex hulls and boundary overlays are added as DOM elements (SVG/div) positioned absolutely over the canvas. This creates a layering mismatch: DOM elements sit above the canvas and capture pointer events, blocking node hover and click detection. Alternatively, cluster boundaries are drawn inside `nodeCanvasObject` per-node, which means each node redraws its cluster's outline — causing O(n) overdraw for each cluster.

**Why it happens:** react-force-graph-2d renders entirely on a single HTML canvas. There is no built-in second layer API. Developers add DOM overlays for convenience, not realizing the pointer event consequences. The `nodePointerAreaPaint` callback renders to a separate off-screen canvas used only for hit detection — it does not accept z-index or pointer-event overrides.

**Consequences:** Clicking within a cluster boundary (on the DOM overlay) does not reach the canvas hit test. Nodes become unclickable inside cluster regions. Alternatively, SVG overlays flicker as they chase node positions on each tick.

**Prevention:**
- Draw cluster hulls via the `onRenderFramePost` prop (fires after all nodes and links are drawn, on the same canvas). This keeps everything on one layer and avoids all pointer-event conflicts.
- If you must use DOM overlays for cluster labels, set `pointer-events: none` on the overlay container so clicks pass through to the canvas.
- Cluster label DOM elements should be absolutely positioned inside the same container as the canvas, reading node x/y positions from a ref updated inside `onRenderFramePost`.
- Never draw cluster geometry inside `nodeCanvasObject` — each node call only draws that node; there is no "draw once for cluster" hook inside node painters.

**Detection:** If you add a `<div>` or `<svg>` as a sibling/child of `ForceGraph2D` without `pointer-events: none`, node clicks in that region will be silently swallowed.

---

### Pitfall 4: Particle Effects — React State and requestAnimationFrame Are Incompatible

**What goes wrong:** When implementing particle/glow trail effects that animate around moving nodes, particle positions are stored in React state and updated via `setState` inside an animation loop. Each state update triggers a React render, which triggers another animation frame, causing a feedback loop. Frame rate collapses to single digits.

**Why it happens:** Particle systems require mutable per-frame state. React state is designed for immutable, render-triggering updates. The two patterns are fundamentally incompatible unless isolated deliberately from the render cycle.

**Consequences:** 60fps animation becomes 5fps when particles are active. React DevTools shows hundreds of renders per second. Memory climbs as old particle objects accumulate faster than GC can collect them.

**Prevention:**
- Store all particle state in `useRef`, never in `useState`. Particle position arrays, velocity arrays, and lifetime counters must live outside React's render cycle.
- Run particle physics inside `onRenderFramePost`: read node positions from graph data, advance particle state, draw to canvas — all in one pass, zero React involvement.
- Clean up dead particles within the canvas callback itself (filter the array in place) rather than triggering a state update to signal their removal.
- Cap particle count per node (max 8-12 particles). Unbounded emission at 60fps with 100 nodes = 6,000+ new objects per second.

---

## Moderate Pitfalls

---

### Pitfall 5: Performance Cliff at ~500 Nodes with Custom Canvas Painters

**What goes wrong:** react-force-graph-2d performs acceptably to ~300-500 nodes with the current custom `nodeCanvasObject`. Beyond that, the per-frame cost of drawing radial gradients, specular highlights, and text pills for every visible node drops frame rate below 30fps.

**Why it happens:** The current node painter draws: 2 radial gradients, 3 arc paths, 1 `measureText` call, 1 `roundRect` fill, 1 `fillText`, and conditionally 2-4 stroke rings. That is 10-12 canvas operations per node per frame. At 500 nodes and 60fps = 300,000-360,000 canvas operations per second.

**Specific performance thresholds (based on library issues #202, #223 and canvas benchmarks):**
- < 200 nodes: Full custom painters at 60fps, no issues
- 200-500 nodes: Acceptable (30-60fps) with current painter complexity
- 500-1,500 nodes: Noticeable frame drops; implement Level of Detail (LOD)
- 1,500+ nodes: Cluster/collapse node groups before rendering; full detail is not viable
- 5,000+ nodes: Library itself struggles regardless of painter complexity

**Prevention:**
- Implement Level of Detail (LOD): when `globalScale < 0.5` (zoomed out far), draw a simple colored circle only — skip gradients, labels, and glow. The user cannot see the detail at that zoom level.
- Disable pointer tracking (`enablePointerInteraction={false}`) for mini/preview instances — this eliminates the internal hit-test canvas repaint entirely.
- For the neighborhood explorer, filter to a subgraph of max 50-100 nodes before rendering the isolated view.
- Pre-compute all `hexToRgba` strings at data decoration time (in `decoratedNodes` useMemo) and store them on the node object. The current implementation calls `hexToRgba` 6-10 times per node per frame — eliminating this removes 36,000-60,000 string parse operations per second at 100 nodes.

---

### Pitfall 6: zoomToFit Race Condition with Simulation Stabilization

**What goes wrong:** Calling `fgRef.current.zoomToFit()` before the simulation has settled produces an incorrect zoom level. The graph has not reached its final layout, so the bounding box is wrong. After stabilization, nodes expand beyond the zoom viewport.

**Why it happens:** `zoomToFit` computes a bounding box from current node positions. If called before `onEngineStop` fires, nodes are still in motion. The current code wraps this in `setTimeout(..., 100)` inside `onEngineStop`, which helps, but 100ms is arbitrary.

**Consequences:** Graph appears correctly zoomed on initial load but clips nodes after large data changes. The `hasZoomedRef` guard prevents re-zoom when it should, but also prevents it when the layout has genuinely changed (timeline toggle, large filter changes).

**Prevention:**
- Call `zoomToFit` only inside `onEngineStop`. The current pattern is correct but the `hasZoomedRef` reset condition should be broadened: reset not only on `nodes.length` change but also on timeline toggle and confidence filter changes that remove more than 20% of nodes.
- For the search auto-zoom feature (zoom to a specific node): use `fgRef.current.centerAt(x, y, duration)` followed by `fgRef.current.zoom(targetZoom, duration)` rather than `zoomToFit`. This zooms to one node without refitting the entire graph.
- For the neighborhood explorer: call `zoomToFit(400, 40)` with a tighter padding after the subgraph is isolated.

---

### Pitfall 7: Mobile Touch — Scroll Trap on Graph Canvas

**What goes wrong:** On mobile, the graph canvas's touch handlers call `preventDefault()` on touch events, preventing them from bubbling to the scroll container. Single-finger swipe is ambiguous — pan the graph or scroll the page? The library defaults to handling all touch, which makes the page un-scrollable when the user touches the graph area.

**Why it happens:** This is a fundamental tension between in-canvas pan gestures and document scroll. The library cannot distinguish intent automatically.

**Consequences:** On the home page with a large interactive graph preview, mobile users get "trapped" — touching the graph area makes it impossible to scroll past. This is a critical UX failure for a PWA.

**Prevention:**
- For mini/preview graph instances on the home page: set `enablePointerInteraction={false}` and `enableNavigationControls={false}`. A non-interactive preview avoids the scroll trap entirely. The current code already sets `enablePointerInteraction={!mini}` — maintain this discipline for all new graph instances.
- If interactive mini graphs are required on mobile, wrap the canvas container in a `touch-action: none` element — this tells the browser to surrender scroll handling for that area.
- Full-page graph views (the `/graph` route) are safe because the graph IS the page; there is nothing to scroll past.

---

### Pitfall 8: Bioluminescent Theme — Glow Intensity vs. Accessibility

**What goes wrong:** The glow effects (radial gradients with semi-transparent color stops) look striking but may fail WCAG 2.1 AA contrast requirements for interactive text elements. Node labels rendered at `rgba(color, 0.7)` against `#050510` have varying contrast ratios by color. Forms and approval UI elements using the same glowing aesthetic can lose legibility at small sizes.

**Specific risk by color:**
- `#06ffc8` (teal) at 70% opacity on `#050510`: passes 4.5:1 — safe
- `#a78bfa` (violet) at 70% opacity on `#050510`: passes — safe
- `#fbbf24` (amber) at 70% opacity on `#050510`: borderline at small sizes — validate
- `#f472b6` (pink) at 70% opacity on `#050510`: may fail at small sizes — validate

**Why it happens:** Canvas-rendered text is invisible to automated accessibility tools (axe, Lighthouse). Failures go undetected in CI. The very dark background (`#050510`) that makes glows look vivid also means any color at reduced opacity risks falling below threshold.

**Consequences:** Reduced legibility for users with low vision or astigmatism. In high-ambient-light environments (outdoor PWA use), glow effects disappear against the dark background entirely.

**Prevention:**
- For DOM elements (buttons, labels, form inputs), ensure base text color passes 4.5:1 contrast before adding glow effects. Never rely on glow for legibility.
- Increase canvas label opacity to 1.0 for active states (hovered, selected). Use reduced opacity only for dimmed/inactive nodes.
- Do not use amber (`#fbbf24`) for small DOM body text. Reserve it for decorative icons, badges, and node type indicators.
- Test on a real mobile OLED screen outdoors. OLED glow rendering differs significantly from a calibrated desktop monitor.
- For users who prefer reduced motion (`prefers-reduced-motion: reduce`), suppress pulse animations and particle effects. Respect this media query throughout all CSS animations.

---

### Pitfall 9: Graph Page State Proliferation — Mode Conflicts

**What goes wrong:** As cluster view, neighborhood explorer, confidence slider, and search are added, the graph page accumulates 15-20 `useState` variables. Interactions between modes become undefined: what happens when the user enables neighborhood mode while in path-tracing mode while the timeline is playing?

**Why it happens:** Each feature is added with its own independent state, with no central concept of "what mode is the graph in."

**Consequences:** Edge cases multiply. The `handleNodeClick` callback grows to an unmaintainable chain of conditionals. Each new mode must check all other modes for compatibility. Tests require setting up complex state combinations.

**Prevention:**
- Before implementing cluster visualization or neighborhood explorer, define a union type: `type GraphMode = 'browse' | 'path' | 'neighborhood' | 'search'`. Only one mode is active at a time.
- Store mode-specific state in a single `graphMode` object: `{ type: 'path', source: string | null, target: string | null }` vs. `{ type: 'neighborhood', center: string }`.
- A clear mode type also makes the UI toolbar logic clean: highlight the active mode button, disable incompatible controls.
- The current `pathMode: boolean` pattern should be the first thing refactored before adding more modes.

---

### Pitfall 10: Cluster Auto-Detection — Algorithm Instability During Timeline Playback

**What goes wrong:** A topology-based clustering algorithm (connected components, Louvain) produces clusters that change dramatically when nodes appear/disappear during timeline playback. Cluster IDs reassign, colors flip, and boundaries jump — every timeline tick during playback shows a different cluster configuration.

**Why it happens:** Connected components are globally sensitive. Adding one edge can merge two large clusters. If cluster colors are assigned by rank order (cluster 0 = teal, cluster 1 = violet), any membership change cascades into a full color remap.

**Consequences:** Cluster overlays jump, resize, and recolor during timeline playback, which is visually disorienting and defeats the purpose of showing knowledge structure growth over time.

**Prevention:**
- Use entity `type` as the primary clustering key rather than graph topology. Node types (person, project, concept, tool, technology) are stable, already in the data model, and produce semantically meaningful clusters. This is the right default.
- If topology-based clustering is needed, compute it server-side and cache it. Do not recompute cluster membership in the browser on every timeline tick.
- Assign cluster colors from a stable hash of a canonical cluster identifier (e.g., most-connected node's ID), not from the cluster's rank in the current result set.
- Separate cluster membership calculation from hull rendering: recalculate membership only when the full node set changes (not during timeline filter), recalculate hull geometry (which depends on live `x`/`y`) every frame inside `onRenderFramePost`.

---

## Minor Pitfalls

---

### Pitfall 11: `nodeCanvasObjectMode` Must Return `'replace'`

**What goes wrong:** If `nodeCanvasObjectMode` returns `'after'` instead of `'replace'`, both the default node painter AND the custom painter run, producing double-drawn artifacts — a default circle under the custom glow effect.

**Prevention:** The current code correctly uses `() => 'replace'`. Maintain this for all new node painter variants (cluster nodes, dimmed nodes, highlighted nodes).

---

### Pitfall 12: `setLineDash` State Leaks Between Link Painters

**What goes wrong:** `ctx.setLineDash([4, 4])` persists on the canvas context across calls. If a link painter exits early (via an `if` guard returning before reset), the dashed pattern bleeds into all subsequent link draws in that frame.

**Prevention:** The current code calls `ctx.setLineDash([])` unconditionally at the end of the link painter — maintain this. For new link variants, use `ctx.save()` / `ctx.restore()` to scope all canvas state changes.

---

### Pitfall 13: TanStack Query `refetchOnWindowFocus` Resets Graph Layout

**What goes wrong:** TanStack Query's default `refetchOnWindowFocus: true` causes the graph data to refetch (and potentially produce a new `graphData` reference) when the user alt-tabs and returns to the browser. During active graph exploration, this resets node positions unexpectedly.

**Prevention:** Set `refetchOnWindowFocus: false` on the graph data query, or set `staleTime` to at least 60 seconds. The knowledge graph does not need sub-minute freshness during interactive exploration.

---

### Pitfall 14: `onRenderFramePost` — Verify It Exists in the Installed Version

**What goes wrong:** `onRenderFramePost` was added in a later version of the underlying `force-graph` library. If the package is pinned to an older version, this prop does not exist and cluster/particle overlays have no clean rendering hook.

**Prevention:** Before implementing cluster hulls or particle effects via `onRenderFramePost`, verify the prop is listed in the installed version's TypeScript types or README. The alternative `onRenderFramePre` draws under all nodes and links, which is wrong for overlays.

---

## Sources

- [GitHub: vasturiano/react-force-graph — Issue #202: Improving performance for extremely large datasets](https://github.com/vasturiano/react-force-graph/issues/202)
- [GitHub: vasturiano/react-force-graph — Issue #223: Performance Optimization when rendering more than 12k elements](https://github.com/vasturiano/react-force-graph/issues/223)
- [GitHub: vasturiano/react-force-graph — Issue #226: Not always re-render the graph when changing node color](https://github.com/vasturiano/react-force-graph/issues/226)
- [GitHub: vasturiano/force-graph — Issue #25: Reheating the simulation](https://github.com/vasturiano/force-graph/issues/25)
- [GitHub: vasturiano/react-force-graph — Issue #231: Initial zoomToFit problem](https://github.com/vasturiano/react-force-graph/issues/231)
- [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [Smashing Magazine: Inclusive Dark Mode — Designing Accessible Dark Themes (April 2025)](https://www.smashingmagazine.com/2025/04/inclusive-dark-mode-designing-accessible-dark-themes/)
- [MDN: CSS and JavaScript animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance)
- [TanStack Query: Important Defaults — refetchOnWindowFocus](https://tanstack.com/query/v4/docs/react/guides/important-defaults)
- [Swizec Teller: Smooth animation up to 4,000 elements with React and canvas](https://swizec.com/blog/livecoding-14-mostlysmooth-animation-up-to-4000-elements-with-react-and-canvas/)
- [WebAIM: Contrast and Color Accessibility](https://webaim.org/articles/contrast/)
