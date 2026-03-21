# Phase 5: GSD Integration - Research

**Researched:** 2026-03-21
**Domain:** Claude Code hook system, direct SQLite write path, GSD phase transition events
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices — pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GSD-01 | Hooks auto-capture episodes at GSD phase transitions (phase complete, milestone complete) | PostToolUse hook on Bash tool can detect `gsd-tools phase complete` command via `tool_input.command` pattern match; direct SQLite write is the correct path (see Architecture Patterns) |
| GSD-02 | Structured episode payloads include phase name, requirements covered, and outcome summary | `cmdPhaseComplete` returns `completed_phase`, `plans_executed`, `next_phase`, `is_last_phase`; phase directory contains `*-SUMMARY.md` files readable at hook time |
| GSD-03 | Hooks call existing MCP tools — no separate write path | MCP tools run over stdio transport and are NOT callable from shell hooks; the correct interpretation is to write directly to brain.db using the same `logEpisode()` logic — identical schema, same write path, no new infrastructure |
</phase_requirements>

## Summary

Phase 5 wires GSD workflow transitions into the brain's episode log automatically. The Claude Code hook system provides a `PostToolUse` event that fires after every Bash tool execution, carrying the exact command that ran. This makes it straightforward to intercept `gsd-tools phase complete` calls and write an episode to brain.db.

The key insight on GSD-03 is definitional: MCP tools (`log_episode`) run over stdio and cannot be invoked from a shell hook. "No separate write path" means the hook should write directly to the SQLite database using the same SQL that `logEpisode()` uses — not that it must somehow call the MCP server. This is consistent with how Claude Code's existing hooks are written (pure Node.js, no MCP dependency).

The hook script must be fire-and-forget with total failure isolation. GSD-02 SUCCESS CRITERIA #2 is explicit: a hook failure must never interrupt the GSD workflow. Every failure path in the hook exits 0 silently.

**Primary recommendation:** A single `PostToolUse` hook script on Bash tool, matching `gsd-tools.*phase.*complete`, that opens brain.db directly with better-sqlite3, inserts one episode row, and exits 0 — regardless of outcome.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | Direct SQLite write from hook | Already in the monorepo as core dependency; synchronous API is exactly right for a hook script |
| nanoid | 5.x | Episode ID generation | Already used everywhere in the codebase for IDs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-in `fs` | — | Read SUMMARY.md files to extract outcome text | No dep needed |
| Node.js built-in `path` | — | Resolve phase directory and brain.db path | No dep needed |
| Node.js built-in `os` | — | Resolve XDG_DATA_HOME for brain.db default path | No dep needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct SQLite write | HTTP POST to Hono API | HTTP adds a network dependency and requires the API server to be running; direct write is synchronous and zero-dependency |
| Direct SQLite write | `mcp__ai-workbots-brain__log_episode` tool call | MCP tools run over stdio, not callable from shell hooks at all |
| PostToolUse Bash matcher | PostToolUse on `mcp__.*` | GSD phase transitions are triggered via Bash calls to gsd-tools, not MCP tool calls |
| PostToolUse Bash matcher | Stop hook with transcript scan | Stop fires on every turn end, requires transcript parsing — much higher noise and complexity |

**Installation:** No new packages needed. The hook script can require `better-sqlite3` and `nanoid` directly from the monorepo's `node_modules` via absolute path, or the hook can be placed in the repo and reference local node_modules.

## Architecture Patterns

### Recommended Project Structure
```
packages/mcp-server/src/hooks/
└── gsd-phase-hook.js        # The hook script (CommonJS, no build step)

~/.claude/settings.json      # Registers the hook globally
  OR
.claude/settings.json        # Registers the hook project-scoped (preferred)
```

**Hook registration location:** `.claude/settings.json` at the project root is the correct scope. This hook is specific to the ai-workbots project — it writes to this project's brain.db. A global `~/.claude/settings.json` hook would fire for all projects. Project-scoped is correct.

### Pattern 1: PostToolUse Bash Matcher

**What:** A hook registered on `PostToolUse` with `matcher: "Bash"`. Receives JSON on stdin containing `tool_input.command` — the exact Bash command that just ran.

