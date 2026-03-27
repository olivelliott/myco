# Phase 18: Schema Foundation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The database migration system runs each migration exactly once and all v5.0 schema columns are present with safe defaults before any feature code touches them.

Requirements: INFRA-01, INFRA-02

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key research findings to incorporate:
- Replace existing try/catch ALTER TABLE pattern with a `schema_migrations` table
- Add temporal columns (valid_from, valid_until) to observations
- Add importance/strength columns to observations and relationships
- Add merged_into column to entities for soft-delete merges
- Add last_accessed_at to observations for decay tracking
- All migrations must be idempotent and safe on existing databases

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/schema.ts` — existing schema with try/catch ALTER TABLE pattern (5 blocks)
- `packages/core/src/db.ts` — openDatabase() function that calls applySchema()

### Established Patterns
- Schema changes applied at startup via `applySchema(db)` in db.ts
- better-sqlite3 synchronous API
- WAL mode enabled

### Integration Points
- `applySchema()` called from `openDatabase()` — migration framework replaces this
- All prepared statements in `statements.ts` will need updating for new columns

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
