# Technology Stack — v6.0 Proactive Knowledge & Onboarding

**Project:** Myco
**Milestone:** v6.0 — Proactive Knowledge & Onboarding
**Researched:** 2026-03-27
**Overall Confidence:** HIGH for session-start injection and workflow rules (verified against official Claude Code docs); HIGH for codebase scanning (verified against npm package docs); MEDIUM for knowledge correction UX patterns (derived from prior art in memory-graph MCP community)

---

## Context: What's Already Validated

The following stack is in production — do NOT re-research:

| Technology | Installed Version | Role |
|------------|------------------|------|
| Node.js | 22.x LTS | Runtime |
| TypeScript | 5.9 | Language |
| better-sqlite3 | 12.8.0 | SQLite database |
| sqlite-vec | 0.1.7 | Vector similarity search |
| FTS5 (SQLite built-in) | — | `fts_observations` virtual table (already in schema) |
| ollama (npm) | 0.6.3 | Embedding client |
| Vercel AI SDK | 4.3.19 | LLM calls (`ai` + `ollama-ai-provider@1.2.0`) |
| Hono | 4.x | REST API on port 3001 |
| MCP SDK | 1.27.1 | MCP protocol (`registerTool()` with Zod v4) |
| Zod | 4.3.6 | Schema validation |
| croner | 10.0.1 | Cron scheduler |
| nanoid | 5.x | ID generation |
| fast-glob | 3.3.3 | File discovery (added in v5.0) |
| p-queue | 8.1.0 | Async job throttling (added in v5.0) |
| React 19 / Vite 8 / Tailwind v4 / shadcn/ui | current | Dashboard PWA |

This research covers **only what must be added** for v6.0 new capabilities.

---

## Feature 1: Automatic Session-Start Recall (Context Injection into Claude Code)

**What's needed:** When a Claude Code session starts in a directory mapped to a known project, Myco proactively surfaces relevant project context, user preferences, and workflow rules into the session — without the user having to ask.

### Recommendation: Claude Code `SessionStart` hook + direct SQLite read — no new library

**How it works — verified against official Claude Code docs (2026-03-27):**

Claude Code's `SessionStart` hook fires on every session start (and on `resume`, `/clear`, `compact`). The hook receives a JSON payload via stdin that includes `cwd` — the current working directory. The hook writes a JSON response to stdout with an `additionalContext` field that Claude Code injects directly into the session context window.

```json
// Input to hook (stdin)
{
  "session_id": "abc123",
  "cwd": "/Users/olive/Documents/GitHub/myco",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-sonnet-4-6"
}

// Output from hook (stdout)
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Project: Myco\nWorkflow rules:\n- Update docs before committing\n...\nRecent context:\n..."
  }
}
```

**Implementation:** A new binary `myco-session-hook` (or extend `myco-cli`) that:
1. Reads `cwd` from stdin JSON
2. Opens the SQLite DB directly (same as existing `myco-cli` pattern — `openDatabase()` + `prepareStatements()`)
3. Resolves `cwd` to a `project` entity (exact match or parent-dir walk)
4. Queries for: workflow rules (`entity_type = 'workflow_rule'`), project observations, user preferences (globally scoped)
5. Formats as compact markdown and writes the `hookSpecificOutput` JSON to stdout
6. Must complete in under 2 seconds (hook timeout)

**Configuration in `.claude/settings.json` (user-level, not project-level):**
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/myco/packages/mcp-server/dist/session-hook.js",
        "timeout": 5000
      }]
    }]
  }
}
```

**Why not use MCP sampling:** MCP sampling (server calling back to client's LLM) is a different protocol flow — it sends a `sampling/createMessage` request requiring client-side support. Claude Code's `SessionStart` hook is simpler, more direct, and purpose-built for this use case. Sampling adds security surface area without benefit here.

**Why not use MCP Resources:** MCP resources require the user to explicitly pull them with `@` mentions. They are not automatically injected at session start. The `SessionStart` hook is the only mechanism that automatically injects text into Claude's context window without user action.

**No new npm dependency needed.** The hook binary reuses `@myco/core`'s `openDatabase()` and `prepareStatements()` — the same direct SQLite write pattern already validated in the existing GSD hook.

---

## Feature 2: Project Onboarding (`myco init`) — Codebase Scanning

**What's needed:** A `myco init` command that scans the current working directory, infers project knowledge (tech stack, conventions, key files), presents a summary for user approval, then commits approved inferences to the graph.

### Recommendation: `fast-glob` (already installed) + TypeScript Compiler API (already available) + Vercel AI SDK `generateObject` (already installed) — no new library

**Rationale by sub-problem:**

#### File Discovery
`fast-glob` (v3.3.3) is already a dependency of `@myco/mcp-server` from v5.0. Use it for codebase traversal with standard exclusion patterns:

```typescript
import fg from 'fast-glob';

