---
phase: 23-auto-extraction-incremental-consolidation
plan: "02"
subsystem: core/mcp-server
tags: [auto-extraction, micro-consolidation, callback, lock, scheduler]
dependency_graph:
  requires: ["23-01"]
  provides: ["end-to-end auto-extraction pipeline", "lock-protected nightly cron"]
  affects: ["packages/core/src/memory-ops.ts", "packages/mcp-server/src/index.ts", "packages/mcp-server/src/scheduler.ts"]
tech_stack:
  added: []
  patterns:
    - "setImmediate fire-and-forget for background extraction from MCP tool handler"
    - "Dependency inversion: callback registered by server into core module to avoid circular import"
    - "acquireLock/releaseLock in try/finally wrapping nightly cron handler"
key_files:
  created: []
  modified:
    - packages/core/src/memory-ops.ts
    - packages/core/src/index.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/scheduler.ts
decisions:
  - "setImmediate used (not setTimeout/process.nextTick) so callback fires after current I/O cycle, never blocking the MCP response"
  - "registerEpisodeCallback uses dependency inversion — core exports the slot, mcp-server fills it at startup — to avoid a circular import"
  - "Nightly cron acquires lock independently; if micro holds the lock, nightly logs a warning and skips (no retry — next 2am will catch up)"
metrics:
  duration: "2m 24s"
  completed: "2026-03-29"
  tasks_completed: 2
  files_modified: 4
---

# Phase 23 Plan 02: Wire Callback System and Lock-Wrap Nightly Summary

Wire the micro-consolidation pipeline into live operation: setImmediate fire-and-forget in logEpisode triggers async extraction on every episode, and the nightly cron wraps runConsolidation with acquireLock/releaseLock in try/finally.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add callback registration to logEpisode with fire-and-forget | e6004b3 | packages/core/src/memory-ops.ts, packages/core/src/index.ts |
| 2 | Wire callback at MCP startup and lock-wrap nightly consolidation | b59ee50 | packages/mcp-server/src/index.ts, packages/mcp-server/src/scheduler.ts |

## What Was Built

**Task 1 — registerEpisodeCallback + fire-and-forget in logEpisode:**

Added a module-level `onEpisodeLogged` slot and `registerEpisodeCallback()` export to `packages/core/src/memory-ops.ts`. After the `insertEpisode` DB write, `logEpisode` now fires a `setImmediate` callback if one is registered. The callback runs asynchronously — the MCP tool response returns before extraction begins (EXTRACT-02). Errors in the callback are caught and logged to stderr, never surfacing to the caller. `registerEpisodeCallback` is re-exported from the `@myco/core` barrel.

**Task 2 — Callback wiring at startup + lock-wrapped nightly:**

`packages/mcp-server/src/index.ts` now imports `registerEpisodeCallback` from `@myco/core` and `runMicroConsolidation` from `./consolidator.js`. After `registerTools()`, it registers the callback: `registerEpisodeCallback((episodeId) => runMicroConsolidation(db, stmts, episodeId))`.

`packages/mcp-server/src/scheduler.ts` now imports `acquireLock` and `releaseLock` from `./consolidator.js`. The nightly cron handler calls `acquireLock(db, 'nightly')` before `runConsolidation` — if the lock is held (micro-consolidation running), it logs a warning and returns without running. If acquired, it runs `runConsolidation` in a try/finally that always calls `releaseLock(db)`. This satisfies CONSOL-02 (no deadlock on crash).

## Verification Results

- `npx tsc --noEmit -p packages/core/tsconfig.json` — pre-existing error in format-adapters.ts only (unrelated, present before this plan)
- `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` — clean (no errors)
- No circular dependency: packages/core does not import from packages/mcp-server
- All acceptance criteria grep checks pass

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- e6004b3 exists: confirmed (`git log --oneline` shows feat(23-02): add registerEpisodeCallback...)
- b59ee50 exists: confirmed (`git log --oneline` shows feat(23-02): wire micro-consolidation callback...)
- packages/core/src/memory-ops.ts: registerEpisodeCallback, onEpisodeLogged, setImmediate all present
- packages/core/src/index.ts: registerEpisodeCallback in re-export line
- packages/mcp-server/src/index.ts: registerEpisodeCallback + runMicroConsolidation present
- packages/mcp-server/src/scheduler.ts: acquireLock, releaseLock, nightly warning, finally block all present
