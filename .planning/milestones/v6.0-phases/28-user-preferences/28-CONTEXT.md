# Phase 28: User Preferences - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement user preference accumulation across projects. Preferences are entities with `type='user_preference'` that start project-scoped and promote to global (`project=NULL`) after 2+ project corroboration or explicit user confirmation. Source projects tracked as evidence in observation metadata. Preferences included in session-start injection alongside rules and facts.

</domain>

<decisions>
## Implementation Decisions

### Preference Storage
- Entity type: `user_preference` (set explicitly by `myco init` scanner or agent via `remember`)
- Project-scoped preferences: `project='myco'` (specific project)
- Global preferences: `project=NULL` (visible everywhere)
- New preferences start project-scoped unless explicitly marked global
- Evidence tracked in observation metadata: `{ "source_projects": ["myco", "other-project"] }`

### Promotion Logic
- When a preference is remembered for project B that matches an existing preference on project A:
  - If both are project-scoped: promote to global (`project=NULL`), merge `source_projects` arrays
  - Update `reinforcement_count` on the observation
- Trigger: same entity name + similar observation content (using existing dedup classification if available, else string match)
- Explicit user confirmation also promotes: agent calls `remember` with `project=null` directly

### Session-Start Injection
- Phase 25 hook already queries `type='user_preference'` with `project IS NULL` — global preferences surface automatically
- Source attribution in injection: `(from: ProjectA, ProjectB)` suffix after each preference observation
- Preferences appear after rules and facts in priority ordering

### MCP Integration
- No new MCP tool needed — `remember` already handles preference entities
- `myco init` scanner already produces `user_preference` entities (Phase 26)
- The promotion logic lives in `rememberEntity()` or a new `promotePreference()` helper

### Claude's Discretion
- Whether promotion logic lives in `rememberEntity()` or as a post-remember hook
- Exact similarity threshold for matching preferences across projects
- Test strategy

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp-server/src/tools.ts` — `rememberEntity()` is the write path
- `packages/mcp-server/src/onboarding-scanner.ts` — already extracts `user_preference` entities
- `hooks/myco-session-start.js` — already queries `type='user_preference'` with `project IS NULL`

### Established Patterns
- Entity creation via `rememberEntity(db, stmts, { name, type, observations, relations })`
- Observation metadata is a JSON string in the `metadata` column
- `project` column: NULL = global, string = project-scoped

### Integration Points
- `rememberEntity()` in tools.ts — add promotion check after entity creation
- Session-start hook — add source attribution formatting for preferences
- `myco init` scanner — already categorizes preferences, will benefit from promotion

</code_context>

<specifics>
## Specific Ideas

- Promotion is the key new logic — everything else is wiring existing pieces
- The hook needs a small update to format preference source attribution from metadata
- Consider a `promotePreference(db, stmts, entityName)` function that checks for cross-project duplicates

</specifics>

<deferred>
## Deferred Ideas

- Dashboard preference management UI — future
- Preference conflict resolution (project A says "strict TypeScript", project B says "loose") — v6.1
- Preference confidence weighting by project count — future

</deferred>
