# Phase 10: Prepared Statements - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

All hot-path database queries are compiled once at startup, eliminating per-request statement preparation overhead.

Requirements: STMT-01, STMT-02

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key research findings to incorporate:
- Create a `prepareStatements(db)` factory called once at startup, returns typed object
- Statement factory must be called AFTER `applySchema(db)` completes
- Phase 10 statements must NOT reference `project` column — that column doesn't exist until Phase 12
- Never call db.prepare() inside request/tool handler functions
- better-sqlite3 statements are automatically finalized when db.close() is called
- Statements should cover: tools.ts (remember, recall, query, log_episode, reEmbedPending), consolidator.ts, relationship-discovery.ts, and API routes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/db.ts` — database initialization, WAL mode, schema application
- `packages/core/src/schema.ts` — table definitions and migrations
- `packages/mcp-server/src/tools.ts` — MCP tool implementations with inline db.prepare() calls
- `packages/mcp-server/src/consolidator.ts` — consolidation pipeline queries
- `packages/mcp-server/src/relationship-discovery.ts` — relationship queries
- `packages/api-server/src/routes/*.ts` — API route queries

### Established Patterns
- db.prepare() currently called inline in every function
- WAL mode for concurrent readers
- Indexes on entity type/name, observation entity_id, etc.

### Integration Points
- Statement factory should live in packages/core (shared by mcp-server and api-server)
- Both mcp-server and api-server need access to prepared statements
- Tests create fresh databases — statement factory needs to work with test DBs too

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
