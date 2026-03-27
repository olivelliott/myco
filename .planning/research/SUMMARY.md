# Project Research Summary

**Project:** Myco
**Domain:** Interactive knowledge graph dashboard — bioluminescent PWA with animated visualization and agent memory management
**Researched:** 2026-03-27
**Confidence:** HIGH (codebase audit + verified package sources)

## Executive Summary

Myco v4.0 is a dashboard enhancement milestone, not a greenfield build. The existing stack (React 19, Vite 8, Tailwind v4, shadcn/ui, TanStack Query/Router, react-force-graph-2d, Hono) is fully in production and must not be re-evaluated. The v4.0 work is scoped to adding visual depth (bioluminescent theme, particle effects, cluster visualization), completing table-stakes graph interactions (search zoom, confidence filter, neighborhood explorer), and upgrading the approval queue (batch actions, onboarding, mini-graph preview). All new capabilities require only six additional npm packages totaling ~81-86KB gzipped.

The recommended approach is to build in dependency order: theme foundation first (unblocks visual QA), then graph core features (confidence filter, clusters, search zoom, neighborhood explorer), then timeline animation and particles (which must be layered on a stable GraphView), then growth chart (needs a new API endpoint), then approvals overhaul. Every feature except the growth chart and batch approvals is purely client-side — no new API endpoints needed. The architecture preserves the existing data flow (`/api/graph` → TanStack Query → in-memory filtering) and extends it with new props on `GraphView` rather than splitting the component.

The dominant risk is the react-force-graph-2d simulation reheating bug. The existing `filteredData` in `graph.tsx` creates a new object reference on every `timelineDate` tick, which reheats the physics simulation 10 times per second during playback. If this is not fixed before adding cluster boundaries, neighborhood isolation, and particle effects, every new feature will appear broken. Fixing graphData reference identity is a prerequisite for all canvas features, not a nice-to-have.

## Key Findings

### Recommended Stack

The existing stack is correct and should not change. Six targeted additions cover all v4.0 needs. See `.planning/research/STACK.md` for full rationale.

**New additions only:**
- `shadcn chart` (via CLI): knowledge growth chart — already in the shadcn ecosystem, wraps Recharts 3.8.1, zero new npm deps beyond recharts (~40KB gzipped)
- `graphology` 0.26.0 + `graphology-communities-louvain` 2.0.2: Louvain community detection for cluster visualization — TypeScript-native, O(n log n), runs in under 2ms for under 10k nodes
- `d3-polygon` 3.0.1: convex hull computation for cluster boundary rendering — 3KB gzipped, already partially present as a d3 family member
- `motion` 12.x (via `LazyMotion + domAnimation`): UI transition animations for approval cards and confidence bars — 15KB gzipped with LazyMotion (vs. 34KB full bundle)
- Glow and particle effects: NO new library — implemented via Canvas 2D `ctx.shadowBlur` in `nodeCanvasObject` and particle state in `useRef` via `onRenderFramePre`

**Critical version notes:** React 19 peer dep issue in Recharts is resolved in 3.x (no override needed). Motion v12 imports from `motion/react` not `framer-motion`. `onRenderFramePost` availability must be verified against the installed react-force-graph-2d version before implementing cluster overlays.

### Expected Features

See `.planning/research/FEATURES.md` for full codebase audit and competitive analysis.

**Must have (table stakes — gaps in current v3.0):**
- Stable hover without node drift — nodes still potentially drift; fix `cooldownTicks` pattern
- Search auto-zoom to result — opacity fade exists but camera does not move (low effort fix via `fgRef.current.centerAt`)
- Confidence threshold filter slider — data exists on every node, filter UI not built
- Neighborhood explorer (ego graph) — highlight-only exists; isolate-subgraph mode does not
- Batch approve/reject in approval queue — each item requires individual action (tedious at scale)

**Should have (differentiators):**
- Cluster visualization with convex hull boundaries — signature visual differentiator (Kumu-style)
- Timeline entry animation for newly appearing nodes — makes knowledge accumulation story visceral
- Confidence badges on entity panel observations — epistemic transparency
- "Myco" language pass + branded empty states — brand coherence, removes legacy "brain" strings

