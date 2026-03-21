---
phase: 03-consolidation-approval
plan: 02
subsystem: mcp-tools-scheduler

tags: [mcp-tools, croner, consolidation, approval-queue, scheduler]

# Dependency graph
requires:
  - phase: 03-consolidation-approval
    plan: 01
    provides: runConsolidation, approval_queue schema, ConsolidationSummary type
provides:
  - MCP tool: consolidate (manual pipeline trigger)
  - MCP tool: list_pending_approvals (queue inspection)
  - MCP tool: resolve_approval (approve/reject/edit with graph write + entity merge)
  - Nightly cron: scheduleDailyConsolidation at 2am America/New_York
affects:
  - 04-pwa-dashboard (reads approval_queue, resolves via MCP tools)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - server.registerTool() for all new tools (MCP SDK 1.27.1 Zod v4 compatible pattern)
    - Croner timezone-aware scheduling (America/New_York for DST-safe 2am EST)
    - Entity merge on approval: reassign observations+relationships, delete secondary entities
    - source_type: 'consolidation' provenance on all approved facts

key-files:
  created:
    - packages/mcp-server/src/scheduler.ts
  modified:
    - packages/mcp-server/src/tools.ts
    - packages/mcp-server/src/index.ts

key-decisions:
  - "Used server.registerTool() pattern (not server.tool()) for all three new tools — consistent with Plan 01 fix for MCP SDK 1.27.1 Zod v4 compatibility"
  - "Removed redundant action !== 'reject' check in resolve_approval merge candidate block — TypeScript narrows action to 'approve'|'edit' after early return on reject"
  - "consolidationCron variable held in module scope to prevent GC of the Cron instance"

requirements-completed: [CNSLD-01, CNSLD-05, APRV-04]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 03 Plan 02: MCP Tools + Scheduler Summary

**Three MCP tools (consolidate, list_pending_approvals, resolve_approval) + croner nightly schedule wired into server startup**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T01:29:00Z
- **Completed:** 2026-03-21T01:32:27Z
- **Tasks:** 2
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- Agents can now manually trigger consolidation via `consolidate` MCP tool
- Humans can inspect the approval queue via `list_pending_approvals`
- Humans can approve, reject, or edit queued items via `resolve_approval` — approved items are written to the knowledge graph with full entity merge support
- Nightly cron runs consolidation at 2am America/New_York automatically without manual intervention
- All three tools use `server.registerTool()` consistent with Plan 01's MCP SDK 1.27.1 fix

## Task Commits

1. **Task 1: consolidate, list_pending_approvals, resolve_approval MCP tools** - `ad5c4b6` (feat)
2. **Task 2: scheduler.ts + index.ts wiring** - `0081d87` (feat)

**Plan metadata:** *(docs commit to follow)*

## Files Created/Modified

- `packages/mcp-server/src/tools.ts` — Added import + 3 new server.registerTool() registrations (7 total)
- `packages/mcp-server/src/scheduler.ts` — New: scheduleDailyConsolidation() with croner at 2am America/New_York
- `packages/mcp-server/src/index.ts` — Import scheduleDailyConsolidation + wire after registerTools()

## Decisions Made

- `server.registerTool()` used for all new tools (not `server.tool()`) — consistent with Plan 01 fix for MCP SDK 1.27.1
- `action !== 'reject'` removed from merge candidate block — TypeScript narrowing after early return makes comparison always true (TS2367 error)
- `consolidationCron` variable holds Cron instance reference in module scope — prevents GC, also useful for test control

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed redundant `action !== 'reject'` TypeScript narrowing error**
- **Found during:** Task 1 (TypeScript compilation verification)
- **Issue:** Plan spec included `&& action !== 'reject'` in the merge candidate `if` condition. After `if (action === 'reject') { return; }` earlier in the function, TypeScript narrows `action` to `'approve' | 'edit'`. Comparing against `'reject'` produces TS2367 "no overlap" error.
- **Fix:** Removed the redundant `action !== 'reject'` from the condition. Added a comment explaining the narrowing behavior.
- **Files modified:** `packages/mcp-server/src/tools.ts`
- **Commit:** `ad5c4b6`

## Self-Check: PASSED

- `packages/mcp-server/src/scheduler.ts` — FOUND
- `packages/mcp-server/src/tools.ts` — FOUND
- `packages/mcp-server/src/index.ts` — FOUND
- Commit `ad5c4b6` — FOUND
- Commit `0081d87` — FOUND
