---
phase: 28-user-preferences
verified: 2026-03-27T12:35:00Z
status: gaps_found
score: 6/7 must-haves verified
gaps:
  - truth: "After promotion, the two original project-scoped entities have merged_into set to the global entity's id"
    status: partial
    reason: "setEntityMergedInto.run() in promotePreference passes 3 arguments (winner.id, now, loser.id) to a 2-param prepared statement. better-sqlite3 throws RangeError on too many args. The code path is never exercised in practice because selectEntityByNameType is project-agnostic — both projects always share one entity row, so losers is always empty and the buggy line is never reached. Test 3 has an if-guard that silently passes when no losers exist."
    artifacts:
      - path: "packages/mcp-server/src/tools.ts"
        issue: "Line 354: stmts.setEntityMergedInto.run(winner!.id, now, loser.id) — 3 args for a 2-param statement (UPDATE entities SET merged_into = ? WHERE id = ?). Correct call should be .run(winner!.id, loser.id)"
      - path: "packages/mcp-server/tests/user-preferences.test.ts"
        issue: "Test 3 wraps merged_into assertion in 'if (mergedEntities.length > 0)' — test passes even when no entities were merged, masking the bug"
    missing:
      - "Fix line 354 in tools.ts: change stmts.setEntityMergedInto.run(winner!.id, now, loser.id) to stmts.setEntityMergedInto.run(winner!.id, loser.id)"
      - "Update Test 3 to use expect(mergedEntities.length).toBeGreaterThan(0) to verify merging actually occurred — requires a scenario where two distinct entity rows exist (e.g., entities created with different names+types first, then a preference stored separately)"
---

# Phase 28: User Preferences Verification Report

**Phase Goal:** User preferences accumulate globally across projects with source attribution, so the agent always knows the user's preferences regardless of which project initiated the session
**Verified:** 2026-03-27T12:35:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A preference remembered for project A is stored as project-scoped on that project | VERIFIED | Test 1 passes: entity.project = 'alpha' confirmed |
| 2 | When the same preference is remembered for project B, both project-scoped copies promote to a single global entity (project=NULL) with source_projects metadata | VERIFIED | Test 2 passes: entity.project = null, meta.source_projects contains alpha+beta |
| 3 | After promotion, the two original project-scoped entities have merged_into set to the global entity's id | PARTIAL | Test 3 passes via if-guard masking — setEntityMergedInto.run() has a 3-arg bug, but losers is always empty so the bug is never triggered; merged_into path is untested |
| 4 | Explicit project=null in a remember call stores the preference as global immediately | VERIFIED | Test 4 passes: no promotion message, project=null confirmed |
| 5 | Promotion merges source_projects arrays into global entity metadata | VERIFIED | Test 5 passes: gamma added to source_projects on re-reinforcement |
| 6 | Session-start injection shows each global preference with its source project attribution | VERIFIED | Tests 8+11 pass: (from: alpha, beta) format confirmed in buildInjection output |
| 7 | Preferences with no source_projects metadata still render correctly without attribution | VERIFIED | Tests 9+10 pass: no (from: ...) suffix for preferences without metadata |

