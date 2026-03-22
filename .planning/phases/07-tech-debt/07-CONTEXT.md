# Phase 7: Tech Debt - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix known v1.0 tech debt: episodes API response shape mismatch, dead fetchEpisodes export, and verify fresh-clone installability. Pure bug fixes and cleanup — no new features.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Known issues from PROJECT.md:
- `/api/episodes` response shape doesn't match `fetchEpisodes()` client expectations
- Dead `fetchEpisodes` export in `packages/dashboard/src/lib/api.ts`
- Fresh-clone `npm install --legacy-peer-deps && npm run build` must succeed

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- API routes in `packages/api-server/src/routes/episodes.ts`
- Client fetch wrapper in `packages/dashboard/src/lib/api.ts`
- All packages now use `@myco/*` naming (Phase 6 complete)

### Established Patterns
- API routes return JSON directly from Hono handlers
- Dashboard uses typed fetch wrappers in `lib/api.ts`
- TanStack Query hooks consume the fetch wrappers

### Integration Points
- episodes route → api.ts fetchEpisodes → use-dashboard hook or direct consumer
- Build: root `npm run build` triggers `tsc --build` across all packages

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
