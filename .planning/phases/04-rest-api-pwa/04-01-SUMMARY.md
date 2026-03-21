---
phase: 04-rest-api-pwa
plan: "01"
subsystem: api
tags: [hono, sqlite, rest-api, brain.db, knowledge-graph, approvals]

# Dependency graph
requires:
  - phase: 01-storage-foundation
    provides: openDatabase(), SQLite schema (entities, observations, relationships, episodes, approval_queue, fts_observations)
  - phase: 03-consolidation-approval
    provides: approval_queue table with metadata JSON, ExtractedFact type, merge_candidate_ids pattern
provides:
  - Hono REST API server on port 3001 with CORS for localhost PWA origins
  - GET /api/dashboard — pending count, entity count, recent episodes
  - GET /api/approvals — pending items with parsed metadata
  - PATCH /api/approvals/:id — approve (writes to graph with merge handling) or reject
  - GET /api/graph — nodes + links arrays for react-force-graph-2d
  - GET /api/entities — paginated list + GET /:id with observations + connected entities
  - GET /api/episodes — recent episodes with JSON-parsed payload
affects:
  - 04-rest-api-pwa (plans 02-05 — PWA dashboard consumes these endpoints)

# Tech tracking
tech-stack:
  added:
    - hono@4.x (HTTP framework, TypeScript-native)
    - "@hono/node-server@1.x (Node.js HTTP adapter for Hono)"
    - "@hono/zod-validator@0.5.x (Zod-based request validation middleware)"
    - nanoid@5.x (ID generation for new entities/observations/relationships on approval)
  patterns:
    - Route factories accept db parameter — testable without server setup
    - Singleton db connection via getDb() — one connection per api-server process
    - Inline DB writes on approval (no Ollama call) — needs_embedding=1 for MCP server sweep
    - db.transaction() wrapping approve path for atomicity

key-files:
  created:
    - packages/api-server/src/index.ts
    - packages/api-server/src/db.ts
    - packages/api-server/src/routes/dashboard.ts
    - packages/api-server/src/routes/episodes.ts
    - packages/api-server/src/routes/graph.ts
    - packages/api-server/src/routes/entities.ts
    - packages/api-server/src/routes/approvals.ts
  modified:
    - packages/api-server/package.json
    - package.json (added 'api' script)

key-decisions:
  - "Route factories (function returning Hono app) accept db parameter — enables isolated testing without server setup"
  - "Approval path inlines DB writes without embedText — sets needs_embedding=1 so MCP server startup sweep handles embedding later"
  - "npm install --legacy-peer-deps required due to @vitejs/plugin-react peer dep conflict with Vite 8 in dashboard package"
  - "Graph nodes map obs_count to val field for react-force-graph-2d node sizing"
  - "Episodes payload JSON-parsed before HTTP response so clients receive objects not strings"

patterns-established:
  - "Route factories: export function xRoutes(db: Database.Database): Hono — all routes use this pattern"
  - "Pagination params: ?limit (default 50, max 200) + ?offset (default 0) with NaN guards"
  - "All relative imports use .js extensions (NodeNext module resolution)"

requirements-completed:
  - PWA-06

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 4 Plan 1: REST API Server Summary

**Hono REST API server on port 3001 with 5 route groups exposing brain.db over HTTP for the PWA dashboard, including atomic approval resolution with entity merge handling**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-21T03:38:48Z
- **Completed:** 2026-03-21T03:42:18Z
- **Tasks:** 2
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- Hono API server with CORS, graceful shutdown, and 5 route groups, all reading from brain.db via getDb() singleton
- Dashboard, graph, episodes, and entities routes returning correct JSON shapes for PWA consumption
- Approval resolution route with full merge candidate handling, inline graph writes (needs_embedding=1), FTS indexing, and db.transaction() atomicity

## Task Commits

1. **Task 1: API server package setup + entry point + dashboard/episodes/graph/entities routes** - `d7a3385` (feat)
2. **Task 2: Approval routes with resolve logic (approve/reject/edit/merge)** - `1f2532d` (feat)

## Files Created/Modified

- `packages/api-server/src/index.ts` - Hono app with CORS, route mounting, serve() on port 3001, graceful shutdown
- `packages/api-server/src/db.ts` - getDb() singleton wrapping openDatabase() from @ai-workbots/core
- `packages/api-server/src/routes/dashboard.ts` - GET / returns pending count, entity count, recent 20 episodes
- `packages/api-server/src/routes/episodes.ts` - GET / with ?limit (default 50, max 200), payload JSON-parsed
- `packages/api-server/src/routes/graph.ts` - GET / returns nodes (with val=obs_count) + links for react-force-graph-2d
- `packages/api-server/src/routes/entities.ts` - GET / paginated + GET /:id with observations + connected entities
- `packages/api-server/src/routes/approvals.ts` - GET list + PATCH resolve with merge handling and atomic transaction
- `packages/api-server/package.json` - Added hono, @hono/node-server, @hono/zod-validator, nanoid, tsup, tsx
- `package.json` - Added 'api' script pointing to api-server

## Decisions Made

- Route factories accept `db` parameter rather than importing getDb — makes routes testable without server setup
- Approval approve path inlines all DB writes (entity upsert, observation insert, FTS insert) without calling embedText/Ollama; sets `needs_embedding=1` so MCP server's startup re-embed sweep handles embeddings
- `npm install --legacy-peer-deps` was needed due to `@vitejs/plugin-react` peer dep conflict with Vite 8 in the dashboard package (pre-existing conflict, not introduced here)
- Graph node `val` field = `obs_count` — drives node size in react-force-graph-2d

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `workspace:*` protocol in package.json is not supported by npm (yarn/pnpm only). Fixed to `*` per the original package.json convention — this is a pre-existing monorepo pattern, not a regression.
- `npm install` fails without `--legacy-peer-deps` due to pre-existing Vite 8 / @vitejs/plugin-react peer conflict in the dashboard package. Used `--legacy-peer-deps` as workaround.

## User Setup Required

None - no external service configuration required. Server reads from brain.db via the same BRAIN_DB_PATH env var used by the MCP server.

## Next Phase Readiness

- API server is fully functional and ready for PWA dashboard consumption
- All 5 route groups verified against live brain.db
- Port 3001 with CORS for localhost:5173 and localhost:4173 ready for Vite dev server
- Plan 04-02 can begin building the PWA dashboard against these endpoints

---
*Phase: 04-rest-api-pwa*
*Completed: 2026-03-21*
