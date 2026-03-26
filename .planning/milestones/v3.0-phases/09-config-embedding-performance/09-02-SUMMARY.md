---
phase: 09-config-embedding-performance
plan: 02
subsystem: mcp-server/embedding
tags: [performance, embedding, ollama, singleton, batch, resilience]
dependency_graph:
  requires: []
  provides: [singleton-embed-client, health-cooldown, batch-embedding, batch-reembed]
  affects: [mcp-server/tools, mcp-server/consolidator]
tech_stack:
  added: []
  patterns: [singleton-module-state, health-cooldown-pattern, promise-race-timeout, batch-with-sequential-fallback]
key_files:
  created: []
  modified:
    - packages/mcp-server/src/embed-client.ts
    - packages/mcp-server/src/tools.ts
key_decisions:
  - "Used Promise.race for per-call timeouts instead of Ollama client fetch override — avoids needing two client instances for different timeouts"
  - "MAX_BATCH_SIZE=50 cap in embedBatch prevents oversized batch requests"
  - "On batch failure, fall back to sequential embedText calls rather than failing entirely — partial success is better than total failure"
  - "reEmbedPending now skips null embeddings (continue) instead of breaking early — allows partial success when batch falls back to sequential"
metrics:
  duration: 111s
  completed: "2026-03-25"
  tasks_completed: 2
  files_modified: 2
---

# Phase 09 Plan 02: Embedding Client Overhaul Summary

Singleton Ollama client with 30s health cooldown and batch embedding API replacing per-row embedText loop in reEmbedPending.

## What Was Built

### embed-client.ts — Resilient Singleton with Health Cooldown and Batch API

The embedding client was completely rewritten with:

1. **Singleton client (EMBED-01):** One `new Ollama(...)` at module scope, reused across all calls. No per-call client creation overhead.

2. **Health cooldown (EMBED-02):** Module-level `lastFailureMs` tracks the last Ollama failure. `isHealthy()` returns false for 30 seconds after any error. `markUnhealthy()` sets the timestamp and logs. Fast-fail returns `null` immediately without hitting Ollama.

3. **Timeout via Promise.race:** `withTimeout<T>()` races the embed promise against a rejection timer — 2s for single calls, 10s for batch.

4. **embedBatch() (EMBED-03):** Sends `string[]` to Ollama's `embed({ input: string[] })` API in a single HTTP call. Falls back to sequential `embedText()` calls on batch error (partial success preserved).

5. **embedText signature unchanged** — consolidator.ts and all other callers remain unaffected.

### tools.ts — reEmbedPending Batch Refactor (EMBED-04)

- Import updated to include `embedBatch`
- `reEmbedPending` now: fetches all pending rows → collects texts with `rows.map(r => r.content)` → calls `embedBatch(texts)` once → iterates results, skipping nulls with `continue` (not `break`)
- INSERT and UPDATE statements prepared once outside the loop
- RE_EMBED_BATCH_SIZE remains 50

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Test Results

- 71/72 tests passing
- 1 pre-existing failure in `server.test.ts` line 246: `expected "semantic" to be "fts"` — this test was failing before this plan's changes (confirmed via git stash verification). Scope: out of scope for this plan.

## Self-Check

Files exist:
- packages/mcp-server/src/embed-client.ts — FOUND
- packages/mcp-server/src/tools.ts — FOUND

Commits:
- c3716b4: feat(09-02): rewrite embed-client with singleton, health cooldown, and batch API
- 9110df6: feat(09-02): update reEmbedPending to use batch embedding
