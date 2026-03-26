---
phase: 11-query-filters-error-handling
plan: "01"
subsystem: mcp-server
tags: [recall, filters, query, sql, tdd]
dependency_graph:
  requires: [10-prepared-statements]
  provides: [recall-filters]
  affects: [packages/mcp-server/src/tools.ts]
tech_stack:
  added: []
  patterns: [STMT-02-dynamic-where, parameterized-sql-filters, tdd-red-green]
key_files:
  created:
    - packages/mcp-server/tests/recall-filters.test.ts
  modified:
    - packages/mcp-server/src/tools.ts
decisions:
  - "Dynamic WHERE (STMT-02 exception) used for recall filters — consistent with queryEntities pattern already in codebase"
  - "Prepared statement fast path preserved when no filters present — backward compatible, no performance regression"
  - "project filter accepted in schema but produces metadata warning only — not wired to SQL (Phase 12 will add project column)"
  - "KNN over-fetch factor of 3 (limit * 3) ensures adequate candidates after filter narrowing"
metrics:
  duration_seconds: 174
  completed_date: "2026-03-25"
  tasks_completed: 1
  files_modified: 2
---

# Phase 11 Plan 01: Recall Filter Parameters Summary

**One-liner:** Added entity_type, min_confidence, and project (no-op warning) filter params to the recall MCP tool using parameterized SQL WHERE clauses on both KNN and FTS paths.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests for recall filter params | 6e17dec | packages/mcp-server/tests/recall-filters.test.ts |
| 1 (GREEN) | Implement filter params in recallKnowledge and recall tool schema | 41d660c | packages/mcp-server/src/tools.ts, tests/recall-filters.test.ts |

## What Was Built

Added typed filter parameters to the `recallKnowledge` function and the `recall` MCP tool Zod schema:

- **`entity_type?: string`** — filters by `e.type = ?` on both KNN and FTS SQL paths
- **`min_confidence?: number`** — filters by `o.confidence >= ?` on both paths
- **`project?: string`** — accepted in schema, returns a metadata warning, never touches SQL

Both filter-active paths use the STMT-02 exception pattern (inline `db.prepare()`) matching the `queryEntities` pattern already established in Phase 10. The prepared statement fast path is preserved when no filters are provided, maintaining backward compatibility.

KNN path over-fetches by a factor of 3 (`limit * 3`) before applying post-KNN SQL filters and re-limiting to `limit`.

## Requirements Satisfied

- **QUERY-01:** entity_type filter returns only entities of matching type
- **QUERY-02:** min_confidence filter excludes observations below threshold
- **QUERY-03:** project filter produces metadata warning, no SQL executed
- **QUERY-04:** All filter values bound via `?` parameters — no string interpolation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FTS test query needed adjustment from phrase to single-word**
- **Found during:** TDD GREEN run — Test 1 returned 0 results
- **Issue:** Test query `'TypeScript Alice'` becomes FTS phrase `"TypeScript Alice"` which doesn't match either observation (FTS5 phrase search requires exact consecutive words)
- **Fix:** Changed test query to `'TypeScript'` — still exercises entity_type filter correctly since Alice (person) would also match "TypeScript" query without the filter
- **Files modified:** packages/mcp-server/tests/recall-filters.test.ts
- **Commit:** 41d660c (included in GREEN commit)

## Test Results

- 90/90 tests passing (was 85 before this plan added 5 new tests)
- All 5 new recall-filter tests pass
- No regressions in existing tests

## Known Stubs

None — all filter logic is fully wired to SQL.

## Self-Check: PASSED

- `packages/mcp-server/src/tools.ts` — exists and contains all required changes
- `packages/mcp-server/tests/recall-filters.test.ts` — exists with 5 tests
- Commit 6e17dec exists (RED)
- Commit 41d660c exists (GREEN)
