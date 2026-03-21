# Phase 2: MCP Server + Memory - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the full MCP tool suite (recall, query, log_episode) with Ollama-powered semantic search, FTS5 fallback, and episode capture. Claude Code agents can write episodes and retrieve relevant knowledge from the brain using natural language.

</domain>

<decisions>
## Implementation Decisions

### Recall Tool Response Format
- Each recall result includes: entity name, type, observation content, confidence, and relevance score — gives agents enough context to decide usefulness
- Multi-result responses use a JSON array in a single `text` content block — agents parse JSON naturally, consistent with `remember` response pattern
- Recall searches both entities and observations — embed and search observations (the facts) but return parent entity context for each match
- Response includes a `method: "semantic" | "fts"` field in metadata — agents may want to know confidence of the retrieval method

### Embedding Pipeline
- Embeddings generated inline at write time (during `remember`) — keeps embeddings always fresh, simpler than batch backfill
- Ollama failure: write succeeds without embedding, flag row as `needs_embedding` — re-embed on next successful connection (SRCH-04 graceful degradation)
- Embed observation content only — observations are the atomic facts, entity names are already searchable via exact lookup
- Ollama client uses lazy singleton — initialize on first embed call, reuse connection, detect unavailability with a health check timeout (2s)

### Episode & Query Tool Design
- `log_episode` accepts: `event_type` (string), `payload` (object), `agent_id` (optional) — minimal, mirrors the episodes table schema, session ID auto-injected
- Episodes are NOT directly queryable by agents via `recall`/`query` (per EPSD-03) — episodes are raw consolidation input only
- `query` tool supports: entity by name, by type, by relationship — plus combination filters. Returns entities with their observations and relationship counts
- `recall` and `query` remain separate tools — `recall` is semantic/fuzzy (natural language → vector search), `query` is structured/exact (filters → SQL)

### Claude's Discretion
- FTS5 table structure and tokenizer configuration
- Exact embedding batch size and re-embedding strategy for `needs_embedding` rows
- Error message wording in tool responses
- Internal helper module organization within packages/core and packages/mcp-server

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `openDatabase()` in `packages/core/src/db.ts` — already loads sqlite-vec, sets WAL mode, applies schema
- `rememberEntity()` in `packages/mcp-server/src/tools.ts` — write logic extracted for testability, needs embedding call added
- `registerTools()` in `packages/mcp-server/src/tools.ts` — `recall` and `query` are already registered as stubs
- `vec_embeddings` virtual table already exists in schema with float[768] columns
- `buildProvenance()` and `generateSessionId()` in `packages/core/src/provenance.ts`
- All types exported from `packages/core/src/types.ts`

### Established Patterns
- Synchronous `better-sqlite3` API throughout — no async DB operations
- Module-scoped `SESSION_ID` for per-process session identity
- `nanoid` for all ID generation
- MCP tool handlers are async (SDK requirement) wrapping sync DB calls
- Zod schemas for tool input validation (via MCP SDK)
- NodeNext module resolution with `.js` extensions in imports

### Integration Points
- `rememberEntity()` is the insertion point for inline embedding — add Ollama embed call after observation insert
- `recall` and `query` stub handlers in `registerTools()` need full implementation
- `vec_embeddings` table: `item_id` + `item_type` + `embedding` — insert alongside observations
- `episodes` table already exists in schema — just needs `log_episode` tool handler
- Schema may need FTS5 virtual table added for full-text search fallback

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the technology stack defined in CLAUDE.md.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-mcp-server-memory*
*Context gathered: 2026-03-20*