**When to use:** Detecting `gsd-tools phase complete` executions.

**How the detection works:**

The `transition.md` workflow calls:
```bash
node "~/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete "${current_phase}"
```

The PostToolUse stdin JSON contains:
```json
{
  "session_id": "abc123",
  "cwd": "/Users/olive/Documents/GitHub/ai-workbots",
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "node \"~/.claude/get-shit-done/bin/gsd-tools.cjs\" phase complete \"5\""
  },
  "tool_response": { ... }
}
```

The hook matches on `tool_input.command` containing `gsd-tools.cjs" phase complete` or `gsd-tools` + `phase complete`.

### Pattern 2: Direct SQLite Episode Insert

**What:** The hook opens brain.db directly using better-sqlite3 (synchronous) and inserts one row into `episodes`. This is identical to what `logEpisode()` does in `packages/mcp-server/src/tools.ts`.

**When to use:** Every time a phase transition is detected.

**The episode schema:**
```sql
INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
VALUES (?, ?, ?, ?, ?, ?)
```

Fields:
- `id`: nanoid()
- `session_id`: `data.session_id` from hook stdin (the Claude Code session that fired the transition)
- `agent_id`: `'gsd-hook'` (fixed string — identifies the source)
- `event_type`: `'gsd_phase_complete'`
- `payload`: JSON string with structured GSD-02 fields
- `created_at`: ISO 8601 UTC timestamp

### Pattern 3: GSD-02 Payload Structure

**What the payload must contain** (per GSD-02 requirements):
```json
{
  "phase_name": "gsd-integration",
  "phase_number": "5",
  "requirements_covered": ["GSD-01", "GSD-02", "GSD-03"],
  "outcome_summary": "...",
  "plans_executed": 3,
  "is_last_phase": false,
  "next_phase": "6",
  "source": "gsd_hook",
  "transition_timestamp": "2026-03-21T04:00:00.000Z"
}
```

**How to populate `requirements_covered`:** The `transition.md` workflow calls `gsd-tools phase complete ${phase}` which reads ROADMAP.md. The hook can read the ROADMAP.md from `cwd` to extract the `**Requirements:**` line for the phase. Alternatively, read `REQUIREMENTS.md` traceability table. Both are in `.planning/`.

**How to populate `outcome_summary`:** Read `*-SUMMARY.md` files from the phase directory. Concatenate the `## Summary` section from each. If files are absent or unreadable, use a fallback: `"Phase ${phase_number} complete — ${plans_executed} plans executed"`.

### Pattern 4: Fire-and-Forget Failure Isolation

**What:** Every code path in the hook must exit 0. No exception or error should propagate to Claude Code.

**The wrapper pattern** (verified from existing hooks like `gsd-context-monitor.js`):
```javascript
process.stdin.on('end', () => {
  try {
    // ... all logic here
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});
```

Additionally:
- Each sub-operation (opening DB, reading files, extracting phase info) wraps in its own try/catch
- If brain.db doesn't exist yet (MCP server never started), the hook exits 0 silently
- If better-sqlite3 is unavailable (wrong path), the hook exits 0 silently
- Stdin timeout guard (same 10s pattern as other hooks) prevents hanging

### Pattern 5: Command Detection Regex

The command string to match is not a fixed path — it uses `~/.claude/get-shit-done/bin/gsd-tools.cjs`. Detection must be path-independent:

```javascript
// Detect phase complete transitions
const command = data.tool_input?.command || '';
const isPhaseComplete = /gsd-tools[^\s]*\s+phase\s+complete/.test(command);
```

This matches regardless of whether the path uses `~`, absolute path, or environment variable expansion.

### Pattern 6: brain.db Location

The brain.db location follows the same logic as `packages/core/src/db.ts`:
```javascript
function getDbPath() {
  const envPath = process.env.BRAIN_DB_PATH;
  if (envPath) return envPath;
  const xdgData = process.env.XDG_DATA_HOME ||
    require('path').join(require('os').homedir(), '.local', 'share');
  return require('path').join(xdgData, 'ai-workbots', 'brain.db');
}
```

