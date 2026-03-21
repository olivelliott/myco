---
phase: 03-consolidation-approval
plan: 01
subsystem: consolidation
tags: [ai-sdk, ollama, sqlite-vec, levenshtein, consolidation, knowledge-graph]

# Dependency graph
requires:
  - phase: 02-mcp-server-memory
    provides: rememberEntity, embedText, KNN vec_embeddings pattern, approval_queue table
  - phase: 01-storage-foundation
    provides: SQLite schema (entities, observations, episodes tables), core types
provides:
  - Consolidation pipeline: extractFacts, detectContradiction, findMergeCandidates, isMergeCandidate, levenshtein, runConsolidation
  - Schema migrations: consolidated_at on episodes, metadata on approval_queue
  - Core types: ExtractedFact, ConsolidationSummary
  - source_type parameter on RememberParams for consolidation provenance
affects:
  - 03-02 (cron scheduler + manual trigger)
  - PWA approval queue (reads approval_queue.metadata JSON)

# Tech tracking
tech-stack:
  added:
    - ai@4.3.19 (Vercel AI SDK v4 — compatible with ollama-ai-provider LanguageModelV1)
    - ollama-ai-provider@1.2.0 (Ollama language model provider for AI SDK)
    - croner@10.0.1 (cron scheduler, used in 03-02)
  patterns:
    - Vercel AI SDK generateText + experimental_output + Output.object() for structured LLM output
    - Batch consolidation loop: fetch BATCH_SIZE, extract, route, mark consolidated
    - Auto-approve threshold: confidence >= 0.85 AND no contradiction AND no merge candidates
    - Queue with reason tags: contradiction, merge_candidate, low_confidence, cross_session
    - metadata JSON column on approval_queue stores full fact payload for human review

key-files:
  created:
    - packages/mcp-server/src/consolidator.ts
  modified:
    - packages/core/src/schema.ts (consolidated_at migration, idx_episodes_unconsolidated, metadata migration)
    - packages/core/src/types.ts (ExtractedFact, ConsolidationSummary, Episode.consolidated_at, ApprovalQueueItem.metadata)
    - packages/core/src/index.ts (export ExtractedFact, ConsolidationSummary)
    - packages/mcp-server/src/tools.ts (source_type param in RememberParams, registerTool migration)
    - packages/mcp-server/package.json (ai, ollama-ai-provider, croner dependencies)
    - package.json (zod override + devDep to unify Zod to single v4.3.6)

key-decisions:
  - "Use ai@4.3.19 not ai@6.x: ollama-ai-provider@1.2.0 returns LanguageModelV1, which ai@6 dropped in favor of LanguageModelV2+. ai@4.3.19 defines LanguageModel = LanguageModelV1 — compatible pair"
  - "Use experimental_output in ai@4 (not output — that's ai@6 API). Result field is result.experimental_output"
  - "Type cast ConsolidationOutputSchema for Output.object() due to Zod v4/v3 structural type mismatch in ai@4 types"
  - "Unify Zod to single v4.3.6 via root devDep + overrides — eliminates LanguageModelV1 Zod type conflicts in MCP SDK"
  - "Migrate server.tool() to server.registerTool() — MCP SDK 1.27.1 changed Zod v4 schema resolution, tool() deprecated"
  - "All consolidator logging via console.error() — stdout reserved for MCP transport"
  - "extractFacts failures mark batch consolidated anyway — prevents infinite reprocessing of failed batches"

patterns-established:
  - "Consolidation provenance: pass source_type: 'consolidation' to rememberEntity for auto-approved facts"
  - "Queue reason tags: contradiction > merge_candidate > low_confidence > cross_session (first match wins)"
  - "metadata JSON in approval_queue: { fact, source_episode_ids, merge_candidate_ids? }"

requirements-completed: [CNSLD-02, CNSLD-03, CNSLD-04, APRV-01, APRV-02, APRV-03]

# Metrics
duration: 12min
completed: 2026-03-21
---

# Phase 03 Plan 01: Consolidation Pipeline Core Summary

**LLM-powered episode-to-knowledge pipeline with Levenshtein merge detection, KNN contradiction detection, and auto-approve/queue routing via Vercel AI SDK + Ollama**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-21T01:02:52Z
- **Completed:** 2026-03-21T01:14:32Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Full consolidation pipeline: batch-reads unconsolidated episodes, extracts facts via Ollama LLM, routes to knowledge graph or approval queue
- Contradiction detection uses proven KNN cosine distance pattern from Phase 2 recallKnowledge
- Entity merge detection uses inline Levenshtein DP — no external library
- Auto-approve threshold 0.85 with evidence_quote provenance requirement ensures high-quality auto-approvals
- Queued items include full fact JSON + source episode IDs for human review context

## Task Commits

1. **Task 1: Install dependencies + schema migrations + types** - `0dd4f93` (feat)
2. **Task 2: Implement consolidator.ts — full pipeline** - `3878d82` (feat)

**Plan metadata:** *(docs commit to follow)*

