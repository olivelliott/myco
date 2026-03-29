---
phase: 26-project-onboarding
verified: 2026-03-27T11:22:00Z
status: gaps_found
score: 6/8 must-haves verified
gaps:
  - truth: "Project path is registered in project_paths on accept so session-start recall can find it"
    status: failed
    reason: "TypeScript compiler rejects cli.ts at the insertProjectPath/selectProjectForPath call sites — the core package dist/statements.d.ts is stale and does not include those two properties in MycoStatements, even though packages/core/src/statements.ts defines them. The compiled type declarations were not regenerated after Phase 24 added these statements."
    artifacts:
      - path: "packages/mcp-server/src/cli.ts"
        issue: "TS2339 — Property 'selectProjectForPath' does not exist on type 'MycoStatements' (line 134). TS2339 — Property 'insertProjectPath' does not exist on type 'MycoStatements' (line 136)."
      - path: "packages/core/dist/statements.d.ts"
        issue: "Stale compiled declarations — MycoStatements interface is missing selectProjectForPath and insertProjectPath. Source at packages/core/src/statements.ts has both, but dist was not rebuilt after Phase 24."
    missing:
      - "Run `tsc -b packages/core` (or `npm run build --workspace=packages/core`) to regenerate dist/statements.d.ts, then confirm `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` returns no errors"
  - truth: "myco init reads package.json, tsconfig.json, .eslintrc*, git config, README.md, and CLAUDE.md from the current directory"
    status: partial
    reason: "The scanner implementation is correct and the runtime behavior is verified by tests. However because cli.ts has TypeScript compilation errors (from the stale dist gap above), the CLI binary itself cannot be built. The scanner module compiles cleanly in isolation."
    artifacts:
      - path: "packages/mcp-server/src/cli.ts"
        issue: "Cannot build CLI binary due to TS2339 errors — runtime behavior blocked at build time"
    missing:
      - "Resolve the stale dist gap above — once core is rebuilt, cli.ts compiles and the init command becomes runnable"
---

# Phase 26: Project Onboarding Verification Report

**Phase Goal:** A developer can scan any codebase with `myco init` and commit a reviewed batch of inferred project knowledge to the graph in a single workflow, populating what session-start recall will surface in every future session.

**Verified:** 2026-03-27T11:22:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | myco init reads package.json, tsconfig.json, .eslintrc*, git config, README.md, and CLAUDE.md | PARTIAL | `readProjectFiles()` in onboarding-scanner.ts reads all listed files (lines 83–151). Tests confirm behavior. CLI binary cannot be built due to TypeScript errors in cli.ts (stale dist). |
| 2 | myco init calls Ollama via generateText+Output.object to infer non-obvious conventions | VERIFIED | `extractEntities()` in onboarding-scanner.ts uses `generateText` + `Output.object` pattern (lines 259–291). `AbortSignal.timeout(30_000)` confirmed at line 268. |
| 3 | myco init presents a numbered terminal table of proposed entities with Type, Entity, Observation columns | VERIFIED | `cmdInit()` in cli.ts renders a formatted table with `#`, `Type`, `Entity`, `Observation` columns (lines 57–75). Header, rows, and footer implemented. |
| 4 | User can accept all (y), reject all (n), or cherry-pick by line number (e.g. 1,3,5) | VERIFIED | readline prompt at lines 78–101 handles `y/yes`, `n/no`, and comma-separated integers with 1-indexed to 0-indexed conversion. |
| 5 | Accepted entities are committed to the knowledge graph via rememberEntity() | VERIFIED | Loop at lines 108–131 calls `rememberEntity(db, {...}, stmts)` for each selected entity with `project`, `entity_type`, `confidence`, and `relations` set. |
| 6 | The project path is registered in project_paths on accept so session-start recall can find it | FAILED | Code at lines 133–144 calls `stmts.selectProjectForPath` and `stmts.insertProjectPath`. TypeScript compiler emits TS2339 errors — `dist/statements.d.ts` does not include these properties. The logic is correct but the project does not compile. |
| 7 | Re-running myco init on the same project does not create duplicate entities (dedup classifier handles it) | VERIFIED | idempotency integration test in onboarding.test.ts confirms `rememberEntity` returns NOOP with "already exists — skipped" on second identical call (lines 262–280). |
| 8 | An agent can call init_project MCP tool and receive a structured list of proposed entities | VERIFIED | `init_project` registered in tools.ts at line 988. Accepts optional `path` param, calls `scanProject()`, returns `proposed_entities` array with `instructions` field guiding agent approval flow. |