const files = await fg([
  'package.json', 'tsconfig*.json', 'pyproject.toml', 'Cargo.toml',
  'CLAUDE.md', 'README.md', '.env.example',
  '**/*.ts', '**/*.tsx', '**/*.js',
  '!**/node_modules/**', '!**/dist/**', '!**/.git/**',
  '!**/*.min.js', '!**/coverage/**'
], { cwd: projectRoot, dot: false });
```

**Why not `globby`:** Globby wraps fast-glob and is slightly slower. Myco already has fast-glob installed. No need for the wrapper.

**Why not Node.js `fs.glob`:** Still experimental in Node 22 (added in 22.13). Production code should not depend on experimental APIs.

#### Gitignore Respect
`fast-glob` supports `ignore` patterns but does not natively read `.gitignore`. For the onboarding scan, add the `ignore` package (2.3M weekly downloads, used by ESLint and Prettier, node-ignore):

```bash
# packages/mcp-server
npm install ignore
```

```typescript
import ignore from 'ignore';
import { readFileSync } from 'fs';

const ig = ignore();
try {
  ig.add(readFileSync(path.join(projectRoot, '.gitignore'), 'utf8'));
} catch { /* no .gitignore, that's fine */ }

const files = await fg(['**/*'], { cwd: projectRoot });
const filteredFiles = files.filter(f => !ig.ignores(f));
```

**Why `ignore` over `parse-gitignore`:** `ignore` is a full gitignore filter (used by ESLint, Prettier, hundreds of major packages). `parse-gitignore` only parses the file to an array of patterns — you still need to filter. `ignore` does both.

#### Convention Inference
**Do not add a rule-based NLP library.** The Vercel AI SDK `generateObject` (already installed at `ai@4.3.19`) handles convention inference correctly with domain-aware LLM reasoning. Pass file listings, `package.json` contents, `tsconfig.json`, and sample file headers to the LLM with a structured Zod schema:

```typescript
import { generateObject } from 'ai';
import { z } from 'zod/v4';

const OnboardingSchema = z.object({
  project_name: z.string(),
  tech_stack: z.array(z.string()),
  conventions: z.array(z.object({
    rule: z.string(),
    evidence: z.string(),
  })),
  workflow_rules: z.array(z.string()),
  user_preferences: z.array(z.string()),
});
```

**Do not use `@typescript-eslint/typescript-estree` or tree-sitter for convention inference.** AST parsing tells you *what* the code does, not *what conventions* it follows. The LLM understands conventions from documentation, config files, and code samples — the same way a human engineer onboards. The v5.0 STACK.md already ruled out tree-sitter due to native binding friction; that reasoning holds here.

#### LLM Call Size Management
Onboarding scans may involve reading many files. Cap LLM context to the most informative files:
1. Always include: `package.json`, `tsconfig.json`, `CLAUDE.md`, `README.md` (first 100 lines each)
2. Sample 3-5 TypeScript files from each major directory (smallest files by line count)
3. Hard cap: 8,000 tokens of input text to the inference call

No new library for tokenization — character count approximation (`chars / 4`) is sufficient for a cap:

```typescript
const MAX_CHARS = 32000; // ~8k tokens
let charCount = 0;
const contextParts: string[] = [];
for (const [path, content] of fileContents) {
  if (charCount + content.length > MAX_CHARS) break;
  contextParts.push(`--- ${path} ---\n${content}`);
  charCount += content.length;
}
```

**New dependency for v6.0 onboarding: `ignore` (v5.3.x)**

```bash
npm install ignore
```

---

## Feature 3: Workflow Rules as First-Class Entities

**What's needed:** Rules like "update docs before committing" stored in the graph, reliably retrieved at session-start, surfaced distinctly from passive memories.

### Recommendation: Existing entity/observation schema with `entity_type = 'workflow_rule'` + existing FTS5 + new `priority` metadata field — no new library

**Rationale:** The existing schema already supports this. Workflow rules are entities with `entity_type = 'workflow_rule'` and observations containing the rule text. The existing `project` column (migration 4) scopes rules to a project or `NULL` for global rules.

**What needs to be built (new TypeScript, not new libraries):**

1. A `WorkflowRuleStore` helper in `@myco/core` that provides typed CRUD for `entity_type = 'workflow_rule'` entities
2. A `myco_set_rule` MCP tool and `myco_list_rules` MCP tool (new tools in `@myco/mcp-server`)
3. A `priority` field in the observation `metadata` JSON column: `{ "priority": "high" | "medium" | "low", "trigger": "always" | "on_commit" | "on_deploy" }`

**Retrieval at session-start:** The session hook queries:
```sql
SELECT e.name, o.content, o.metadata
FROM entities e
JOIN observations o ON o.entity_id = e.id
WHERE e.type = 'workflow_rule'
  AND (e.project = ? OR e.project IS NULL)
  AND o.valid_until IS NULL