**Defer to v4.1+:**
- Knowledge growth chart on home page (requires new API endpoint — cut if schedule is tight)
- Inline mini-graph preview in approvals (requires neighborhood API endpoint)
- Right-click context menu on nodes (nice to have, not critical path)
- Node-level confidence badge overlay on canvas (post-cluster visual polish)

**Anti-features (do not build):**
- Betweenness centrality computed in browser (O(VE) — freezes UI at 500+ nodes)
- 3D graph view (visually impressive, practically useless per Obsidian community feedback)
- Graph editing directly on canvas (UX complexity, dashboard is read-and-approve)
- Semantic search in dashboard (blocks on Ollama inference, Ollama may not be running)

### Architecture Approach

All v4.0 features integrate into the existing component tree by adding props to `GraphView` rather than splitting it or adding new data-fetching layers. The `graph.tsx` route orchestrates all new state. Client-side filtering in `decoratedNodes` useMemo is the correct home for confidence threshold, neighborhood isolation, and cluster detection — no server round-trips. Two new API endpoints are required: `GET /api/stats/growth` (growth chart) and `POST /api/approvals/batch` (batch resolve). See `.planning/research/ARCHITECTURE.md` for the full integration map and component-by-component breakdown.

**Major components and their v4.0 responsibilities:**
1. `graph-view.tsx` (MODIFY) — receives `clusterMap`, `confidenceThreshold`, `neighborhoodData`, `newNodeIds` props; hosts particle system via `onRenderFramePre`; adds search auto-zoom
2. `graph.tsx` route (MODIFY) — owns all new state (`clustersEnabled`, `neighborhoodNodeId`, `confidenceThreshold`, `newNodeIds`); defines `GraphMode` union type; wires all new props
3. `lib/graph-clusters.ts` (NEW) — shared `detectClusters(nodes, links)` utility extracted from inline analytics union-find
4. `hooks/use-neighborhood.ts` (NEW) — BFS subgraph at depth 1 or 2 from a focal node
5. `approvals.tsx` + `use-approvals.ts` (MODIFY) — batch action bar, `useBatchResolveApprovals` mutation
6. `api-server/routes/stats.ts` (NEW) — `GET /api/stats/growth` with SQLite `strftime` GROUP BY

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full detail and sources. Top five:

1. **graphData reference identity — silent reheat trap** — `filteredData` in `graph.tsx` creates a new object on every `timelineDate` change (10x/second during playback), reheating the physics simulation continuously. Fix: separate structural data from visual data; pass visual state (opacity, color) via refs that `nodeCanvasObject` reads directly, not via `graphData`. This is a prerequisite before any other canvas feature.

2. **Timeline setInterval vs. requestAnimationFrame** — `setInterval` at 100ms fires 10 React state updates/second, cascading into simulation reheats. Fix: drive timeline playback via `requestAnimationFrame` loop; store cutoff timestamp in `useRef`; update React state only on manual scrub or play completion.

3. **Cluster boundaries on wrong canvas layer** — DOM or SVG overlays above the canvas capture pointer events, making nodes inside cluster regions unclickable. Fix: draw cluster hulls via `onRenderFramePost` on the canvas itself; use `pointer-events: none` on any DOM labels.

4. **Particle state in React state** — storing particle positions in `useState` inside an animation loop causes a render feedback loop, collapsing frame rate to single digits. Fix: all particle state in `useRef`; particle physics runs entirely inside `onRenderFramePre`; zero React state involvement; cap particle pool at 200 entries.

5. **Graph mode state proliferation** — adding cluster, neighborhood, path, and search modes as independent `useState` variables creates unmaintainable conditionals. Fix: define `type GraphMode = 'browse' | 'path' | 'neighborhood' | 'search'` before implementing any new modes; refactor existing `pathMode: boolean` first.

## Implications for Roadmap

Based on research, the architecture file defines a clear 6-phase build order driven by technical dependencies. This directly maps to recommended roadmap phases.

### Phase 1: Theme Foundation
**Rationale:** Unblocks accurate visual QA for all subsequent phases. Pure CSS/class changes with no logic dependencies.
**Delivers:** Bioluminescent CSS variables applied across `activity-feed.tsx`, `approvals.tsx`, sidebar, and remaining hardcoded `slate-*` classes. "Myco" language pass removes legacy "brain" strings. Branded empty states for approvals and graph.
**Addresses:** FEATURES.md differentiator #7 (Myco language + empty states)
**Avoids:** Discovering theme inconsistencies mid-feature QA on later phases

