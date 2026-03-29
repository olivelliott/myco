# Phase 25: Session-Start Recall - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the existing `hooks/myco-session-start.js` from a static reminder ("consider using recall") to an actual knowledge-injecting hook that queries the database and injects relevant workflow rules, project facts, and user preferences into every Claude Code session via `additionalContext`. The hook must resolve `cwd` to a project via the Phase 24 `project_paths` table, query rules + facts, enforce a 1,500-token cap, track novelty to avoid repetition, and complete under 500ms using FTS5 only (no Ollama).

</domain>

<decisions>
## Implementation Decisions

### Hook Architecture
- Upgrade the existing `hooks/myco-session-start.js` in-place — do not create a separate binary
- Open database in read-only mode (`new Database(path, { readonly: true })`) — hook must never hold a write lock
- Use `$PWD` from the hook's stdin JSON `data.cwd` field — do NOT use `process.cwd()`
- Fix the legacy `brain.db` default path to `myco.db` while keeping `MYCO_DB_PATH` env var support
- No Ollama calls — FTS5 queries only for speed
- 500ms hard timeout — if DB is locked or slow, output a graceful fallback message

### Injection Content & Format
- Priority ordering: workflow rules first, then project facts, then user preferences
- Workflow rules: `SELECT * FROM entities WHERE type = 'workflow_rule' AND (project = $project OR project IS NULL) AND merged_into IS NULL` + their observations
- Project facts: top-K recent observations for entities in the current project namespace
- User preferences: entities with `type = 'user_preference'` and `project IS NULL`
- Format as structured text inside `<myco>` tags (matching existing hook pattern)
- Include "More context available — call `myco recall`" when cap is reached

### Token Budget
- Hard cap at 1,500 tokens (~6,000 characters) enforced at the application layer
- Priority-ordered retrieval: rules get full budget first, then facts fill remaining, then preferences
- If over cap, truncate facts section (rules and preferences are more important)

### Novelty Filtering
- Track content hash of last injection in a small `injection_log` table or file
- On next session: compare hash — if identical, output "No changes since last session" instead of re-injecting
- Write the hash AFTER successful injection (append-only, deferred — not in the read-only hook connection)
- For v6.0: use a simple file-based cache (`~/.local/share/myco/last-injection-hash`) to avoid write contention

### Graceful Degradation
- No project match: inject global-only knowledge with note "No project context found for this directory"
- Empty database: keep existing "knowledge base is new" message
- Database locked/unavailable: output brief fallback message and exit 0
- No workflow rules: skip rules section, show facts only

### Claude's Discretion
- Exact SQL query structure for fact retrieval (how many, ordering)
- Whether to use the existing `prepareStatements()` factory or inline queries (hook is CommonJS, core is ESM)
- File-based hash cache implementation details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hooks/myco-session-start.js` — existing hook to upgrade (CommonJS, reads stdin, writes stdout JSON)
- `hooks/myco-auto-remember.js` — PostToolUse hook pattern with debounce (reference for hook conventions)
- `.claude/hooks/gsd-myco-episode.js` — GSD hook that opens better-sqlite3 directly (reference for DB access in hooks)
- `packages/core/src/statements.ts` — prepared statements including `selectProjectForPath`

### Established Patterns
- Hooks are CommonJS `.js` files (not TypeScript) — they run directly without compilation
- Hooks resolve `better-sqlite3` from the project's `node_modules` relative to the hook file
- All hooks exit 0 even on error — never block the session
- `hookSpecificOutput.additionalContext` is the injection mechanism
- Database path resolution: `MYCO_DB_PATH` → `XDG_DATA_HOME/myco/myco.db` → `~/.local/share/myco/myco.db`

### Integration Points
- `hooks/myco-session-start.js` is registered in `~/.claude/settings.json` as a global SessionStart hook
- `project_paths` table from Phase 24 provides cwd → project resolution
- `entities` table `type` column will be used for `workflow_rule` and `user_preference` filtering (Phase 27-28 will populate, but queries should be ready)
- `observations` table with `valid_until IS NULL` for current facts only

</code_context>

<specifics>
## Specific Ideas

- The existing hook already handles MCP server detection, DB existence checks, and the stdout JSON format — preserve all of that, upgrade the knowledge injection part
- Use the same `<myco>` tag wrapping for consistency with the existing hook output
- The `selectProjectForPath` SQL from Phase 24 can be inlined in the hook (it's a single query)

</specifics>

<deferred>
## Deferred Ideas

- Trigger-aware rule surfacing (surface only commit rules before git commit) — v6.1
- Semantic similarity search in hook (requires Ollama) — not for v6.0
- Dashboard view of injection history — future

</deferred>
