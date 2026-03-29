---
phase: 19-temporal-versioning-dedup-resolution
verified: 2026-03-27T18:10:00Z
status: passed
score: 11/11 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 8/11
  gaps_closed:
    - "Calling recall without as_of returns only current observations (valid_until IS NULL) — backward compatible"
    - "Calling query with history=true returns all observation versions including superseded ones"
    - "KNN and FTS search results exclude retired observations when as_of is not specified"
  gaps_remaining: []
  regressions: []
---

# Phase 19: Temporal Versioning + Dedup Resolution — Verification Report

**Phase Goal:** Facts carry version history so the graph is never silently overwritten, and every incoming memory is classified as a new addition, an update to an existing fact, or a duplicate before it is committed.
**Verified:** 2026-03-27T18:10:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (dist rebuild)

## Gap Closure Summary

Previous verification found one root cause: `packages/core/dist/statements.js` was stale — compiled at 17:43, before plan 03 committed source changes at 17:58. The gap required no source code changes. The dist has been rebuilt (timestamps: 2026-03-27T18:09). All 137 tests now pass.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Same observation submitted twice does NOT create a duplicate row (NOOP) | VERIFIED | `dedup.ts:61-65` exact-match logic; 10 dedup tests pass |
| 2 | Semantically similar but reworded observation retires old and inserts new (UPDATE) | VERIFIED | `dedup.ts:67-92` near-dup KNN; `tools.ts:132-146` atomic transaction; tests pass |
| 3 | Brand new observations inserted with valid_from set to current timestamp | VERIFIED | `tools.ts:149-152` ADD path passes `now` as valid_from; `statements.ts:128-133` SQL includes valid_from |
| 4 | Retire+insert for UPDATE classification happens atomically in a single transaction | VERIFIED | `tools.ts:134-141` — `db.transaction()` wraps retireObservation + insertObservation + insertFtsObservation |
| 5 | After approving a merge, source entity stays in DB with merged_into set | VERIFIED | `tools.ts:943-944` — `UPDATE entities SET merged_into = ? WHERE id = ?` inside transaction |
| 6 | After merge, source entity's observations remain on source entity_id | VERIFIED | `tools.ts` merge block: updateObservationEntityId removed; observations stay on secondaryId |
| 7 | After merge, source entity's relationships are re-pointed to primary | VERIFIED | `tools.ts:939-940` — updateRelationshipFromId + updateRelationshipToId called in merge block |
| 8 | Calling recall with as_of returns only observations valid at that timestamp | VERIFIED | `tools.ts:225-229` dynamic WHERE: `valid_from <= ?` AND `(valid_until IS NULL OR valid_until > ?)` |
| 9 | Calling recall without as_of returns only current observations (backward compatible) | VERIFIED | `dist/chunk-U67A6NFO.js:41` — `AND valid_until IS NULL` present in compiled selectObservationsByEntityId; 2/2 tests pass |
| 10 | Calling query with history=true returns all versions including superseded ones | VERIFIED | `dist/chunk-U67A6NFO.js:43` — `selectAllObservationsByEntityId` present in compiled dist; 15/15 temporal tests pass |
| 11 | KNN and FTS search results exclude retired observations (default path) | VERIFIED | `dist/chunk-U67A6NFO.js:84,98,131` — all three JOIN conditions include `AND o.valid_until IS NULL`; tests pass |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp-server/src/dedup.ts` | classifyObservation, retireObservation, ClassificationResult, NEAR_DUP_DISTANCE_THRESHOLD | VERIFIED | All 4 exports present; NEAR_DUP_DISTANCE_THRESHOLD = 0.08; 111 lines |
| `packages/mcp-server/tests/dedup.test.ts` | Unit tests for classification pipeline, min 50 lines | VERIFIED | 197 lines, 10 tests — all pass |
| `packages/core/src/statements.ts` | insertObservation with valid_from, selectAllObservationsByEntityId, valid_until IS NULL filters | VERIFIED | valid_from in INSERT (line 128/133), selectAllObservationsByEntityId (line 154), valid_until IS NULL on selectObservationsByEntityId/knnSearch/ftsSearch |
| `packages/mcp-server/src/tools.ts` | classifyObservation wired, as_of+history params, soft-delete merge | VERIFIED | Import on line 9; classification at line 124; as_of/history on recallKnowledge (line 214) and queryEntities (line 360); merged_into at line 943 |
| `packages/mcp-server/tests/temporal-query.test.ts` | Integration tests for temporal filtering, min 40 lines | VERIFIED | 234 lines, 15 tests — all 15 pass |
| `packages/core/dist/statements.js` (via chunk) | Compiled artifact reflecting all source changes | VERIFIED | Rebuilt 2026-03-27T18:09 — valid_until IS NULL on 3 statements, selectAllObservationsByEntityId present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tools.ts` | `dedup.ts` | `import { classifyObservation, retireObservation }` | VERIFIED | Line 9 |
| `tools.ts` | `statements.ts` | `insertObservation.run` with valid_from | VERIFIED | Lines 136-139 (UPDATE) and 149-152 (ADD) pass `now` as valid_from |
| `dedup.ts` | observations table | inline KNN query with `valid_until IS NULL` | VERIFIED | Lines 71-87 |
| `tools.ts (resolve_approval)` | entities table | `UPDATE entities SET merged_into` | VERIFIED | Line 943 |
| `tools.ts (queryEntities)` | observations table | `e.merged_into IS NULL` default filter | VERIFIED | Line 365 |
| `tools.ts (recallKnowledge)` | observations table | temporal WHERE `valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)` | VERIFIED | Lines 225-229 |
| `tools.ts (queryEntities)` | dist compiled statements | `selectObservationsByEntityId` with `valid_until IS NULL` | VERIFIED | Confirmed in rebuilt dist chunk at line 41 |