**Score:** 6/7 truths verified (1 partial due to latent bug in dead code path)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/statements.ts` | selectPreferencesByNameAcrossProjects, updateEntityProject, updateEntityMetadata, updateObservationMetadata | VERIFIED | All 4 statements present in interface and prepareStatements(); updateObservationEntityId2 also added |
| `packages/mcp-server/src/tools.ts` | promotePreference helper and promotion hook in rememberEntity | VERIFIED | promotePreference exported (line 251), called from rememberEntity for both NOOP and normal write paths |
| `packages/mcp-server/tests/user-preferences.test.ts` | 11 integration tests for preference promotion and attribution | VERIFIED | 11 tests in 2 describe blocks, all passing |
| `hooks/myco-session-start.js` | queryUserPreferences with obs_metadata, buildInjection with source attribution | VERIFIED | obs_metadata selected in SQL (line 177), attribution formatted in buildInjection (lines 250-257) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| packages/mcp-server/src/tools.ts | packages/core/src/statements.ts | stmts.selectPreferencesByNameAcrossProjects | VERIFIED | Line 265: stmts.selectPreferencesByNameAcrossProjects.all(entityName) |
| packages/mcp-server/src/tools.ts (rememberEntity) | packages/mcp-server/src/tools.ts (promotePreference) | post-write promotion check | VERIFIED | Lines 128-146 (NOOP path) and 214-225 (normal write path) both call promotePreference when entity_type === 'user_preference' |
| hooks/myco-session-start.js (queryUserPreferences) | observations.metadata | SQL query joining o.metadata as obs_metadata | VERIFIED | Line 177: o.metadata as obs_metadata in GROUP BY query |
| hooks/myco-session-start.js (buildInjection) | queryUserPreferences result | formatting source attribution into preference lines | VERIFIED | Lines 250-257: parses obs_metadata, appends (from: ...) suffix |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| hooks/myco-session-start.js (buildInjection) | preferences array | queryUserPreferences -> SQLite entities+observations | Yes — LEFT JOIN with GROUP BY, obs_metadata selected | FLOWING |
| packages/mcp-server/src/tools.ts (promotePreference) | sourceProjects | allProjects Set built from entity.project + metadata.source_projects + currentProject | Yes — reads real DB rows via selectPreferencesByNameAcrossProjects | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 11 user-preference tests pass | npx vitest run packages/mcp-server/tests/user-preferences.test.ts | 11 passed (1 test file) | PASS |
| No regressions in full test suite | npx vitest run packages/mcp-server/tests/ | 120 passed (8 test files) | PASS |
| TypeScript compiles without errors | npx tsc --noEmit -p packages/core/tsconfig.json && npx tsc --noEmit -p packages/mcp-server/tsconfig.json | No output (clean) | PASS |
| Session-start hook has no syntax errors | node -c hooks/myco-session-start.js | Clean | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PREF-01 | 28-01 | User preferences stored on global user entity (project=NULL) with source project as evidence | SATISFIED | promotePreference sets project=NULL and stores source_projects in entity+observation metadata |
| PREF-02 | 28-01 | Preferences start project-scoped, promote to global after 2+ projects or explicit confirmation | PARTIAL | Promotion logic works correctly for the common single-entity case; merged_into path for multi-entity scenarios has a latent argument-count bug (line 354, dead code in current implementation) |
| PREF-03 | 28-02 | User preferences included in session-start recall with source attribution | SATISFIED | queryUserPreferences returns obs_metadata, buildInjection appends (from: projectA, projectB) when present |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| packages/mcp-server/src/tools.ts | 354 | stmts.setEntityMergedInto.run(winner!.id, now, loser.id) — extra argument | WARNING | In current implementation, losers is always empty (selectEntityByNameType is project-agnostic), so this line never executes. If a scenario produces multiple entity rows for the same preference name, the transaction would throw RangeError at runtime. |
| packages/mcp-server/tests/user-preferences.test.ts | 121-126 | if (mergedEntities.length > 0) guard allows Test 3 to pass without verifying any actual merge | WARNING | Test 3 does not actually verify merged_into is set — it only verifies IF merged entities exist THEN they point to the winner. The base condition is never true in current tests. |

### Human Verification Required

None. All critical behaviors are testable and tested programmatically.

### Gaps Summary

**One gap, one latent bug in a dead code path:**

The `promotePreference` function contains a parameter-count bug on line 354 of `packages/mcp-server/src/tools.ts`:

```typescript
stmts.setEntityMergedInto.run(winner!.id, now, loser.id);
```

The `setEntityMergedInto` statement is `UPDATE entities SET merged_into = ? WHERE id = ?` — two bind parameters. The call passes three: `winner.id`, `now` (a timestamp), and `loser.id`. better-sqlite3 throws `RangeError: Too many parameter values were provided` when this executes.

The correct call (matching how the same statement is used at line 762 elsewhere) should be:

```typescript
stmts.setEntityMergedInto.run(winner!.id, loser.id);
```

**Why the tests still pass:** Because `selectEntityByNameType` selects entities by name+type without a project filter, both project "alpha" and project "beta" calls for the same preference name return the same entity row. The `losers` array in `promotePreference` is always empty (one row returned, winner picked, no losers), so the buggy line is never reached. Test 3's `if (mergedEntities.length > 0)` guard makes the test unconditionally pass without verifying any merge occurred.

**Impact on phase goal:** The primary goal (preferences accumulate globally with source attribution) is fully achieved. The bug only affects the `merged_into` bookkeeping on loser entities — a secondary correctness property that is not user-visible in the current architecture. The bug becomes active only if a future change causes multiple entity rows to exist for the same preference name+type, which the current schema prevents.

---

_Verified: 2026-03-27T12:35:00Z_
_Verifier: Claude (gsd-verifier)_