### Phase 2: Graph Core Features
**Rationale:** All four features modify `GraphView` independently. Must precede particle effects (Phase 3) since particles layer on a stable render loop. The graphData reference identity fix is the first task in this phase — it unblocks everything else.
**Delivers:** Confidence threshold filter, cluster detection + hull rendering, search auto-zoom + animated highlight, neighborhood explorer (depth 1/2 toggle)
**Uses:** `graphology` + `graphology-communities-louvain` + `d3-polygon` (new STACK.md additions)
**Implements:** `lib/graph-clusters.ts` (NEW), `hooks/use-neighborhood.ts` (NEW), `GraphMode` union type, `graph-view.tsx` prop additions
**Avoids:** Pitfalls #1 (graphData reheat), #3 (cluster canvas layer), #5 (mode state proliferation), #9 (LOD for performance cliff)

### Phase 3: Timeline Animation and Particles
**Rationale:** Depends on Phase 2's stable `GraphView`. The `newNodeIds` prop and `onRenderFramePre` particle system must be added after all other `GraphView` changes are merged to avoid conflicts in the canvas callback chain.
**Delivers:** `requestAnimationFrame`-driven timeline playback (replaces setInterval), animated node entry pulse on timeline advance, particle burst system for node clicks and new entries, restyled timeline slider UI replacing native range input
**Implements:** `useRef`-based timeline cutoff (ARCHITECTURE.md pattern), particle pool in `useRef` capped at 200 entries
**Avoids:** Pitfall #2 (setInterval fights rAF), Pitfall #4 (particle state in React state)

### Phase 4: Growth Chart
**Rationale:** Requires a new backend endpoint; independent of all dashboard component changes. Can be parallelized with Phase 3 if two tracks are available.
**Delivers:** `GET /api/stats/growth` endpoint, `growth-chart.tsx` custom Canvas sparkline (no charting library), `hooks/use-growth.ts`, integration into home page route
**Uses:** SQLite `strftime GROUP BY` pattern, custom Canvas gradient matching existing `graph-view.tsx` bioluminescent patterns
**Avoids:** Adding Recharts/Nivo for a 3-line sparkline (ARCHITECTURE.md anti-pattern: >200KB for a 60-line Canvas impl)

### Phase 5: Approvals Overhaul
**Rationale:** Relatively independent of graph work; needs only Phase 1 theme. Inline mini-graph preview (optional) requires Phase 2 stable GraphView.
**Delivers:** Dismissable onboarding banner (`localStorage`-gated), batch approve/reject with `POST /api/approvals/batch`, `useBatchResolveApprovals` mutation with optimistic cache removal, `ApprovalCard` selectable mode activated (interface already defined), optional inline mini-graph preview from approval metadata
**Implements:** `components/approvals-onboarding.tsx` (NEW), batch endpoint in `approvals.ts` (MODIFY), `use-approvals.ts` batch mutation (MODIFY)
**Avoids:** Undo/redo system (use 5-second toast/commit window — the Gmail pattern per FEATURES.md anti-features)

### Phase 6: Analytics Panel Enhancement
**Rationale:** Depends on `lib/graph-clusters.ts` from Phase 2. Final polish pass — reorganizes existing code, no novel risk.
**Delivers:** `GraphAnalytics` refactored to import from shared cluster utility (removes inline union-find duplication), cluster-aware analytics breakdown section, confidence badges on `entity-panel.tsx` observations
**Implements:** Refactor only — no new APIs, no new hooks

### Phase Ordering Rationale