If the file does not exist at that path, the hook exits 0 silently (no brain.db means no MCP server has ever run, nothing to write to).

### Pattern 7: sqlite-vec Extension

`logEpisode()` in the existing codebase does NOT use vec_embeddings — it writes to the plain `episodes` table only. The hook does not need to load the sqlite-vec extension. This simplifies the hook significantly: plain `new Database(dbPath)` with no extension loading.

**Verification:** The `episodes` table schema in `packages/core/src/schema.ts` has no vector column.

### Anti-Patterns to Avoid

- **Loading the full sqlite-vec extension in the hook:** Unnecessary — episodes table has no vector column. Loading it requires the native binary, adds complexity, and failure modes.
- **Calling the MCP server over stdio from a hook:** MCP stdio transport is not designed for external callers; the server is already in use by the Claude Code session.
- **Matching on `gsd-tools` broadly:** Would fire on `find-phase`, `init`, `roadmap`, etc. Use `phase complete` as the specific subcommand match.
- **Using `exit 2` on any failure path:** exit 2 blocks the tool call. Every failure must exit 0.
- **Writing to stdout with non-JSON or JSON that has unrecognized keys:** Claude Code may surface hook errors if stdout is non-empty and unparseable. Keep stdout empty on success (no `additionalContext` needed).
- **Using `require()` with relative paths:** Hook scripts run with cwd set to the Claude Code workspace. Use `path.resolve(__dirname, ...)` for all internal requires.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ID generation | Custom UUID/random | `nanoid` (already installed) | Already in monorepo node_modules; collision-resistant |
| SQLite access | `sqlite3` async callback API | `better-sqlite3` (already installed) | Already in monorepo; synchronous API is correct for hooks |
| brain.db path resolution | Custom logic | Copy the exact pattern from `packages/core/src/db.ts` | One source of truth; env var support |
| Phase data extraction | Parse ROADMAP.md from scratch | Read the hook's `cwd` and use same file paths GSD uses | Same files already exist; reading them is reliable |

**Key insight:** This phase is entirely about plumbing existing infrastructure together. Every component already exists — the hook system, the SQLite schema, the episode insertion logic, the source_type. The work is writing a thin glue script.

## Common Pitfalls

### Pitfall 1: Hook Fires on gsd-tools Plan Operations Too
**What goes wrong:** The matcher is too broad and fires on `gsd-tools init`, `gsd-tools state`, `gsd-tools template fill`, etc.
**Why it happens:** Many GSD operations call gsd-tools.cjs via Bash.
**How to avoid:** Match specifically on `phase complete` as the subcommand: `/gsd-tools[^\s]*\s+phase\s+complete/`
**Warning signs:** Episodes table filling with non-transition events.

### Pitfall 2: hook Script Requires sqlite-vec Extension
**What goes wrong:** Script calls `sqliteVec.load(db)` before inserting — fails if native binary path is wrong.
**Why it happens:** Copying pattern from `packages/core/src/db.ts` which loads it for vector search.
**How to avoid:** Episodes table has no vector column. Do not load sqlite-vec in the hook. Just `new Database(dbPath)` then the INSERT.
**Warning signs:** Hook error logged: "Could not load extension".

### Pitfall 3: Hook Blocks When brain.db Doesn't Exist
**What goes wrong:** `new Database(dbPath)` with better-sqlite3 auto-creates the file when it doesn't exist. This creates an empty database without the schema, and subsequent INSERT fails.
**Why it happens:** better-sqlite3 creates files by default. An empty brain.db has no `episodes` table.
**How to avoid:** Check `fs.existsSync(dbPath)` before opening. If the file doesn't exist, exit 0 silently.
**Warning signs:** SQLite "no such table: episodes" error caught and swallowed; silent no-op.

### Pitfall 4: Path Resolution for better-sqlite3 require
**What goes wrong:** `require('better-sqlite3')` fails because node_modules is not on the path when the hook runs.
**Why it happens:** Claude Code runs hooks in a shell that does not have the project's node_modules in NODE_PATH.
**How to avoid:** Use an absolute path to require: `require('/Users/olive/Documents/GitHub/ai-workbots/node_modules/better-sqlite3')`. Or — better — reference the monorepo root node_modules relative to `__dirname` if the hook lives in the project. The hook should be placed in the project repo at `.claude/hooks/` so `__dirname` is reliable.
**Warning signs:** "Cannot find module 'better-sqlite3'" error caught silently.

