---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: Proactive Knowledge & Onboarding
status: Ready to plan
stopped_at: Roadmap created — v6.0 phases 24-28 defined
last_updated: "2026-03-27"
last_activity: 2026-03-27 — v6.0 roadmap written, 18 requirements mapped to 5 phases
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.
**Current focus:** Phase 24 — Context Scoping Schema (v6.0 first phase)

## Current Position

Phase: 24 of 28 (Context Scoping Schema)
Plan: —
Status: Ready to plan
Last activity: 2026-03-27 — v6.0 roadmap written, 18 requirements mapped to 5 phases

Progress: [░░░░░░░░░░] 0% (v6.0)

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v6.0)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v6.0 research]: SessionStart hook with `additionalContext` is the only correct injection mechanism — MCP Resources require explicit user invocation, not automatic
- [v6.0 research]: Hook binary must open SQLite in read-only mode, FTS5-only, complete under 500ms — never call Ollama from hook
- [v6.0 research]: Token cap is 1,500 tokens enforced at query layer (priority ordering), not end-truncation
- [v6.0 research]: Preferences start project-scoped, promote to global user entity only after 2+ project corroboration or explicit confirmation
- [v6.0 research]: `myco init` scans README, CLAUDE.md, package manifests only — no source files (anchoring bias research)
- [v6.0 research]: One new npm dependency: `ignore@5.3.x` for gitignore-aware file filtering during `myco init`
- [v6.0 research]: Novelty filter tracking needs design decision — `injection_log` table vs deferred consolidation update

### Pending Todos

None.

### Blockers/Concerns

- [Phase 25]: Token cap enforcement strategy — SQLite has no native "stop at N tokens"; must be enforced at app layer with priority-ordered queries; design needed in planning
- [Phase 25]: Novelty filter write strategy — hook is read-only, but tracking `last_injected_at` requires a write; decide between `injection_log` table (separate write) or deferred update
- [Phase 26]: Batch approval UX pattern — distinct from existing per-item queue; needs design decision (new dashboard route vs terminal-interactive flow)
- [Phase 26]: `myco init` idempotency — re-run must not duplicate entities; dedup classifier handles single observations but batch flow may need separate "already seen" check

## Session Continuity

Last session: 2026-03-27
Stopped at: Roadmap created — v6.0 phases 24-28 written to ROADMAP.md
Resume file: None
