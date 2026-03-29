---
phase: 21-memory-importance-decay
verified: 2026-03-27T19:03:30Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 21: Memory Importance Decay — Verification Report

**Phase Goal:** Recall results account for how recently and how often a fact has been accessed, so stale unreinforced memories rank lower than actively reinforced ones — without any write overhead in the hot path
**Verified:** 2026-03-27T19:03:30Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | computeEffectiveConfidence returns base confidence unchanged for decay-exempt entities | VERIFIED | `packages/core/src/decay.ts:64` — `if (decayExempt) { return confidence; }` |
| 2 | computeEffectiveConfidence returns a decayed value lower than base confidence for non-exempt entities not accessed in 30+ days | VERIFIED | Exponential formula at line 79: `confidence * Math.exp(-LAMBDA * daysSinceAccess)`. Test 4 asserts ~0.407 for 30 days at confidence=1.0 and passes. |
| 3 | Reinforcement count boosts effective confidence but never exceeds base confidence | VERIFIED | `decay.ts:81` — `Math.min(confidence, decayed + boost)`. Test 5 confirms cap at base. |
| 4 | Effective confidence never drops below 0.1 floor | VERIFIED | `decay.ts:83` — `Math.max(FLOOR, effective)`. Test 6 confirms floor=0.1 after 365-day extreme decay. |
| 5 | The function is pure — takes only scalar inputs, no DB handle | VERIFIED | `decay.ts` has no imports from `better-sqlite3` or any database module; params are all scalars/primitives. |
| 6 | Recall results include effective_confidence field alongside base confidence | VERIFIED | `tools.ts:339,421` — `effective_confidence: r.effective_confidence` in both semantic and FTS result maps |
| 7 | Recall results are re-sorted by final_score (similarity * effective_confidence) so stale memories rank lower | VERIFIED | `tools.ts:313` and `tools.ts:395` — `scoredRows.sort((a, b) => b.final_score - a.final_score)` in both paths |
| 8 | KNN distance is inverted to similarity before multiplying by effective_confidence | VERIFIED | `tools.ts:308` — `Math.max(0, 1 - r.relevance_score)` |
| 9 | FTS rank is negated before multiplying by effective_confidence | VERIFIED | `tools.ts:390` — `const similarity = -r.relevance_score` |
| 10 | last_accessed_at is updated for all observation IDs returned by recall (lazy write, best-effort) | VERIFIED | `tools.ts:316-328` (semantic) and `tools.ts:398-410` (FTS) — both guarded by length>0, wrapped in try/catch |
| 11 | queryEntities observations include effective_confidence as an informational field | VERIFIED | `tools.ts:511-521` — computeEffectiveConfidence called per obs row, result added to base object |
| 12 | Decay-exempt entities return base confidence unchanged in recall results | VERIFIED | `tools.ts:302` — `decayExempt: DECAY_EXEMPT_TYPES.has(r.entity_type)` feeds into pure function exempt bypass |
| 13 | Empty result sets do not trigger a last_accessed_at UPDATE (avoids SQL syntax error) | VERIFIED | `tools.ts:316` and `tools.ts:398` — `if (scoredRows.length > 0)` / `if (scoredRowsFts.length > 0)` guard; `tools.ts:535` same guard on queryEntities |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/decay.ts` | computeEffectiveConfidence pure function and DECAY_EXEMPT_TYPES constant | VERIFIED | 85 lines. Exports both symbols. No DB imports. LAMBDA=0.03, FLOOR=0.1, REINFORCEMENT_WEIGHT=0.1, DEFAULT_DAYS_NOT_ACCESSED=30. |
| `packages/mcp-server/tests/decay.test.ts` | Unit tests for decay function | VERIFIED | 144 lines (min_lines=40 requirement met). 10 tests covering all specified behaviors. |
| `packages/core/src/statements.ts` | Extended KNN and FTS prepared statements with decay columns | VERIFIED | `last_accessed_at`, `decay_exempt`, `reinforcement_count` added to knnSearchObservations, ftsSearchObservations, selectObservationsByEntityId, selectAllObservationsByEntityId. Internal helpers (knnSearchForContradiction, knnSearchForRelationships) correctly left unchanged. |
| `packages/mcp-server/src/tools.ts` | Decay integration in recallKnowledge and queryEntities | VERIFIED | computeEffectiveConfidence imported and called in both semantic and FTS paths. RecallRow and QueryObservationRow interfaces updated. Lazy write implemented in all three result paths. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/core/src/index.ts` | `packages/core/src/decay.ts` | re-export | VERIFIED | Line 8: `export { computeEffectiveConfidence, DECAY_EXEMPT_TYPES } from './decay.js';` |
| `packages/mcp-server/src/tools.ts` | `packages/core/src/decay.ts` | import from @myco/core | VERIFIED | Line 4: `import { generateSessionId, buildProvenance, computeEffectiveConfidence, DECAY_EXEMPT_TYPES } from '@myco/core';` |
| `packages/mcp-server/src/tools.ts` | `packages/core/src/statements.ts` | knnSearchObservations returns decay columns | VERIFIED | `last_accessed_at` appears in statements.ts knnSearchObservations SELECT; RecallRow interface declares the field |
| `packages/mcp-server/src/tools.ts` | observations table | lazy batch UPDATE last_accessed_at after recall | VERIFIED | `UPDATE observations SET last_accessed_at = ? WHERE id IN (${placeholders})` present in all three result paths |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `tools.ts` recallKnowledge (semantic) | effective_confidence | `computeEffectiveConfidence` called with DB row values for confidence, last_accessed_at, decay_exempt, reinforcement_count | Yes — all inputs sourced from live DB rows returned by knnSearchObservations prepared statement | FLOWING |
| `tools.ts` recallKnowledge (FTS) | effective_confidence | Same as above via ftsSearchObservations | Yes | FLOWING |
| `tools.ts` queryEntities | effective_confidence | computeEffectiveConfidence called with selectObservationsByEntityId row values | Yes — obs rows from real DB query | FLOWING |
| `tools.ts` recallKnowledge | last_accessed_at (lazy write) | Batch UPDATE after read, IDs from scored rows | Yes — IDs populated from real query results | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 147 tests pass (decay unit tests + recall integration + temporal query) | `npx vitest run` | 10 test files, 147 tests passed, 0 failed | PASS |
| decay.ts exports computeEffectiveConfidence | grep check | Line 59: `export function computeEffectiveConfidence` | PASS |
| decay.ts exports DECAY_EXEMPT_TYPES | grep check | Line 27: `export const DECAY_EXEMPT_TYPES = new Set<string>([...])` | PASS |
| core re-exports decay symbols | grep check | Line 8 of index.ts confirmed | PASS |
| tools.ts imports from @myco/core | grep check | Line 4 confirmed | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DECAY-01 | 21-01 | Observation importance score decays over time based on age and reinforcement frequency | SATISFIED | `computeEffectiveConfidence` implements exponential decay (LAMBDA=0.03) with reinforcement boost. 10 unit tests verify the algorithm. |
| DECAY-02 | 21-01, 21-02 | Decay is computed lazily at read time (not stored, no write-path overhead) | SATISFIED | Pure function with no DB handle. Integrated into recall at read time. Lazy `last_accessed_at` write runs after read completes, wrapped in try/catch (best-effort). |
| DECAY-03 | 21-02 | Recall results factor in importance decay when ranking | SATISFIED | `final_score = similarity * effective_confidence` used to re-sort both semantic and FTS result sets. Exposed in output JSON. |

Note: REQUIREMENTS.md traceability table (lines 94-96) still shows DECAY-01/02/03 as "Pending" — this is a documentation inconsistency only. The requirement descriptions at lines 55-57 are marked `[x]` (complete). The implementation satisfies all three requirements. Updating the traceability table status to "Complete" is recommended but is not a gap that blocks goal achievement.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODOs, FIXMEs, placeholders, or hollow implementations found in phase-modified files.

---

### Human Verification Required

None. All behaviors are mechanically verifiable:
- Decay algorithm is a deterministic pure function with injectable time, fully covered by unit tests.
- Wiring from DB rows through scoring to output JSON is confirmed by static analysis.
- Test suite (147/147) provides behavioral confidence across all three paths (semantic, FTS, queryEntities).

---

### Gaps Summary

No gaps. All 13 observable truths verified, all 4 artifacts substantive and wired, all 3 key links confirmed, all 3 requirement IDs satisfied. Full test suite passes.

---

_Verified: 2026-03-27T19:03:30Z_
_Verifier: Claude (gsd-verifier)_