### Pitfall 5: stdout Pollution From Hook Causes Hook Error
**What goes wrong:** Any text written to stdout that isn't valid JSON (or is JSON with unexpected structure) causes Claude Code to log "hook error" in the transcript.
**Why it happens:** Claude Code tries to parse PostToolUse stdout as a JSON decision object. Stray console.log() calls write to stdout.
**How to avoid:** Use `console.error()` for all diagnostic output in the hook (writes to stderr, not stdout). Keep stdout completely empty on success — no `additionalContext` needed for a fire-and-forget hook.
**Warning signs:** "hook error" appearing in Claude Code transcript after phase transitions.

### Pitfall 6: Phase Extraction From Command String Is Fragile
**What goes wrong:** Using regex to extract the phase number from the command string like `phase complete "5"` breaks with different quoting styles.
**Why it happens:** Shell quoting varies.
**How to avoid:** Also read `cwd/.planning/STATE.md` frontmatter to get the current phase number as a fallback. The `stopped_at` field or `gsd_state_version` block contains phase context. PRIMARY: parse from the command string; FALLBACK: read STATE.md.

## Code Examples

Verified patterns from the existing codebase:

### Episode Insert (from packages/mcp-server/src/tools.ts:338)
```typescript
// Source: packages/mcp-server/src/tools.ts logEpisode()
db.prepare(`
  INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(id, prov.session_id, prov.agent_id, event_type, JSON.stringify(payload), prov.created_at);
