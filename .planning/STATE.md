---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Dashboard & Graph Experience
status: Ready to execute
stopped_at: Completed 14-01-PLAN.md
last_updated: "2026-03-27T18:58:12.636Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 4
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.
**Current focus:** Phase 14 — graph-core-features

## Current Position

Phase: 14 (graph-core-features) — EXECUTING
Plan: 2 of 3

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v4.0)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 13 P01 | 12 | 2 tasks | 12 files |
| Phase 14 P01 | 352 | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 13]: Theme comes first — unblocks accurate visual QA for all downstream phases
- [Phase 14]: graphData reference identity fix is Phase 14 task 0 — prerequisite for all canvas features (simulation reheat bug)
- [Phase 14]: GraphMode union type (`browse | path | neighborhood | search`) must be defined before implementing new modes
- [Phase 14]: Cluster hull boundaries drawn via canvas `onRenderFramePost` (not DOM overlay) to avoid capturing pointer events
- [Phase 15]: Timeline playback driven by `requestAnimationFrame` + `useRef` cutoff timestamp — NOT `setInterval` (causes 10x/sec reheat)
- [Phase 15]: Particle state stored in `useRef`, never React state — prevents render feedback loop
- [Phase 17]: `ApprovalCard` selectable props already defined in TypeScript interface — APRV-02 is mostly route-level wiring
- [Phase 13]: App components use inline style pattern, UI primitives use Tailwind arbitrary value syntax for CSS variable theming
- [Phase 14]: computeGraphDataKey memoizes graphData by sorted node/link ID sets — only structural changes reheat simulation (Pitfall 1 fix)
- [Phase 14]: GraphModeState discriminated union replaces pathMode boolean — single source of truth for explore/path/neighborhood/search modes
- [Phase 14]: cooldownTicks(0) in handleEngineStop permanently freezes simulation after initial layout — prevents hover drift (GRPH-01)

### Pending Todos

- Run `/gsd:plan-phase 13` to decompose Phase 13 into executable plans

### Blockers/Concerns

- [Phase 14]: Verify `onRenderFramePost` exists in the installed `react-force-graph-2d` version before cluster hull implementation (fallback: draw in `onRenderFramePre`, hulls render under nodes)
- [Phase 14]: Verify `graphology-communities-louvain` 2.0.2 has no breaking changes against `graphology` 0.26.0 before writing integration code

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260327-f8o | Build brain forget MCP tool for removing entities, observations, or relationships | 2026-03-27 | 8ad8e06 | [260327-f8o-build-brain-forget-mcp-tool-for-removing](./quick/260327-f8o-build-brain-forget-mcp-tool-for-removing/) |
| 260327-hr6 | Rename brain.db to myco.db and BRAIN_* env vars to MYCO_* across entire codebase | 2026-03-27 | 9752be5 | [260327-hr6-rename-brain-db-to-myco-db-and-brain-env](./quick/260327-hr6-rename-brain-db-to-myco-db-and-brain-env/) |

## Session Continuity

Last session: 2026-03-27T18:58:12.632Z
Stopped at: Completed 14-01-PLAN.md
Resume file: None
