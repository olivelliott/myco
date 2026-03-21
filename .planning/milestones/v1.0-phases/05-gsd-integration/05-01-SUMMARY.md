---
phase: 05-gsd-integration
plan: 01
subsystem: infra
tags: [better-sqlite3, hooks, commonjs, vitest, sqlite, claude-code]

# Dependency graph
requires:
  - phase: 01-storage-foundation
    provides: episodes table schema and brain.db path resolution pattern
  - phase: 02-mcp-server-memory
    provides: logEpisode() SQL INSERT pattern and agent_id/event_type conventions
provides:
  - PostToolUse hook that auto-captures GSD phase transitions into brain.db
  - Unit tests proving hook detection, extraction, and SQLite write logic
affects: [05-gsd-integration, future-phases-that-read-episodes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ".claude/package.json with type:commonjs to enable require() in ESM-root project"
    - "PostToolUse hook using stdin JSON, 10s timeout guard, process.exit(0) on all failure paths"
    - "Direct better-sqlite3 INSERT from hook script (no MCP tool invocation)"
    - "crypto.randomUUID() for ID generation instead of nanoid (avoids ESM/CJS compat issue)"

key-files:
  created:
    - .claude/hooks/gsd-brain-episode.js
    - .claude/package.json
    - packages/mcp-server/tests/gsd-brain-episode.test.ts
  modified: []

key-decisions:
  - ".claude/package.json with type:commonjs added to allow require() in hook scripts while project root has type:module"
  - "crypto.randomUUID() used for episode IDs instead of nanoid — nanoid v5 is ESM-only and cannot be required() in CommonJS hook"
  - "Test file placed in packages/mcp-server/tests/ (not src/__tests__/) to match root vitest.config.ts include pattern"
  - "Hook does not load sqlite-vec extension — episodes table has no vector column, extension loading adds unnecessary failure modes"

patterns-established:
  - "Hook pattern: stdin reader + 10s timeout + try/catch + process.exit(0) on all paths"
  - "brain.db existence check via fs.existsSync() before open — prevents auto-creation of empty schemaless DB"
  - "better-sqlite3 required via absolute path from project root node_modules to avoid NODE_PATH issues"

requirements-completed: [GSD-01, GSD-02, GSD-03]

# Metrics
duration: 35min
completed: 2026-03-21
---

# Phase 05 Plan 01: GSD Phase Transition Hook Summary

**Fire-and-forget PostToolUse hook that writes structured GSD-02 episode payloads to brain.db via direct better-sqlite3 INSERT when `gsd-tools phase complete` commands are detected**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-03-21T16:45:11Z
- **Completed:** 2026-03-21T17:20:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Hook script at `.claude/hooks/gsd-brain-episode.js` detects GSD phase transitions via regex and writes structured episodes to brain.db
- Episode payloads contain all GSD-02 required fields: phase_name, phase_number, requirements_covered, outcome_summary, plans_executed, source, transition_timestamp
- 22 unit tests cover command detection, phase extraction, DB path resolution, payload structure, and SQLite write + read verification — all passing
- All failure paths exit 0 silently — hook never blocks GSD workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Write GSD phase transition hook script** - `0e724f2` (feat)
2. **Task 2: Write unit tests for hook logic** - `8f20bf8` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `.claude/hooks/gsd-brain-episode.js` - PostToolUse hook script (278 lines, CommonJS)
- `.claude/package.json` - Overrides module type to commonjs for .claude/ directory
- `packages/mcp-server/tests/gsd-brain-episode.test.ts` - 22 unit tests across 5 describe groups

## Decisions Made

- `.claude/package.json` with `"type": "commonjs"` added to allow `require()` in hook scripts while project root has `"type": "module"` (same pattern as `~/.claude/package.json`)
- `crypto.randomUUID()` used for episode IDs instead of nanoid — nanoid v5 is ESM-only and cannot be `require()`d in CommonJS hook scripts (research open question 3 confirmed)
- Test file placed in `packages/mcp-server/tests/` (not `src/__tests__/`) — root `vitest.config.ts` includes only `packages/*/tests/**/*.test.ts`; wrong path would make tests non-discoverable
- Hook does not load sqlite-vec extension — episodes table has no vector column, and extension loading adds unnecessary native binary dependency and failure modes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added .claude/package.json to enable CommonJS require() in ESM project**
- **Found during:** Task 1 (hook script creation)
- **Issue:** Project root has `"type": "module"` in package.json, causing `.js` files to be treated as ESM. Hook script uses `require()` and `__dirname` which are not available in ESM context.
- **Fix:** Created `.claude/package.json` with `{"type":"commonjs"}` — same pattern used by `~/.claude/package.json` for global hooks.
- **Files modified:** `.claude/package.json` (new file)
- **Verification:** `echo '' | node .claude/hooks/gsd-brain-episode.js; echo $?` outputs `0`
- **Committed in:** `0e724f2` (Task 1 commit)

**2. [Rule 3 - Blocking] Test file placed in packages/mcp-server/tests/ (not src/__tests__/)**
- **Found during:** Task 2 (test file creation)
- **Issue:** Plan specified `packages/mcp-server/src/__tests__/gsd-brain-episode.test.ts` but root `vitest.config.ts` only discovers tests matching `packages/*/tests/**/*.test.ts` — the `src/__tests__/` path would never be discovered.
- **Fix:** Used `packages/mcp-server/tests/gsd-brain-episode.test.ts` matching the pattern already used by `packages/mcp-server/tests/server.test.ts`.
- **Files modified:** `packages/mcp-server/tests/gsd-brain-episode.test.ts` (new file at correct location)
- **Verification:** `npx vitest run packages/mcp-server/tests/gsd-brain-episode.test.ts` — 22 tests pass
- **Committed in:** `8f20bf8` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both fixes necessary for hook to run and tests to be discoverable. No scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

The hook script exists but is not yet registered in `.claude/settings.json`. To activate it, add the following to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/Users/olive/Documents/GitHub/ai-workbots/.claude/hooks/gsd-brain-episode.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

This may be handled by Plan 02 of this phase.

## Next Phase Readiness

- Hook script is complete, tested, and committed
- Unit tests prove all core logic paths work correctly
- Hook registration in `.claude/settings.json` is required for the hook to fire in production — check Phase 05 Plan 02

---
*Phase: 05-gsd-integration*
*Completed: 2026-03-21*
