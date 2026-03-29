---
phase: 23-auto-extraction-incremental-consolidation
verified: 2026-03-27T11:30:00Z
status: gaps_found
score: 13/15 must-haves verified
re_verification: false
gaps:
  - truth: "Tests reflect 10 migrations after migration 010 was added"
    status: failed
    reason: "migrations.test.ts and db.test.ts hardcode the expected migration count as 9; migration 010 was added in Phase 23 but tests were not updated, causing 4 test failures"
    artifacts:
      - path: "packages/core/tests/migrations.test.ts"
        issue: "Lines 38, 81, 175 assert expect(count.cnt).toBe(9) — should be 10"
      - path: "packages/core/tests/db.test.ts"
        issue: "Line 253 asserts expect(result.cnt).toBe(9) — should be 10"
    missing:
      - "Update all 4 toBe(9) assertions to toBe(10) in migrations.test.ts and db.test.ts"
      - "Update test name on line 34 of migrations.test.ts: '9 rows' -> '10 rows'"
      - "Update test name on line 76 of migrations.test.ts: '9 rows' -> '10 rows'"
      - "Update test name on line 248 of db.test.ts: '9 applied migrations' -> '10 applied migrations'"
---

# Phase 23: Auto-Extraction and Incremental Consolidation Verification Report

**Phase Goal:** Every log_episode call passively captures entities and relationships from the conversation context via LLM extraction without blocking the response, and high-confidence episodes trigger a micro-consolidation immediately rather than waiting for the nightly 2am cycle.
**Verified:** 2026-03-27T11:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | SourceType union includes 'auto_extracted' | VERIFIED | `packages/core/src/types.ts` line 1 — union literal present |
| 2  | consolidation_lock table is created by migration 010 | VERIFIED | `packages/core/src/migrations.ts` lines 183-193 — CREATE TABLE IF NOT EXISTS consolidation_lock with id, locked_at, locked_by |
| 3  | acquireLock returns true on first call and false on second concurrent call | VERIFIED | Uses `INSERT OR IGNORE`; `result.changes === 1` — atomically claims the singleton row; second call finds existing row and returns false |
| 4  | releaseLock removes the lock row so next acquireLock succeeds | VERIFIED | `DELETE FROM consolidation_lock WHERE id = 'singleton'` |
| 5  | runMicroConsolidation extracts facts from a single episode and inserts them to approval queue with reason 'auto_extracted' | VERIFIED | consolidator.ts lines 207-272 — calls `extractFacts([episodeText])`, loops facts into `insertApprovalQueueItem.run(...)` with `'auto_extracted'` as reason |
| 6  | runMicroConsolidation does NOT call rememberEntity, detectContradiction, or findMergeCandidates | VERIFIED | grep over function body returns no matches for any of the three functions |
| 7  | runMicroConsolidation marks the episode as consolidated | VERIFIED | `UPDATE episodes SET consolidated_at = ? WHERE id = ?` at line 264 |
| 8  | runMicroConsolidation acquires and releases the lock via try/finally | VERIFIED | `try { ... } finally { releaseLock(db); }` at lines 218-271 |
| 9  | If lock is already held, runMicroConsolidation backs off silently | VERIFIED | Lines 213-216: `if (!acquired) { console.error(...); return; }` |
| 10 | logEpisode returns its response immediately, before extraction begins | VERIFIED | `setImmediate(...)` fires after the `return` statement at line 586 — the return executes before the setImmediate callback |
| 11 | After logEpisode, a setImmediate callback invokes the registered episode callback | VERIFIED | memory-ops.ts lines 578-584 — `if (onEpisodeLogged) { setImmediate(() => { onEpisodeLogged!(id).catch(...) }); }` |
| 12 | registerEpisodeCallback is exported from @myco/core and called in MCP server startup | VERIFIED | index.ts (core) line 24 exports it; mcp-server/index.ts line 6 imports and line 32 calls it |
| 13 | The nightly consolidation cron wraps runConsolidation with acquireLock/releaseLock | VERIFIED | scheduler.ts lines 22-35 — `acquireLock(db, 'nightly')`, try/finally with `releaseLock(db)` |
| 14 | If nightly lock acquisition fails (micro holds lock), the nightly run backs off and logs a warning | VERIFIED | scheduler.ts lines 23-26: `if (!acquired) { console.error('[consolidation] nightly run skipped — lock held by another process'); return; }` |
| 15 | Tests reflect 10 migrations after migration 010 was added | FAILED | migrations.test.ts lines 38, 81, 175 and db.test.ts line 253 all assert `.toBe(9)` — 4 tests failing with "expected 9, received 10" |

