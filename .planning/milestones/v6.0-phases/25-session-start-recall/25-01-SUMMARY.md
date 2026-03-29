---
phase: 25-session-start-recall
plan: "01"
subsystem: hooks
tags: [session-start, knowledge-injection, sqlite, tdd, hooks]
dependency_graph:
  requires: [24-01]
  provides: [automatic-session-recall]
  affects: [hooks/myco-session-start.js]
tech_stack:
  added: []
  patterns: [readonly-sqlite, file-based-novelty-hash, priority-ordered-token-budgeting]
key_files:
  created:
    - hooks/tests/session-start-recall.test.cjs
    - hooks/package.json
  modified:
    - hooks/myco-session-start.js
decisions:
  - "Use hooks/package.json with type:commonjs to fix ESM/CJS conflict caused by root package.json type:module"
  - "Test file uses .cjs extension to match hooks/ CJS environment"
  - "resolveProject() uses positional parameters (not $path named params) for compatibility with better-sqlite3 .get() API in hooks"
metrics:
  duration_seconds: 250
  completed_date: "2026-03-29"
  tasks_completed: 1
  files_changed: 3
requirements: [SCOPE-02, RECALL-01, RECALL-02, RECALL-03, RECALL-04]
---

# Phase 25 Plan 01: Session-Start Recall Summary

Database-backed SessionStart hook with project resolution, priority-ordered knowledge injection, 6,000-char token budgeting, SHA-256 novelty filtering, and 500ms hard timeout — 31 tests passing.

## Summary

Upgraded `hooks/myco-session-start.js` from a static "consider using recall" reminder into a fully functional knowledge-injecting hook. The hook now resolves the session's `cwd` to a registered project via the `project_paths` table (Phase 24), queries workflow rules, project facts, and user preferences with priority-ordered token budgeting (rules > facts > preferences, 6,000 char cap), tracks injection novelty via SHA-256 file hash to skip unchanged sessions, and degrades gracefully across all error paths (no DB, empty DB, no project, DB locked, timeout).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Rewrite session-start hook with knowledge injection (TDD) | 53d1bf7 | hooks/myco-session-start.js, hooks/tests/session-start-recall.test.cjs, hooks/package.json |

## What Was Built

### hooks/myco-session-start.js (rewritten)

Core functions:
- `resolveProject(db, cwd)` — walk-up SQL query against `project_paths` table, returns project name or null
- `queryWorkflowRules(db, projectName)` — fetches `workflow_rule` entities for project + global scope, excludes merged
- `queryProjectFacts(db, projectName)` — fetches current observations (valid_until IS NULL) for project entities, excludes rules/prefs
- `queryUserPreferences(db)` — fetches global `user_preference` entities (project IS NULL)
- `buildInjection(rules, facts, preferences, projectName)` — assembles `<myco>` block with 6,000 char cap; truncates facts section first if over budget; appends "More context available" note when truncated or LIMIT 30 hit
- `computeContentHash(text)` — 16-char truncated SHA-256 for novelty tracking

Key behaviors:
- Opens DB with `readonly: true` — never holds a write lock
- 500ms hard deadline checked between each query section
- Novelty hash stored at `~/.local/share/myco/last-injection-hash` (includes project + cwd in hash input)
- All error paths exit 0 with graceful fallback messages
- Exports all core functions when loaded as a module (for testing)
- Fixed legacy `brain.db` default path to `myco.db`

### hooks/package.json (new)

Added `{ "type": "commonjs" }` to override the root monorepo's `"type": "module"`. Without this, Node.js treats all `.js` files in `hooks/` as ESM and `require()` fails. This fixes a pre-existing bug that made the hook non-functional when run directly from the repo path.

### hooks/tests/session-start-recall.test.cjs (new, 31 tests)

Uses Node.js built-in `node:test` + `node:assert`. Creates an in-memory better-sqlite3 database with the minimal schema (entities, observations, project_paths), seeds test data, and tests all exported functions:

- `resolveProject`: exact match, subdirectory match, no-match, partial-prefix non-match
- `queryWorkflowRules`: project+global scope, merged exclusion, null project
- `queryProjectFacts`: current-only observations, superseded exclusion, type exclusion, null project
- `queryUserPreferences`: global-only, project-scoped exclusion
- `buildInjection`: ordering, `<myco>` wrapping, 6,000-char cap, truncation note, empty-DB message, no-project behavior
- `computeContentHash`: determinism, distinctness, 16-char hex format
- Novelty filtering: hash match, missing file, hash mismatch
- Graceful degradation: getDbPath env var, empty DB, all-empty injection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CJS/ESM conflict in hooks/ directory**
- **Found during:** Task 1 (RED phase — tests immediately failed with "require is not defined in ES module scope")
- **Issue:** The root `package.json` has `"type": "module"`, causing Node.js to treat all `.js` files in `hooks/` as ESM. The hooks use `require()` (CommonJS). This means both the existing `myco-session-start.js` and any new test files fail when run via `node hooks/...`.
- **Fix:** Added `hooks/package.json` with `{ "type": "commonjs" }` to override the root ESM setting for the hooks directory. Renamed the test file to `.cjs` extension as an additional guard.
- **Files modified:** `hooks/package.json` (new), `hooks/tests/session-start-recall.test.cjs` (renamed from .test.js)
- **Commit:** 53d1bf7

**2. [Rule 1 - Bug] Test file uses .cjs extension**
- The plan specified `.test.js` but with the `hooks/package.json` fix already in place, `.cjs` was used for belt-and-suspenders clarity. The verification command in the plan (`node --test hooks/tests/session-start-recall.test.js`) needed updating to `.cjs`.

## Acceptance Criteria Met

- `grep "readonly: true" hooks/myco-session-start.js` — match found
- `grep "myco.db" hooks/myco-session-start.js` — match found
- `grep "brain.db" hooks/myco-session-start.js` — no match (removed)
- `grep "workflow_rule" hooks/myco-session-start.js` — match found
- `grep "user_preference" hooks/myco-session-start.js` — match found
- `grep "project_paths" hooks/myco-session-start.js` — match found
- `grep "6000" hooks/myco-session-start.js` — match found
- `grep "last-injection-hash" hooks/myco-session-start.js` — match found
- `grep "createHash" hooks/myco-session-start.js` — match found
- `grep "No changes since last session" hooks/myco-session-start.js` — match found
- `grep "No project context found" hooks/myco-session-start.js` — match found
- `grep "More context available" hooks/myco-session-start.js` — match found
- `grep "data.cwd" hooks/myco-session-start.js` — match found
- `grep "module.exports" hooks/myco-session-start.js` — match found
- `node --test hooks/tests/session-start-recall.test.cjs` — 31/31 pass
- Multiple `process.exit(0)` paths (12 total)
- Valid JSON output with `hookSpecificOutput.additionalContext`

## Known Stubs

None. The hook queries real DB tables. Phase 27-28 will populate `workflow_rule` and `user_preference` entities, but the queries are already wired and ready.

## Self-Check: PASSED
