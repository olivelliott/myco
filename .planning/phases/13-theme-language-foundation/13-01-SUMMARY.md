---
phase: 13-theme-language-foundation
plan: 01
subsystem: dashboard
tags: [theme, css-variables, tailwind, bioluminescent, shadcn-ui]
dependency_graph:
  requires: []
  provides: [bioluminescent-theme-foundation, css-variable-color-system]
  affects: [packages/dashboard/src]
tech_stack:
  added: []
  patterns: [css-custom-properties-for-theming, tailwind-arbitrary-value-syntax, inline-style-css-variables]
key_files:
  created: []
  modified:
    - packages/dashboard/src/routes/__root.tsx
    - packages/dashboard/src/routes/approvals.tsx
    - packages/dashboard/src/components/activity-feed.tsx
    - packages/dashboard/src/components/quick-approve.tsx
    - packages/dashboard/src/components/ui/card.tsx
    - packages/dashboard/src/components/ui/input.tsx
    - packages/dashboard/src/components/ui/textarea.tsx
    - packages/dashboard/src/components/ui/select.tsx
    - packages/dashboard/src/components/ui/tooltip.tsx
    - packages/dashboard/src/components/ui/scroll-area.tsx
    - packages/dashboard/src/components/ui/separator.tsx
    - packages/dashboard/src/components/graph-view.tsx
decisions:
  - "App components use inline style={{ ... }} pattern (matches sidebar.tsx/approval-card.tsx precedent)"
  - "UI primitives use Tailwind arbitrary value syntax bg-[var(--token)] (avoids cn() merge conflicts with inline styles)"
  - "hover:bg-slate-700 removed from ghost Button variants — variant already handles hover"
metrics:
  duration: ~12 minutes
  completed: "2026-03-27"
  tasks_completed: 2
  files_modified: 12
requirements_validated:
  - THME-01
  - THME-02
---

# Phase 13 Plan 01: Theme Language Foundation Summary

**One-liner:** Replaced all hardcoded `slate-*` Tailwind classes with CSS custom property references (`var(--bg-void)`, `var(--text-primary)`, etc.) across 11 dashboard files, establishing `app.css` as the single color source of truth.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migrate application components from slate-* to CSS variables | 4d47654 | __root.tsx, approvals.tsx, activity-feed.tsx, quick-approve.tsx |
| 2 | Migrate shadcn/ui primitives from slate-* to CSS variables | 5f43f03 | card.tsx, input.tsx, textarea.tsx, select.tsx, tooltip.tsx, scroll-area.tsx, separator.tsx, graph-view.tsx |

## Verification Results

- Zero `slate-*` classes remaining in `packages/dashboard/src/`
- Zero "brain" strings in dashboard UI
- 24 files now reference CSS variables
- `var(--bg-void)` in `__root.tsx`: 1 match
- `var(--` in `approvals.tsx`: 6 matches
- `var(--` in `activity-feed.tsx`: 8 matches
- `var(--` in `quick-approve.tsx`: 6 matches
- `var(--` in `card.tsx`: 2 matches
- `var(--` in `select.tsx`: 5 matches
- Dashboard build: exits with code 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `enableNavigationControls` prop from graph-view.tsx**
- **Found during:** Task 2 build verification
- **Issue:** `enableNavigationControls` does not exist in `react-force-graph-2d` type definitions, causing TypeScript compilation failure. This was pre-existing work-in-progress code in the repo.
- **Fix:** Removed the invalid prop. `enablePointerInteraction` (which is in the type defs) was retained.
- **Files modified:** `packages/dashboard/src/components/graph-view.tsx`
- **Commit:** 5f43f03

## Decisions Made

1. **Two-pattern approach for CSS variables:** Application components use `style={{ backgroundColor: 'var(--token)' }}` (inline styles, matching the established sidebar.tsx pattern). UI primitives use Tailwind arbitrary value syntax `bg-[var(--token)]` (avoids conflicts with `cn()` className merging in consumer components).

2. **hover:bg-slate-700 removal:** Removed from ghost-variant Button components in quick-approve.tsx. The `variant="ghost"` already handles hover styling, and the semantic action colors (emerald/red) are preserved as-is — they are intentional, not theme colors.

## Known Stubs

None — all color references are wired to live CSS custom properties defined in `app.css`.

## Self-Check: PASSED

Files verified:
- packages/dashboard/src/routes/__root.tsx: FOUND
- packages/dashboard/src/routes/approvals.tsx: FOUND
- packages/dashboard/src/components/activity-feed.tsx: FOUND
- packages/dashboard/src/components/quick-approve.tsx: FOUND
- packages/dashboard/src/components/ui/card.tsx: FOUND
- packages/dashboard/src/components/ui/input.tsx: FOUND
- packages/dashboard/src/components/ui/textarea.tsx: FOUND
- packages/dashboard/src/components/ui/select.tsx: FOUND
- packages/dashboard/src/components/ui/tooltip.tsx: FOUND
- packages/dashboard/src/components/ui/scroll-area.tsx: FOUND
- packages/dashboard/src/components/ui/separator.tsx: FOUND

Commits verified:
- 4d47654: FOUND
- 5f43f03: FOUND