**Score:** 14/15 truths verified (1 failed — test suite not updated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/types.ts` | Extended SourceType with 'auto_extracted' | VERIFIED | Line 1: `'auto_extracted'` present in union |
| `packages/core/src/migrations.ts` | Migration 010 creating consolidation_lock table | VERIFIED | `010_consolidation_lock` at lines 183-193 |
| `packages/mcp-server/src/consolidator.ts` | acquireLock, releaseLock, runMicroConsolidation exports | VERIFIED | All three exported at lines 172, 190, 207 |
| `packages/core/src/memory-ops.ts` | registerEpisodeCallback export + setImmediate fire-and-forget | VERIFIED | Lines 19-21 export; lines 578-584 setImmediate |
| `packages/core/src/index.ts` | registerEpisodeCallback re-export | VERIFIED | Line 24 includes registerEpisodeCallback |
| `packages/mcp-server/src/scheduler.ts` | Lock-wrapped nightly consolidation | VERIFIED | acquireLock + try/finally at lines 22-35 |
| `packages/mcp-server/src/index.ts` | Callback registration wiring micro-consolidation to logEpisode | VERIFIED | Lines 32-33: `registerEpisodeCallback(...)` |
| `packages/core/tests/migrations.test.ts` | Test assertions reflect 10 migrations | STUB | Hardcodes `9` in 3 places; migration 010 not accounted for |
| `packages/core/tests/db.test.ts` | Test assertions reflect 10 migrations | STUB | Hardcodes `9` in 1 place |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/mcp-server/src/consolidator.ts` | consolidation_lock table | acquireLock INSERT OR IGNORE | WIRED | Line 181: `INSERT OR IGNORE INTO consolidation_lock ...` |
| `packages/mcp-server/src/consolidator.ts` | approval_queue table | stmts.insertApprovalQueueItem.run | WIRED | Line 252: `stmts.insertApprovalQueueItem.run(...)` |
| `packages/core/src/memory-ops.ts` | runMicroConsolidation | registerEpisodeCallback → onEpisodeLogged | WIRED | setImmediate fires `onEpisodeLogged!(id)` which is bound to runMicroConsolidation at server startup |
| `packages/mcp-server/src/index.ts` | packages/core/src/memory-ops.ts | registerEpisodeCallback import + call | WIRED | Line 6 imports, line 32 calls `registerEpisodeCallback((episodeId) => runMicroConsolidation(db, stmts, episodeId))` |
| `packages/mcp-server/src/scheduler.ts` | packages/mcp-server/src/consolidator.ts | acquireLock/releaseLock wrapping runConsolidation | WIRED | Line 4 imports both; lines 22 and 34 call them around runConsolidation |

### Data-Flow Trace (Level 4)

Not applicable — Phase 23 artifacts are pipeline components and callbacks, not UI components rendering dynamic data. All data flows are verified via key links above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Core builds cleanly | `npx tsup ... --format esm` | `Build success in 52ms` | PASS |
| mcp-server TypeScript compiles | `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` | No output (clean) | PASS |
| Test suite runs (non-migration tests) | `npx vitest run` | 143/147 pass | PARTIAL — 4 migration count tests fail |
| Commits exist | `git log --oneline` | b83c449, 7ee6b1a, e6004b3, b59ee50 all confirmed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EXTRACT-01 | 23-01 | System passively extracts entities and relationships from conversation context via LLM | SATISFIED | `runMicroConsolidation` calls `extractFacts([episodeText])` which calls Ollama LLM to extract structured facts from episode |
| EXTRACT-02 | 23-01, 23-02 | Extraction runs asynchronously (fire-and-forget) and never blocks the MCP tool response | SATISFIED | `logEpisode` uses `setImmediate` — callback fires after current event loop tick, return statement executes first |
| EXTRACT-03 | 23-01 | All auto-extracted items route through the approval queue before becoming permanent | SATISFIED | `runMicroConsolidation` routes ALL facts to `insertApprovalQueueItem` with `reason='auto_extracted'`; no direct writes to knowledge graph |
| CONSOL-01 | 23-01, 23-02 | Episodes consolidated on-the-fly after log_episode, not just nightly | SATISFIED | Every `logEpisode` call triggers `runMicroConsolidation` via registered callback |
| CONSOL-02 | 23-01, 23-02 | Consolidation lock prevents race conditions between incremental and nightly | SATISFIED | Singleton-row mutex via `INSERT OR IGNORE`; 5-minute expiry for crash recovery; both micro and nightly paths use `acquireLock`/`releaseLock` |
| CONSOL-03 | 23-01 | Nightly cycle performs deeper analysis (contradiction detection, merge) beyond incremental | SATISFIED | `runMicroConsolidation` explicitly does NOT call `detectContradiction` or `findMergeCandidates`; these remain exclusive to `runConsolidation` |

All 6 requirements are satisfied by the implementation.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/core/tests/migrations.test.ts` | 38, 81, 175 | `.toBe(9)` hardcoded migration count | BLOCKER | 3 tests fail; CI would reject this |
| `packages/core/tests/db.test.ts` | 253 | `.toBe(9)` hardcoded migration count | BLOCKER | 1 test fails; CI would reject this |

No stubs, placeholder implementations, or hollow wiring found in the production code. The failures are exclusively in test assertions that were not updated when migration 010 was added.

### Human Verification Required

None — all automated checks are conclusive. The gap is a deterministic test assertion update.

### Gaps Summary

The phase goal is fully achieved in production code. All 6 requirements are implemented and wired correctly. The single gap is a mechanical test maintenance issue: when `010_consolidation_lock` was added to the MIGRATIONS array, four test assertions that hardcode the expected migration row count (`9`) were not updated to `10`.

**Root cause:** `packages/core/tests/migrations.test.ts` (3 tests) and `packages/core/tests/db.test.ts` (1 test) assert the migration count numerically. Neither was updated after Plan 01 added the 10th migration.

**Fix:** Update all four `toBe(9)` calls to `toBe(10)` and update the test description strings to say "10" instead of "9".

This does not indicate a problem with the migration itself or the lock infrastructure — the consolidation_lock table is correctly created when migrations run, as confirmed by the 10 rows being found (not 9).

---

_Verified: 2026-03-27T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
