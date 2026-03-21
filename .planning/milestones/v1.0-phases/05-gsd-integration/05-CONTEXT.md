# Phase 5: GSD Integration - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

GSD workflow hooks that automatically capture high-signal episodes at phase transitions, milestone completions, and key workflow moments. Episodes flow into brain.db via existing MCP tools. Hook failures are silently caught — they never interrupt the GSD workflow.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `logEpisode()` MCP tool in `packages/mcp-server/src/tools.ts` — accepts event_type, payload, agent_id
- `registerTools()` already registers `log_episode` tool
- GSD hooks system in `~/.claude/settings.json` or `settings.local.json` — shell commands that fire on events
- `buildProvenance()` with `source_type: 'gsd_hook'` already defined in types

### Established Patterns
- GSD hooks are shell commands configured in Claude Code settings
- MCP tools are callable from any Claude Code session
- Episodes table captures event_type, payload (JSON), agent_id, session_id

### Integration Points
- GSD phase complete events (from `gsd-tools.cjs phase complete`)
- GSD milestone complete events
- The `log_episode` MCP tool is the write path — hooks should call it
- PWA activity feed already reads from episodes table

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None

</deferred>

---

*Phase: 05-gsd-integration*
*Context gathered: 2026-03-21*
