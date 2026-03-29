---
phase: 26-project-onboarding
plan: "02"
subsystem: mcp-server
tags: [onboarding, mcp-tool, testing, scanner]
dependency_graph:
  requires: [26-01]
  provides: [init_project MCP tool, onboarding test coverage]
  affects: [packages/mcp-server/src/tools.ts, packages/mcp-server/tests/onboarding.test.ts]
tech_stack:
  added: []
  patterns: [vitest mock for ai module, top-level await import after mock setup]
key_files:
  created:
    - packages/mcp-server/tests/onboarding.test.ts
  modified:
    - packages/mcp-server/src/tools.ts
decisions:
  - init_project omits relations from MCP response to keep agent output clean — agent can pass relations when calling remember()
  - Top-level await import for onboarding-scanner in test file — ensures vi.mock('ai') is applied before the scanner module loads
  - Pre-existing cli.ts TypeScript errors (selectProjectForPath, insertProjectPath) are out of scope for this plan
metrics:
  duration: ~5 minutes
  completed: "2026-03-29"
  tasks: 2
  files: 2
---

# Phase 26 Plan 02: init_project MCP Tool and Onboarding Tests Summary

**One-liner:** init_project MCP tool wiring scanProject() into tools.ts with agent-mediated approval instructions, plus 14 vitest tests covering file reading, fallback extraction, and dedup idempotency.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Register init_project MCP tool in tools.ts | 9d5aa54 | packages/mcp-server/src/tools.ts |
| 2 | Add onboarding tests — scanner unit tests and integration test | 607e2af | packages/mcp-server/tests/onboarding.test.ts |

## What Was Built

### Task 1: init_project MCP Tool

Added `init_project` tool to `registerTools()` in `packages/mcp-server/src/tools.ts`:

- Imports `scanProject` from `./onboarding-scanner.js`
- Accepts optional `path` parameter (defaults to `process.cwd()`)
- Calls `scanProject(targetPath)` and returns structured JSON with:
  - `project_name`, `project_path`, `files_scanned`, `scan_duration_ms`
  - `proposed_entities` array (entity_name, entity_type, observation, confidence, category — relations omitted for clean output)
  - `instructions` field guiding the agent on what to do: present to user, call `remember()` for each approved entity
- Full error handling returning `SCAN_ERROR` with message on failure

### Task 2: Onboarding Tests

Created `packages/mcp-server/tests/onboarding.test.ts` with 14 tests across 3 describe groups:

**`describe('readProjectFiles')`** (5 tests):
- Reads package.json from monorepo root
- Returns empty record for nonexistent directory
- Truncates README.md to 2000 chars
- Truncates CLAUDE.md to 2000 chars
- Reads package.json and tsconfig.json without truncation

**`describe('scanProject')`** (7 tests):
- Returns ScanResult with project_name from package.json
- Falls back to directory basename when package.json absent
- Always includes a `project` type entity
- Handles Ollama unavailability gracefully (fallback path via mocked ECONNREFUSED)
- project_path is an absolute path
- files_scanned lists readable project files
- AbortSignal.timeout usage verified structurally

**`describe('scanProject idempotency')`** (2 tests):
- `rememberEntity` called twice with same observation returns NOOP on second call ("already exists — skipped")
- Different observations for same entity are NOT deduplicated

## Deviations from Plan

### Out-of-scope pre-existing issue noted

**Pre-existing TypeScript errors in cli.ts** (`selectProjectForPath`, `insertProjectPath` not in `MycoStatements`) were discovered but are pre-existing from a previous phase's incomplete work. They are out of scope for this plan.

These errors were logged as deferred items and do not affect this plan's functionality — tools.ts compiles clean, all 14 tests pass.

### Auto-fixed Issues

**[Rule 2 - Test infrastructure] Top-level await import for scanner**
- **Found during:** Task 2 test authoring
- **Issue:** `vi.mock('ai', ...)` must be hoisted before module imports, but `readProjectFiles` and `scanProject` are imported from a module that imports 'ai'. Using a regular static import would import the scanner before the mock applies.
- **Fix:** Used `const { readProjectFiles, scanProject } = await import('../src/onboarding-scanner.js')` after the `vi.mock()` call, ensuring mock is active when the scanner module loads.
- **Files modified:** packages/mcp-server/tests/onboarding.test.ts

## Known Stubs

None. All plan goals achieved — init_project tool fully wired, scanner tested end-to-end.

## Self-Check: PASSED

- packages/mcp-server/src/tools.ts — FOUND (modified)
- packages/mcp-server/tests/onboarding.test.ts — FOUND (created, 298 lines)
- Commit 9d5aa54 — FOUND (feat: register init_project MCP tool)
- Commit 607e2af — FOUND (test: add onboarding scanner unit and integration tests)
- 14/14 tests passing
- TypeScript errors in scope (tools.ts): 0
