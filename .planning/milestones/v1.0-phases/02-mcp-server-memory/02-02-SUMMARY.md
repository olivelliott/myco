---
phase: 02-mcp-server-memory
plan: 02
subsystem: mcp-server
tags: [sqlite-vec, fts5, knn-search, ollama, embeddings, episodes, semantic-search]

requires:
  - phase: 02-01
    provides: embed-client, fts5-schema, needs_embedding column, async-rememberEntity

provides:
  - recall tool: KNN vector search with FTS5 fallback
  - query tool: entity filter by name, type, relationship
  - log_episode tool: timestamped episode creation with provenance
  - reEmbedPending: startup sweep for needs_embedding backfill
  - index.ts startup re-embed sweep (non-blocking async)

affects: [03-consolidation, 04-pwa-dashboard]

tech-stack:
  added: []
  patterns: [knn-cte-join, fts5-fallback, episode-isolation, re-embed-sweep]

key-files:
  created: []
  modified:
    - packages/mcp-server/src/tools.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/tests/server.test.ts

key-decisions:
  - "z.record(z.string(), z.unknown()) required for Zod v4 — single-arg z.record() not supported"
  - "log_episode tool registered alongside recall/query in registerTools() — consistent tool registration pattern"
  - "reEmbedPending startup sweep is fire-and-forget (non-blocking) — server startup not gated on Ollama availability"
  - "FTS5 query wrapped in double-quotes for phrase matching — sanitizes special chars from agent query input"
  - "recall and query do not join episodes table — enforces EPSD-03 isolation at query level"

patterns-established:
  - "KNN-CTE-join: WITH knn AS (SELECT FROM vec_embeddings WHERE embedding MATCH ? AND k = ?) JOIN observations JOIN entities"
  - "FTS5 fallback: when embedText returns null, use fts_observations MATCH with phrase-quoted query"
  - "episode isolation: recall/query only query observations+entities tables, never episodes"
  - "exported helper functions: recallKnowledge, queryEntities, logEpisode, reEmbedPending for direct test access"

requirements-completed: [SRCH-02, SRCH-03, EPSD-01, EPSD-02, EPSD-03]

duration: 4min
completed: "2026-03-21"
---

# Phase 02 Plan 02: Recall, Query, Log Episode Tools Summary

**recall/query/log_episode MCP tools with KNN semantic search via sqlite-vec CTE, FTS5 fallback, per-agent episode isolation, and startup re-embed sweep**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T00:26:34Z
- **Completed:** 2026-03-21T00:30:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `recallKnowledge`: KNN vector search via sqlite-vec CTE (`WITH knn AS (... WHERE embedding MATCH ? AND k = ?)`) with automatic FTS5 fallback when Ollama unavailable
- `queryEntities`: dynamic SQL filter by entity name, type, and/or relationship type with per-entity observation fetch
- `logEpisode`: timestamped episode creation using `buildProvenance()` + `SESSION_ID`, enforces EPSD-02 per-agent isolation via `agent_id` storage
- `reEmbedPending`: batched startup sweep (up to 50 rows) backfills `needs_embedding = 1` observations into `vec_embeddings`
- `index.ts` fires re-embed sweep async at startup without blocking MCP transport connect
- 10 new tests: FTS5 fallback, entity filters, log_episode fields, EPSD-02 per-agent isolation, EPSD-03 episode recall isolation, reEmbedPending clean DB — all 43 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1+2: implement recall/query/log_episode tools and re-embed sweep** - `8670a18` (feat)
2. **Task 2 tests: add recall/query/logEpisode/reEmbedPending tests** - `9c22a68` (test)

**Plan metadata:** committed with docs commit

## Files Created/Modified

- `packages/mcp-server/src/tools.ts` - Added RecallRow/QueryEntityRow/QueryObservationRow/RecallResult/LogEpisodeResult types; recallKnowledge, queryEntities, logEpisode, reEmbedPending exported functions; log_episode MCP tool registration; replaced stub recall/query handlers
- `packages/mcp-server/src/index.ts` - Added reEmbedPending import; non-blocking startup re-embed sweep after openDatabase()
- `packages/mcp-server/tests/server.test.ts` - 10 new tests covering all acceptance criteria; updated import to include all new exports

## Decisions Made

- **Zod v4 record syntax:** `z.record(z.string(), z.unknown())` required — single-arg `z.record(z.unknown())` not supported in Zod v4 (discovered at compile time, fixed inline per Rule 1)
- **FTS5 phrase quoting:** Query wrapped in `'"' + query.replace(/"/g, '""') + '"'` for phrase match — handles special FTS5 characters from agent input
- **Non-blocking startup sweep:** `reEmbedPending(db).then(...).catch(...)` fires async without awaiting — MCP transport startup not gated on Ollama health
- **Episode isolation at query level:** recall and query SQL only join `observations` + `entities` tables — `episodes` table never referenced in either function

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 z.record() requires two arguments**
- **Found during:** Task 1 (log_episode tool registration)
- **Issue:** Plan specified `z.record(z.unknown())` but Zod v4 requires `z.record(z.string(), z.unknown())` — TypeScript compile error TS2554
- **Fix:** Changed to `z.record(z.string(), z.unknown())` in log_episode tool schema
- **Files modified:** packages/mcp-server/src/tools.ts
- **Verification:** `npm run build` exits 0
- **Committed in:** 8670a18 (Task 1+2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Single Zod v4 API signature fix. No scope creep.

## Issues Encountered

None — plan executed cleanly after the Zod v4 fix.

## User Setup Required

None - no external service configuration required. Ollama integration is gracefully degraded (FTS5 fallback when unavailable).

## Next Phase Readiness

Phase 02 is now complete. All MCP tools are functional:
- `remember`: stores entities + observations with embeddings (Plan 01)
- `recall`: semantic KNN search with FTS5 fallback (this plan)
- `query`: structured entity filter (this plan)
- `log_episode`: episode capture with per-agent isolation (this plan)

Phase 03 (consolidation) can read from `episodes` table and write back to `entities`/`observations`.

## Self-Check: PASSED

All files exist on disk. Both task commits (8670a18, 9c22a68) verified in git log. 43/43 tests pass.

---
*Phase: 02-mcp-server-memory*
*Completed: 2026-03-21*
