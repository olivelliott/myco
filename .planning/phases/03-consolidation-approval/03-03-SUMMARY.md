---
phase: 03-consolidation-approval
plan: 03
subsystem: cli

tags: [cli, consolidation, approval-queue, gap-closure]

# Dependency graph
requires:
  - phase: 03-consolidation-approval
    plan: 01
    provides: runConsolidation, approval_queue schema, ConsolidationSummary type
  - phase: 03-consolidation-approval
    plan: 02
    provides: rememberEntity, resolve_approval logic
provides:
  - brain-cli binary: consolidate, list-approvals, resolve-approval subcommands
  - CLI entry point at packages/mcp-server/src/cli.ts
affects:
  - CNSLD-05 (now satisfied: CLI-based consolidation trigger)
  - APRV-04 (now satisfied: CLI-based approval management)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - process.argv subcommand dispatch (no external CLI framework for 3 subcommands)
    - All diagnostic output via console.error(); structured output via console.log()
    - openDatabase() shared DB access pattern (same file as MCP server)

key-files:
  created:
    - packages/mcp-server/src/cli.ts
  modified:
    - packages/mcp-server/package.json

key-decisions:
  - "Used process.argv directly (no commander/yargs): only 3 subcommands, zero extra dependencies warranted"
  - "Replicated resolve_approval merge_candidate entity reassignment logic verbatim from tools.ts — identical behavior without MCP session"

requirements-completed: [CNSLD-05, APRV-04]

# Metrics
duration: 81s
completed: 2026-03-21
---

# Phase 03 Plan 03: CLI Entry Point (Gap Closure) Summary

**Thin CLI wrapper over runConsolidation() and approval queue logic — closes CNSLD-05 and APRV-04 gaps by making consolidation and approval management available from a terminal without an MCP session**

## Performance

- **Duration:** 81s
- **Started:** 2026-03-21T02:35:53Z
- **Completed:** 2026-03-21T02:37:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `brain consolidate` CLI command calls runConsolidation() directly and prints a human-readable summary
- `brain list-approvals [--limit N]` queries pending approval_queue rows and formats each with entity/observation/confidence/evidence
- `brain resolve-approval <id> <approve|reject|edit> [--content "..."]` replicates the full resolve_approval MCP tool logic including entity merge candidate reassignment
- TypeScript compiles clean, dist/cli.js has #!/usr/bin/env node shebang, help and error messages verified

## Task Commits

1. **Task 1: Create CLI entry point with consolidate, list-approvals, and resolve-approval subcommands** - `1d72878` (feat)
2. **Task 2: Build and verify CLI is executable end-to-end** - verified in Task 1 commit (no source changes; build clean, all acceptance criteria met)

## Files Created/Modified

- `packages/mcp-server/src/cli.ts` — 210-line CLI with subcommand dispatch, all three subcommands, error handling, and usage message
- `packages/mcp-server/package.json` — Added `"brain-cli": "./dist/cli.js"` to bin object

## Decisions Made

- `process.argv` used directly instead of a CLI framework — 3 subcommands does not justify an additional dependency
- Diagnostic output via `console.error()`, structured output via `console.log()` — consistent with MCP server convention where stdout is reserved

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- `packages/mcp-server/src/cli.ts` — FOUND
- `packages/mcp-server/package.json` bin entry `brain-cli` — FOUND
- `packages/mcp-server/dist/cli.js` — FOUND (built during Task 2)
- Commit `1d72878` — FOUND
- TypeScript build: exit 0 (no errors)
- `brain-cli --help`: prints all three subcommands
- `brain-cli resolve-approval` (no args): exits 1 with error message (not crash)
- `brain-cli list-approvals`: prints "No pending approvals." (exit 0)

## Self-Check: PASSED
