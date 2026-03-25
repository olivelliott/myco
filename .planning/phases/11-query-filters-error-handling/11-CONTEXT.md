# Phase 11: Query Filters + Error Handling - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

The recall tool accepts typed filter parameters (entity_type, min_confidence) that narrow results, and all API routes and MCP tools return structured, consistently-formatted errors. Zod validation on API route inputs catches malformed requests early with human-readable messages.

</domain>

<decisions>
## Implementation Decisions

### Query Filter Design
- Recall tool accepts `entity_type` (string), `min_confidence` (number 0-1), and `limit` (number) as optional filter parameters
- Multiple filters combine with AND logic — all specified filters narrow results simultaneously
- Filters are applied as post-KNN/FTS SQL WHERE clauses — simple and effective
- Both semantic (KNN) and FTS fallback paths honor all filters equally

### Error Response Format
- MCP tool errors return structured `{ error: string, code: string }` in JSON text content — simple and parseable
- API error responses use standard REST shape: `{ error: { message: string, code: string, status: number } }`
- Zod validation runs on API routes only — MCP SDK already validates tool inputs via its own Zod schemas
- Unknown errors wrapped in generic 500/INTERNAL_ERROR with sanitized message — never leak stack traces

### Validation Scope
- All 5 API route groups get Zod schemas where they accept input (approvals PATCH body, entities query params, episodes query params; dashboard and graph need none currently)
- Invalid recall filter values trigger graceful degradation — warning in response metadata, not a 400 error
- Zod error messages are human-readable field-level: "entity_type must be a string"

### Claude's Discretion
- Specific Zod schema definitions and middleware placement
- Error code naming conventions (e.g., INVALID_INPUT, NOT_FOUND, INTERNAL_ERROR)
- Whether to use Hono middleware or per-route validation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/statements.ts` — 50+ prepared statements, `MycoStatements` interface (Phase 10)
- `packages/mcp-server/src/tools.ts` — `recallKnowledge()` function at line 170, currently accepts `{ query, limit }` params
- Zod already a project dependency (peer dep of MCP SDK, v4.x)

### Established Patterns
- MCP tools return `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` shape
- API routes use Hono factory pattern: `dashboardRoutes(db, stmts): Hono`
- Route files have minimal error handling — just 2 catch blocks across all routes
- Prepared statements live in `@myco/core` and are passed to handlers

### Integration Points
- `recallKnowledge()` in tools.ts — add filter params to function signature and SQL queries
- `recall` tool registration in tools.ts ~line 386 — update Zod schema to accept new params
- All 5 API route files in `packages/api-server/src/routes/` — add Zod validation and error middleware
- `packages/api-server/src/index.ts` — potential place for global error handler middleware

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
