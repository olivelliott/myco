---
phase: 27-workflow-rules-and-knowledge-correction
verified: 2026-03-27T11:46:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 27: Workflow Rules and Knowledge Correction Verification Report

**Phase Goal:** Agents can store actionable procedural instructions as first-class rule entities that are always surfaced at session start, and any stale or incorrect knowledge can be found and superseded in a single operation
**Verified:** 2026-03-27T11:46:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Calling `remember_rule` stores a `workflow_rule` entity with `decay_exempt=true` and `confidence=1.0` | ✓ VERIFIED | `rememberRule()` at tools.ts:781 calls `rememberEntity()` with `entity_type: 'workflow_rule', confidence: 1.0`, then runs `UPDATE entities SET decay_exempt = 1` (tools.ts:808). Tests 1-3 in workflow-rules.test.ts confirm all three DB columns via direct SQL query — all pass. |
| 2 | Calling `update_knowledge` without `confirm_id` returns candidate observations for correction | ✓ VERIFIED | Phase 1 search at tools.ts:695-771 uses dual-path FTS5/KNN, returns `{ action: 'confirm', candidates: [...] }`. Test "search phase returns candidates matching query text" confirms `action === 'confirm'` and non-empty candidates — passes. |
| 3 | Confirming an `update_knowledge` candidate retires old observation and inserts replacement atomically | ✓ VERIFIED | Phase 2 at tools.ts:655-667 executes `db.transaction()` calling `retireObservation()` + `stmts.insertObservationTemporal.run()` + `stmts.insertFtsObservation.run()` in one shot. Tests "confirm phase retires old observation" and "atomic transaction: both retire and insert happen" — both pass. |
| 4 | Retired observations have `valid_until` set and are excluded from default recall | ✓ VERIFIED | `retireObservation()` sets `valid_until`; `recallKnowledge()` at tools.ts:247 filters `WHERE (o.valid_until IS NULL)` by default. Test "retired observation is excluded from default recall results" directly verifies exclusion via `recallKnowledge()` — passes. |
| 5 | Workflow rules are surfaced at session start via the hook's query | ✓ VERIFIED | `queryWorkflowRules()` in `hooks/myco-session-start.js:107` queries `WHERE e.type = 'workflow_rule' AND (e.project = ? OR e.project IS NULL) AND e.merged_into IS NULL`. Test "session-start query surfaces the rule (proves RULE-03)" replicates this SQL verbatim and asserts rule appears — passes. |
| 6 | `remember_rule` is idempotent — duplicate instruction does not create duplicate entity | ✓ VERIFIED | Entity name is `rule:{sha256-8}` of instruction text (tools.ts:789-790); `rememberEntity()` upserts by name+type. Test "duplicate instruction does not create a duplicate entity" calls twice, asserts `rows.length === 1` — passes. |
| 7 | Migration 10 adds `decay_exempt` column to `entities` table | ✓ VERIFIED | `migrations.ts:141-151` — migration id 10 `add_entity_decay_exempt` runs `ALTER TABLE entities ADD COLUMN decay_exempt INTEGER NOT NULL DEFAULT 0` with a partial index. Migration applied successfully in test runs (output shows "Applied migration 10: add_entity_decay_exempt"). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp-server/src/tools.ts` | `remember_rule` and `update_knowledge` MCP tool registrations | ✓ VERIFIED | Both `server.registerTool('remember_rule', ...)` at line 1237 and `server.registerTool('update_knowledge', ...)` at line 1259 exist and are substantive (full handlers, not stubs). Total tool count = 11 (9 prior + 2 new), matching plan expectation. |
| `packages/mcp-server/src/tools.ts` | `rememberRule` exported function | ✓ VERIFIED | `export async function rememberRule` at line 781 — 31 lines of substantive logic with hash generation, content assembly, `rememberEntity()` call, and `decay_exempt` SQL update. |
| `packages/mcp-server/src/tools.ts` | `updateKnowledge` exported function | ✓ VERIFIED | `export async function updateKnowledge` at line 633 — full two-phase implementation: 60+ lines covering confirm path with atomic transaction and search path with dual FTS5/KNN. |
| `packages/mcp-server/tests/workflow-rules.test.ts` | Integration tests for `remember_rule` and `update_knowledge` | ✓ VERIFIED | 354 lines, 19 tests across two `describe` blocks (10 for `rememberRule`, 8 for `updateKnowledge`, plus 1 extra candidate fields test). All 19 pass. |
| `packages/core/src/migrations.ts` | Migration 10 for `entities.decay_exempt` | ✓ VERIFIED | Migration id 10 `add_entity_decay_exempt` at lines 141-151. Column added to entities table with partial index. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `remember_rule` tool handler | `rememberRule()` | Direct call in async handler (tools.ts:1248) | ✓ WIRED | `return await rememberRule(db, { instruction, project, triggers }, stmts)` |
| `rememberRule()` | `rememberEntity()` | Calls with `entity_type='workflow_rule'`, `confidence: 1.0` (tools.ts:797-805) | ✓ WIRED | Pattern `rememberEntity.*workflow_rule` confirmed present |
| `rememberRule()` | `decay_exempt` SQL update | Direct `db.prepare().run()` after `rememberEntity()` (tools.ts:808) | ✓ WIRED | `UPDATE entities SET decay_exempt = 1 WHERE name = ? AND type = ?` |
| `update_knowledge` tool handler | `updateKnowledge()` | Direct call in async handler (tools.ts:1271) | ✓ WIRED | `return await updateKnowledge(db, { query, new_value, entity_name, confirm_id }, stmts)` |
| `updateKnowledge()` confirm phase | `retireObservation()` + `insertObservationTemporal` | `db.transaction()` at tools.ts:655 | ✓ WIRED | Pattern `retireObservation` confirmed present inside transaction block |
| `queryWorkflowRules` in session-start hook | `workflow_rule` entities | SQL `WHERE e.type = 'workflow_rule'` (myco-session-start.js:115) | ✓ WIRED | Hook queries this type; test replicates the SQL and confirms rules surface |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `rememberRule` | `entity_name` (hashed) | `createHash('sha256').update(instruction)` | Yes — deterministic from input | ✓ FLOWING |
| `updateKnowledge` search | `candidates[]` | FTS5 via `fts_observations MATCH ?` or KNN via `vec_embeddings` JOIN | Yes — DB query with real results | ✓ FLOWING |
| `updateKnowledge` confirm | retired observation / new observation | `db.transaction()` with `retireObservation` + `insertObservationTemporal` | Yes — both rows verified in DB by tests | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 19 integration tests pass | `npx vitest run packages/mcp-server/tests/workflow-rules.test.ts` | 19 passed (19), 0 failed | ✓ PASS |
| TypeScript compiles cleanly | `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` | No output (exit 0) | ✓ PASS |
| 11 MCP tools registered (9 + 2 new) | `grep -c "server.registerTool" tools.ts` | 11 | ✓ PASS |
| Migration 10 applies cleanly | Vitest run output | "Applied migration 10: add_entity_decay_exempt" in all test runs | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RULE-01 | 27-01, 27-02 | Workflow rules stored as `entity_type='workflow_rule'` with structured observation format | ✓ SATISFIED | `rememberRule()` sets `entity_type: 'workflow_rule'`; migration 10 adds `decay_exempt` to entities; tests 1-5 verify entity structure in DB |
| RULE-02 | 27-01, 27-02 | `remember_rule` MCP tool captures actionable instructions with optional trigger context | ✓ SATISFIED | Tool registered at line 1237; trigger annotation confirmed via test "with triggers, observation content includes trigger annotation" |
| RULE-03 | 27-02 | All workflow rules always included in session-start injection, not similarity-ranked | ✓ SATISFIED | `queryWorkflowRules` in hook returns all `workflow_rule` entities for project + global scope; test "session-start query surfaces the rule" replicates hook SQL and verifies rule appears |
| CORRECT-01 | 27-01, 27-02 | `update_knowledge` finds stale observations by natural language query and presents for confirmation | ✓ SATISFIED | Phase 1 search with FTS5 fallback (no Ollama needed); test "search phase returns candidates matching query text" verifies `action === 'confirm'` with non-empty candidates |
| CORRECT-02 | 27-01, 27-02 | Confirmed corrections supersede old observation (`valid_until`) and insert replacement in single operation | ✓ SATISFIED | `db.transaction()` atomically retires via `retireObservation()` and inserts via `insertObservationTemporal`; tests verify both rows change state; "atomic transaction" test confirms no partial state |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TODOs, stubs, placeholder returns, or empty handlers in phase artifacts | — | — |

Notes on scan:
- `rememberRule` and `updateKnowledge` both have full implementations with real DB operations — not stubs
- Tool error handlers return structured error JSON (not empty objects) — correct pattern
- `action: 'no_matches'` on empty search results is documented behavior, not a stub

### Human Verification Required

None. All success criteria are programmatically verifiable and confirmed via the test suite.

### Gaps Summary

No gaps found. All 7 observable truths verified, all 5 artifacts substantive and wired, all 5 requirements satisfied, and 19 integration tests pass end-to-end.

---

_Verified: 2026-03-27T11:46:00Z_
_Verifier: Claude (gsd-verifier)_