```

### brain.db Path Resolution (from packages/core/src/db.ts)
```javascript
// Source: packages/core/src/db.ts getDefaultDbPath()
function getDbPath() {
  const envPath = process.env.BRAIN_DB_PATH;
  if (envPath) return envPath;
  const xdgData = process.env.XDG_DATA_HOME ||
    require('path').join(require('os').homedir(), '.local', 'share');
  return require('path').join(xdgData, 'ai-workbots', 'brain.db');
}
```

### Hook Stdin Pattern (from ~/.claude/hooks/gsd-context-monitor.js)
```javascript
// Source: ~/.claude/hooks/gsd-context-monitor.js — standard GSD hook pattern
let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    // ... process data.session_id, data.cwd, data.tool_input.command
  } catch (e) {
    process.exit(0); // Silent fail
  }
});
```

### Hook Registration (from ~/.claude/settings.json observed pattern)
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/absolute/path/to/.claude/hooks/gsd-brain-episode.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Note:** The hook should be registered in `.claude/settings.json` at the project root (project-scoped, committable), not in `~/.claude/settings.json` (global).

### Phase Number Extraction Pattern
```javascript
// Extract phase number from command string
// Input: node "~/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete "5"
const phaseMatch = command.match(/phase\s+complete\s+["']?(\d+[A-Z]?(?:\.\d+)*)["']?/i);
const phaseNumber = phaseMatch ? phaseMatch[1] : null;
```

### Reading ROADMAP.md for Requirements Coverage
```javascript
// Extract requirements from phase section of ROADMAP.md
// Phase section contains: **Requirements:** [GSD-01, GSD-02, GSD-03]
const roadmapPath = require('path').join(cwd, '.planning', 'ROADMAP.md');
const roadmap = require('fs').readFileSync(roadmapPath, 'utf-8');
const phaseSection = roadmap.match(
  new RegExp(`##+ Phase ${phaseNumber}[:\\s][\\s\\S]*?(?=##+ Phase|$)`, 'i')
);
const reqMatch = phaseSection && phaseSection[0].match(/\*\*Requirements:\*\*\s*\[?([^\]\n]+)/i);
const requirements = reqMatch
  ? reqMatch[1].split(/[,\s]+/).map(r => r.trim()).filter(Boolean)
  : [];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP server as sole write path | Direct SQLite write from hook scripts | Hook system design | Hooks are shell commands, not MCP clients — direct DB write is idiomatic |
| Global hook registration | Project-scoped `.claude/settings.json` | Claude Code settings scoping | Keeps project-specific hooks out of global settings |

**Deprecated/outdated:**
- `sqlite3` (npm): Do not use — see CLAUDE.md "What NOT to Use" section. Use `better-sqlite3`.
- `sqlite-vss`: Deprecated by author in 2024, replaced by `sqlite-vec`. Not relevant here anyway (no vectors in episodes).

## Open Questions

1. **Hook placement: project `.claude/settings.json` vs global `~/.claude/settings.json`**
   - What we know: Project-scoped (`.claude/settings.json`) is the correct semantic — this hook is specific to this project's brain.db
   - What's unclear: Whether `.claude/settings.json` is already gitignored or intended to be committed for this project
   - Recommendation: Use `.claude/settings.json` at project root. If it already exists, merge the new hook entry into it. The hook script itself lives in `.claude/hooks/` (committed to the repo).

2. **Outcome summary extraction: SUMMARY.md vs generated text**
   - What we know: Phase SUMMARY.md files exist after plan execution; they contain a `## Summary` section
   - What's unclear: Whether reading SUMMARY.md at hook time is reliable (hook fires before/after summary creation?)
   - Recommendation: The `transition.md` workflow step `cleanup_handoff` runs before `update_roadmap_and_state` which calls `phase complete`. SUMMARY.md files should exist by then. Read them — but wrap in try/catch and fall back to a generated summary if absent.

3. **`nanoid` CommonJS availability**
   - What we know: `nanoid` v5.x is ESM-only
   - What's unclear: Whether the hook (CommonJS .js file) can require nanoid v5
   - Recommendation: The hook should use `crypto.randomUUID()` (Node.js built-in, available in Node.js 14.17+, LTS 22.x confirmed) instead of nanoid to avoid ESM/CJS compatibility issues. `crypto.randomUUID()` generates a standard UUID which is equally suitable for episode IDs.

## Sources

### Primary (HIGH confidence)
- `/Users/olive/Documents/GitHub/ai-workbots/packages/mcp-server/src/tools.ts` — `logEpisode()` function, episode INSERT SQL, `SourceType` usage
- `/Users/olive/Documents/GitHub/ai-workbots/packages/core/src/db.ts` — `getDefaultDbPath()`, BRAIN_DB_PATH env var, db path logic
- `/Users/olive/Documents/GitHub/ai-workbots/packages/core/src/types.ts` — `SourceType = 'gsd_hook'` already defined, `Episode` interface
- `/Users/olive/.claude/hooks/gsd-context-monitor.js` — canonical GSD hook pattern: stdin reading, timeout guard, silent fail, PostToolUse JSON structure
- `/Users/olive/.claude/settings.json` — PostToolUse hook registration syntax, timeout field, matcher field
- `https://code.claude.com/docs/en/hooks-guide` — Hook lifecycle, PostToolUse Bash stdin schema with `tool_input.command`, exit code semantics, stdout JSON format
- `https://code.claude.com/docs/en/hooks` — TaskCompleted event details, Stop hook fields, PostToolUse tool_response schema
- `/Users/olive/.claude/get-shit-done/workflows/transition.md` — `gsd-tools phase complete` call site, exact command format
- `/Users/olive/.claude/get-shit-done/bin/lib/phase.cjs` `cmdPhaseComplete()` — returned fields: `completed_phase`, `plans_executed`, `next_phase`, `is_last_phase`

### Secondary (MEDIUM confidence)
- WebSearch + official Claude Code docs: PostToolUse fires after Bash tool completes; `tool_input.command` contains the shell command; hook stdout must be empty or valid JSON

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in the monorepo, no new packages
- Architecture: HIGH — hook system docs verified against official source; direct SQLite write pattern verified against existing tools.ts code
- Pitfalls: HIGH — pitfalls derived from reading actual hook implementations and better-sqlite3 behavior

**Research date:** 2026-03-21
**Valid until:** 2026-09-21 (Claude Code hook API is stable; better-sqlite3 and core types are locked for this project)
