---
phase: 11-query-filters-error-handling
plan: "02"
subsystem: api-server, mcp-server
tags: [error-handling, zod, validation, hono, mcp-tools, structured-errors]
dependency_graph:
  requires: [11-01]
  provides: [structured-error-responses, zod-validation-hooks, mcp-error-guards]
  affects:
    - packages/api-server/src/validation.ts
    - packages/api-server/src/index.ts
    - packages/api-server/src/routes/approvals.ts
    - packages/api-server/src/routes/entities.ts
    - packages/api-server/src/routes/episodes.ts
    - packages/mcp-server/src/tools.ts
tech_stack:
  added: []
  patterns: [shared-validation-hook, zod-coerce-query-params, global-hono-error-handler, mcp-tool-try-catch]
key_files:
  created:
    - packages/api-server/src/validation.ts
  modified:
    - packages/api-server/src/index.ts
    - packages/api-server/src/routes/approvals.ts
    - packages/api-server/src/routes/entities.ts
    - packages/api-server/src/routes/episodes.ts
    - packages/mcp-server/src/tools.ts
decisions:
  - "validationErrorHook shared across all route files — single source of truth for INVALID_INPUT error shape"
  - "z.coerce.number() used for query params (strings need coercion) — not z.number()"
  - "app.onError registered before app.route() calls — required for Hono to catch route throws"
  - "MCP tool try/catch at handler level only — core business functions (rememberEntity etc.) remain unwrapped for testability"
  - "resolve_approval existing inline error returns preserved — they are intentional domain errors, not unexpected exceptions"
metrics:
  duration_seconds: 181
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 6
---

# Phase 11 Plan 02: Structured Error Handling Summary

**One-liner:** Added shared Zod validationErrorHook, global Hono onError handler, and try/catch wrappers on all 7 MCP tools returning consistent `{ error, code }` JSON content.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create shared validation helper, Zod query schemas, global error handler | 0355b65 | packages/api-server/src/validation.ts (new), index.ts, approvals.ts, entities.ts, episodes.ts |
| 2 | Add try/catch wrappers to all MCP tool handlers | 7cbc08c | packages/mcp-server/src/tools.ts |

## What Was Built

### Task 1 — API Server Error Handling

**`packages/api-server/src/validation.ts`** (new file):
- Exports `validationErrorHook` — the third argument to `zValidator()` calls
- Returns `{ error: { message, code: 'INVALID_INPUT', status: 400 } }` with HTTP 400 on Zod failure
- First issue message surfaced to caller; stack trace stays on server

**`packages/api-server/src/index.ts`**:
- Added `app.onError()` before `app.route()` calls — catches any unhandled throw from route handlers
- Returns `{ error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR', status: 500 } }`
- Logs full error to stderr via `console.error`

**`packages/api-server/src/routes/approvals.ts`**:
- Added `validationErrorHook` as third arg to `zValidator('json', resolveSchema, validationErrorHook)`
- Updated three ad-hoc error returns (404, 409, 422) to structured `{ error: { message, code, status } }` shape

**`packages/api-server/src/routes/entities.ts`**:
- Replaced manual `parseInt`/`isNaN`/`Math.min`/`Math.max` with `entitiesQuerySchema` using `z.coerce.number()`
- Added `zValidator('query', entitiesQuerySchema, validationErrorHook)` on GET /
- Updated 404 error return to structured shape

**`packages/api-server/src/routes/episodes.ts`**:
- Replaced manual `parseInt` with `episodesQuerySchema` using `z.coerce.number()`
- Added `zValidator('query', episodesQuerySchema, validationErrorHook)` on GET /

### Task 2 — MCP Tool Error Guards

All 7 `registerTool` handlers in `packages/mcp-server/src/tools.ts` now wrapped in try/catch:
- `remember`, `recall`, `query`, `log_episode`, `consolidate`, `list_pending_approvals`, `resolve_approval`
- Each catch: logs to stderr with `[toolname] tool error:` prefix, returns `{ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' }` as JSON text content
- Core business functions (`rememberEntity`, `recallKnowledge`, `queryEntities`, `logEpisode`) remain unwrapped — throw freely for testability
- `resolve_approval` existing inline domain error returns preserved unchanged

## Requirements Satisfied

- **ERR-01:** Invalid API request bodies return `{ error: { message, code: 'INVALID_INPUT', status: 400 } }`
- **ERR-02:** Unhandled API route errors return `{ error: { message: 'An unexpected error occurred', code: 'INTERNAL_ERROR', status: 500 } }`
- **ERR-03:** All MCP tool errors return JSON text content `{ error: string, code: 'INTERNAL_ERROR' }`

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

- 90/90 tests passing (no change — this plan added no new tests, only error handling wrappers)
- No regressions in existing test suite

## Known Stubs

None.

## Self-Check: PASSED

- `packages/api-server/src/validation.ts` — exists, exports validationErrorHook, contains INVALID_INPUT
- `packages/api-server/src/index.ts` — contains app.onError and INTERNAL_ERROR
- `packages/api-server/src/routes/approvals.ts` — contains validationErrorHook as third arg
- `packages/api-server/src/routes/entities.ts` — contains z.coerce.number(), no parseInt
- `packages/api-server/src/routes/episodes.ts` — contains z.coerce.number(), no parseInt
- `packages/mcp-server/src/tools.ts` — 7 INTERNAL_ERROR occurrences, all tool error log prefixes present
- Commit 0355b65 exists (Task 1)
- Commit 7cbc08c exists (Task 2)
