---
phase: 02-mcp-server-memory
plan: 01
subsystem: mcp-server
tags: [embeddings, fts5, ollama, schema-migration, sqlite-vec]
dependency_graph:
  requires: [01-02]
  provides: [embed-client, fts5-schema, async-remember]
  affects: [packages/core/src/schema.ts, packages/mcp-server/src/tools.ts]
tech_stack:
  added: [ollama@0.6.3]
  patterns: [lazy-singleton, graceful-degradation, idempotent-migration, AbortSignal.timeout]
key_files:
  created:
    - packages/mcp-server/src/embed-client.ts
  modified:
    - packages/core/src/schema.ts
    - packages/core/src/types.ts
    - packages/mcp-server/src/tools.ts
    - packages/mcp-server/tests/server.test.ts
    - packages/mcp-server/package.json
decisions:
  - "embedText uses AbortSignal.timeout(2000) on each Ollama fetch, not a one-time health check"
  - "fts_observations uses porter unicode61 tokenizer for stemming in FTS5"
  - "needs_embedding migration uses try/catch to handle both fresh and existing databases idempotently"
  - "await embedText call is outside any db.transaction block (no transaction wrapping in rememberEntity)"
metrics:
  duration: 313s
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_changed: 5
requirements_validated: [SRCH-01, SRCH-04]
---

# Phase 02 Plan 01: Embeddings Pipeline and FTS5 Schema Summary

**One-liner:** Ollama inline embedding pipeline with AbortSignal.timeout(2s) graceful degradation, FTS5 fts_observations table, and needs_embedding re-queue flag for observations.

## What Was Built

### Task 1: Schema migration — FTS5 table and needs_embedding column
Added FTS5 full-text search support and an embedding status flag to the database schema.

- `fts_observations` virtual table created with FTS5 + porter unicode61 tokenizer
- `observations.needs_embedding` column added via idempotent `ALTER TABLE` migration (try/catch, safe on repeat startup)
- `idx_observations_needs_embedding` partial index for efficient re-embedding queue queries
- `Observation` TypeScript interface extended with `needs_embedding?: number`

### Task 2: EmbedClient singleton and async rememberEntity
Wired Ollama embeddings into the remember tool with full graceful degradation.

**embed-client.ts:**
- Lazy singleton `Ollama` instance, initialized on first `embedText()` call
- Configurable host via `OLLAMA_HOST` env var (defaults to `http://127.0.0.1:11434`)
- 2-second timeout enforced via `AbortSignal.timeout(HEALTH_TIMEOUT_MS)` on every Ollama HTTP request
- Returns `number[] | null` — null on any error or timeout

**tools.ts changes:**
- `rememberEntity` signature changed from sync to `async function ... Promise<RememberResult>`
- After every observation INSERT: inserts `(content, obsId)` into `fts_observations`
- Calls `await embedText(content)` — if vector returned: inserts `Float32Array` into `vec_embeddings`
- If `embedText` returns null (Ollama down/slow): sets `needs_embedding = 1` on the observation row
- All 8 existing tests updated to `await rememberEntity(...)` + 2 new tests added (FTS5 row, graceful degradation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale dist prevented FTS5 table from appearing in tests**
- **Found during:** Task 2 test run
- **Issue:** Test DB created via `@ai-workbots/core` (resolved to `packages/core/dist/`) which had pre-Task-1 compiled schema — `fts_observations` table not present at runtime
- **Fix:** Ran `npm run build` (root `tsc --build`) to recompile `packages/core/dist/` with FTS5 DDL
- **Files modified:** packages/core/dist/ (build output — not committed per gitignore)
- **Commit:** N/A (build artifact)

## Verification

- `npm run build` exits 0 — all TypeScript compiles clean
- `npm test` — 33/33 tests pass across 2 test files
- `packages/core` per-package `tsc --noEmit` exits 0
- `packages/mcp-server` per-package `tsc --noEmit` exits 0
- embed-client.ts: `export async function embedText` with `AbortSignal.timeout(2000)` confirmed
- schema.ts: `CREATE VIRTUAL TABLE IF NOT EXISTS fts_observations USING fts5(` confirmed
- tools.ts: `INSERT INTO fts_observations`, `INSERT INTO vec_embeddings`, `UPDATE observations SET needs_embedding = 1` all confirmed

## Self-Check: PASSED

All created/modified files exist on disk. Both task commits (173a978, 90efbc9) verified in git log.
