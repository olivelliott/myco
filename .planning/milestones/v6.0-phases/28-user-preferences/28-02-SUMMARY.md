---
phase: 28-user-preferences
plan: 02
subsystem: hooks/session-start
tags: [user-preferences, source-attribution, session-start, tdd]
dependency_graph:
  requires: [28-01]
  provides: [source-attribution-in-session-start]
  affects: [hooks/myco-session-start.js, packages/mcp-server/tests/user-preferences.test.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, obs_metadata JSON parsing in hook, attribution formatting]
key_files:
  created: []
  modified:
    - hooks/myco-session-start.js
    - packages/mcp-server/tests/user-preferences.test.ts
decisions:
  - "obs_metadata in GROUP BY picks one observation's metadata (last SQLite processes); acceptable because promoted preferences consolidate source_projects on all active observations in Plan 01"
metrics:
  duration: 124s
  completed_date: "2026-03-29"
  tasks: 1
  files: 2
requirements: [PREF-03]
---

# Phase 28 Plan 02: Session-Start Source Attribution Summary

Source attribution in session-start injection — global preferences now display `(from: alpha, beta)` to show which projects corroborated them, using `obs_metadata` from the observations table.

## What Was Built

### Updated `queryUserPreferences()` in `hooks/myco-session-start.js`

Extended the SQL query to also select `o.metadata as obs_metadata`. The `GROUP BY e.id` means SQLite picks one observation's metadata per entity row — acceptable since Plan 01 ensures all active observations on a promoted preference share the same `source_projects` value.

Return type expanded: `Array<{name: string, observations: string, obs_metadata: string|null}>`.

### Updated `buildInjection()` preferences section

Added attribution parsing in the preferences rendering loop:

```javascript
if (p.obs_metadata) {
  const meta = JSON.parse(p.obs_metadata);
  if (meta.source_projects && meta.source_projects.length > 0) {
    attribution = ` (from: ${meta.source_projects.join(', ')})`;
  }
}
```

Output example: `- **dark theme**: prefers dark themes (from: alpha, beta)`

Preferences without `source_projects` metadata render identically to before — fully backward compatible.

### 5 New Tests in `packages/mcp-server/tests/user-preferences.test.ts`

- Test 7: `queryUserPreferences` returns `obs_metadata` field after promotion
- Test 8: `buildInjection` formats preference with source_projects as `(from: alpha, beta)`
- Test 9: `buildInjection` formats preference without metadata — no attribution suffix (backward compat)
- Test 10: `buildInjection` with empty `{}` metadata — no attribution suffix
- Test 11: End-to-end — promote via `rememberEntity`, then `queryUserPreferences` + `buildInjection` produces `(from: projectA, projectB)`

Total test suite: **120 tests passing** (was 98 at project start, 6 from Plan 01, 5 new here + pre-existing).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — source attribution is fully wired end-to-end from observation metadata to injection output.

## Self-Check: PASSED
