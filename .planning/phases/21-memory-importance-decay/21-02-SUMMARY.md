---
phase: 21-memory-importance-decay
plan: "02"
subsystem: mcp-server/recall-pipeline
tags: [decay, recall, scoring, lazy-write, prepared-statements]
dependency_graph:
  requires: ["21-01"]
  provides: ["DECAY-02", "DECAY-03"]
  affects: ["packages/core/src/statements.ts", "packages/mcp-server/src/tools.ts"]
tech_stack:
  added: []
  patterns:
    - "Decay-aware ranking: similarity * effective_confidence as final_score"
    - "Lazy last_accessed_at batch UPDATE after read (best-effort try/catch)"
    - "KNN distance inversion: Math.max(0, 1 - distance) converts 0=perfect to similarity"
    - "FTS rank negation: -rank converts negative BM25 to positive similarity"
    - "STMT-02 exception documented on inline db.prepare() for dynamic placeholder counts"
key_files:
  created: []
  modified:
    - packages/core/src/statements.ts
    - packages/mcp-server/src/tools.ts
decisions:
  - "DECAY-03: recall results re-sorted by final_score (similarity * effective_confidence) not raw relevance_score"
  - "Lazy write uses dynamic IN (?) — STMT-02 exception applies since placeholder count varies with result set"
  - "Empty result guard (scoredRows.length > 0) prevents SQL syntax error on empty IN () clause"
  - "queryEntities collects allReturnedObsIds across all entities before issuing single batch UPDATE"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-27T23:00:34Z"
  tasks: 2
  files_modified: 2
---

# Phase 21 Plan 02: Decay Integration into Recall Pipeline Summary

Decay scoring wired into recall and query pipelines — effective_confidence factored into result ranking, KNN distance inverted to similarity, FTS rank negated to similarity, lazy last_accessed_at write after read completes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend prepared statements with decay columns | b6da244 | packages/core/src/statements.ts |
| 2 | Integrate decay scoring and lazy write into recallKnowledge and queryEntities | ff7f559 | packages/mcp-server/src/tools.ts |

## What Was Built

**Task 1 — Prepared statements extended (packages/core/src/statements.ts):**
- `knnSearchObservations`: added `o.last_accessed_at`, `o.decay_exempt`, `o.reinforcement_count` to SELECT
- `ftsSearchObservations`: same three columns added after `o.confidence`
- `selectObservationsByEntityId`: added the three decay columns to SELECT
- `selectAllObservationsByEntityId`: added the three decay columns to SELECT
- `knnSearchForContradiction` and `knnSearchForRelationships` left unchanged (internal write-path helpers)

**Task 2 — Decay integration in tools.ts (packages/mcp-server/src/tools.ts):**
- Import: `computeEffectiveConfidence` and `DECAY_EXEMPT_TYPES` imported from `@myco/core`
- `RecallRow` interface: added `last_accessed_at: string | null`, `decay_exempt: number`, `reinforcement_count: number`
- `QueryObservationRow` interface: same three fields added
- Dynamic KNN and FTS inline queries: `o.last_accessed_at, o.decay_exempt, o.reinforcement_count` added to SELECT
- **Semantic path**: `computeEffectiveConfidence` called per row, KNN distance inverted via `Math.max(0, 1 - r.relevance_score)`, `final_score = similarity * effective_confidence`, results re-sorted descending
- **FTS path**: same pattern, FTS rank negated via `-r.relevance_score` to get positive similarity score
- **Both paths**: lazy batch `UPDATE observations SET last_accessed_at = ? WHERE id IN (...)` after read, wrapped in try/catch, guarded by `scoredRows.length > 0`
- **queryEntities**: `effective_confidence` computed and included as informational field on each observation; `allReturnedObsIds` collected across all entity loops; single batch `last_accessed_at` UPDATE before return
- Recall results now expose `effective_confidence` alongside base `confidence` in JSON output

## Decisions Made

1. **DECAY-03 implementation**: `final_score = similarity * effective_confidence` — the product of geometric similarity and importance decay provides a single ranking signal that naturally demotes both irrelevant and stale observations
2. **Lazy write placement**: `last_accessed_at` UPDATE runs after the read and scoring complete — DECAY-02 satisfied (no write overhead in hot path; reads never block on write)
3. **STMT-02 exception on lazy write**: placeholder count varies with result set size so `db.prepare()` is called inline — consistent with existing STMT-02 pattern for dynamic WHERE
4. **Empty result guard**: `if (scoredRows.length > 0)` prevents `IN ()` SQL syntax error on empty result sets — this was an explicit `must_haves.truths` requirement

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

- `packages/mcp-server/tests/decay.test.ts`: 10/10 passed
- `packages/mcp-server/tests/recall-filters.test.ts`: 10/10 passed
- `packages/mcp-server/tests/temporal-query.test.ts`: 10/10 passed
- Full suite: 147/147 passed (10 test files)

## Known Stubs

None. All fields are wired from real DB data.

## Self-Check: PASSED

- `packages/core/src/statements.ts` — modified, exists
- `packages/mcp-server/src/tools.ts` — modified, exists
- Commit `b6da244` — exists (Task 1)
- Commit `ff7f559` — exists (Task 2)
- 147 tests passing
