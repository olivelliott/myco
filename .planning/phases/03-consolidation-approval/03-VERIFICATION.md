---
phase: 03-consolidation-approval
verified: 2026-03-21T03:10:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: true
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "Running `brain consolidate` processes unconsolidated episodes from a CLI command (CNSLD-05)"
    - "A human can approve, reject, or edit a queued item from the CLI (APRV-04)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Trigger consolidation via `brain-cli consolidate` and verify LLM fact extraction produces evidence_quote values"
    expected: "Summary shows totalExtracted > 0 with evidence_quote fields in queued items containing verbatim text from episode payloads"
    why_human: "Requires a running Ollama instance with llama3.2 model and pre-populated episode data to verify end-to-end LLM extraction quality"
  - test: "Run consolidation with episodes containing near-duplicate entity names (e.g., 'TypeScript' and 'Typescript')"
    expected: "The near-duplicate triggers a merge_candidate queue entry; `brain-cli list-approvals` shows it; `brain-cli resolve-approval <id> approve` merges the entities"
    why_human: "Requires live database with test data; Levenshtein logic is code-verified but runtime integration needs confirmation"
  - test: "Verify nightly cron fires at 2am America/New_York without manual intervention"
    expected: "stderr log '[consolidation] nightly run starting' appears at 2am EST/EDT"
    why_human: "Time-based behavior cannot be verified without running the server overnight"
---

# Phase 3: Consolidation + Approval Verification Report

**Phase Goal:** The brain distills raw episode logs into durable graph knowledge nightly, and the human can review and control what becomes permanent
**Verified:** 2026-03-21
**Status:** human_needed — all automated checks pass; 3 items require live runtime validation
**Re-verification:** Yes — after gap closure (plan 03-03)

## Re-verification Summary

| Gap from Initial Verification | Status |
|-------------------------------|--------|
| CNSLD-05: No CLI command `brain consolidate` | CLOSED |
| APRV-04: No CLI-based approval flow | CLOSED |

Both gaps share the same root cause (no CLI layer). Both are resolved by the addition of `packages/mcp-server/src/cli.ts` (257 lines) and the `brain-cli` bin entry in `package.json`.

Regression check: all 8 previously-passing artifacts and 7 key links remain intact — no regressions detected.

---

## Goal Achievement

### Observable Truths (ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `brain consolidate` processes unconsolidated episodes, extracts facts with evidence quotes, writes high-confidence facts to graph | VERIFIED | `cli.ts` line 43 calls `runConsolidation(db)` and prints ConsolidationSummary. `dist/cli.js` compiled and executable. `brain-cli consolidate` runs without crash. |
| 2 | Nightly cron job runs at 2am EST without manual intervention | VERIFIED | `scheduler.ts` croner `'0 2 * * *'` + `timezone: 'America/New_York'`. Wired via `index.ts` line 28. |
| 3 | Facts that contradict existing knowledge, entity merge candidates, and low-confidence facts appear in the approval queue | VERIFIED | `determineQueueReason()` routes by contradiction/merge_candidate/low_confidence/cross_session. `INSERT INTO approval_queue` at consolidator.ts line 282. |
| 4 | A human can approve, reject, or edit a queued item from the CLI and the graph reflects the decision immediately | VERIFIED | `cli.ts` `cmdResolveApproval()` — lines 157-219 — replicates full MCP resolve_approval logic: reject sets status, approve/edit calls `rememberEntity()`, merge_candidate reassigns observations+relationships+entities. `brain-cli resolve-approval` with no args exits 1 with usage error (not crash). |
| 5 | Every auto-approved fact has a direct evidence quote traceable to the source episode | VERIFIED | `evidence_quote` required in `ExtractedFactSchema` Zod schema, required by LLM prompt, stored in approval_queue metadata JSON, and propagated through `rememberEntity()` call at cli.ts line 204. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp-server/src/cli.ts` | CLI entry point with consolidate, list-approvals, resolve-approval subcommands, min 80 lines | VERIFIED | 257 lines. Shebang line 1. All three subcommands implemented. Imports all three required dependencies. No stubs. |
| `packages/mcp-server/package.json` | `brain-cli` bin entry pointing to `./dist/cli.js` | VERIFIED | Line 7: `"brain-cli": "./dist/cli.js"` alongside `brain-mcp`. |
| `packages/mcp-server/dist/cli.js` | Compiled CLI artifact with shebang | VERIFIED | Exists. First line: `#!/usr/bin/env node`. TypeScript build exits 0 with no errors. |
| `packages/mcp-server/src/consolidator.ts` | Full pipeline: extractFacts, detectContradiction, findMergeCandidates, runConsolidation | VERIFIED (regression) | Key exports confirmed present. CONFIDENCE_THRESHOLD = 0.85 at line 14. INSERT INTO approval_queue at line 282. |
| `packages/core/src/schema.ts` | Schema migrations for consolidated_at and metadata columns | VERIFIED (regression) | Not modified in plan 03-03; previously verified intact. |
| `packages/mcp-server/src/scheduler.ts` | Cron scheduling for nightly consolidation | VERIFIED (regression) | croner `'0 2 * * *'` + America/New_York confirmed. |
| `packages/mcp-server/src/tools.ts` | Three MCP tools: consolidate, list_pending_approvals, resolve_approval | VERIFIED (regression) | All three registrations confirmed at lines 478, 496, 538. |
| `packages/mcp-server/src/index.ts` | Wiring of scheduler into server startup | VERIFIED (regression) | `scheduleDailyConsolidation(db)` at line 28. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `cli.ts` | `consolidator.ts` | `import { runConsolidation }` | VERIFIED | Line 10 import. Line 43 call: `await runConsolidation(db)`. |
| `cli.ts` | `tools.ts` | `import { rememberEntity }` | VERIFIED | Line 11 import. Line 204 call: `await rememberEntity(db, {...})`. |
| `cli.ts` | `@ai-workbots/core` | `import { openDatabase }` | VERIFIED | Line 9 import. Lines 40, 59, 138 calls: `openDatabase()`. |
| `consolidator.ts` | `ollama-ai-provider` | `createOllama` + `generateText` + `experimental_output` | VERIFIED (regression) | Confirmed in initial verification. |
| `consolidator.ts` | `tools.ts rememberEntity` | calls `rememberEntity()` with `source_type: 'consolidation'` | VERIFIED (regression) | Confirmed in initial verification. |
| `consolidator.ts` | `approval_queue table` | `INSERT INTO approval_queue` | VERIFIED (regression) | Line 282 confirmed. |
| `scheduler.ts` | `consolidator.ts runConsolidation` | cron callback | VERIFIED (regression) | Line 21 call confirmed. |
| `index.ts` | `scheduler.ts scheduleDailyConsolidation` | startup wiring | VERIFIED (regression) | Line 28 call confirmed. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CNSLD-01 | 03-02-PLAN | Nightly deep sleep cycle runs at 2am EST via cron | SATISFIED | `scheduler.ts` croner `'0 2 * * *'` America/New_York, wired at index.ts line 28 |
| CNSLD-02 | 03-01-PLAN | LLM-assisted extraction requires direct evidence quotes for every extracted fact | SATISFIED | `evidence_quote` in Zod schema, required by LLM prompt, stored in metadata JSON |
| CNSLD-03 | 03-01-PLAN | Contradiction detection identifies when new facts conflict with existing knowledge | SATISFIED | `detectContradiction()` uses KNN cosine distance < 0.3 via vec_embeddings |
| CNSLD-04 | 03-01-PLAN | Entity deduplication merges equivalent entities discovered across sessions | SATISFIED | `findMergeCandidates()` via Levenshtein <= 2 or case-insensitive match; merge logic replicated in cli.ts lines 187-200 |
| CNSLD-05 | 03-03-PLAN | Manual consolidation trigger available via CLI command | SATISFIED | `brain-cli consolidate` calls `runConsolidation(db)` from cli.ts line 43. Compiles and runs. |
| APRV-01 | 03-01-PLAN | Confidence scoring assigns a score to every extracted fact during consolidation | SATISFIED | `confidence` field in ExtractedFactSchema (min 0, max 1), required by LLM prompt, stored in metadata |
| APRV-02 | 03-01-PLAN | Facts above confidence threshold (0.85+) auto-approve into the knowledge graph | SATISFIED | `CONFIDENCE_THRESHOLD = 0.85`, `shouldAutoApprove` logic in `runConsolidation()` lines 246-249 |
| APRV-03 | 03-01-PLAN | Low-confidence facts, contradictions, and entity merge candidates queue for human review | SATISFIED | `determineQueueReason()` with tags: contradiction, merge_candidate, low_confidence, cross_session |
| APRV-04 | 03-03-PLAN | Human can approve, reject, or edit queued items | SATISFIED | `brain-cli resolve-approval <id> <approve|reject|edit>` — full logic including entity merge at cli.ts lines 114-228 |

