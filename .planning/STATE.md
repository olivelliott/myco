---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Feature Parity & Differentiation
status: Ready to execute
stopped_at: Completed 19-03-PLAN.md — temporal as_of and history query filtering
last_updated: "2026-03-27T22:07:00.000Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.
**Current focus:** Phase 19 — temporal-versioning-dedup-resolution

## Current Position

Phase: 19 (temporal-versioning-dedup-resolution) — EXECUTING
Plan: 3 of 3 (complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v5.0)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 18 P01 | 3 | 2 tasks | 6 files |
| Phase 19-temporal-versioning-dedup-resolution P01 | 215 | 2 tasks | 6 files |
| Phase 19 P02 | 4 | 1 tasks | 1 files |
| Phase 19 P03 | 7 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v5.0 research]: Vercel AI SDK locked at v4.3.19 — do NOT upgrade in v5.0 (ollama-ai-provider incompatibility)
- [v5.0 research]: All auto-extracted entities unconditionally route to approval queue — no auto-approve threshold applies
- [v5.0 research]: Relationship strength updated only on `remember` (not `recall`) to avoid write amplification
- [v5.0 research]: `computeEffectiveConfidence` is a pure function at read time — no write-back to DB
- [v5.0 research]: Phase 18 must land before any other v5.0 phase — migration framework prerequisite
- [Phase 18]: columnExists() guards in migrations 002-005 handle v4.0 databases that already have those columns — avoids duplicate column errors without try/catch
- [Phase 18]: Per-migration db.transaction() wrappers isolate failures; a partial failure rolls back only that migration, not prior work
- [Phase 18]: NOT NULL columns with DB defaults typed as required number in TypeScript; nullable columns typed as optional string | null
- [Phase 19-temporal-versioning-dedup-resolution]: Embedding fetched before classifyObservation — KNN near-dup check needs embedding upfront
- [Phase 19-temporal-versioning-dedup-resolution]: UPDATE transaction wraps retire+FTS insert only — vec embedding insert outside transaction
- [Phase 19-temporal-versioning-dedup-resolution]: valid_from = now matches created_at on new observations — same timestamp at insert time
- [Phase 19-02]: Soft-delete merge: secondary entity stays in DB with merged_into = primary.id rather than hard-deleted
- [Phase 19-02]: Observations NOT reassigned during merge — they stay on source entity for historical queryability
- [Phase 19-02]: Merged entities excluded from queryEntities results via default condition e.merged_into IS NULL
- [Phase 19-03]: valid_until IS NULL added to JOIN clause (not WHERE) on knnSearchObservations and ftsSearchObservations — filters at join time
- [Phase 19-03]: useDefaultTemporalOnly guard preserves fast path; any additional filter forces dynamic WHERE
- [Phase 19-03]: history output includes valid_from/valid_until fields; default output omits them for backward compatibility
- [Phase 19-03]: as_of queryEntities uses inline db.prepare() (STMT-02 exception) — runtime SQL construction required

### Pending Todos

None.

### Blockers/Concerns

- [Phase 19]: SQLite `CURRENT_TIMESTAMP` instability — all `valid_from` values must be generated in application code before transactions open (audit every `insertObservation` call site)
- [Phase 19]: Wrong entity merges are hard to undo — merge candidates require BOTH Levenshtein ≤ 2 AND cosine similarity > 0.92; all merge proposals must route through approval queue
- [Phase 23]: Consolidation lock design (`consolidation_lock` table row structure, expiry logic, atomic check-and-lock SQL) must be fully specified before implementation begins

## Session Continuity

Last session: 2026-03-27T22:07:00.000Z
Stopped at: Completed 19-03-PLAN.md — temporal as_of and history query filtering
Resume file: None
