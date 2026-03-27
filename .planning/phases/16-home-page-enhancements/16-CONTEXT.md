# Phase 16: Home Page Enhancements - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure + visual phase, decisions from milestone discuss)

<domain>
## Phase Boundary

The home page becomes a rich analytics command center: knowledge growth chart, rich activity stream with entity cards, health metrics panel, and larger interactive graph preview. Requires one new API endpoint for time-series growth data.

</domain>

<decisions>
## Implementation Decisions

### Knowledge Growth Chart (HOME-01)
- Use shadcn Chart component (wraps Recharts) — install via `npx shadcn add chart`
- Area/line chart with 3 trend lines: entities, observations, relationships over time
- Bioluminescent styling: teal/violet/amber lines on dark void background
- New API endpoint: `GET /api/stats/growth` returning time-bucketed counts
- Time range: last 30 days by default, with date bucketing (daily)

### Rich Activity Stream (HOME-02)
- Replace plain text activity entries with entity cards
- Each card shows entity name, type (with color dot), event type, relative timestamp
- Use the existing type color system from graph-view

### Health Metrics (HOME-03)
- Four metric indicators: consolidation status, embedding coverage %, orphaned node count, confidence distribution
- Compact layout using stat cards or inline metrics
- New API data: extend `/api/dashboard` endpoint to include health metrics (or add sub-endpoint)

### Graph Preview (HOME-04)
- Make the existing mini graph preview larger (at least 400px height)
- Keep it interactive (hoverable, clickable to navigate to full graph)
- Already exists in index.tsx — just needs sizing and polish

### Claude's Discretion
- Exact chart configuration (axis labels, tooltips, grid lines)
- Health metrics layout and grouping
- API response shape for growth endpoint
- Whether to extend existing `/api/dashboard` or create new endpoint

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- stat-card.tsx already exists for metric display
- activity-feed.tsx exists (needs enhancement, not replacement)
- GraphView mini mode already works on home page
- use-dashboard.ts hook fetches from /api/dashboard

### API Layer
- api-server/src/routes/ contains all route files
- dashboard route already returns topConnected, typeBreakdown, growthStats (last 7d counts)
- Need time-series data (daily bucketed) for the chart

### Integration Points
- packages/api-server/src/routes/dashboard.ts — add growth endpoint
- packages/dashboard/src/routes/index.tsx — main home page
- packages/dashboard/src/components/activity-feed.tsx — enhance
- packages/dashboard/src/components/stat-card.tsx — reuse

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond milestone discussion.

</specifics>

<deferred>
## Deferred Ideas

- Customizable dashboard layout (drag-and-drop widgets) — future
- Real-time WebSocket updates — out of scope

</deferred>