- Theme first because visual regressions in dark mode are impossible to QA against a half-converted palette; it also takes the least time and sets the visual baseline for all screenshots
- graphData reference identity fix is Phase 2 task 0 — every subsequent canvas feature depends on a simulation that does not continuously reheat
- Particles after all other GraphView changes to prevent merge conflicts in the canvas callback chain; `onRenderFramePre` particle loop is the last thing added to avoid interference
- Growth chart as standalone phase because the API work is completely independent and can be parallelized if bandwidth allows
- Approvals overhaul late because `ApprovalCard` selectable props already exist in the TypeScript interface — it is the lowest-risk scope and the batch API endpoint is the only non-trivial backend work
- Analytics panel last because it only reorganizes existing computation, adding zero user-visible risk

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Cluster Visualization):** `onRenderFramePost` vs `onRenderFramePre` availability must be verified against the installed `react-force-graph-2d` version before choosing the canvas hook. If `onRenderFramePost` does not exist, hull rendering approach changes (draw under nodes rather than over).
- **Phase 3 (Timeline rAF pattern):** The `requestAnimationFrame` + `useRef` timeline replacement is a significant rework of the existing `setInterval` implementation — consider a brief spike to validate the rAF/ref pattern keeps the slider UI in sync before committing to full implementation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Theme):** Pure CSS class replacement — no research needed
- **Phase 4 (Growth Chart):** SQLite `strftime GROUP BY` is well-documented; Canvas gradient sparkline follows existing patterns in `graph-view.tsx`
- **Phase 5 (Approvals):** `ApprovalCard` selectable interface already defined; batch endpoint follows existing single-approve logic in a `db.transaction()` loop
- **Phase 6 (Analytics refactor):** Extract-and-reuse of existing union-find — no novel patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All additions verified via npm + official docs. Recharts React 19 compat confirmed in 3.x changelog. Motion v12 React 19 compat confirmed. |
| Features | HIGH | Competitive analysis against Neo4j Bloom, Obsidian, Kumu, Gephi + direct codebase audit of all v3.0 shipped components |
| Architecture | HIGH | Based on direct codebase read of all relevant source files. Integration points verified (e.g., `ApprovalCard` selectable props confirmed in TypeScript interface but not yet wired) |
| Pitfalls | HIGH | Library-specific pitfalls verified against GitHub issues #202, #223, #226, #25, #231 on react-force-graph; animation pitfalls verified against MDN and React patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **`onRenderFramePost` existence in installed version:** MEDIUM confidence. Verify before Phase 2 cluster implementation by checking TypeScript types in the installed `react-force-graph-2d` package. Fallback: draw hulls in `onRenderFramePre` (hulls render under nodes, acceptable trade-off).
- **Graphology-communities-louvain maintenance cadence:** Last published ~9 months ago. The Louvain algorithm is stable and does not require ongoing updates, but verify no breaking changes against graphology 0.26.0 before writing integration code.
- **`hasZoomedRef` reset conditions:** PITFALLS.md flags that the zoom guard should reset on confidence filter changes removing over 20% of nodes. Validate this threshold empirically during Phase 2 implementation.
- **Growth chart scope decision:** FEATURES.md marks the growth chart as a "defer to v4.1" candidate. Roadmapper should make an explicit go/defer call — Phase 4 is fully independent and can be cut without affecting any other phase.

## Sources

### Primary (HIGH confidence)

- Direct codebase audit: `packages/dashboard/src/` — all component files read (informs FEATURES.md and ARCHITECTURE.md)
- npm registry: recharts 3.8.1, graphology 0.26.0, graphology-communities-louvain 2.0.2, d3-polygon 3.0.1, motion 12.x — all version-verified (STACK.md)
- shadcn/ui docs: chart component, CSS variable theming, automatic dark mode via `--chart-1` through `--chart-5`
- GitHub: vasturiano/react-force-graph — issues #202, #223, #226, #25, #231 — performance thresholds and simulation behavior (PITFALLS.md)
- motion.dev docs: LazyMotion bundle sizes confirmed (15KB domAnimation vs. 34KB full bundle)

### Secondary (MEDIUM confidence)

- Neo4j Bloom product docs — competitive feature comparison
- Obsidian graph view docs + community forum — neighborhood explorer validation ("Local Graph is the most-used feature")
- Kumu clustering docs — cluster visualization competitive reference
- graphology-communities-louvain v2.0.2 — algorithm stability assumed from Louvain specification stability
- ForceGraph2D `onRenderFramePost` API — confirmed in library docs; specific version availability not pinned against installed package

### Tertiary (LOW confidence)

- Performance thresholds (under 200 / 200-500 / 500-1500 / 1500+ nodes): derived from library issues + canvas benchmarks, not first-party benchmarks on this codebase
- Mobile OLED glow rendering behavior: inferred from general OLED display characteristics, not tested on device

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