**Score:** 6/8 truths verified (1 failed, 1 partial)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp-server/src/onboarding-scanner.ts` | Core scanning logic with scanProject, ScanResult, ProposedEntity exports | VERIFIED | 360 lines. Exports `ProposedEntity`, `ScanResult`, `readProjectFiles`, `extractEntities`, `scanProject`. LLM call with 30s AbortSignal + ECONNREFUSED fallback. |
| `packages/mcp-server/src/cli.ts` | init subcommand added to existing CLI dispatch | PARTIAL | `case 'init':` present at line 341. `cmdInit()` defined at line 45. TypeScript compilation blocked by stale dist (TS2339 on lines 134, 136). |
| `packages/mcp-server/src/tools.ts` | init_project MCP tool registration | VERIFIED | `init_project` registered at line 988. Imports `scanProject` from `./onboarding-scanner.js` (line 12). Correct schema, error handling, and instructions field. |
| `packages/mcp-server/tests/onboarding.test.ts` | Unit tests for scanner module and integration test for init_project | VERIFIED | 298 lines. 14 tests across 3 describe groups. All 14 pass. Covers file reading, LLM fallback, absolute path, idempotency. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| onboarding-scanner.ts | ai (generateText + Output.object) | Vercel AI SDK | VERIFIED | `import { generateText, Output } from 'ai'` at line 12. `experimental_output` used at line 265. |
| cli.ts | onboarding-scanner.ts | import { scanProject } | VERIFIED | Line 14: `import { scanProject } from './onboarding-scanner.js'`. Called at line 50. |
| cli.ts | tools.ts | import { rememberEntity } | VERIFIED | Line 13: `import { rememberEntity } from './tools.js'`. Called at line 112. |
| cli.ts | core/statements.ts | stmts.insertProjectPath | BROKEN | Call at line 136 resolves against stale `dist/statements.d.ts` — `insertProjectPath` absent from compiled type. Runtime would work; build does not. |
| tools.ts | onboarding-scanner.ts | import { scanProject } | VERIFIED | Line 12: `import { scanProject } from './onboarding-scanner.js'`. Called at line 1000. |
| onboarding.test.ts | onboarding-scanner.ts | import { readProjectFiles, scanProject } | VERIFIED | Line 23: dynamic import after vi.mock hoisting. Both symbols used throughout tests. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| cli.ts cmdInit | `result.proposed_entities` | `scanProject(projectPath)` → `extractEntities()` → `generateText` (Ollama) or `fallbackExtract(package.json)` | Yes — LLM response or real dep parse | FLOWING |
| cli.ts cmdInit | `stmts.insertProjectPath` (project registration) | Direct statement call on live DB | Yes — writes to project_paths table | HOLLOW (TypeScript error prevents build, but runtime logic is correct) |
| tools.ts init_project | `result` from `scanProject()` | Same path as above | Yes | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles without errors | `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` | 2 errors in cli.ts (TS2339 selectProjectForPath, TS2339 insertProjectPath) | FAIL |
| All 14 onboarding tests pass | `npx vitest run packages/mcp-server/tests/onboarding.test.ts` | 14/14 pass, 1.44s | PASS |
| onboarding-scanner.ts exports present | `grep -c "export.*ProposedEntity\|export.*ScanResult\|export async function scanProject"` | 3 matches | PASS |
| init_project tool registered | `grep "init_project" packages/mcp-server/src/tools.ts` | 3 matches (registration, log, error log) | PASS |
| case 'init' dispatch present | `grep "case 'init'" packages/mcp-server/src/cli.ts` | 1 match at line 341 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ONBOARD-01 | 26-01-PLAN.md | `myco init` CLI scans project files and infers conventions via LLM | PARTIAL | Scanner fully implemented and tested. CLI has TypeScript errors preventing build due to stale dist. Runtime logic is correct but binary cannot be produced without `tsc -b packages/core`. |
| ONBOARD-02 | 26-01-PLAN.md | Scan results presented as batch summary for human approval before committing | VERIFIED | Numbered table + y/n/cherry-pick prompt in cmdInit (lines 57–101). All three approval paths implemented. |
| ONBOARD-03 | 26-01-PLAN.md | Onboarding scan registers project path in project_paths for automatic context scoping | FAILED | Code written correctly (lines 133–144) but TypeScript compiler rejects it — stale `dist/statements.d.ts` missing the two statement properties from Phase 24. |
| ONBOARD-04 | 26-02-PLAN.md | init_project MCP tool provides onboarding capability from within a Claude Code session | VERIFIED | Tool registered and wired in tools.ts. Returns structured proposed_entities with agent instructions. tools.ts compiles clean (0 errors). |

No orphaned requirements detected — all four ONBOARD-* IDs appear in plan frontmatter and map to Phase 26 in REQUIREMENTS.md.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| packages/core/dist/statements.d.ts | N/A | Stale compiled declarations — source added `selectProjectForPath` and `insertProjectPath` in Phase 24 but dist was never rebuilt | BLOCKER | TypeScript project references resolve against dist; mcp-server tsconfig uses `references: [{ path: "../core" }]`, so cli.ts sees the stale type and emits TS2339 errors. The fix is one command: `tsc -b packages/core`. |

No TODO/FIXME/placeholder comments found in the phase 26 files.
No empty handlers or return stubs found.

---

### Human Verification Required

No items require human verification — all behavioral gaps are programmatically identified. Once the TypeScript compilation gap is fixed, manual testing of `myco init` end-to-end would be recommended but is not a blocker for phase acceptance.

---

### Gaps Summary

**One root cause, two affected truths:**

The `packages/core/dist/statements.d.ts` compiled type declarations are stale. Phase 24 added `selectProjectForPath` and `insertProjectPath` to both the `MycoStatements` interface in `packages/core/src/statements.ts` and the `prepareStatements()` implementation, but the `dist/` directory was not rebuilt. Because `packages/mcp-server/tsconfig.json` uses `composite` project references pointing to `../core`, TypeScript resolves `@myco/core` type information from `dist/statements.d.ts` rather than the source — and that dist file predates the Phase 24 additions.

**Consequence:** `cli.ts` lines 134 and 136 (the project path registration block in `cmdInit`) produce TS2339 errors at compile time. The `myco-cli` binary cannot be built. The project path registration logic itself is correctly written and would work at runtime if the build succeeded.

**All other phase 26 deliverables are fully functional:**
- `onboarding-scanner.ts` is complete, substantive, and wired — all exports verified, all tests pass
- `tools.ts` `init_project` tool compiles clean and is properly wired
- `onboarding.test.ts` runs 14/14 passing tests
- The CLI table display, interactive approval prompt, and `rememberEntity()` write loop are all correctly implemented

**Fix required:** Run `tsc -b packages/core` to regenerate `dist/statements.d.ts`, then confirm `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` returns no errors.

---

_Verified: 2026-03-27T11:22:00Z_
_Verifier: Claude (gsd-verifier)_
