# Phase 22: Core Refactor + REST Write Routes + Import/Export - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Business logic is accessible to both MCP tools and REST clients from a shared `packages/core/memory-ops.ts` module, the REST API exposes full write operations with OpenAPI documentation and optional auth, and users can export or import their entire knowledge graph via MCP tool or HTTP endpoint.

Requirements: API-01, API-02, API-03, IO-01, IO-02, IO-03, IO-04

</domain>

<decisions>
## Implementation Decisions

### Core Refactor Architecture
- Shared business logic in `packages/core/src/memory-ops.ts` — per goal statement
- MCP tools import directly from `@myco/core` — zero overhead
- Operations that move to memory-ops: remember, recall, forget, query (the 4 core MCP tool handlers)
- memory-ops encapsulates full pipeline including embed+classify+write — callers pass raw text, not embeddings

### REST API & Auth
- OpenAPI: `@hono/swagger-ui` + `@hono/zod-openapi` — auto-generate docs from Zod schemas
- Auth: Bearer token via `MYCO_API_KEY` env var — simple, optional
- Auth default: Disabled when env var is unset — frictionless local dev
- Route structure: `POST /api/memory/remember`, `POST /api/memory/recall`, `POST /api/memory/forget`, `POST /api/memory/query`
- OpenAPI docs served at `/api/docs`

### Import/Export Format
- Native export: Single JSON `{entities: [], observations: [], relationships: [], metadata: {version, exported_at}}`
- Export includes retired observations (valid_until set) for complete temporal history
- Import dedup: Skip existing entities by name+type, add new observations only
- Mem0 adapter: `memories[].memory` → observation content, `memories[].metadata` → entity attributes
- Anthropic reference server adapter: JSONL with `{entities: [{name, entityType, observations}]}` format
- Export/import available as both MCP tools (`export_graph`, `import_graph`) and HTTP endpoints (`GET /api/export`, `POST /api/import`)

### Claude's Discretion
- Internal structure of memory-ops functions (parameter types, return types, error handling)
- Hono middleware ordering and error handling
- OpenAPI schema detail level
- Import validation and error reporting
- Test structure and fixtures

### Prior Decisions (Locked)
- Hono for HTTP API server (CLAUDE.md)
- Zod for schema validation (CLAUDE.md)
- better-sqlite3 synchronous API
- Dedup classification from Phase 19 applies to import operations
- Temporal versioning from Phase 19 applies to imported observations
- Relationship strength from Phase 20 applies to imported relationships

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp-server/src/tools.ts` — existing rememberEntity, recallKnowledge, forgetEntity, queryEntities implementations to extract
- `packages/api-server/src/` — existing Hono API server with read-only routes
- `packages/core/src/statements.ts` — all prepared statements
- `packages/mcp-server/src/dedup.ts` — classification pipeline from Phase 19

### Established Patterns
- Hono routes in `packages/api-server/src/routes/`
- TanStack Query for dashboard data fetching
- Zod schemas for MCP tool input validation

### Integration Points
- MCP tool handlers → memory-ops (refactor existing inline logic)
- Hono routes → memory-ops (new write routes)
- Export/import → memory-ops + direct DB access for bulk operations

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