---

### Data-Flow Trace (Level 4)

Not applicable. This phase adds write-path classification and query-path filtering. There are no dynamic UI components rendering fetched data.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Dedup tests (classify + retire) | `npx vitest run packages/mcp-server/tests/dedup.test.ts` | 10/10 pass | PASS |
| Temporal query tests | `npx vitest run packages/mcp-server/tests/temporal-query.test.ts` | 15/15 pass | PASS |
| Full test suite | `npx vitest run` | 137/137 pass (9 test files) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TEMP-01 | 19-01 | Observations track valid_from and valid_until timestamps for fact versioning | SATISFIED | insertObservation SQL includes valid_from; retireObservation sets valid_until in dedup.ts:102-110 |
| TEMP-02 | 19-03 | User can query "what was true at time X" via recall/query tools with timestamp parameter | SATISFIED | as_of wired in tools.ts:214-229 and tools.ts:360-418; 15/15 temporal tests pass |
| TEMP-03 | 19-01 | Superseded observations are soft-retired (valid_until set) rather than deleted | SATISFIED | retireObservation() in dedup.ts:102-110; called in UPDATE path at tools.ts:135 |
| DEDUP-01 | 19-01 | When new memory conflicts with existing, system classifies as ADD/UPDATE/NOOP | SATISFIED | classifyObservation() in dedup.ts:45-96; wired into rememberEntity at tools.ts:124 |
| DEDUP-02 | 19-01 | UPDATE actions retire old observation (temporal) and insert new version | SATISFIED | tools.ts:132-146 atomic transaction: retireObservation + insertObservation |
| DEDUP-03 | 19-02 | Entity merges use soft-delete (merged_into column) so merges are reversible | SATISFIED | tools.ts:943-944 inline UPDATE SET merged_into; deleteEntityById removed from merge block |
| DEDUP-04 | 19-01 | Near-duplicate observations detected and deduplicated at write time | SATISFIED | dedup.ts:67-92 KNN query with NEAR_DUP_DISTANCE_THRESHOLD = 0.08 |

All 7 requirements satisfied.

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder patterns in source files. No empty handlers. No hardcoded stub returns. The previously-flagged stale dist is resolved.

---

### Human Verification Required

None.

---

### Gaps Summary

No gaps remain. The single root cause from the initial verification (stale `packages/core/dist/`) has been resolved by rebuilding the package. All source implementations were correct throughout; this was purely a build artifact issue.

---

_Verified: 2026-03-27T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