ORDER BY json_extract(o.metadata, '$.priority') DESC, e.created_at ASC
LIMIT 20
```

This uses the existing `project` index and `valid_until` temporal column from v5.0 migration 5. No new index or table needed.

**Why not a separate `rules` table:** Keeping rules in the entity/observation schema means they participate in vector search, dedup detection, approval flows, and the knowledge graph explorer without any special-casing. The entity graph is the right abstraction.

**Why not a dedicated rule engine library (json-rules-engine, nools, etc.):** These libraries evaluate rules against runtime facts (data conditions trigger actions). Myco's workflow rules are textual instructions surfaced to Claude, not programmatic conditions triggering automated actions. A rule engine is the wrong abstraction — it would evaluate rules against data, not surface them to a human-facing agent.

**No new npm dependency needed.**

---

## Feature 4: Smart Context Scoping (Working Directory → Project Entity)

**What's needed:** Given a `cwd` at session-start, resolve it to the correct project entity in the knowledge graph.

### Recommendation: Path normalization using Node.js built-ins — no new library

**Resolution algorithm:**

```typescript
import path from 'path';

function resolveProjectFromCwd(cwd: string, db: Database.Database): string | null {
  // 1. Try exact match on entity name or metadata path
  // 2. Try git root (walk up to find .git directory)
  // 3. Try longest prefix match against known project paths
  // 4. Fall back to NULL (global scope)
}
```

**Git root detection without a library:**
```typescript
function findGitRoot(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}
```

Node's `path`, `fs.existsSync`, and `os.homedir()` handle everything needed. The `simple-git` library is unnecessary overhead for a one-time git root detection.

**Project path stored in entity metadata:** When `myco init` runs, the project entity stores its root path in `metadata`:
```json
{ "root_path": "/Users/olive/Documents/GitHub/myco", "git_remote": "..." }
```

**No new npm dependency needed.**

---

## Feature 5: Knowledge Correction & Evolution

**What's needed:** A user-facing flow to find, display, and supersede stale or incorrect knowledge. Triggered by "I changed my mind about X" or "update this rule."

### Recommendation: New `myco_correct` MCP tool + existing `valid_until` temporal column + existing approval queue — no new library

**The correction flow:**

1. Agent calls `myco_recall` to surface the current observation(s) about X
2. Agent calls `myco_correct` with the observation ID and new content
3. `myco_correct` sets `valid_until = now()` on the old observation (using the v5.0 temporal column) and creates a new observation with `valid_from = now()`
4. Creates a `SUPERSEDED_BY` relationship between old and new entity observations for audit trail
5. High-confidence corrections auto-apply; low-confidence go to the approval queue (existing pattern)

**The `myco_correct` tool schema:**
```typescript
const CorrectSchema = z.object({
  entity_name: z.string(),
  observation_id: z.string().optional(),   // specific observation, or...
  search_query: z.string().optional(),      // ...find by text
  new_content: z.string(),
  reason: z.string().optional(),
  project: z.string().optional(),
});
```

**Dashboard UX for corrections:** The existing approval queue UI in `@myco/dashboard` handles the human-in-the-loop confirmation. No new UI pattern needed — a correction that requires review simply creates an `approval_queue` entry with `item_type = 'correction'`.

**Why not a separate audit/history table:** The `valid_from` / `valid_until` pattern on `observations` (already in migration 5) provides a complete history of what was true when. Querying `WHERE valid_until IS NOT NULL ORDER BY valid_until DESC` gives the full correction history for any entity.

**No new npm dependency needed.**

---

## Feature 6: User Preference Accumulation

**What's needed:** Preferences inferred in any project attach to a global `user` entity, with the project as evidence in the observation metadata.

### Recommendation: Existing entity schema with `entity_type = 'user_preference'` + `project` as `NULL` for global scope — no new library

**Pattern:** During `myco init` and during the consolidation pipeline, inferred user preferences create/update observations on a canonical `user` entity:

```typescript
await rememberEntity(db, {
  entity_name: 'User',
  entity_type: 'user',
  content: 'Prefers dark color themes in UI',
  project: null,   // NULL = global, not project-scoped
  metadata: { evidence_project: 'myco', evidence_source: 'observed_in_codebase' },
});
```

The session hook surfaces global user preferences (where `project IS NULL`) alongside project-specific workflow rules, giving Claude a full picture in every session.

**No new npm dependency needed.**

---

## Complete New Dependencies for v6.0

| Library | Version | Purpose | Package | Justification |
|---------|---------|---------|---------|---------------|
| `ignore` | 5.3.x | Gitignore-aware file filtering during `myco init` scan | `@myco/mcp-server` | Used by ESLint/Prettier; 2.3M weekly downloads; full `.gitignore` spec compliance; no native deps |

**That's it. One new dependency for all v6.0 features.**

Everything else is new TypeScript classes, MCP tools, SQL queries, and a new CLI binary — all built on the existing stack.

---

## What NOT to Add

| Library | Why Not | What to Use Instead |
|---------|---------|-------------------|
| `simple-git` / `isomorphic-git` | Git root detection requires only `fs.existsSync` + `path.dirname` loop; full git library is 200KB+ for a 5-line algorithm | Node.js `path` + `fs` built-ins |
| `globby` | Wraps fast-glob with slight performance penalty; Myco already has fast-glob installed | `fast-glob` (already in `@myco/mcp-server`) |
| `parse-gitignore` | Only parses `.gitignore` to an array; doesn't filter — you need `ignore` anyway | `ignore` (does both parse and filter) |
| `json-rules-engine` / `nools` | Rule engines evaluate data conditions to trigger actions; Myco rules are textual instructions for agents, not programmatic if-then logic | `entity_type = 'workflow_rule'` in existing graph |
| `tiktoken` / `gpt-tokenizer` | Tokenization library for LLM context budgeting; character-count approximation (`chars / 4`) is sufficient for a soft cap in onboarding scan | Plain character count |
| `@typescript-eslint/typescript-estree` | AST parsing tells you code structure, not coding conventions; LLM-based inference via `generateObject` is more accurate for convention detection | Existing `ai@4.3.19` + `generateObject` |
| `chokidar` | File watcher for live re-indexing; v6.0 onboarding is a one-time scan, not a live watcher; `myco init` is imperative, not reactive | Not needed in v6.0; revisit if live codebase indexing is added later |
| `@huggingface/transformers` (in-process NLP) | 500MB+ model weight, slow cold start, requires ONNX runtime; used by some competing MCP memory servers but violates Myco's local-lightweight constraint | Existing Ollama via `ollama@0.6.3` npm |
| MCP Sampling (`sampling/createMessage`) | Server-to-client LLM callbacks; requires client-side sampling support; adds security surface; not the right tool for session context injection | Claude Code `SessionStart` hook with `additionalContext` |
| MCP Resources for auto-context | Resources require user `@` invocation; not automatically injected at session start | Claude Code `SessionStart` hook (automatically fired, no user action needed) |
| `lancedb` / Chroma / Qdrant | External vector DB; violates local-only constraint; used by `codebase-context` MCP but Myco already has sqlite-vec in the same SQLite file | `sqlite-vec@0.1.7` (already installed) |

---

## Schema Migrations Required (No New Libraries)

| Migration ID | Table | New Columns / Changes | Feature |
|-------------|-------|----------------------|---------|
| 9 | `entities` | `root_path TEXT DEFAULT NULL` (or store in existing `metadata` JSON) | Project path → CWD resolution |

**Recommendation:** Store `root_path` in the existing `metadata` JSON column on entities rather than adding a new column. Query via `json_extract(e.metadata, '$.root_path')`. This avoids another `ALTER TABLE` for a rarely-queried field.

**No new tables needed.** Workflow rules are entities, user preferences are entity observations, corrections use the existing `valid_until` column.

---

## New Binaries / Entry Points

| Binary | Package | Purpose | Implementation |
|--------|---------|---------|----------------|
| `myco-session-hook` | `@myco/mcp-server` | Claude Code `SessionStart` hook binary | Reads `cwd` from stdin JSON, queries SQLite, writes `additionalContext` to stdout. Extend existing `cli.ts` with a new `session-hook` subcommand or a separate entry point. Must be fast (< 2s). |

**Hook output format** (verified against Claude Code hooks docs):
```typescript
interface SessionHookOutput {
  hookSpecificOutput: {
    hookEventName: 'SessionStart';
    additionalContext: string; // Markdown text injected into Claude's context
  };
}
```

---

## Integration Points With Existing Stack

| New Capability | Integration Point | Notes |
|----------------|-------------------|-------|
| Session-start recall | Claude Code `SessionStart` hook → direct SQLite read via `@myco/core` `openDatabase()` | Same pattern as existing GSD hook which does direct SQLite writes |
| `myco init` scan | `fast-glob` (existing) + `ignore` (new) + `generateObject` (existing) | New `InitScanner` class in `@myco/mcp-server` |
| Workflow rules CRUD | New MCP tools (`myco_set_rule`, `myco_list_rules`) registered in `tools.ts` | `entity_type = 'workflow_rule'` uses existing entity schema |
| Knowledge correction | New MCP tool (`myco_correct`) using existing `valid_until` column (migration 5) | Routes through existing approval queue if confidence < 0.85 |
| User preferences | `entity_type = 'user_preference'`, `project = NULL` in existing entity table | Global scope via existing nullable `project` column |
| Dashboard corrections UI | Existing approval queue UI in `@myco/dashboard` | New `item_type = 'correction'` in approval_queue, no new UI components |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|----------------|-------|
| `ignore@5.3.x` | Node.js 6+, CJS + ESM | Pure JS, no native bindings; v5 is stable and long-running |
| `ignore@5.x` vs `fast-glob@3.3.3` | Fully compatible | Used together: fast-glob discovers, ignore filters |
| Claude Code `SessionStart` hook | Claude Code v2.1+ | Hook `additionalContext` field confirmed in current docs; `cwd` field available in hook input |
| `myco-session-hook` binary | `@myco/core` `openDatabase()` | Must use same `MYCO_DB_PATH` env var config as MCP server to find the correct SQLite file |

---

## Architectural Notes

**Session hook performance constraint:** The `SessionStart` hook must respond in under 5 seconds (configurable timeout). Direct SQLite reads via better-sqlite3 are synchronous and sub-millisecond for the queries involved (indexed lookups on `entity_type` and `project`). The hook should never trigger Ollama calls (no embedding needed for retrieval-by-type queries).

**Context injection size limit:** Claude Code loads `MEMORY.md` at 200 lines / 25KB. The `additionalContext` from hooks also contributes to the context window. Keep session hook output under 2,000 characters (~400 tokens). Prioritize: workflow rules first, then user preferences, then recent project context.

**`myco init` approval flow:** The onboarding scan result should present to the user for review before committing to the graph. Use the existing approval queue (`approval_queue` table with `item_type = 'onboarding_batch'`) rather than auto-approving all inferences. High-confidence stack detection (package.json parse) can auto-approve; LLM-inferred conventions go to the queue.

**Vercel AI SDK version lock continues:** Do NOT upgrade `ai` or `ollama-ai-provider` for v6.0. The `ai@4.3.19` + `ollama-ai-provider@1.2.0` combination is validated. The `generateObject` call for onboarding reuses the same LLM infrastructure as consolidation.

---

## Sources

- Claude Code hooks documentation: https://code.claude.com/docs/en/hooks — `SessionStart` hook, `cwd` field, `additionalContext` output format confirmed (HIGH confidence — official docs, current)
- Claude Code memory documentation: https://code.claude.com/docs/en/memory — MEMORY.md 200-line / 25KB limit confirmed; auto memory scoped per working tree / git root (HIGH confidence)
- MCP Prompts specification: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts — Prompts are user-initiated via slash commands, NOT auto-injected at session start (HIGH confidence — confirmed they are wrong tool for auto-context)
- npm: `ignore` — v5.3.2 current stable; used by ESLint, Prettier; 2.3M weekly downloads; full gitignore spec compliance (HIGH confidence)
- npm: `fast-glob` v3.3.3 — already installed; no gitignore native support confirmed (HIGH confidence)
- GitHub: PatrickSys/codebase-context — reference implementation analysis: uses `@typescript-eslint/typescript-estree` + `@huggingface/transformers` + `lancedb`; explicitly NOT the approach for Myco (too heavyweight, violates local constraints) (MEDIUM confidence — GitHub README)
- memory-graph MCP community: `SUPERSEDED_BY` relationship pattern + `valid_from`/`valid_until` for correction tracking (MEDIUM confidence — multiple community implementations agree)
- WebSearch: Claude Code SessionStart hook injects context via `additionalContext` stdout field; `cwd` available in hook input JSON (HIGH confidence — multiple sources, consistent with official docs)

---

*Stack research for: Myco v6.0 Proactive Knowledge & Onboarding*
*Researched: 2026-03-27*
