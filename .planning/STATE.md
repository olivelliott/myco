---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: Proactive Knowledge & Onboarding
status: Milestone complete
stopped_at: Completed 27-02-PLAN.md — integration tests for remember_rule and update_knowledge
last_updated: "2026-03-29T15:47:12.077Z"
progress:
  total_phases: 10
  completed_phases: 9
  total_plans: 17
  completed_plans: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.
**Current focus:** Phase 27 — Workflow Rules and Knowledge Correction

## Current Position

Phase: 27
Plan: Not started

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
| Phase 24 P01 | 2 | 2 tasks | 6 files |
| Phase 25-session-start-recall P01 | 250s | 1 tasks | 3 files |
| Phase 26-project-onboarding P01 | 325 | 2 tasks | 2 files |
| Phase 26-project-onboarding P02 | 300 | 2 tasks | 2 files |
| Phase 27-workflow-rules-and-knowledge-correction P01 | 480 | 2 tasks | 1 files |
| Phase 27-workflow-rules-and-knowledge-correction P02 | 480 | 2 tasks | 3 files |

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
- [Phase 24]: Migration framework (migrations.ts + schema_migrations table) added alongside existing try/catch ALTER TABLE pattern — new tables use migration tracking, legacy column additions keep try/catch
- [Phase 24]: selectProjectForPath uses named $path parameter with slash-boundary LIKE (directory_path || '/%') to prevent false prefix matches like /a/bx matching /a/b
- [Phase 25-session-start-recall]: hooks/package.json with type:commonjs required to fix ESM/CJS conflict from root monorepo type:module
- [Phase 25-session-start-recall]: Session-start hook opens DB readonly:true, uses file-based hash cache at ~/.local/share/myco/last-injection-hash for novelty tracking (no DB write)
- [Phase 26-project-onboarding]: source_type 'onboarding' not in SourceType union — use 'agent_session' for myco init writes as closest semantic match for human-guided initial population
- [Phase 26-project-onboarding]: myco init scanner reads README/CLAUDE.md truncated to 2000 chars, .eslintrc* (first found), package.json, tsconfig.json, git config — no source files per anchoring bias research
- [Phase 26-project-onboarding]: init_project omits relations from MCP response to keep agent output clean — agent passes relations when calling remember()
- [Phase 26-project-onboarding]: Top-level await import for onboarding-scanner in tests ensures vi.mock('ai') is applied before scanner module loads
- [Phase 27]: Entity name for workflow rules uses rule:{sha256-8} — stable, collision-resistant, auto-generated from instruction text
- [Phase 27]: updateKnowledge Phase 2 uses db.transaction() for retire+insert+FTS atomicity; embedding attempted post-transaction due to async constraint
- [Phase 27]: decay_exempt column must live on entities table (not just observations) — added migration 10
- [Phase 27]: updateKnowledge confirm phase must pass 'unknown' agent_id (NOT NULL constraint on observations)

### Pending Todos

None.

### Blockers/Concerns

- [Phase 25]: Token cap enforcement strategy — SQLite has no native "stop at N tokens"; must be enforced at app layer with priority-ordered queries; design needed in planning
- [Phase 25]: Novelty filter write strategy — hook is read-only, but tracking `last_injected_at` requires a write; decide between `injection_log` table (separate write) or deferred update
- [Phase 26]: Batch approval UX pattern — distinct from existing per-item queue; needs design decision (new dashboard route vs terminal-interactive flow)
- [Phase 26]: `myco init` idempotency — re-run must not duplicate entities; dedup classifier handles single observations but batch flow may need separate "already seen" check

## Session Continuity

Last session: 2026-03-29T15:43:47.935Z
Stopped at: Completed 27-02-PLAN.md — integration tests for remember_rule and update_knowledge
Resume file: None
