# Phase 21: Memory Importance Decay - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Recall results account for how recently and how often a fact has been accessed, so stale unreinforced memories rank lower than actively reinforced ones — without any write overhead in the hot path.

Requirements: DECAY-01, DECAY-02, DECAY-03

</domain>

<decisions>
## Implementation Decisions

### Decay Algorithm
- Exponential decay: `base * e^(-lambda * daysSinceAccess)` with lambda=0.03 (~50% at 23 days)
- Reinforcement boost: `reinforcement_count * 0.1` added to effective confidence before decay cap
- Minimum effective confidence floor: 0.1 — never fully forgotten, always retrievable
- Decay-exempt entity types: preference, constraint, decision, architecture — return base confidence unchanged

### Integration with Recall Ranking
- `last_accessed_at` updated on every recall that returns the observation — lazy write after read completes
- Decay modulates similarity: `final_score = similarity * effective_confidence`
- Include `effective_confidence` alongside base `confidence` in recall/query results

### Claude's Discretion
- Internal function structure and module placement
- SQL for updating last_accessed_at efficiently (batch update after recall)
- Test fixtures and edge case coverage
- Performance optimization for the lazy write path

### Prior Decisions (Locked)
- `computeEffectiveConfidence` is a pure function at read time — no write-back to DB (STATE.md)
- No write overhead in the hot path — the function computes, doesn't store
- better-sqlite3 synchronous API
- last_accessed_at column already exists from Phase 18 migrations

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/types.ts` — Observation interface with `last_accessed_at`, `decay_exempt`, `reinforcement_count` fields
- `packages/mcp-server/src/tools.ts` — recallKnowledge and queryEntities functions
- `packages/core/src/statements.ts` — prepared statements for observation queries

### Established Patterns
- Pure utility functions tested in isolation
- Recall results assembled in tools.ts before returning
- Entity type stored on entity, accessible via JOIN

### Integration Points
- Recall/query result assembly in tools.ts — apply decay scoring before returning
- last_accessed_at update — batch UPDATE after recall completes (not per-row during query)
- Dashboard/API — include effective_confidence in response objects

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
