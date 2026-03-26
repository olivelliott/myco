---
phase: 12-namespace-isolation
plan: 02
subsystem: api-server
tags: [namespace-isolation, project-scoping, api-routes, hono, zod-validation, STMT-02]
dependency_graph:
  requires: [12-01 (project column migration + MCP tool wiring)]
  provides: [project-filtered entities API, project-filtered graph API, project-filtered dashboard API]
  affects:
    - packages/api-server/src/routes/entities.ts
    - packages/api-server/src/routes/graph.ts
    - packages/api-server/src/routes/dashboard.ts
tech_stack:
  added: []
  patterns: [STMT-02 exception for dynamic project WHERE, JS-side relationship filtering by entity ID set]
key_files:
  created: []
  modified:
    - packages/api-server/src/routes/entities.ts
    - packages/api-server/src/routes/graph.ts
    - packages/api-server/src/routes/dashboard.ts
decisions:
  - STMT-02 exception pattern used for all project-filtered queries — inline db.prepare() when project set, prepared statements when not
  - Graph relationships filtered in JS by entity ID set — avoids complex SQL JOIN since relationships have no project column
  - recentEpisodes/topConnected/typeBreakdown remain global per CONTEXT.md locked decision
  - Project param omitted = identical behavior to previous version (fully backward compatible)
metrics:
  duration_minutes: 2
  completed_date: "2026-03-26T18:24:00Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 12 Plan 02: Namespace Isolation — API Route Filtering Summary

**One-liner:** Added optional `project` query parameter to entities, graph, and dashboard API routes using STMT-02 inline `db.prepare()` pattern for project-scoped filtering with full backward compatibility when param is omitted.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add project query param to entities route | 2487b9a |
| 2 | Add project query param to graph and dashboard routes | 17d16a2 |

## What Was Built

### Task 1 — entities.ts

**Schema extension:** `entitiesQuerySchema` gains `project: z.string().optional()`.

**Route handler:** Destructures `project` from validated query. When `project` is truthy, uses STMT-02 exception:
```sql
SELECT id, name, type, confidence, created_at
FROM entities WHERE project = ?
ORDER BY updated_at DESC LIMIT ? OFFSET ?
```
When `project` is absent, falls through to `stmts.selectEntitiesPaginated.all(limit, offset)` — identical to previous behavior. The `/:id` single-entity lookup is unchanged (entity IDs are globally unique, no project filtering needed).

### Task 2 — graph.ts

**New imports:** `zValidator`, `z`, `validationErrorHook` added (file previously had no query validation).

**Schema:** `graphQuerySchema = z.object({ project: z.string().optional() })` added before the route factory.

**Route handler:** When `project` provided:
- Fetches nodes via inline `db.prepare()` with `WHERE e.project = ?` (includes obs_count subquery)
- Builds `entityIds` Set from node results
- Filters `stmts.selectGraphRelationships.all()` in JS: only relationships where both `from_id` and `to_id` are in the project entity set

When `project` absent: uses `stmts.selectGraphNodes.all()` and `stmts.selectGraphRelationships.all()` unchanged.

### Task 2 — dashboard.ts

**New imports:** `zValidator`, `z`, `validationErrorHook` added.

**Schema:** `dashboardQuerySchema = z.object({ project: z.string().optional() })`.

**Route handler:** When `project` provided, six counts use inline `db.prepare()`:
- `entities WHERE project = ?`
- `observations JOIN entities WHERE e.project = ?`
- `relationships JOIN entities e1, e2 WHERE e1.project = ? AND e2.project = ?`
- Same three queries with `AND created_at > ?` for the 7-day growth stats

When `project` absent: existing prepared statements (`stmts.countEntities`, `stmts.countRelationships`, etc.) used unchanged.

`recentEpisodes`, `topConnected`, and `typeBreakdown` are always global per CONTEXT.md locked decision — consolidation and aggregate views are not project-scoped.

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

- **Before:** 90 tests passing
- **After:** 90 tests passing
- No test changes needed — the new project filtering is additive-only and doesn't affect existing test scenarios

## Known Stubs

None. Project filtering is fully functional end-to-end:
- `GET /api/entities?project=myco` returns only entities with `project='myco'`
- `GET /api/entities` returns all entities (backward compatible)
- `GET /api/graph?project=myco` returns project-scoped nodes and filtered relationships
- `GET /api/graph` returns full graph (backward compatible)
- `GET /api/dashboard?project=myco` returns project-scoped counts with global aggregate views
- `GET /api/dashboard` returns global counts (backward compatible)

## Self-Check: PASSED

- packages/api-server/src/routes/entities.ts — FOUND
- packages/api-server/src/routes/graph.ts — FOUND
- packages/api-server/src/routes/dashboard.ts — FOUND
- .planning/phases/12-namespace-isolation/12-02-SUMMARY.md — FOUND
- Commit 2487b9a — FOUND
- Commit 17d16a2 — FOUND
