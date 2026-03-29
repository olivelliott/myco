# Phase 19: Temporal Versioning + Dedup Resolution - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Facts carry version history so the graph is never silently overwritten, and every incoming memory is classified as a new addition, an update to an existing fact, or a duplicate before it is committed.

Requirements: TEMP-01, TEMP-02, TEMP-03, DEDUP-01, DEDUP-02, DEDUP-03, DEDUP-04

</domain>

<decisions>
## Implementation Decisions

### Dedup Classification Strategy
- NOOP detection uses exact text match on `content` field — fast, deterministic, no false positives
- Near-duplicate detection (DEDUP-04) uses embedding cosine similarity > 0.92 threshold
- Dedup classification (ADD/UPDATE/NOOP) runs synchronously inside `remember` before commit — must classify before writing
- When multiple existing observations match, most recent (highest `valid_from`) wins as the comparison target

### Temporal Query Interface
- Add optional `as_of` parameter to existing `recall` and `query` MCP tools — no new tools
- Timestamp format: ISO 8601 string (e.g., "2026-03-27T12:00:00Z"), validated via Zod
- When `as_of` is omitted, defaults to current time (returns latest versions only) — backward compatible
- Version history is NOT shown in recall results. A separate `history` filter on the query tool exposes version chains for a given entity/observation

### Entity Merge Behavior
- Merge candidates detected during consolidation only — not in the remember hot path
- All merge proposals route through approval queue (per STATE.md blocker: Levenshtein ≤ 2 AND cosine > 0.92)
- After merge, source entity's relationships are re-pointed to the target entity (UPDATE foreign keys)
- Merges are reversible — `merged_into` is a soft-delete, source entity and its observations remain queryable

### Claude's Discretion
- Internal implementation of the classification pipeline (function structure, helper decomposition)
- SQL query optimization for temporal filtering
- Test structure and coverage approach
- Error handling for edge cases (e.g., entity with no observations, merge of already-merged entity)

### Prior Decisions (Locked)
- All `valid_from` values generated in application code, not SQLite CURRENT_TIMESTAMP (STATE.md blocker)
- Per-migration db.transaction() pattern from Phase 18 applies to all new DB operations
- better-sqlite3 synchronous API — no async patterns

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/migrations.ts` — migration framework from Phase 18, v5.0 columns already present
- `packages/core/src/statements.ts` — prepared statements for insertObservation, selectObservationsByEntityId, knnSearchForContradiction
- `packages/core/src/types.ts` — Observation, Entity, Relationship interfaces with v5.0 temporal/merge fields

### Established Patterns
- Prepared statements in `statements.ts` compiled once at startup
- better-sqlite3 synchronous API throughout
- WAL mode enabled
- Embedding operations via Ollama (nomic-embed-text, 768 dims)
- Vector similarity via sqlite-vec `vec_distance_cosine()`

### Integration Points
- `statements.ts` INSERT/SELECT queries need temporal column awareness (valid_from, valid_until)
- MCP tool handlers in `packages/mcp/src/tools/` — recall and query tools need `as_of` parameter
- Consolidation pipeline needs merge candidate detection
- Approval queue already exists for routing merge proposals

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above. Implementation should follow existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