All 9 requirements SATISFIED. No orphaned requirements found.

---

### Anti-Patterns Found

None found in `cli.ts`. No TODO/FIXME/placeholder comments. No empty implementations. No stub handlers. TypeScript compilation: exit 0, zero errors.

---

### Human Verification Required

#### 1. End-to-End LLM Fact Extraction via CLI

**Test:** With Ollama running and `llama3.2` model available, add 3-5 episodes via `log_episode` MCP tool, then run `brain-cli consolidate`.
**Expected:** Output shows `Facts extracted > 0` and `brain-cli list-approvals` displays items with non-empty `Evidence:` fields containing verbatim text from the episode payloads.
**Why human:** Requires live Ollama instance with populated episode data. LLM output quality and evidence_quote adherence cannot be verified statically.

#### 2. Levenshtein Merge Detection — CLI Round-Trip

**Test:** Insert two entities with names differing by 1-2 characters (e.g., "TypeScript" and "Typescript"), run `brain-cli consolidate`, then `brain-cli list-approvals`. Then run `brain-cli resolve-approval <id> approve`.
**Expected:** The fact appears with `reason: merge_candidate`. After approval, `brain-cli list-approvals` shows zero pending items and the secondary entity is deleted from the DB.
**Why human:** Requires live database with test data; runtime merge behavior needs end-to-end validation.

#### 3. Nightly Cron Timing

**Test:** Run the MCP server past 2am America/New_York and check stderr output.
**Expected:** `[consolidation] nightly run starting` appears in stderr at 2am EST/EDT, followed by summary log.
**Why human:** Time-based behavior requires overnight observation.

---

## Gaps Summary

No gaps remaining. Both gaps from initial verification are closed.

The two previously-blocking gaps (CNSLD-05 and APRV-04) both required a CLI layer over the existing `runConsolidation()` and approval queue logic. The addition of `packages/mcp-server/src/cli.ts` (257 lines) with the `brain-cli` bin entry resolves both gaps. The CLI:

- Wraps `runConsolidation()` via the `consolidate` subcommand
- Wraps the approval queue query via `list-approvals`
- Replicates the full `resolve_approval` MCP tool logic — including entity merge candidate reassignment — via `resolve-approval`

All 9 phase requirements (CNSLD-01 through CNSLD-05, APRV-01 through APRV-04) are now SATISFIED. Three human verification items remain, all requiring live runtime conditions (Ollama model, populated data, overnight timing) that cannot be verified statically.

---

_Verified: 2026-03-21_
_Verifier: Claude (gsd-verifier)_
