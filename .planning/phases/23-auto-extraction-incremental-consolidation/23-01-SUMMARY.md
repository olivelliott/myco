---
phase: 23-auto-extraction-incremental-consolidation
plan: "01"
subsystem: core/mcp-server
tags: [consolidation, locking, micro-consolidation, auto-extraction, migrations]
dependency_graph:
  requires: []
  provides:
    - consolidation_lock table (migration 010)
    - acquireLock / releaseLock functions
    - runMicroConsolidation pipeline
    - auto_extracted SourceType
  affects:
    - packages/mcp-server/src/consolidator.ts
    - packages/core/src/types.ts
    - packages/core/src/migrations.ts
tech_stack:
  added: []
  patterns:
    - singleton-row mutex via INSERT OR IGNORE with 5-min expiry recovery
    - try/finally lock release pattern
    - episode-scoped fact extraction routed to approval queue
key_files:
  created: []
  modified:
    - packages/core/src/types.ts
    - packages/core/src/migrations.ts
    - packages/mcp-server/src/consolidator.ts
decisions:
  - "All auto-extracted facts unconditionally route to approval queue — no auto-approve threshold (per locked v5.0 research decision)"
  - "acquireLock uses INSERT OR IGNORE for atomic check-and-set; stale lock expiry is 5 minutes"
  - "runMicroConsolidation does not call rememberEntity, detectContradiction, or findMergeCandidates — those are nightly-only operations (CONSOL-03)"
  - "Lock always released in finally block — crash safety via expiry threshold"
metrics:
  duration: "98s"
  completed: "2026-03-29T15:18:48Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 23 Plan 01: Lock Infrastructure and Micro-Consolidation Pipeline Summary

**One-liner:** Singleton-row consolidation mutex (INSERT OR IGNORE, 5-min expiry) and micro-consolidation pipeline routing all auto-extracted facts to approval queue via try/finally lock discipline.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add SourceType extension and consolidation_lock migration | b83c449 | packages/core/src/types.ts, packages/core/src/migrations.ts |
| 2 | Implement acquireLock, releaseLock, runMicroConsolidation | 7ee6b1a | packages/mcp-server/src/consolidator.ts |

## What Was Built

### SourceType Extension (packages/core/src/types.ts)

Extended the `SourceType` union to include `'auto_extracted'` — the provenance marker for all facts produced by the micro-consolidation pipeline.

### Migration 010 (packages/core/src/migrations.ts)

Added `010_consolidation_lock` migration creating a singleton-row mutex table:

```sql
CREATE TABLE IF NOT EXISTS consolidation_lock (
  id         TEXT PRIMARY KEY DEFAULT 'singleton',
  locked_at  TEXT NOT NULL,
  locked_by  TEXT NOT NULL DEFAULT 'unknown'
)
```

The table holds at most one row (`id = 'singleton'`). `locked_at` enables 5-minute expiry recovery after crashes. `locked_by` tracks `'micro'` vs `'nightly'` contention.

### Lock Functions (packages/mcp-server/src/consolidator.ts)

**`acquireLock(db, lockedBy)`** — atomic check-and-set:
1. Deletes stale rows where `locked_at < now - 5 min` (crash recovery)
2. `INSERT OR IGNORE` the singleton row
3. Returns `result.changes === 1` (true = acquired, false = held)

**`releaseLock(db)`** — removes the singleton row unconditionally.

### `runMicroConsolidation(db, stmts, episodeId)`

Episode-scoped fact extraction pipeline:
1. Acquires lock as `'micro'` — backs off silently if already held
2. Fetches the single episode by ID
3. Calls `extractFacts([episodeText])` — reuses existing LLM extraction
4. Routes ALL extracted facts to approval queue with `reason = 'auto_extracted'`
5. Marks episode as consolidated (`consolidated_at = now`)
6. Releases lock in `finally` block — always runs even on error

**Critical constraints met:**
- No `rememberEntity` calls — all items go to approval queue
- No `detectContradiction` calls — nightly-only operation
- No `findMergeCandidates` calls — nightly-only operation

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan creates infrastructure only. The `runMicroConsolidation` function is complete but not yet wired to any trigger point. Plan 02 will integrate it into the `log_episode` tool hook.

## Self-Check: PASSED

- `packages/core/src/types.ts` — FOUND: contains `auto_extracted`
- `packages/core/src/migrations.ts` — FOUND: contains `010_consolidation_lock`
- `packages/mcp-server/src/consolidator.ts` — FOUND: exports `acquireLock`, `releaseLock`, `runMicroConsolidation`
- Commit b83c449 — FOUND
- Commit 7ee6b1a — FOUND
- Pre-existing TypeScript errors in `format-adapters.ts` and `tools.ts` are from Phase 22 (missing barrel exports) — not introduced by this plan
