# Phase 27: Workflow Rules and Knowledge Correction - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Add two new MCP tools: `remember_rule` for storing actionable workflow instructions as first-class `workflow_rule` entities, and `update_knowledge` for finding and superseding stale observations. Rules are always surfaced at session start (Phase 25 hook already queries for `type='workflow_rule'`). Corrections use `valid_until` temporal retirement from existing dedup infrastructure.

</domain>

<decisions>
## Implementation Decisions

### remember_rule Tool
- Parameter schema: `{ instruction: string, project?: string, triggers?: string[] }`
- Stored as entity with `type='workflow_rule'`, `decay_exempt=1`, `confidence=1.0`
- Entity name: `rule:{first8CharsOfSha256(instruction)}` — auto-generated, collision-resistant
- Observation content = the instruction text
- Triggers stored as JSON array in observation metadata
- If `project` is null, rule is global (surfaced in all sessions)
- Thin wrapper over existing `rememberEntity()` — no new DB logic

### update_knowledge Tool
- Parameter schema: `{ query: string, new_value: string, entity_name?: string }`
- Step 1: Search observations by query text (semantic via sqlite-vec if embeddings available, FTS5 fallback)
- Step 2: Return top-3 candidates with entity name, observation content, confidence, created_at
- Step 3: If agent confirms a candidate, retire old observation (set `valid_until`) and insert replacement
- If `entity_name` provided, narrow search to that entity's observations
- Uses existing `retireObservation()` pattern — set `valid_until = now()` on old, insert new with `valid_from = now()`
- Single atomic operation (both retire + insert in one transaction)

### Session-Start Integration
- Phase 25 hook already queries `SELECT * FROM entities WHERE type = 'workflow_rule'` — no hook changes needed
- Rules created by `remember_rule` will automatically appear in next session start

### Claude's Discretion
- Whether to use sqlite-vec or FTS5 for the correction search (depends on embedding availability)
- Test strategy and mock patterns
- Error handling for edge cases (no matches found, entity doesn't exist)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp-server/src/tools.ts` — `rememberEntity()`, existing tool registration pattern with `registerTool()`
- `packages/core/src/statements.ts` — prepared statements for observation queries
- `hooks/myco-session-start.js` — already queries `type='workflow_rule'` entities (Phase 25)
- Dedup classification from v5.0 worktree (if merged) — `retireObservation()` pattern

### Established Patterns
- MCP tools registered via `server.registerTool(name, schema, handler)`
- Zod v4 for input schema validation
- Entity creation via `rememberEntity(db, stmts, { name, type, observations, relations })`
- Tool results return `{ content: [{ type: 'text', text: '...' }] }`

### Integration Points
- `tools.ts` is the single file for all MCP tool registrations
- Session-start hook reads `type='workflow_rule'` entities — no changes needed
- `valid_until` column exists on observations table (migration 5)

</code_context>

<specifics>
## Specific Ideas

- `remember_rule` should be very simple — essentially `rememberEntity()` with fixed type/confidence
- `update_knowledge` is the more complex tool — the search + confirm + retire pattern
- Consider whether `update_knowledge` should work in one call (auto-pick best match) or two calls (search then confirm) — recommended: return candidates, let agent mediate

</specifics>

<deferred>
## Deferred Ideas

- Trigger-aware rule surfacing (surface only commit rules before `git commit`) — v6.1
- Rule priority/ordering within the same project — future
- Bulk rule import from CLAUDE.md — explicitly out of scope (two-source-of-truth problem)

</deferred>
