# Requirements: Myco

**Defined:** 2026-03-27
**Core Value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## v4.0 Requirements

Requirements for Dashboard & Graph Experience milestone. Each maps to roadmap phases.

### Graph Core

- [ ] **GRPH-01**: Graph nodes remain stable on hover — no drift, repulsion, or physics reheat
- [ ] **GRPH-02**: User can isolate a node's 1-2 hop neighborhood in a focused subgraph view
- [ ] **GRPH-03**: Graph auto-detects entity clusters via Louvain community detection and renders convex hull boundaries
- [ ] **GRPH-04**: User can filter graph nodes by confidence threshold via slider control
- [ ] **GRPH-05**: User can search entities with animated highlight and auto-zoom to matching nodes
- [ ] **GRPH-06**: User can scrub timeline from earliest to latest entity with smooth playback animation showing the graph grow
- [ ] **GRPH-07**: Graph uses a clean interaction mode system (explore/path/neighborhood/search) with visible mode indicator
- [ ] **GRPH-08**: Graph applies level-of-detail rendering — skip gradients and labels when zoomed out for 500+ node performance

### Dashboard Theme

- [ ] **THME-01**: All dashboard pages use bioluminescent deep-sea visual theme with consistent CSS variables
- [ ] **THME-02**: All "brain" language throughout dashboard updated to "Myco"

### Home Page

- [ ] **HOME-01**: Home page displays knowledge growth chart showing entities, observations, and relationships over time
- [ ] **HOME-02**: Activity stream shows rich entity cards with type colors and context instead of plain text
- [ ] **HOME-03**: Home page shows health metrics: consolidation status, embedding coverage, orphaned nodes, confidence distribution
- [ ] **HOME-04**: Home page graph preview is larger and interactive, clickable to enter full graph view

### Approvals

- [ ] **APRV-01**: Approvals page shows guided onboarding explaining Myco's knowledge extraction and approval flow
- [ ] **APRV-02**: User can select multiple approval items and approve/reject in batch
- [ ] **APRV-03**: Approval cards show confidence visualization with source evidence and episode links
- [ ] **APRV-04**: Approval cards show inline mini-graph preview of where the entity would connect

## Future Requirements

### Graph Advanced

- **GRPH-F01**: 3D graph view toggle (deferred — navigation penalty exceeds visual benefit per research)
- **GRPH-F02**: Betweenness centrality computation (deferred — O(VE) freeze risk in browser at scale)
- **GRPH-F03**: Graph export to PNG/SVG

### Dashboard Advanced

- **HOME-F01**: Customizable dashboard layout (drag-and-drop widgets)
- **APRV-F01**: Approval card inline editing before approve

## Out of Scope

| Feature | Reason |
|---------|--------|
| Canvas-based graph editing (add/remove nodes in UI) | High complexity for a read-and-approve interface — knowledge enters via MCP tools |
| Real-time WebSocket updates | Polling via TanStack Query (60s) is sufficient for single-user |
| Mobile-native graph gestures (pinch-zoom custom) | react-force-graph-2d handles touch adequately; custom gestures add fragility |
| Obsidian/Roam graph parity | Different use case — Myco is agent knowledge, not personal notes |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRPH-01 | — | Pending |
| GRPH-02 | — | Pending |
| GRPH-03 | — | Pending |
| GRPH-04 | — | Pending |
| GRPH-05 | — | Pending |
| GRPH-06 | — | Pending |
| GRPH-07 | — | Pending |
| GRPH-08 | — | Pending |
| THME-01 | — | Pending |
| THME-02 | — | Pending |
| HOME-01 | — | Pending |
| HOME-02 | — | Pending |
| HOME-03 | — | Pending |
| HOME-04 | — | Pending |
| APRV-01 | — | Pending |
| APRV-02 | — | Pending |
| APRV-03 | — | Pending |
| APRV-04 | — | Pending |

**Coverage:**
- v4.0 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18 (pending roadmap)

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after initial definition*
