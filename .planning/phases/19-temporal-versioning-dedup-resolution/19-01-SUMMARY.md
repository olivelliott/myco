---
phase: 19-temporal-versioning-dedup-resolution
plan: "01"
subsystem: core + mcp-server
tags: [dedup, temporal, classification, sqlite-vec, prepared-statements]
dependency_graph:
  requires: [phase-18-migrations]
  provides: [DedupClassification, ClassificationResult, classifyObservation, retireObservation, selectObservationsByEntityForDedup, insertObservationTemporal]
  affects: [mcp-server/tools.ts (plan 02 wires these in)]
tech_stack:
  added: []
  patterns: [TDD red-green, sqlite-vec Euclidean distance on unit vectors]
key_files:
  created:
    - packages/mcp-server/src/dedup-resolver.ts
    - packages/mcp-server/tests/dedup-resolver.test.ts
  modified:
    - packages/core/src/statements.ts
    - packages/core/src/types.ts
    - packages/core/src/index.ts
    - packages/core/tests/statements.test.ts
decisions:
  - "sqlite-vec returns Euclidean distance between normalized vectors, not cosine distance — thresholds corrected to NOOP<0.40, UPDATE<0.84 (equivalent to cosine 0.08 and 0.35)"
  - "retireObservation is a pure sync function (no async) — SQL UPDATE is synchronous in better-sqlite3"
  - "Ollama-down fallback: exact string match for NOOP, ADD otherwise — avoids data loss at the cost of possible rare duplicate"
metrics:
  duration: "5m 3s"
  completed: "2026-03-27"
  tasks_completed: 2
  files_changed: 6
---

# Phase 19 Plan 01: Dedup/Temporal Prepared Statements and Classifier Summary

**One-liner:** Dedup classification engine (ADD/UPDATE/NOOP via sqlite-vec Euclidean distance) with temporal retirement SQL and corrected distance thresholds for the actual sqlite-vec metric.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add dedup/temporal prepared statements to core | abdd9fc | statements.ts, types.ts, index.ts, statements.test.ts |
| 2 | Build dedup-resolver module with classification logic | cb04b57 | dedup-resolver.ts, dedup-resolver.test.ts |

## What Was Built

### packages/core/src/types.ts
- `DedupClassification` type: `'ADD' | 'UPDATE' | 'NOOP'`
- `ClassificationResult` interface with `classification`, `superseded_observation_id?`, and `reason` fields

### packages/core/src/statements.ts (4 new statements)
- `selectObservationsByEntityForDedup` — fetches current (valid_until IS NULL) observations for an entity
- `retireObservation` — UPDATE observations SET valid_until = ? WHERE id = ?
- `insertObservationTemporal` — INSERT with valid_from parameter (application-generated timestamp)
- `insertObservationTemporalWithEmbeddingFlag` — same with needs_embedding = 1

### packages/mcp-server/src/dedup-resolver.ts
- `classifyObservation(db, stmts, entityId, content)` — async, returns ClassificationResult
- `retireObservation(stmts, observationId, retiredAt)` — sync, sets valid_until
- Classification algorithm: fetch existing → embed → KNN search → apply thresholds
- Ollama-down fallback: exact string match (NOOP) or ADD (safe default)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected distance thresholds for sqlite-vec metric**
- **Found during:** Task 2 GREEN phase (1 test failing — UPDATE path returning ADD)
- **Issue:** The plan specified NOOP_THRESHOLD=0.08 and UPDATE_THRESHOLD=0.35 as "cosine distance" values, but sqlite-vec returns Euclidean distance between normalized unit vectors (`sqrt(2 * cosine_dist)`). The UPDATE-range test vector produced distance 0.518, which exceeded the 0.35 threshold and incorrectly classified as ADD.
- **Fix:** Converted thresholds to Euclidean equivalents: NOOP<0.40 (was 0.08), UPDATE<0.84 (was 0.35). These are semantically identical — cosine_dist 0.08 → euclidean 0.40, cosine_dist 0.35 → euclidean 0.84.
- **Files modified:** packages/mcp-server/src/dedup-resolver.ts
- **Commit:** cb04b57

## Verification Results

1. `npx tsc --noEmit -p packages/core/tsconfig.json` — PASSED (no type errors)
2. `npx vitest run packages/mcp-server/tests/dedup-resolver.test.ts` — 8/8 PASSED
3. `npx vitest run packages/mcp-server/tests/server.test.ts` — 30/30 PASSED (no regressions)
4. All 4 new statements present in statements.ts — VERIFIED
5. DedupClassification and ClassificationResult types present in types.ts — VERIFIED

## Known Stubs

None — all logic is wired to real SQLite queries. The module is intentionally NOT yet integrated into `rememberEntity` (that is Plan 02's scope).

## Self-Check: PASSED

Files verified:
- packages/mcp-server/src/dedup-resolver.ts — exists
- packages/mcp-server/tests/dedup-resolver.test.ts — exists
- packages/core/src/statements.ts — updated with 4 new statements
- packages/core/src/types.ts — updated with DedupClassification, ClassificationResult

Commits verified:
- abdd9fc — feat(19-01): add dedup/temporal prepared statements and types
- cb04b57 — feat(19-01): build dedup-resolver module with classification and retirement logic
