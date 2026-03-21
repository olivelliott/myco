---
phase: 01-storage-foundation
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, sqlite-vec, nanoid, typescript, monorepo, npm-workspaces, tdd, vitest]

# Dependency graph
requires: []
provides:
  - npm workspace monorepo with packages/core, packages/mcp-server, packages/api-server
  - openDatabase() — SQLite bootstrap with WAL, foreign_keys, sqlite-vec extension
  - applySchema() — all 6 knowledge graph tables with provenance columns
  - generateSessionId() and buildProvenance() provenance helpers
  - Shared TypeScript types: Entity, Observation, Relationship, Episode, ApprovalQueueItem, ProvenanceRecord
  - TypeScript project references across all 3 packages (composite builds)
affects: [02-mcp-tools, 03-consolidation, 04-api-server, 05-pwa]

# Tech tracking
tech-stack:
  added:
    - better-sqlite3 ^12.8.0 (synchronous SQLite)
    - sqlite-vec ^0.1.7 (vector similarity search extension)
    - nanoid ^5.1.7 (collision-resistant IDs)
    - zod ^4.3.6 (schema validation, MCP SDK peer dep)
    - typescript ~5.9.0
    - vitest (testing)
    - tsx ^4.21.0 (dev TypeScript runner)
  patterns:
    - npm workspaces + TypeScript composite project references
    - sqliteVec.load(db) BEFORE applySchema(db) (required for vec0 virtual table)
    - All PRAGMAs set outside transactions (WAL requirement)
    - NodeNext module resolution with .js extensions in relative imports
    - process.env.BRAIN_DB_PATH env var override for DB location
    - XDG_DATA_HOME convention for default DB path (~/.local/share/ai-workbots/brain.db)

key-files:
  created:
    - package.json (root workspace config)
    - tsconfig.json (root TypeScript project references)
    - vitest.config.ts (test runner config)
    - packages/core/src/db.ts (openDatabase — WAL, sqlite-vec, schema bootstrap)
    - packages/core/src/schema.ts (applySchema — all 6 CREATE TABLE statements)
    - packages/core/src/provenance.ts (generateSessionId, buildProvenance)
    - packages/core/src/types.ts (Entity, Observation, Relationship, Episode, ApprovalQueueItem, ProvenanceRecord)
    - packages/core/src/index.ts (public re-exports)
    - packages/core/tests/db.test.ts (21 tests)
    - packages/mcp-server/src/index.ts (import chain stub)
    - packages/api-server/src/index.ts (stub)
  modified: []

key-decisions:
  - "sqliteVec.load(db) must be called BEFORE applySchema(db) — vec0 module must be registered before CREATE VIRTUAL TABLE"
  - "All PRAGMAs set outside transactions — WAL mode change requires exclusive lock, cannot be inside a transaction"
  - "NodeNext module resolution requires .js extensions in all relative imports within packages/core/src/"
  - "nanoid v5 is ESM-only — all package.json files must have type:module"
  - "BRAIN_DB_PATH env var + XDG_DATA_HOME fallback for zero-config local database location"

patterns-established:
  - "Pattern: Database bootstrap order — new Database() → sqliteVec.load() → pragmas → applySchema()"
  - "Pattern: All knowledge tables include provenance columns (session_id, agent_id, source_type, confidence, created_at)"
  - "Pattern: Relative imports use .js extension (NodeNext ESM resolution)"
  - "Pattern: console.error for diagnostics, never console.log (stdout reserved for MCP JSON-RPC)"

requirements-completed: [CORE-02, CORE-03, CORE-04]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 1 Plan 01: Storage Foundation Summary

**npm workspace monorepo with @ai-workbots/core exporting openDatabase() (WAL + sqlite-vec), full 6-table knowledge graph schema with provenance columns, and nanoid-based session/provenance helpers — 21 vitest tests passing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T20:14:20Z
- **Completed:** 2026-03-20T20:16:45Z
- **Tasks:** 1
- **Files modified:** 19

## Accomplishments
- Monorepo scaffold with npm workspaces and TypeScript project references for packages/core, packages/mcp-server, packages/api-server
- openDatabase() with WAL mode, foreign_keys, busy_timeout, sqlite-vec extension load order enforced
- Full knowledge graph schema: entities, observations, relationships, episodes, approval_queue, vec_embeddings (float[768])
- Provenance columns on all knowledge tables: session_id, agent_id, source_type, confidence
- generateSessionId() (nanoid, ~21 chars) and buildProvenance() helpers
- 21 vitest tests covering all behavior requirements: WAL, schema tables, column verification, unique constraints, env var override, idempotent open
- tsc --build compiles cleanly across all 3 packages

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold monorepo and implement Core library** - `519dc23` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `package.json` - Root workspace config with workspaces: ["packages/*"]
- `tsconfig.json` - Root TypeScript project references to all 3 packages
- `vitest.config.ts` - Test runner scanning packages/*/tests/**/*.test.ts
- `packages/core/package.json` - @ai-workbots/core with better-sqlite3, sqlite-vec, nanoid, zod
- `packages/core/src/db.ts` - openDatabase() with correct load order and PRAGMA setup
- `packages/core/src/schema.ts` - applySchema() with all 6 CREATE TABLE IF NOT EXISTS statements
- `packages/core/src/provenance.ts` - generateSessionId() and buildProvenance() helpers
- `packages/core/src/types.ts` - Shared TypeScript interfaces for all knowledge graph types
- `packages/core/src/index.ts` - Public re-exports for the @ai-workbots/core package
- `packages/core/tests/db.test.ts` - 21 vitest tests covering all behavior requirements
- `packages/mcp-server/src/index.ts` - Stub importing from @ai-workbots/core (import chain verified)
- `packages/api-server/src/index.ts` - Stub for Phase 4

## Decisions Made
- sqliteVec.load(db) must precede applySchema(db) — enforced by implementation order and documented as critical pattern
- All PRAGMAs set outside any transaction block (WAL mode requirement)
- XDG_DATA_HOME convention with BRAIN_DB_PATH override follows decisions D-01 and D-02 from CONTEXT.md

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core library exports are ready: openDatabase(), applySchema(), generateSessionId(), buildProvenance(), all shared types
- @ai-workbots/core is importable from mcp-server and api-server packages (verified via TypeScript build)
- Plan 02 (MCP server tool registration) can proceed immediately
- No blockers or concerns
