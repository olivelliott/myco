# Phase 4: REST API + PWA - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Hono REST API exposing brain data over HTTP, plus a React PWA dashboard with approval queue, knowledge graph explorer, and activity monitoring. Installable on phone, works offline with cached data.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout & Information Architecture
- Sidebar navigation with 3 views: Dashboard (home), Approvals (queue), Knowledge Graph (explorer). Sidebar collapses to bottom tabs on mobile
- Dashboard home shows 3 stat cards (pending approvals, total entities, recent episodes) + recent activity feed + quick-approve list for top pending items
- Activity feed is chronological, grouped by date, with relative timestamps ("2 hours ago") via date-fns
- Dark theme with accent colors for status (green=approved, amber=pending, red=rejected). Minimal, data-focused dashboard aesthetic

### Approval Queue UI
- Card list display with: entity name, observation preview, confidence badge, reason tag (contradiction/low_confidence/merge_candidate/cross_session), expandable evidence quote. Most recent first
- Inline actions on each card — approve (green button), reject (red button), edit (opens inline text editor replacing observation content, then approve)
- Toast notification + card animates out on action. Counter updates. No page reload — optimistic update via TanStack Query mutation + invalidation
- Entity merge candidates show both entities side-by-side with observations from each. "Merge" button consolidates, "Keep Separate" dismisses

### Knowledge Graph Explorer
- `react-force-graph-2d` for Canvas-based force-directed graph visualization (per CLAUDE.md recommendation)
- Nodes show entity name as label, color-coded by entity type, size proportional to observation count. Hover shows type + observation count tooltip
- Clicking a node opens a side panel with: entity details (name, type, created_at), all observations listed, connected entities with relationship types. Panel dismisses on click-away or Escape
- Search bar at top filters/highlights matching entities. Type filter dropdown to show/hide entity types. Graph re-renders with filtered subset

### REST API & PWA Infrastructure
- Separate `packages/api-server` package importing from `@ai-workbots/core`. Hono routes: `/api/dashboard` (stats), `/api/approvals` (CRUD), `/api/entities` (list/detail), `/api/episodes` (recent), `/api/graph` (nodes + edges for visualization)
- API server opens same `brain.db` via `openDatabase()` — WAL mode supports concurrent readers. API is read-heavy, writes only for approval resolution
- PWA via `vite-plugin-pwa` with runtime caching: API responses use `staleWhileRevalidate` (30s stale time), static assets cached-first. Offline shows last-fetched data
- PWA lives in `packages/dashboard` — separate Vite 8 workspace with React 19 + Tailwind v4 + shadcn/ui. Dev server proxies `/api` to Hono server

### Claude's Discretion
- Exact shadcn/ui component selection for cards, badges, buttons, dialogs
- Graph physics parameters (link distance, charge strength, node repulsion)
- TanStack Query cache timing and refetch intervals
- API pagination strategy and default limits
- PWA manifest details (icons, splash screens, theme color)
- TanStack Router route structure

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `openDatabase()` in `packages/core/src/db.ts` — shared DB connection with WAL mode
- All TypeScript types in `packages/core/src/types.ts` — Entity, Observation, Relationship, Episode, ApprovalQueueItem
- `runConsolidation()` in `packages/mcp-server/src/consolidator.ts` — approval queue write logic can inform API read patterns
- Approval queue metadata JSON shape established in Phase 3: `{ fact: ExtractedFact, source_episode_ids: string[], merge_candidate_ids?: string[] }`

### Established Patterns
- Synchronous better-sqlite3 for DB queries
- Monorepo with `packages/core`, `packages/mcp-server` workspaces
- NodeNext module resolution with .js extensions
- nanoid for ID generation
- Zod for schema validation

### Integration Points
- `brain.db` is the shared data layer — API reads same tables MCP server writes
- `approval_queue` table with `metadata TEXT` column for proposed fact payloads
- `entities`, `observations`, `relationships` tables for graph data
- `episodes` table for activity feed
- All tables have proper indexes from Phase 1 schema

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the technology stack defined in CLAUDE.md.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-rest-api-pwa*
*Context gathered: 2026-03-21*
