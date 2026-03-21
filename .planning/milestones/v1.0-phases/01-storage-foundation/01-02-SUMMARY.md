---
phase: 01-storage-foundation
plan: 02
subsystem: mcp-tools
tags: [mcp, mcp-server, better-sqlite3, nanoid, typescript, tdd, vitest, zod, provenance]

# Dependency graph
requires:
  - phase: 01-storage-foundation plan 01
    provides: openDatabase(), applySchema(), generateSessionId(), buildProvenance(), shared types, @ai-workbots/core package
provides:
  - registerTools() — registers remember, recall, query MCP tools on McpServer instance
  - rememberEntity() — extracted DB write helper (entity upsert + observation + optional relationships, fully testable)
  - packages/mcp-server/src/index.ts — full MCP server entry point with StdioServerTransport
  - brain-mcp binary — creates brain.db at first run, accepts remember calls
affects: [02-mcp-tools, 03-consolidation, 04-api-server, 05-pwa]

# Tech tracking
tech-stack:
  added:
    - nanoid ^5.1.7 (now explicit dep in mcp-server package.json)
    - @types/better-sqlite3 ^7.6.0 (dev dep for type-safe db access in mcp-server)
  patterns:
    - rememberEntity() extracted from tool handler for direct unit test access — thin wrapper pattern
    - Index signature on return type (RememberResult) for MCP SDK type compatibility
    - SESSION_ID generated once at module level (per-process session, not per-call)
    - Entity upsert: SELECT first by name+type, INSERT only if not found — deduplication by name+type
    - INSERT OR IGNORE for relationships — respects UNIQUE constraint without errors

key-files:
  created:
    - packages/mcp-server/src/tools.ts (registerTools, rememberEntity — core tool logic)
    - packages/mcp-server/tests/server.test.ts (10 vitest tests covering all behavior requirements)
  modified:
    - packages/mcp-server/src/index.ts (full MCP server entry point replacing stub)
    - packages/mcp-server/package.json (added nanoid and @types/better-sqlite3)

key-decisions:
  - "rememberEntity() extracted from tool handler for direct testability — MCP SDK tool invocation is hard to unit test, thin wrapper pattern avoids complexity"
  - "SESSION_ID generated once per process lifetime (module scope) not per-call — session represents the MCP server process, not individual tool calls"
  - "Index signature added to RememberResult (key: string, value: unknown) for MCP SDK CallToolResult type compatibility"

patterns-established:
  - "Pattern: Extract business logic from MCP tool handlers into testable helpers (rememberEntity, etc.)"
  - "Pattern: Entity deduplication by name+type — find existing, reuse ID, always append observation"
  - "Pattern: INSERT OR IGNORE for relationships — safe idempotent writes respecting UNIQUE constraints"

requirements-completed: [CORE-01, CORE-05]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 1 Plan 02: MCP Server Tools Summary

**MCP server with functional remember tool (entity upsert + observation + relationships + provenance) and stub recall/query tools — 10 tests passing, brain-mcp binary ready for Claude Code registration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T20:19:19Z
- **Completed:** 2026-03-20T20:21:50Z
- **Tasks:** 1 (TDD: 2 commits — test RED + feat GREEN)
- **Files modified:** 4

## Accomplishments
- registerTools() registers 'remember', 'recall', 'query' tools on McpServer via @modelcontextprotocol/sdk
- remember tool: entity upsert by name+type (deduplication), observation INSERT, optional relationships with INSERT OR IGNORE
- Full provenance on all rows: session_id (per-process), agent_id (defaults 'unknown'), source_type='agent_session', confidence=1.0
- recall and query return stub text ('not yet implemented') — Phase 2 will add semantic search
- StdioServerTransport wired in index.ts — console.error only (stdout reserved for JSON-RPC)
- 10 new vitest tests, 31 total passing across both packages

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for MCP server tools** - `e4af3ac` (test)
2. **Task 1 GREEN: MCP server with remember tool and stubs** - `a1ba93a` (feat)

**Plan metadata:** TBD (docs: complete plan)

_Note: TDD task has two commits — test (RED) then feat (GREEN)_

## Files Created/Modified
- `packages/mcp-server/src/tools.ts` - rememberEntity() helper + registerTools() for remember/recall/query
- `packages/mcp-server/src/index.ts` - Full MCP server entry with StdioServerTransport (replaces stub)
- `packages/mcp-server/package.json` - Added nanoid ^5.1.7 and @types/better-sqlite3 dependencies
- `packages/mcp-server/tests/server.test.ts` - 10 tests covering entity insert, observation link, provenance, relations, upsert behavior

## Decisions Made
- Extracted rememberEntity() from the MCP tool handler for testability — the MCP SDK makes it difficult to invoke tool handlers directly in unit tests; a thin wrapper pattern cleanly separates DB logic from tool registration
- SESSION_ID is module-scoped (generated once per process) not per-call — a session represents the MCP server process
- Added index signature to RememberResult for MCP SDK CallToolResult type compatibility (TypeScript strict mode)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added index signature to RememberResult for MCP SDK TypeScript type compatibility**
- **Found during:** Task 1 GREEN (tsc build after implementation)
- **Issue:** MCP SDK's CallToolResult requires `[key: string]: unknown` index signature; RememberResult was missing it, causing TS2769 overload resolution failure
- **Fix:** Added `[key: string]: unknown` to the RememberResult interface
- **Files modified:** packages/mcp-server/src/tools.ts
- **Verification:** `tsc --build` exits 0 after fix
- **Committed in:** a1ba93a (feat task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type compatibility bug)
**Impact on plan:** Necessary for TypeScript strict-mode build correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed TypeScript type compatibility issue above.

## User Setup Required
None - no external service configuration required. The MCP server can be registered in Claude Code using:
```json
{
  "mcpServers": {
    "ai-workbots-brain": {
      "command": "node",
      "args": ["/path/to/ai-workbots/packages/mcp-server/dist/index.js"]
    }
  }
}
```
Or for development: `npx tsx packages/mcp-server/src/index.ts`

## Next Phase Readiness
- MCP server is fully functional for the remember tool — agents can start storing knowledge
- recall and query are stubs awaiting Phase 2 (semantic search via Ollama embeddings)
- brain.db is created automatically at first run via openDatabase()
- All Phase 1 tests pass (31 total) — storage foundation is complete
- No blockers or concerns for subsequent phases

## Self-Check: PASSED
- packages/mcp-server/src/tools.ts: FOUND
- packages/mcp-server/src/index.ts: FOUND
- packages/mcp-server/tests/server.test.ts: FOUND
- .planning/phases/01-storage-foundation/01-02-SUMMARY.md: FOUND
- Commit e4af3ac (test RED): FOUND
- Commit a1ba93a (feat GREEN): FOUND

---
*Phase: 01-storage-foundation*
*Completed: 2026-03-20*
