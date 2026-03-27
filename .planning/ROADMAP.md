# Roadmap: Myco

## Milestones

- ✅ **v1.0 AI Workbots Brain** — Phases 1-5 (shipped 2026-03-21)
- ✅ **v2.0 Open Source Release** — Phases 6-8 (shipped 2026-03-22)
- ✅ **v3.0 Performance & Architecture Optimization** — Phases 9-12 (shipped 2026-03-26)
- 🚧 **v4.0 Dashboard & Graph Experience** — Phases 13-17 (in progress)

## Phases

<details>
<summary>✅ v1.0 AI Workbots Brain (Phases 1-5) — SHIPPED 2026-03-21</summary>

- [x] Phase 1: Storage Foundation (2/2 plans) — completed 2026-03-20
- [x] Phase 2: MCP Server + Memory (2/2 plans) — completed 2026-03-21
- [x] Phase 3: Consolidation + Approval (3/3 plans) — completed 2026-03-21
- [x] Phase 4: REST API + PWA (5/5 plans) — completed 2026-03-21
- [x] Phase 5: GSD Integration (2/2 plans) — completed 2026-03-21

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Open Source Release (Phases 6-8) — SHIPPED 2026-03-22</summary>

- [x] Phase 6: Rename (3/3 plans) — completed 2026-03-22
- [x] Phase 7: Tech Debt (1/1 plans) — completed 2026-03-22
- [x] Phase 8: Open Source Packaging (2/2 plans) — completed 2026-03-22

Full details: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v3.0 Performance & Architecture Optimization (Phases 9-12) — SHIPPED 2026-03-26</summary>

- [x] Phase 9: Config + Embedding Performance (2/2 plans) — completed 2026-03-25
- [x] Phase 10: Prepared Statements (2/2 plans) — completed 2026-03-25
- [x] Phase 11: Query Filters + Error Handling (2/2 plans) — completed 2026-03-25
- [x] Phase 12: Namespace Isolation (2/2 plans) — completed 2026-03-26

Full details: `.planning/milestones/v3.0-ROADMAP.md`

</details>

### 🚧 v4.0 Dashboard & Graph Experience (In Progress)

**Milestone Goal:** Transform the Myco dashboard into a polished, bioluminescent analytics experience with a deeply interactive knowledge graph, enriched home page, and a streamlined approvals flow.

- [x] **Phase 13: Theme + Language Foundation** - Bioluminescent CSS variables and "Myco" language pass across all dashboard pages (completed 2026-03-27)
- [ ] **Phase 14: Graph Core Features** - Stable interaction mode system, confidence filter, cluster visualization, neighborhood explorer, search zoom, LOD rendering
- [ ] **Phase 15: Timeline Animation** - requestAnimationFrame-driven timeline playback with animated node entry
- [ ] **Phase 16: Home Page Enhancements** - Knowledge growth chart, rich activity stream, health metrics, interactive graph preview
- [ ] **Phase 17: Approvals Overhaul** - Guided onboarding, batch actions, confidence visualization, inline mini-graph preview

## Phase Details

### Phase 13: Theme + Language Foundation
**Goal**: All dashboard pages present the bioluminescent deep-sea aesthetic with consistent visual language and no legacy "brain" terminology
**Depends on**: Phase 12 (v3.0 complete)
**Requirements**: THME-01, THME-02
**Success Criteria** (what must be TRUE):
  1. Every dashboard page (home, graph, approvals, activity) uses the bioluminescent color palette with no residual slate-* hardcoded classes
  2. CSS variables for the theme are defined in one place and applied consistently — changing a variable updates all pages
  3. No visible "brain" string remains in the dashboard UI — all copy reads "Myco" (headings, labels, empty states, tooltips)
  4. Branded empty states exist for the graph view and approvals page, matching the deep-sea aesthetic
**Plans:** 1/1 plans complete
Plans:
- [x] 13-01-PLAN.md — Migrate all slate-* hardcoded classes to CSS variables and verify no "brain" terminology remains
**UI hint**: yes

### Phase 14: Graph Core Features
**Goal**: The knowledge graph is a fully interactive, stable visualization with mode-driven interactions, cluster awareness, confidence filtering, entity search, and performant rendering at scale
**Depends on**: Phase 13
**Requirements**: GRPH-01, GRPH-02, GRPH-03, GRPH-04, GRPH-05, GRPH-07, GRPH-08
**Success Criteria** (what must be TRUE):
  1. Hovering over any node does not cause it or neighboring nodes to drift — the simulation stays visually calm during interaction
  2. A visible mode indicator shows the current interaction mode (explore / neighborhood / search); switching modes is a single click
  3. User can click a node to enter neighborhood mode, seeing only that node's 1-2 hop subgraph isolated from the rest of the graph
  4. Community clusters are auto-detected and rendered with labeled convex hull boundaries; clusters update when the graph data changes
  5. Dragging the confidence threshold slider immediately filters nodes below the chosen value out of the visible graph
  6. Typing in the search box highlights matching nodes, moves the camera to center on the best match, and dims non-matching nodes
  7. Graphs with 500+ nodes skip per-node gradient and label rendering when zoomed out, keeping interaction smooth
