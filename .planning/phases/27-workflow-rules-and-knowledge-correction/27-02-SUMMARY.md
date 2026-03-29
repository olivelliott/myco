---
phase: 27-workflow-rules-and-knowledge-correction
plan: "02"
subsystem: mcp-server/tests
tags: [testing, tdd, workflow-rules, update-knowledge, integration-tests]
dependency_graph:
  requires: [27-01]
  provides: [RULE-01-proof, RULE-02-proof, RULE-03-proof, CORRECT-01-proof, CORRECT-02-proof]
  affects: [packages/mcp-server/tests, packages/mcp-server/src, packages/core/src]
tech_stack:
  added: []
  patterns: [vitest integration tests against real SQLite, FTS5 fallback search, temporal observation lifecycle]
key_files:
  created:
    - packages/mcp-server/tests/workflow-rules.test.ts
  modified:
    - packages/mcp-server/src/tools.ts
    - packages/core/src/migrations.ts
decisions:
  - "decay_exempt column must live on entities table (not just observations) — added migration 10"
  - "updateKnowledge confirm phase must pass 'unknown' agent_id (NOT NULL constraint on observations)"
metrics:
  duration: 480
  completed_date: "2026-03-27"
  tasks_completed: 2
  files_changed: 3
---

# Phase 27 Plan 02: Workflow Rules and Knowledge Correction Tests Summary

Integration tests proving all five phase success criteria using a real SQLite database — 19 tests across rememberRule (10) and updateKnowledge (9), with two auto-fixed bugs discovered during execution.

## Tasks Completed

| # | Task | Commit | Key Output |
|---|------|--------|------------|
| 1 | Integration tests for remember_rule | b8d3f10 | 10 tests: entity type, decay_exempt, confidence, name pattern, project scope, triggers, session-start surfacing, idempotency |
| 2 | Integration tests for update_knowledge | b8d3f10 | 9 tests: search candidates, entity_name filter, no-match, retire+insert, recall exclusion, NOT_FOUND, atomicity |

## Verification

```
npx vitest run packages/mcp-server/tests/workflow-rules.test.ts
Test Files  1 passed (1)
Tests  19 passed (19)

npx vitest run packages/mcp-server/tests/
Test Files  7 passed (7)
Tests  109 passed (109)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing decay_exempt column on entities table**
- **Found during:** Task 1 — rememberRule tests
- **Issue:** `rememberRule` in tools.ts does `UPDATE entities SET decay_exempt = 1` but migration 6 only added `decay_exempt` to the `observations` table, not `entities`
- **Fix:** Added migration 10 (`add_entity_decay_exempt`) to `packages/core/src/migrations.ts` with `ALTER TABLE entities ADD COLUMN decay_exempt INTEGER NOT NULL DEFAULT 0` and an index; rebuilt core dist
- **Files modified:** `packages/core/src/migrations.ts`
- **Commit:** b8d3f10

**2. [Rule 1 - Bug] updateKnowledge confirm phase passed null for agent_id**
- **Found during:** Task 2 — updateKnowledge confirm tests
- **Issue:** `stmts.insertObservationTemporal.run(...)` call in `updateKnowledge` passed `null` for `agent_id`, but the `observations` table has `agent_id TEXT NOT NULL` — causing `NOT NULL constraint failed` on every confirm operation
- **Fix:** Changed `null` to `'unknown'` to match the default used by `rememberEntity`
- **Files modified:** `packages/mcp-server/src/tools.ts` line 662
- **Commit:** b8d3f10

## Success Criteria Verification

- [x] RULE-01: `workflow_rule` entity type verified — `type='workflow_rule'` test passes
- [x] RULE-02: `remember_rule` tool — `decay_exempt=1`, `confidence=1.0`, name pattern confirmed
- [x] RULE-03: Session-start surfacing — hook SQL replicated directly in test, rule appears in results
- [x] CORRECT-01: `update_knowledge` search returns candidates with `action='confirm'` and candidate fields
- [x] CORRECT-02: Confirm phase is atomic — old obs gets `valid_until` set, new obs inserted with `valid_from`; retired observations excluded from default recall

## Known Stubs

None — all tests wire against real data and real SQL.

## Self-Check: PASSED
