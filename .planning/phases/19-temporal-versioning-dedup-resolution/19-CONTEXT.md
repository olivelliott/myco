# Phase 19: Temporal Versioning + Dedup Resolution - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — backend logic phase)

<domain>
## Phase Boundary

Facts carry version history so the graph is never silently overwritten, and every incoming memory is classified as a new addition, an update to an existing fact, or a duplicate before it is committed.

Requirements: TEMP-01, TEMP-02, TEMP-03, DEDUP-01, DEDUP-02, DEDUP-03, DEDUP-04

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — backend logic phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key context:
- Phase 18 added valid_from, valid_until columns to observations table
- Phase 18 added merged_into column to entities table
- Dedup classification should happen BEFORE write, not after
- Semantic similarity via existing embedding infrastructure (sqlite-vec, Ollama)
- Classification categories: ADD (new fact), UPDATE (supersedes existing), NOOP (duplicate)

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
