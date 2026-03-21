# Phase 1: Storage Foundation - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo scaffold, SQLite database with WAL mode and full schema (entities, relationships, observations, episodes, vec_embeddings, approval_queue), and a shared Core TypeScript library. The project compiles, the database exists with the correct schema, and every future component has a working place to write and read data.

</domain>

<decisions>
## Implementation Decisions

### Database Location
- **D-01:** Default location is `~/.local/share/ai-workbots/brain.db` (XDG data directory convention)
- **D-02:** `BRAIN_DB_PATH` env var overrides the default location
- **D-03:** Server auto-creates the directory and database with full schema on first run (zero setup friction)
- **D-04:** Single database file (`brain.db`) holds everything — knowledge graph, episodes, embeddings, approval queue

### Provenance Model
- **D-05:** Session IDs use nanoid (short, URL-safe, collision-resistant)
- **D-06:** Agent identity is caller-provided string (e.g. `gsd-executor`, `main-session`), falls back to `unknown` if omitted
- **D-07:** Confidence scale is 0.0–1.0 float (0.85 threshold for auto-approval per REQUIREMENTS)
- **D-08:** Provenance includes a `source_type` field with tagged values: `agent_session`, `consolidation`, `human_edit`, `gsd_hook`

### Claude's Discretion
- Schema openness — how flexible entity types and observations are (fixed columns + JSON metadata vs EAV, observation modeling, relationship structure)
- Package boundaries — how to split the monorepo between core, mcp-server, and api packages; workspace tooling choice
- Timestamp format and granularity
- Table naming conventions and index strategy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above and in project documentation:

### Project Documentation
- `.planning/PROJECT.md` — Project vision, constraints (Node.js runtime, SQLite storage, Ollama embeddings, local-only)
- `.planning/REQUIREMENTS.md` — CORE-01 through CORE-05 define Phase 1 scope
- `.planning/ROADMAP.md` — Phase 1 success criteria and dependencies
- `CLAUDE.md` — Technology stack with specific versions, compatibility matrix, and what NOT to use

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing source code

### Established Patterns
- None yet — Phase 1 establishes the foundational patterns

### Integration Points
- MCP server will use `@modelcontextprotocol/sdk` with `StdioServerTransport` (per CLAUDE.md)
- `better-sqlite3` for synchronous SQLite access (per CLAUDE.md)
- `sqlite-vec` extension for vector similarity search columns
- `nanoid` for ID generation (confirmed by provenance decision)

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

*Phase: 01-storage-foundation*
*Context gathered: 2026-03-20*
