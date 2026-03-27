---
phase: 16-home-page-enhancements
plan: 01
subsystem: api
tags: [sqlite, hono, react, tanstack-query, typescript, dashboard]

# Dependency graph
requires:
  - phase: 10-prepared-statements
    provides: MycoStatements interface and prepareStatements factory
provides:
  - GET /api/stats/growth returning daily-bucketed entity/observation/relationship counts for last 30 days
  - Enriched GET /api/dashboard with health metrics (embeddingCoverage, orphanedNodes, confidenceDistribution, unconsolidatedEpisodes)
  - recentActivity entity cards in dashboard response alongside recentEpisodes
  - GrowthPoint, HealthMetrics, ActivityCard TypeScript types in dashboard api.ts
  - fetchGrowthStats() fetch function
  - useGrowthStats() TanStack Query hook
affects:
  - 16-02-home-page-ui

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Health metrics computed in route handler via 4 separate prepared statements, combined into a single health object in the JSON response"
    - "Growth time-series uses UNION ALL across 3 tables with date() grouping — 3 bind params (one per UNION branch) for the 30-day cutoff"

key-files:
  created: []
  modified:
    - packages/core/src/statements.ts
    - packages/api-server/src/routes/dashboard.ts
    - packages/dashboard/src/lib/api.ts
    - packages/dashboard/src/hooks/use-dashboard.ts

key-decisions:
  - "Growth endpoint at /api/stats/growth (separate from /api/dashboard) for clean separation of time-series vs snapshot data"
  - "recentActivity added alongside recentEpisodes for backward compatibility — not a replacement"
  - "embeddingCoverage defaults to 100 when total observations = 0 (no divide-by-zero)"

patterns-established:
  - "New prepared statements always added to both MycoStatements interface AND prepareStatements() body"
  - "Build core package (npm run build) required before api-server TypeScript check resolves updated MycoStatements types from dist/"

requirements-completed: [HOME-01, HOME-02, HOME-03]

# Metrics
duration: 8min
completed: 2026-03-27
---

# Phase 16 Plan 01: Home Page Analytics Data Layer Summary

**Daily-bucketed growth time-series endpoint, health metrics (embedding coverage, orphan count, confidence distribution, backlog), and entity-level activity feed added to the API with typed hooks for Plan 02 UI consumption.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-27T00:00:00Z
- **Completed:** 2026-03-27
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added 6 new prepared statements to `@myco/core` (growth time-series, embedding coverage, orphaned entities, confidence distribution, unconsolidated episode count, recent activity)
- New `GET /api/stats/growth` endpoint returns daily-bucketed counts for last 30 days across entities, observations, and relationships
- `GET /api/dashboard` enriched with `health` object (4 metrics) and `recentActivity` entity cards
- Frontend `api.ts` extended with `GrowthPoint`, `HealthMetrics`, and `ActivityCard` interfaces plus `fetchGrowthStats()`
- New `useGrowthStats()` hook with 60-second refetch interval

## Task Commits

1. **Task 1: Add prepared statements for growth, health, and activity queries** - `7b2cae2` (feat)
2. **Task 2: Add growth endpoint, enrich dashboard response, update frontend types and hooks** - `eb0c047` (feat)

## Files Created/Modified

- `packages/core/src/statements.ts` - Added 6 new prepared statements to interface and factory
- `packages/api-server/src/routes/dashboard.ts` - Added `/stats/growth` route and health metrics to dashboard response
- `packages/dashboard/src/lib/api.ts` - Added GrowthPoint, HealthMetrics, ActivityCard types and fetchGrowthStats()
- `packages/dashboard/src/hooks/use-dashboard.ts` - Added useGrowthStats() hook

## Decisions Made

- Growth endpoint is a separate route (`/api/stats/growth`) rather than embedding time-series in `/api/dashboard` — keeps snapshot data separate from time-series data
- `recentActivity` added alongside existing `recentEpisodes` rather than replacing it — backward compatibility with any existing consumers
- Embedding coverage returns 100% when no observations exist (safe default, avoids divide-by-zero)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- After modifying `packages/core/src/statements.ts`, `api-server` TypeScript check failed because `dist/` was stale. Required running `npm run build` (workspace `tsc --build`) to regenerate type declarations before the downstream package could resolve the updated `MycoStatements` interface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All API endpoints and TypeScript types are ready for Plan 02 (home page UI)
- `useGrowthStats()` and enriched `useDashboard()` provide all data hooks Plan 02 needs
- No blockers

---
*Phase: 16-home-page-enhancements*
*Completed: 2026-03-27*
