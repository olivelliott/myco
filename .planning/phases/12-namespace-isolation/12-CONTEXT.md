# Phase 12: Namespace Isolation - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Entities can be scoped to a named project namespace. The `remember` tool accepts an optional `project` param to store entities under a namespace. The `recall` and `query` tools filter by project when specified. Existing data (NULL project) remains globally accessible. Schema migration adds a nullable `project` column to the entities table. Virtual tables are filtered at query time.

</domain>

<decisions>
## Implementation Decisions

### Schema Migration Strategy
- Add `project TEXT DEFAULT NULL` column to entities table via `ALTER TABLE` with try/catch (idempotent, same pattern as existing migrations in schema.ts)
- Only entities table gets the project column — observations, relationships, and episodes inherit project scope via entity foreign keys
- Virtual tables (vec_embeddings, fts_observations) CANNOT be altered (SQLite limitation) — filter at query time by joining back to entities
- Existing entities get NULL project = globally visible to all queries

### Tool Interface Design
- `remember` tool gets optional `project` string param — if omitted, entity stored with NULL project (global)
- `recall` tool's existing `project` param (Phase 11 no-op with warning) becomes fully functional — `WHERE e.project = ?` when set, no filter when omitted
- `query` tool also gets optional `project` param for consistency across all read tools
- NULL project entities are visible to ALL queries (no project filter = see everything, project filter = see only that project's entities plus global NULL entities)

### API + Dashboard Behavior
- API routes (entities, graph, dashboard) get optional `project` query param for filtering
- Dashboard default view shows all entities (no project filter) — preserves current behavior
- Consolidation remains global — cross-project knowledge synthesis, not per-project partitioning

### Claude's Discretion
- Index creation strategy for the project column
- Exact SQL for project-aware prepared statements
- Whether to add project display in dashboard entity cards

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/schema.ts` — existing migration pattern with try/catch on ALTER TABLE (lines 85-120)
- `packages/core/src/statements.ts` — 50+ prepared statements, `MycoStatements` interface
- `packages/mcp-server/src/tools.ts` — recall already has `project` param wired as no-op (Phase 11)
- `packages/api-server/src/validation.ts` — shared Zod validation hook (Phase 11)

### Established Patterns
- Schema migrations: `try { ALTER TABLE } catch { /* column already exists */ }` in `applySchema()`
- Dynamic WHERE: STMT-02 exception pattern used for `queryEntities` and recall filters
- Tool params: Zod schemas in `registerTools()` with optional fields
- API validation: `zValidator` with `validationErrorHook` on routes with input

### Integration Points
- `packages/core/src/schema.ts` — add ALTER TABLE migration
- `packages/core/src/statements.ts` — update statements that need project awareness
- `packages/mcp-server/src/tools.ts` — remember (add project param), recall (activate project filter), query (add project param)
- `packages/api-server/src/routes/entities.ts` — add project query param
- `packages/api-server/src/routes/graph.ts` — add project query param
- `packages/api-server/src/routes/dashboard.ts` — add project query param for counts

</code_context>

<specifics>
## Specific Ideas

- The recall tool's project param already exists from Phase 11 with a "not yet supported" warning — this phase removes the warning and wires the actual SQL filter
- STATE.md notes: "SQLite ALTER TABLE cannot modify virtual tables (vec_embeddings, fts_observations) — filter at query time for namespace isolation"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