**Plans:** 2/3 plans executed
Plans:
- [x] 14-01-PLAN.md — Foundation: packages, GraphInteractionMode types, graphData stability fix, sim freeze, LOD rendering, mode toolbar
- [ ] 14-02-PLAN.md — Cluster visualization with Louvain detection and convex hull rendering, confidence threshold slider
- [x] 14-03-PLAN.md — Neighborhood explorer (1-2 hop subgraph isolation) and search auto-zoom with pulse animation
**UI hint**: yes

### Phase 15: Timeline Animation
**Goal**: Users can watch the knowledge graph grow from its earliest entry to the present day via smooth, animated timeline playback
**Depends on**: Phase 14
**Requirements**: GRPH-06
**Success Criteria** (what must be TRUE):
  1. The timeline slider shows the full date range of entities in the graph and can be scrubbed manually to any point in time
  2. Pressing play animates the graph growing from the earliest entity to the latest without visible frame drops or physics reheating
  3. Nodes that newly appear during playback get a brief entry pulse effect; the rest of the graph remains stable
  4. Stopping or scrubbing while playing immediately freezes the graph at that point in time
**Plans**: TBD
**UI hint**: yes

### Phase 16: Home Page Enhancements
**Goal**: The home page is a rich analytics command center showing how the knowledge graph has grown over time, current system health, and a live graph preview
**Depends on**: Phase 13
**Requirements**: HOME-01, HOME-02, HOME-03, HOME-04
**Success Criteria** (what must be TRUE):
  1. The home page displays a knowledge growth chart with separate trend lines for entities, observations, and relationships over time
  2. The activity stream shows entity cards with type-specific colors and contextual metadata rather than plain text log entries
  3. Four health metric indicators are visible: consolidation status, embedding coverage percentage, orphaned node count, and confidence distribution
  4. The graph preview on the home page is large enough to orient users and responds to click/tap by navigating to the full graph view
**Plans**: TBD
**UI hint**: yes

### Phase 17: Approvals Overhaul
**Goal**: The approvals page guides new users through Myco's knowledge flow, supports efficient bulk review, and provides epistemic context (confidence, evidence, graph position) on every item
**Depends on**: Phase 14
**Requirements**: APRV-01, APRV-02, APRV-03, APRV-04
**Success Criteria** (what must be TRUE):
  1. First-time visitors to the approvals page see a dismissable onboarding banner explaining how Myco extracts knowledge and what approving/rejecting does
  2. User can select multiple approval items with checkboxes and approve or reject the whole selection in a single action
  3. Each approval card displays the confidence score as a visual bar with the source episode linked as evidence
  4. Each approval card shows an inline mini-graph preview of where the entity would connect in the knowledge graph
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Storage Foundation | v1.0 | 2/2 | Complete | 2026-03-20 |
| 2. MCP Server + Memory | v1.0 | 2/2 | Complete | 2026-03-21 |
| 3. Consolidation + Approval | v1.0 | 3/3 | Complete | 2026-03-21 |
| 4. REST API + PWA | v1.0 | 5/5 | Complete | 2026-03-21 |
| 5. GSD Integration | v1.0 | 2/2 | Complete | 2026-03-21 |
| 6. Rename | v2.0 | 3/3 | Complete | 2026-03-22 |
| 7. Tech Debt | v2.0 | 1/1 | Complete | 2026-03-22 |
| 8. Open Source Packaging | v2.0 | 2/2 | Complete | 2026-03-22 |
| 9. Config + Embedding Performance | v3.0 | 2/2 | Complete | 2026-03-25 |
| 10. Prepared Statements | v3.0 | 2/2 | Complete | 2026-03-25 |
| 11. Query Filters + Error Handling | v3.0 | 2/2 | Complete | 2026-03-25 |
| 12. Namespace Isolation | v3.0 | 2/2 | Complete | 2026-03-26 |
| 13. Theme + Language Foundation | v4.0 | 1/1 | Complete    | 2026-03-27 |
| 14. Graph Core Features | v4.0 | 2/3 | In Progress|  |
| 15. Timeline Animation | v4.0 | 0/? | Not started | - |
| 16. Home Page Enhancements | v4.0 | 0/? | Not started | - |
| 17. Approvals Overhaul | v4.0 | 0/? | Not started | - |
