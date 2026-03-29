---
phase: 22-core-refactor-rest-write-routes-import-export
plan: "03"
subsystem: core, mcp-server, api-server
tags: [import-export, format-adapters, mcp-tools, rest-api, dedup]
dependency_graph:
  requires: ["22-01"]
  provides: [IO-01, IO-02, IO-03, IO-04]
  affects: [mcp-server, api-server, core]
tech_stack:
  added: []
  patterns:
    - exportGraph: synchronous bulk SELECT on all three tables, wrapped in metadata
    - importGraph: entities-first order, classifyObservation dedup pipeline, preserves original timestamps
    - normalizeMem0: metadata.entity_name grouping with mem0_import fallback catch-all
    - normalizeAnthropicJSONL: two-pass JSONL parsing (entities first, then relations)
    - registerIORoutes: same OpenAPIHono pattern as memory.ts routes (Phase 22-02)
key_files:
  created:
    - packages/core/src/import-export.ts
    - packages/core/src/format-adapters.ts
    - packages/api-server/src/routes/io.ts
  modified:
    - packages/core/src/index.ts
    - packages/mcp-server/src/tools.ts
    - packages/api-server/src/index.ts
decisions:
  - Export includes all observations (including retired valid_until set) — preserves temporal history
  - importGraph preserves original valid_from timestamps — critical for as_of temporal queries
  - entities-first import order ensures entity_id map is built before observations/relationships
  - Orphaned observations (entity not in map) are silently skipped, counted as skipped
  - Anthropic adapter does two passes — first entities+observations, then relations — to build entityNameMap before relation resolution
  - GET /api/export has no auth (read-only); POST /api/import uses apiKeyAuth() (write)
  - DTS build failure in api-server is pre-existing (confirmed via git stash); ESM build succeeds
metrics:
  duration: "~4 minutes"
  completed: "2026-03-29"
  tasks: 2
  files: 6
---

# Phase 22 Plan 03: Import/Export Functionality Summary

Implemented export/import functionality for the Myco knowledge graph. Export produces a complete JSON snapshot including all observations (including temporally retired ones). Import routes through the existing dedup pipeline for idempotent re-import. Two format adapters handle Mem0 and Anthropic JSONL formats. Available as MCP tools (`export_graph`, `import_graph`) and HTTP endpoints (`GET /api/export`, `POST /api/import`).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Core export/import functions and format adapters | d174318 | import-export.ts, format-adapters.ts, index.ts |
| 2 | MCP tools and HTTP endpoints | e52aaa9 | tools.ts, routes/io.ts, api-server/index.ts |

## What Was Built

### `packages/core/src/import-export.ts`

**`exportGraph(db)`** — synchronous function that bulk-SELECTs all non-merged entities, all observations (including retired), and all relationships, wrapping them in a `GraphExport` envelope with metadata (version, exported_at, counts).

**`importGraph(db, payload, stmts)`** — async function that processes in entities-first order:
1. Entity import: check selectEntityByNameType, skip if exists, insert if not, build `original_id -> new_id` map
2. Observation import: look up mapped entityId, embed with `embedText`, classify with `classifyObservation` (NOOP/UPDATE/ADD), insert preserving original `valid_from` and `created_at` timestamps
3. Relationship import: map from_id and to_id through entity map, check selectRelationshipExists, skip if exists, insert if not

### `packages/core/src/format-adapters.ts`

**`normalizeMem0(input)`** — groups Mem0 memories by `metadata.entity_name`/`metadata.entity_type` if present, otherwise groups under catch-all entity `"mem0_import"` with type `"import_batch"`. Maps `memory` string to observation content, preserves `created_at` for `valid_from`.

**`normalizeAnthropicJSONL(jsonl)`** — two-pass JSONL parser. First pass: entity lines create entities + observations, building entityNameMap. Second pass: relation lines resolve from/to names through entityNameMap to produce relationships.

### MCP Tools (`packages/mcp-server/src/tools.ts`)

- **`export_graph`** — no params, calls `exportGraph(db)`, returns JSON string
- **`import_graph`** — `data` (string or file path) + `format` (native/mem0/anthropic), handles file path resolution (`/` and `~` prefixes via `fs.readFileSync`), delegates to appropriate adapter, calls `importGraph`

### HTTP Endpoints (`packages/api-server/src/routes/io.ts`)

- **`GET /api/export`** — no auth, calls `exportGraph(db)`, returns `GraphExport`
- **`POST /api/import`** — auth required via `apiKeyAuth()`, body `{data, format}`, normalizes based on format, calls `importGraph`
- Both registered via `registerIORoutes()` on the main OpenAPIHono instance (same pattern as memory.ts)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data is wired through the real SQLite database and dedup pipeline.

## Pre-existing Issues (Out of Scope)

- **DTS build failure in api-server**: `npm run build --workspace=packages/api-server` DTS step fails with "not listed within file list of project" for all routes. Confirmed pre-existing (present before this plan's changes). ESM build succeeds. Logged to deferred-items.
- **FTS5 test failure**: `returns FTS5 results with method "fts" when Ollama is unavailable` test in server.test.ts fails. Confirmed pre-existing (present before this plan's changes).

## Self-Check: PASSED

Files created:
- [x] packages/core/src/import-export.ts
- [x] packages/core/src/format-adapters.ts
- [x] packages/api-server/src/routes/io.ts

Commits verified:
- [x] d174318 — feat(22-03): add exportGraph, importGraph, and format adapters in core
- [x] e52aaa9 — feat(22-03): add export_graph/import_graph MCP tools and GET /api/export, POST /api/import HTTP endpoints
