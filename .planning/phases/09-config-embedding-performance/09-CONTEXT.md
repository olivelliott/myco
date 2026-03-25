# Phase 9: Config + Embedding Performance - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The MCP server starts with a reproducible, logged configuration and the embedding client is resilient — singleton-managed, health-cached, and batch-capable.

Requirements: CONFIG-01, CONFIG-02, CONFIG-03, EMBED-01, EMBED-02, EMBED-03, EMBED-04

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key research findings to incorporate:
- dotenv must load before any module reads process.env at import time
- Ollama batch embed fails entirely on error — need fallback to sequential
- Cap batch size at 50 (matches current reEmbedPending limit)
- Set longer timeout for batch calls (10s vs 2s for single)
- Singleton + health state lives at module scope in embed-client.ts

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp-server/src/embed-client.ts` — current embedding wrapper (creates new Ollama() per call)
- `packages/core/src/db.ts` — DB path resolution reads MYCO_DB_PATH env var
- `packages/mcp-server/src/index.ts` — MCP server entry point
- `packages/api-server/src/index.ts` — API server entry point
- `packages/mcp-server/src/cli.ts` — CLI entry point

### Established Patterns
- console.error for all logging (stdout reserved for MCP transport)
- Graceful degradation when Ollama unavailable (FTS5 fallback)
- needs_embedding flag for re-embed queue

### Integration Points
- embed-client.ts is imported by tools.ts, consolidator.ts, relationship-discovery.ts
- db.ts is imported by all packages
- Entry points: mcp-server/index.ts, api-server/index.ts, mcp-server/cli.ts

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
