# Phase 20: Relationship Strength Scoring - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Every relationship in the knowledge graph carries a strength score that grows each time it is reinforced by a `remember` call, and the dashboard graph visualizes edge weight via line thickness.

Requirements: STRENGTH-01, STRENGTH-02, STRENGTH-03

</domain>

<decisions>
## Implementation Decisions

### Strength Scoring Algorithm
- Linear increment: `strength = strength + 1` per reinforcement — simple, predictable
- Initial strength value: 1.0 for new relationships
- Upsert via `INSERT ... ON CONFLICT DO UPDATE SET strength = strength + 1, reinforcement_count = reinforcement_count + 1` — single SQL statement
- Strength does NOT decay over time — it only grows via remember calls. Decay is separate (Phase 21)

### Dashboard Edge Visualization
- Line thickness range: 1px (strength=1) to 5px (strength≥10), linear clamp
- Tooltip on hover: "Strength: N (reinforced N times)"
- Single edge color — vary only thickness, not color, for clarity
- Include `strength` and `reinforcement_count` in relationship objects returned by recall/query API results

### Claude's Discretion
- SQL upsert implementation details
- Dashboard component structure for edge rendering
- Test approach and edge cases

### Prior Decisions (Locked)
- Relationship strength updated only on `remember` (not `recall`) — STATE.md decision, avoids write amplification
- better-sqlite3 synchronous API
- react-force-graph-2d for dashboard graph visualization

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/statements.ts` — `insertRelationship`, `selectRelationshipExists` prepared statements
- `packages/core/src/types.ts` — Relationship interface with `strength` and `reinforcement_count` fields (from Phase 18)
- `packages/dashboard/src/components/KnowledgeGraph.tsx` — existing force graph component

### Established Patterns
- Prepared statements compiled at startup
- Dashboard uses TanStack Query for data fetching
- react-force-graph-2d for graph visualization

### Integration Points
- `tools.ts` rememberEntity — relationship insertion needs upsert logic
- Dashboard graph component — edge rendering needs strength-aware width
- API response — relationship objects need strength fields populated

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
