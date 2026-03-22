# Phase 6: Rename - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename every reference to "ai-workbots" / "AI Workbots Brain" to "myco" / "Myco" across all packages, imports, CLI binaries, database paths, and user-facing strings. Pure infrastructure — no behavior changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key naming targets:
- Package names: `@ai-workbots/*` → `@myco/*`
- Binaries: `brain-mcp` → `myco`, `brain-cli` → `myco-cli`
- DB path: `~/.local/share/ai-workbots/` → `~/.local/share/myco/`
- Environment variable: `BRAIN_DB_PATH` → `MYCO_DB_PATH` (keep BRAIN_DB_PATH as fallback for existing users)
- MCP server name: "ai-workbots-brain" → "myco"
- Dashboard: title, manifest, and branding → "Myco"

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Monorepo with 4 packages under `packages/` — all need package.json name updates
- Cross-package imports use `@ai-workbots/core` — need find-replace

### Established Patterns
- Package names follow `@ai-workbots/{package}` convention
- Binary names defined in `packages/mcp-server/package.json` bin field
- DB path constructed in `packages/core/src/db.ts` using `ai-workbots` directory name
- MCP server name set in `packages/mcp-server/src/index.ts`
- Dashboard title in `packages/dashboard/index.html` and PWA manifest in `vite.config.ts`

### Integration Points
- `.claude/hooks/gsd-brain-episode.js` references DB path
- `CLAUDE.md` references package names and paths
- `GETTING-STARTED.md` references all old names
- Test files reference package names

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
