---
phase: 09-config-embedding-performance
plan: 01
subsystem: config
tags: [dotenv, config, env-vars, mcp-server, api-server, cli]

requires: []
provides:
  - "packages/core/src/config.ts — loadConfig/getConfig exports with dotenv + stderr logging"
  - ".env.example — template documenting all 7 supported env vars"
  - "All three entry points (MCP server, CLI, API server) call loadConfig() at startup"
affects:
  - 09-config-embedding-performance
  - 10-prepared-statements
  - 11-query-filters-error-handling
  - 12-namespace-isolation

tech-stack:
  added: ["dotenv@17.3.1 (in @myco/core)"]
  patterns:
    - "loadConfig() called as first code in each entry point before any other imports execute"
    - "getConfig() provides safe access to config after loadConfig() has run"
    - "Env vars read lazily (inside functions) not at module scope, to avoid ESM hoisting pitfall"

key-files:
  created:
    - packages/core/src/config.ts
    - .env.example
  modified:
    - packages/core/src/index.ts
    - packages/core/package.json
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/cli.ts
    - packages/mcp-server/src/consolidator.ts
    - packages/api-server/src/index.ts

key-decisions:
  - "dotenv v17.3.1 installed (latest); prints its own injecting env message to stderr — acceptable noise"
  - "consolidator.ts BRAIN_CONSOLIDATION_MODEL moved from module-scope const to lazy getConsolidationModel() function to avoid ESM hoisting pitfall"
  - "API server port now driven by config.apiPort (MYCO_API_PORT env var) instead of hardcoded 3001"

patterns-established:
  - "Entry-point pattern: import { loadConfig } from '@myco/core'; loadConfig(); as first two lines (after shebang/comments)"
  - "Lazy env read pattern: wrap process.env.X reads in functions when the module will be imported before dotenv loads"

requirements-completed: [CONFIG-01, CONFIG-02, CONFIG-03]

duration: 5min
completed: 2026-03-25
---

# Phase 09 Plan 01: Config Layer Summary

**dotenv configuration layer with OLLAMA_HOST/MYCO_DB_PATH/BRAIN_CONSOLIDATION_MODEL support, stderr startup logging, and .env.example template**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T19:11:11Z
- **Completed:** 2026-03-25T19:16:05Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Config module created with `loadConfig()` (dotenv + stderr logging) and `getConfig()` (safe accessor)
- `.env.example` documents all 7 env vars with defaults and comments
- All three entry points now call `loadConfig()` before any env-dependent code runs
- API server port is now configurable via `MYCO_API_PORT` instead of hardcoded 3001
- Consolidator fixed to read `BRAIN_CONSOLIDATION_MODEL` lazily (avoids ESM hoisting pitfall)

## Task Commits

1. **Task 1: Create config module and .env.example** - `8a8f06e` (feat)
2. **Task 2: Wire loadConfig into all entry points** - `9f94f02` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `packages/core/src/config.ts` - MycoConfig interface, loadConfig() with dotenv + stderr logging, getConfig() safe accessor
- `.env.example` - Template for all 7 supported env vars with defaults
- `packages/core/src/index.ts` - Added loadConfig, getConfig, MycoConfig exports
- `packages/core/package.json` - Added dotenv@17.3.1 dependency
- `packages/mcp-server/src/index.ts` - loadConfig() as first call at entry
- `packages/mcp-server/src/cli.ts` - loadConfig() as first call at entry
- `packages/mcp-server/src/consolidator.ts` - CONSOLIDATION_MODEL → getConsolidationModel() lazy getter
- `packages/api-server/src/index.ts` - loadConfig() at top, config.apiPort replaces hardcoded 3001

## Decisions Made

- dotenv v17 prints its own `[dotenv@17.3.1] injecting env` message to stderr — acceptable noise alongside `[config]` lines
- ESM hoisting means `loadConfig()` on line 3 of an entry file runs AFTER all static imports resolve, so the fix for the consolidator reading env at module scope was to make it a lazy function rather than a preload file
- API server port configurable via `MYCO_API_PORT` — zero-config default of 3001 maintained

## Deviations from Plan

None - plan executed exactly as written. The lazy getter fix for `consolidator.ts` was explicitly specified in the plan as the required approach.

## Issues Encountered

None.

## Known Stubs

None. All config values are wired to real env vars with sensible defaults.

## Next Phase Readiness

- Config foundation complete — all entry points load dotenv and log resolved config at startup
- Phase 09 Plan 02 (embedding client singleton + health caching) can now use `getConfig()` for `ollamaHost` and `ollamaModel` values
- Prepared statement work in Phase 10 can reference `getConfig()` for any needed config values

---
*Phase: 09-config-embedding-performance*
*Completed: 2026-03-25*
