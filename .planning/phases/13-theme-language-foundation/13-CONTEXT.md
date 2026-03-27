# Phase 13: Theme + Language Foundation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped — infrastructure phase)

<domain>
## Phase Boundary

All dashboard pages present the bioluminescent deep-sea aesthetic with consistent visual language and no legacy "brain" terminology. Pure CSS/string work — no logic changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key context from research:
- activity-feed.tsx and approvals.tsx still use hardcoded slate-* Tailwind classes instead of CSS variables
- Existing CSS variables in app.css already define the mycelium palette (--bg-void, --bg-surface, --glow-teal, etc.)
- The bioluminescent deep-sea aesthetic: dark void, rich glowing elements, organic shapes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- app.css already has CSS variables for the mycelium palette
- shadcn/ui components already use CSS variable system
- graph-view.tsx already uses the theme correctly via inline styles

### Established Patterns
- Components use inline `style={{ color: 'var(--text-primary)' }}` pattern
- Some components still use hardcoded Tailwind slate-* classes

### Integration Points
- app.css is the single source of truth for theme variables
- All dashboard components in packages/dashboard/src/components/
- All routes in packages/dashboard/src/routes/

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