## Files Created/Modified
- `packages/mcp-server/src/consolidator.ts` — Full consolidation pipeline with 6 exported functions
- `packages/core/src/schema.ts` — consolidated_at migration, unconsolidated index, metadata migration
- `packages/core/src/types.ts` — ExtractedFact, ConsolidationSummary, Episode.consolidated_at, ApprovalQueueItem.metadata
- `packages/core/src/index.ts` — Export new types
- `packages/mcp-server/src/tools.ts` — source_type in RememberParams, registerTool migration
- `packages/mcp-server/package.json` — ai, ollama-ai-provider, croner
- `package.json` — Zod v4.3.6 unified via override + devDep

## Decisions Made
- `ai@4.3.19` used instead of `ai@6.x` — ollama-ai-provider@1.2.0 returns LanguageModelV1 which ai@6 dropped; v4 defines LanguageModel = LanguageModelV1
- `experimental_output` API in ai@4 (becomes `output` in ai@6) — the API call changes between major versions
- Type cast needed for Zod v4/v3 structural mismatch in `Output.object()` schema parameter
- Zod unified to single v4.3.6 at root via npm overrides — fixes MCP SDK tool registration type errors that preexisted in tools.ts
- `server.registerTool()` replaces deprecated `server.tool()` — pre-existing TypeScript errors in tools.ts caused by MCP SDK v1.27.1 changing Zod schema resolution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing TypeScript errors in tools.ts**
- **Found during:** Task 1 (TypeScript compilation verification)
- **Issue:** `server.tool(name, description, schema, cb)` pattern produced TS2769 errors in MCP SDK 1.27.1 due to Zod v4 type compatibility break. 4 tool registrations affected.
- **Fix:** Migrated all 4 calls to `server.registerTool(name, { description, inputSchema: schema }, cb)` which uses `ZodRawShapeCompat | AnySchema` — accepts Zod v4 schemas correctly
- **Files modified:** `packages/mcp-server/src/tools.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `0dd4f93` (Task 1 commit)

**2. [Rule 3 - Blocking] Unified Zod to single v4.3.6 via root override**
- **Found during:** Task 1 (TypeScript compilation verification)
- **Issue:** Root `node_modules/zod@3.25.76` coexisted with workspace `zod@4.3.6`. MCP SDK's `AnySchema = z3.ZodTypeAny | z4.$ZodType` cross-referenced both versions, causing structural type mismatch.
- **Fix:** Added `zod: "^4.3.6"` to root `devDependencies` + `overrides` in root `package.json`. Single zod@4.3.6 hoisted to root.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** Workspace-level zod removed, single version resolves, compilation clean
- **Committed in:** `0dd4f93` (Task 1 commit)

**3. [Rule 3 - Blocking] Downgraded ai SDK from v6 to v4.3.19**
- **Found during:** Task 2 (TypeScript compilation of consolidator.ts)
- **Issue:** `ollama-ai-provider@1.2.0` returns `LanguageModelV1` from `@ai-sdk/provider@1.x`. The `ai@6.x` SDK requires `LanguageModelV2+`. Type error: `LanguageModelV1 not assignable to LanguageModelV2`.
- **Fix:** Downgraded `ai` to `@4.3.19` which defines `LanguageModel = LanguageModelV1`. Used `experimental_output` API (renamed to `output` in v6).
- **Files modified:** `packages/mcp-server/package.json`, `package-lock.json`
- **Verification:** TypeScript compilation passes, `Output.object()` pattern verified present
- **Committed in:** `3878d82` (Task 2 commit)

**4. [Rule 2 - Missing Export] Added ExtractedFact + ConsolidationSummary to core index.ts**
- **Found during:** Task 2 (consolidator.ts import from @ai-workbots/core)
- **Issue:** Types added to types.ts in Task 1 were not re-exported from core's index.ts
- **Fix:** Added export statements to `packages/core/src/index.ts`, rebuilt core dist
- **Files modified:** `packages/core/src/index.ts`, `packages/core/dist/`
- **Verification:** `import type { ConsolidationSummary, ExtractedFact } from '@ai-workbots/core'` compiles cleanly
- **Committed in:** `3878d82` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking type errors, 1 version incompatibility, 1 missing export)
**Impact on plan:** All auto-fixes required for compilation. No scope creep. Consolidation pipeline functionally equivalent to plan spec.

## Issues Encountered
- ai@6 vs ollama-ai-provider version incompatibility: ai@6 adopted LanguageModelV2 protocol breaking LanguageModelV1 providers. Will need to update once ollama-ai-provider releases v2 support.
- Zod v4 classic `ZodType` structural differences from Zod v3 `ZodTypeDef` required type cast in Output.object() schema parameter — cosmetic TypeScript issue, functional at runtime.

## Next Phase Readiness
- Plan 03-02 can now wire runConsolidation() into a cron schedule (croner already installed) and a manual trigger MCP tool
- approval_queue.metadata JSON contains full fact payload — PWA plan 04 can read and render for human review
- No blockers

---
*Phase: 03-consolidation-approval*
*Completed: 2026-03-21*
