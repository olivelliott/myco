---
phase: 26-project-onboarding
plan: 01
subsystem: mcp-server/cli
tags: [onboarding, cli, llm, knowledge-graph, scanner]
requirements: [ONBOARD-01, ONBOARD-02, ONBOARD-03]

dependency_graph:
  requires:
    - packages/core/src/statements.ts (insertProjectPath, selectProjectForPath — Phase 24)
    - packages/mcp-server/src/tools.ts (rememberEntity)
    - packages/mcp-server/src/consolidator.ts (generateText + Output.object pattern)
  provides:
    - packages/mcp-server/src/onboarding-scanner.ts (scanProject, ProposedEntity, ScanResult)
    - packages/mcp-server/src/cli.ts#cmdInit (myco-cli init subcommand)
  affects:
    - packages/mcp-server/src/cli.ts (new imports + subcommand)

tech_stack:
  added: []
  patterns:
    - generateText + Output.object (Vercel AI SDK structured output, same as consolidator.ts)
    - AbortSignal.timeout(30_000) for LLM calls
    - readline/promises for interactive terminal input
    - node:child_process execSync for git config reading

key_files:
  created:
    - packages/mcp-server/src/onboarding-scanner.ts
  modified:
    - packages/mcp-server/src/cli.ts

decisions:
  - "Used source_type: 'agent_session' for onboarding writes — 'onboarding' not in SourceType union; agent_session is closest semantic match for human-guided initial population"
  - "Worktree was behind main (pre-Phase 24) — rebased onto main before Task 2 to pick up insertProjectPath/selectProjectForPath statements"
  - "npm install required after rebase to recreate @myco/core symlink in node_modules for TypeScript resolution"

metrics:
  duration_seconds: 325
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 26 Plan 01: Project Onboarding Scanner Summary

**One-liner:** `myco init` CLI command that reads config files, uses Ollama LLM to infer project conventions, and presents a numbered approval table for cherry-pick knowledge graph population.

## What Was Built

### Task 1: `onboarding-scanner.ts`

New module at `packages/mcp-server/src/onboarding-scanner.ts` that provides:

- `ProposedEntity` — typed interface for LLM-extracted entities (project/convention/tooling/user_preference/workflow_rule)
- `ScanResult` — scan output with project metadata, entities, and timing
- `readProjectFiles(projectPath)` — reads package.json, tsconfig.json, .eslintrc* (first found), README.md/CLAUDE.md (2000 char truncated), git config name/email
- `extractEntities(files, projectName)` — calls Ollama via `generateText` + `Output.object` with 30s timeout; falls back to basic package.json dependency extraction when Ollama is unavailable (ECONNREFUSED)
- `scanProject(projectPath)` — main entry point; resolves absolute path, reads files, calls LLM, prepends project entity, adds `belongs_to` relations to all proposed entities

### Task 2: `myco-cli init` subcommand

`cli.ts` extended with:

- New imports: `scanProject`, `nanoid`, `readline/promises`
- `cmdInit(args)` — scans project, prints numbered table (Type / Entity / Observation columns), prompts `[y]es all / [n]o / comma-separated numbers`, writes approved entities via `rememberEntity()`, registers project path via `insertProjectPath`
- `case 'init':` dispatch routing
- Updated `printUsage()` with `init [path]` entry

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree predated Phase 24 — missing selectProjectForPath/insertProjectPath**
- **Found during:** Task 2 TypeScript compile
- **Issue:** Worktree branch was forked before Phase 24 merged; `MycoStatements` in this worktree's `packages/core` had no project_paths statements
- **Fix:** `git rebase main` to bring worktree up to date with Phase 24+25 commits; then `npm install` to recreate `@myco/core` symlink
- **Files modified:** No source files changed — rebase pulled in existing upstream changes
- **Commit:** Rebase (no separate commit — integrated into existing history)

**2. [Rule 3 - Blocking] Missing npm symlink for @myco/core after rebase**
- **Found during:** Task 2 TypeScript compile (post-rebase)
- **Issue:** `node_modules/@myco/` symlink didn't exist in worktree after rebase; TypeScript resolved to stale path
- **Fix:** `npm install --workspace=packages/mcp-server` to recreate workspace symlinks
- **Files modified:** node_modules (not committed)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `60af849` | feat(26-01): create onboarding-scanner.ts |
| Task 2 | `3574b4a` | feat(26-01): add init subcommand to CLI |

## Test Results

76 tests passing across 5 test files in packages/mcp-server/tests/. No regressions.

## Known Stubs

None. The scanner makes a real LLM call (with fallback) and writes to the real knowledge graph.

## Self-Check: PASSED

- [x] `packages/mcp-server/src/onboarding-scanner.ts` exists
- [x] `packages/mcp-server/src/cli.ts` has `case 'init':`
- [x] TypeScript compiles clean (`npx tsc --noEmit -p packages/mcp-server/tsconfig.json`)
- [x] Commits `60af849` and `3574b4a` exist
- [x] 76 tests passing
