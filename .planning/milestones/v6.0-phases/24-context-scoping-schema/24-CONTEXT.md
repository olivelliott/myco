# Phase 24: Context Scoping Schema - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Add a `project_paths` table (migration 9) that maps filesystem directories to project entity names. Implement walk-up path resolution so any subdirectory resolves to its nearest registered ancestor project. Add prepared statements for path lookup, insertion, and deletion.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions (existing migration pattern in schema.ts/migrations.ts) to guide decisions.

Key constraints from research:
- Walk-up resolution must traverse parent directories (e.g., `/path/to/project/src` resolves to project registered at `/path/to/project`)
- The hook will pass `$PWD` explicitly — do NOT rely on `process.cwd()`
- Migration follows the existing pattern (migration 8 is current)
- Prepared statements follow the `prepareStatements()` factory pattern in @myco/core

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/src/migrations.ts` — migration framework with `runMigrations()`, up to migration 8
- `packages/core/src/schema.ts` — table creation SQL
- `packages/core/src/statements.ts` — `prepareStatements(db)` factory

### Established Patterns
- Each migration has a unique number and `up()` function
- ALTER TABLE wrapped in individual try/catch for idempotency
- Prepared statements compiled once at startup via factory

### Integration Points
- `openDatabase()` calls `runMigrations()` on startup
- MCP server and API server both call `prepareStatements(db)` at init

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
