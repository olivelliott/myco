# Architecture Research

**Domain:** MCP memory server — Proactive Knowledge & Onboarding (v6.0 additions)
**Researched:** 2026-03-27
**Confidence:** HIGH (existing codebase read directly; Claude Code hook and MCP protocol behavior verified via official docs)

---

## Context: Existing Architecture Baseline

This document focuses exclusively on how v6.0 features integrate with the existing four-package monorepo. The v5.0 architecture document covers the baseline in detail.

### Current Package Map

```
packages/
├── core/           — DB open, schema, migrations, types, provenance, prepared statements
├── mcp-server/     — MCP tools, consolidation, cron, CLI (myco / myco-cli binaries)
├── api-server/     — Hono REST API on port 3001 (5 route groups)
└── dashboard/      — React PWA (approval queue, graph explorer, activity)
```

### Current MCP Tools (from packages/mcp-server/src/tools.ts)

| Tool | Purpose |
|------|---------|
| `remember` | Upsert entity + temporal observation, optional relations, project scoping |
| `recall` | Semantic/FTS search over observations, temporal + project filters |
| `query` | Entity lookup by name/type/relation/project |
| `log_episode` | Raw episode write for later consolidation |
| `consolidate` | Manual LLM consolidation trigger |
| `list_pending_approvals` | Read approval queue |
| `resolve_approval` | Approve/reject/edit queued items |
| `forget` | Delete entity/observation/relationship |

### Schema Relevant to v6.0

- `entities.project TEXT DEFAULT NULL` (migration 4) — namespace isolation already in place
- `observations.valid_from / valid_until` (migration 5) — temporal supersession via `retireObservation()` in dedup-resolver.ts
- `observations.decay_exempt INTEGER DEFAULT 0` (migration 6) — flag for decay-exempt observations
- `entities.merged_into TEXT DEFAULT NULL` (migration 8) — soft-delete on merge
- `entity_type` is a free-text column — no enum constraint; new type values need no schema change
- FTS5 (`fts_observations`) + vec0 (`vec_embeddings`) for dual-mode search

---

## Key Architecture Questions Answered

### Q1: Should session-start recall use MCP Resources or a dedicated tool?

**Answer: Neither. Use a SessionStart hook writing `additionalContext` JSON to stdout.**

MCP Resources are NOT automatically injected into context by Claude Code. The MCP specification (modelcontextprotocol.io/docs/learn/client-concepts) defines Resources as "file-like data that can be read by clients" — they require explicit client request or user `@` mention. Claude Code does not enumerate and inject Resources at session start. Using Resources would require the user to manually `@`-reference project context each session, eliminating the "proactive" value.

MCP Prompts are accessible via `/mcp__servername__promptname` slash commands — also not automatic.

The correct mechanism is the **Claude Code `SessionStart` hook** (confirmed: code.claude.com/docs/en/hooks):
- Fires on every session start, resume, or `/clear`
- Receives `{ cwd, session_id, hook_event_name, source, model }` on stdin
- JSON output with `hookSpecificOutput.additionalContext` injects context silently (no transcript entry)
- The `cwd` field is the foundation for project detection

**Why not an MCP tool:** An MCP tool called at session start would require the agent to explicitly call it, adding a step to every session and depending on the agent following instructions. Hooks are guaranteed to fire regardless of agent behavior.

### Q2: Should the onboarding scanner be an MCP tool, CLI command, or both?

**Answer: CLI command primary; MCP tool as a secondary convenience wrapper.**

`myco init` is a setup operation analogous to `git init`. It runs once per project, before or outside of an active agent session. CLI is the natural interface. Codebase scanning reads many files and runs git commands — this belongs at setup time, not in a live agent session.

An MCP tool (`init_project`) is useful as a convenience wrapper for agents that want to trigger onboarding without leaving a session. The tool calls the same scanner module the CLI uses. This is a thin wrapper, not an alternative implementation.

### Q3: Where should workflow rules live — new table or entity_type?

**Answer: `entity_type = 'workflow_rule'` — no new table.**

The existing entity/observation model already handles structured first-class knowledge well. A workflow rule is semantically: an entity (name = rule identifier) with type `workflow_rule`, observations describing when/why the rule applies, and optional project scoping. This fits the existing model exactly.

Creating a separate table would exclude rules from semantic recall, FTS search, and embedding-based similarity. They would become invisible in the knowledge graph explorer. The `entity_type` discriminator gives rules full participation in all graph features at zero schema cost.

---

## v6.0 Feature Integration Map

### Feature 1: Automatic Session-Start Recall

**Integration classification:** NEW BINARY + NEW PREPARED STATEMENTS

**Architecture:**

```
Claude Code opens in /Users/olive/Documents/GitHub/myco
    ↓
SessionStart hook fires (configured in ~/.claude/settings.json)
Command: myco-recall-hook
    ↓
recall-hook.ts binary:
  Reads stdin: { cwd: "/Users/.../myco" }
  Calls selectProjectForPath(db, cwd)  — walks up directory tree
  Found: project = "myco"
  Queries:
    1. workflow rules (entity_type='workflow_rule', project='myco' OR NULL) LIMIT 5
    2. recent project observations (project='myco') ORDER BY updated_at DESC LIMIT 10
    3. user preferences (entity_type='person', entity_name='User') LIMIT 5
  Formats as markdown context block
  Writes to stdout:
    {
      "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": "## Myco project context\n..."
      }
    }
    ↓
Claude Code injects additionalContext into session silently
```

The hook binary is a **standalone script** compiled separately from the MCP server. This is required because Claude Code hooks run as shell commands — the MCP stdio transport is not accessible from hooks. This pattern is already validated in this project: PROJECT.md Key Decisions notes "GSD hook: direct SQLite write — MCP tools not callable from shell hooks."

**Performance requirement:** Hook must complete in under 500ms. Therefore:
- FTS5 only — no Ollama embedding call
- Direct SQLite reads via `better-sqlite3` synchronous API
- No network calls

**New file:** `packages/mcp-server/src/recall-hook.ts` — compiled to `myco-recall-hook` binary.

**Context budget:** Target under 2,000 tokens for the injected context block. Format:
```
## Session Context (Myco project)

**Workflow Rules:**
1. Update docs before committing
2. Run tests before pushing

**Recent project knowledge:**
- Uses Hono for HTTP API (confidence: 1.0)
- React 19 + Tailwind v4 for dashboard (confidence: 1.0)
...

**Your preferences:**
- Prefers dark themes in all UIs
```

---

### Feature 2: Project Onboarding (`myco init`)

**Integration classification:** NEW MODULE + CLI SUBCOMMAND + MCP TOOL WRAPPER

**New file:** `packages/mcp-server/src/onboarding-scanner.ts`

**Scanner flow:**

```
ProjectScanner.scan(path: string, projectName: string): Promise<ScanResult>
    ↓
File reads (synchronous, bounded):
  - package.json / Cargo.toml / pyproject.toml / go.mod → language, framework, version
  - CLAUDE.md / .claude/CLAUDE.md → existing instructions, conventions
  - README.md (first 3,000 chars) → project description
  - src/ structure probe (maxDepth: 2, fileCount only) → codebase scale
  - git log --oneline -20 → recent activity context

Produces: ScanResult {
  projectName: string,
  language: string,
  framework: string | null,
  conventions: string[],
  dependencies: string[],
  description: string,
  recentActivity: string,
}
    ↓
LLM extraction via Vercel AI SDK (same model + pattern as consolidator.ts):
  Input: ScanResult as structured prompt
  Output: FactList[] { entity_name, entity_type, observation, confidence, relations[] }
    ↓
For each extracted fact:
  confidence >= 0.85 → rememberEntity() directly (auto-approved)
  confidence < 0.85  → insert into approval_queue (human review)
    ↓
Insert project_paths row: { path: absolutePath, project: projectName }
    ↓
Print summary to stdout: N facts auto-approved, M queued for review
```

**CLI integration:** Add `init` subcommand to `packages/mcp-server/src/cli.ts`:
```
myco init --project <name> [--path <dir>]
```

**MCP tool integration:** Add `init_project` tool in `tools.ts`:
```typescript
{
  project_name: z.string(),
  path: z.string().optional(),  // defaults to cwd from session context
}
```

**Integration points:**
- Reuses `rememberEntity()` — no new write path
- Reuses `approval_queue` table — no new schema
- Reuses Vercel AI SDK extraction pattern from `consolidator.ts`
- `project` column on entities already exists (migration 4)
- Creates/upserts a `project` entity_type entity as the root node

---

### Feature 3: Smart Context Scoping (cwd → project mapping)

**Integration classification:** NEW TABLE (migration 9) + NEW PREPARED STATEMENTS

**Problem:** The `entities.project` column stores a project name string, but there is no table linking filesystem paths to project names. The SessionStart hook receives `cwd` and needs to identify the project without scanning the filesystem.

**New migration (migration 9):**

```sql
CREATE TABLE IF NOT EXISTS project_paths (
  id          TEXT PRIMARY KEY,
  path        TEXT NOT NULL UNIQUE,   -- absolute filesystem path (no trailing slash)
  project     TEXT NOT NULL,          -- matches entities.project
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_paths_path ON project_paths(path);
```

**Path resolution algorithm in `recall-hook.ts`:**

```typescript
function findProjectForPath(db: Database, stmts: MycoStatements, cwd: string): string | null {
  // Try exact match first
  let match = stmts.selectProjectForPath.get(cwd);
  if (match) return match.project;

  // Walk up the directory tree
  let dir = path.dirname(cwd);
  while (dir !== path.dirname(dir)) {  // stop at filesystem root
    match = stmts.selectProjectForPath.get(dir);
    if (match) return match.project;
    dir = path.dirname(dir);
  }
  return null;  // no project found — fall back to global knowledge only
}
```

Walking upward handles work inside subdirectories: `/Users/olive/Documents/GitHub/myco/packages/mcp-server` correctly resolves to the `myco` project via the registered path `/Users/olive/Documents/GitHub/myco`.

**Registration:** `myco init` inserts a `project_paths` row. Also expose `myco link-project <path> <project>` as a standalone CLI subcommand for manual registration of existing projects.

**Optional: Auto-detection from `remember` tool:** If a `remember` call includes `project` but no matching row exists in `project_paths`, and the MCP SDK exposes the session's working directory, auto-register it. This is a nice-to-have; the explicit init flow is the primary path.

**Schema location:** Add `project_paths` to `packages/core/src/schema.ts` as a new `CREATE TABLE IF NOT EXISTS` block (migration 9 in `migrations.ts`).

---

### Feature 4: Workflow Rules as First-Class Entities

**Integration classification:** CONVENTION + NEW MCP TOOL WRAPPER (no schema changes)

**No schema changes required.** `entity_type` is already a free-text column. `decay_exempt` already exists (migration 6).

**Entity_type convention:**
- `entity_type = 'workflow_rule'`
- `entity.project = null` for global rules; project name for project-specific rules
- All observations on a `workflow_rule` entity get `decay_exempt = 1` — rules don't decay
- `confidence = 1.0` — user-authored rules are always high confidence

**New `remember_rule` MCP tool:**

A dedicated tool provides cleaner semantics for agents storing rules:

```typescript
server.registerTool('remember_rule', {
  inputSchema: {
    rule: z.string().describe('The rule or instruction to remember'),
    project: z.string().optional().describe('Project scope (omit for global rule)'),
    when: z.string().optional().describe('Trigger condition (e.g. "before committing")'),
  }
}, async ({ rule, project, when }) => {
  const content = when ? `${rule} (applies: ${when})` : rule;
  return rememberEntity(db, {
    content,
    entity_name: slugify(rule),  // deterministic name for upsert
    entity_type: 'workflow_rule',
    project,
    confidence: 1.0,
    // decay_exempt flag wired through rememberEntity params
  }, stmts);
});
```

This is a thin wrapper over `rememberEntity()` — not a new write path.

**Surfacing in recall-hook:** The recall-hook queries `entity_type = 'workflow_rule'` for both the matched project AND globally (`project IS NULL`), formats them as a numbered list at the top of the context block.

**Dashboard support:** Add a "Rules" filter button to the knowledge graph explorer (entity_type = 'workflow_rule' query). This is a UI change in `packages/dashboard`.

---

### Feature 5: User Preference Accumulation

**Integration classification:** CONVENTION (no schema changes, no new tools)

User preferences reuse the existing entity model:
- `entity_type = 'person'` entity (e.g., name = "User" or actual username)
- Observations are preference statements
- `project = null` — preferences are global
- Relations to project entities record where the preference was observed

**Agent usage pattern:**

```typescript
// Agent observes a preference in the context of working on a project
remember({
  entity_name: "User",
  entity_type: "person",
  content: "Prefers minimal UI with no emoji",
  project: null,      // global — not scoped to current project
  relations: [{
    target_name: "myco",
    target_type: "project",
    relation_type: "observed_in"
  }]
})
```

The relation to the project entity captures provenance without scoping the preference. No schema changes needed — this is already expressible today.

**Session-start surfacing:** The recall-hook includes global `entity_type = 'person'` observations in the "Your preferences" section.

**No dedicated tool needed.** The existing `remember` tool handles this. Agents are instructed (via CLAUDE.md conventions) to use `entity_type: 'person'` and `project: null` for preferences.

---

### Feature 6: Knowledge Correction & Evolution

**Integration classification:** NEW MCP TOOL (uses existing `retireObservation()` + `rememberEntity()`)

The temporal supersession infrastructure is already in place from v5.0:
- `valid_from / valid_until` columns on observations (migration 5)
- `retireObservation(stmts, obsId, now)` in `dedup-resolver.ts` — sets `valid_until = now`
- `dedup-resolver.ts` already classifies observations as UPDATE vs NEW vs NOOP
- Default `recallKnowledge()` filter already excludes retired observations (`valid_until IS NULL`)

What's missing: a user-facing "find and update" workflow where the agent shows current knowledge before replacing it.

**New `update_knowledge` MCP tool:**

```typescript
server.registerTool('update_knowledge', {
  inputSchema: {
    entity_name: z.string(),
    entity_type: z.string().default('concept'),
    // Optional: narrow to a specific observation
    old_content_fragment: z.string().optional()
      .describe('Substring of the observation to replace'),
    new_content: z.string()
      .describe('Replacement observation text'),
  }
}, async ({ entity_name, entity_type, old_content_fragment, new_content }) => {
  // 1. Find entity
  const entity = stmts.selectEntityByNameType.get(entity_name, entity_type);
  if (!entity) return { content: [{ type: 'text', text: 'Entity not found' }] };

  // 2. Find active observations
  const activeObs = stmts.selectCurrentObservationsByEntityId.all(entity.id);

  // 3. Narrow if fragment provided
  const target = old_content_fragment
    ? activeObs.find(o => o.content.includes(old_content_fragment))
    : activeObs[activeObs.length - 1];  // most recent if no fragment

  if (!target) return { content: [{ type: 'text', text: 'No matching observation found' }] };

  // 4. Retire old, create new
  const now = new Date().toISOString();
  retireObservation(stmts, target.id, now);
  await rememberEntity(db, {
    content: new_content,
    entity_name,
    entity_type,
    confidence: 1.0,
    source_type: 'agent_session',
  }, stmts);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'updated',
        retired: { id: target.id, content: target.content },
        created: { content: new_content },
      })
    }]
  };
});
```

**Integration points:**
- `retireObservation()` already exported from `dedup-resolver.ts`
- `rememberEntity()` already creates temporal observations with `valid_from = now`
- `selectCurrentObservationsByEntityId` — new prepared statement (filter: `valid_until IS NULL`)
- No schema changes needed

---

## Component Map: New vs Modified

### New Files

| File | Package | Purpose |
|------|---------|---------|
| `src/recall-hook.ts` | mcp-server | SessionStart hook binary — reads cwd, queries DB, outputs additionalContext |
| `src/onboarding-scanner.ts` | mcp-server | Codebase scanner — reads project files, calls LLM, routes to approval queue |

### Modified Files

| File | Package | Change |
|------|---------|--------|
| `src/tools.ts` | mcp-server | Add `remember_rule`, `update_knowledge`, `init_project` tool registrations |
| `src/cli.ts` | mcp-server | Add `init` and `link-project` subcommands |
| `src/schema.ts` | core | Add `project_paths` table (or migration 9 in `migrations.ts`) |
| `src/migrations.ts` | core | Migration 9: `project_paths` table + index |
| `src/statements.ts` | core | Add `selectProjectForPath`, `insertProjectPath`, `selectCurrentObservationsByEntityId` |

### Unchanged Files

| File | Why Unchanged |
|------|--------------|
| `src/consolidator.ts` | Onboarding scanner reuses extraction pattern but in a new module |
| `src/dedup-resolver.ts` | `retireObservation()` already correct for `update_knowledge` tool |
| `src/embed-client.ts` | No changes needed |
| `src/index.ts` | MCP server startup unchanged |
| `packages/api-server/` | project_paths CRUD routes useful but not critical path for v6.0 |

---

## System Overview (Post v6.0)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Claude Code session startup                            │
│                                                                           │
│  ~/.claude/settings.json:                                                 │
│    SessionStart hook → myco-recall-hook                                  │
│         ↓ reads stdin: { cwd }                                            │
│         ↓ queries SQLite directly (WAL mode, concurrent safe)            │
│         ↓ writes additionalContext JSON to stdout                        │
│         ↓ Claude receives project context before first message           │
└──────────────────────────────────────────────────────────────────────────┘
                               │ session active
┌──────────────────────────────▼──────────────────────────────────────────┐
│              MCP Clients (Claude Code sessions)                           │
│  remember / recall / query / remember_rule / update_knowledge            │
│  init_project / log_episode / consolidate / forget                       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ stdio transport
┌──────────────────────────────▼──────────────────────────────────────────┐
│                     packages/mcp-server                                   │
│  tools.ts (+remember_rule, +update_knowledge, +init_project)             │
│  onboarding-scanner.ts [NEW]   recall-hook.ts [NEW]                     │
│  consolidator.ts   embed-client.ts   scheduler.ts   cli.ts (+init)      │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ imports @myco/core
┌──────────────────────────────▼──────────────────────────────────────────┐
│                      packages/core                                        │
│  db.ts   schema.ts (+project_paths)   statements.ts (+3 new stmts)      │
│  migrations.ts (+migration 9)   types.ts   provenance.ts                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ better-sqlite3 (WAL mode)
┌──────────────────────────────▼──────────────────────────────────────────┐
│                    SQLite Database (myco.db)                              │
│  entities   observations   relationships   episodes                      │
│  approval_queue   project_paths [NEW]                                    │
│  vec_embeddings (sqlite-vec)   fts_observations                          │
└──────────────────────────────▲──────────────────────────────────────────┘
                               │ imports @myco/core
┌──────────────────────────────┴──────────────────────────────────────────┐
│                     packages/api-server                                   │
│  Hono on :3001   /api/dashboard   /api/entities   /api/graph             │
│  /api/approvals   /api/episodes                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ TanStack Query polling
┌──────────────────────────────▼──────────────────────────────────────────┐
│                     packages/dashboard                                    │
│  React 19 PWA   Graph explorer (+Rules filter)   Approval queue          │
│  Activity log                                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Session-Start Recall Flow

```
Claude Code opens in /Users/olive/Documents/GitHub/myco
    ↓
SessionStart hook: myco-recall-hook (stdin: { cwd: "/Users/.../myco" })
    ↓
FTS5 path lookup (no Ollama):
  project_paths WHERE path = cwd (exact)
  → walk up: path = dirname(cwd), dirname(dirname(cwd)), ...
  → found: project = "myco"
    ↓
Parallel queries (all FTS5/BTree, fast):
  1. entities WHERE type='workflow_rule' AND (project='myco' OR project IS NULL) LIMIT 5
     JOIN observations WHERE valid_until IS NULL
  2. entities WHERE project='myco'
     JOIN observations WHERE valid_until IS NULL ORDER BY updated_at DESC LIMIT 10
  3. entities WHERE type='person'
     JOIN observations WHERE valid_until IS NULL LIMIT 5
    ↓
Format markdown (target: <2,000 tokens)
stdout: { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }
    ↓
Claude Code injects into context silently (no transcript entry)
```

### Project Onboarding Flow

```
User: myco init --project myco --path /Users/olive/Documents/GitHub/myco
    ↓
onboarding-scanner.ts: ProjectScanner.scan(path, projectName)
  File reads: package.json, CLAUDE.md, README.md, git log --oneline -20
  ScanResult { language, framework, conventions[], deps[], description, recentActivity }
    ↓
LLM extraction (Vercel AI SDK, BRAIN_CONSOLIDATION_MODEL from config):
  Prompt: canned extraction prompt + ScanResult as JSON
  Response: FactList[] { entity_name, entity_type, observation, confidence, relations[] }
    ↓
For each fact:
  confidence >= 0.85 → rememberEntity(db, fact, stmts)  [direct write]
  confidence < 0.85  → stmts.insertApprovalQueueItem.run(...)  [queued for review]
    ↓
stmts.insertProjectPath.run({ path, project: projectName })
    ↓
Print: "Onboarding complete: 12 facts auto-approved, 3 queued for review."
```

### Knowledge Correction Flow

```
Agent: update_knowledge({ entity_name: "myco", new_content: "Now uses Vite 9" })
    ↓
selectEntityByNameType(entity_name, entity_type)
    ↓
selectCurrentObservationsByEntityId(entity.id)  // valid_until IS NULL
  → [{ id: "obs_abc", content: "Uses Vite 8.0", ... }]
    ↓
[tool returns current observations so agent can confirm with user]
    ↓
Agent calls update_knowledge with old_content_fragment="Vite 8" + new_content="..."
    ↓
retireObservation(stmts, "obs_abc", now)  // sets valid_until = now
rememberEntity(db, { content: "Now uses Vite 9", ... }, stmts)  // valid_from = now
    ↓
Return: { retired: { id: "obs_abc", content: "..." }, created: { content: "..." } }
```

---

## Recommended Build Order

Features have these hard dependencies:

```
migration 9 (project_paths)
    └── required by → recall-hook.ts
    └── required by → onboarding-scanner.ts (path registration)
    └── required by → link-project CLI subcommand

recall-hook.ts binary
    └── requires → project_paths table
    └── improves from → workflow_rule entities (created by Feature 4)
    └── improves from → onboarding data (created by Feature 2)

onboarding-scanner.ts
    └── requires → project_paths table
    └── produces → project entities recall-hook can surface

remember_rule tool
    └── no hard dependencies (entity_type is already free-text)

update_knowledge tool
    └── no hard dependencies (retireObservation already exists)
```

**Suggested build order:**

| Phase | Deliverable | Why First |
|-------|-------------|-----------|
| **Phase A** | Migration 9 (`project_paths`) + prepared statements | Unblocks recall-hook, init, and link-project. Zero risk — additive schema change. |
| **Phase B** | `recall-hook.ts` binary + SessionStart hook setup | Delivers visible value immediately even before the graph is populated. Global knowledge + any existing project knowledge surfaces at start. |
| **Phase C** | `onboarding-scanner.ts` + `myco init` CLI | Populates the graph for recall-hook to surface. Depends on Phase A for path registration. |
| **Phase D** | `remember_rule` tool + `update_knowledge` tool | Standalone — no dependencies on A-C. Can develop in parallel with B-C. |
| **Phase E** | Dashboard: Rules filter, correction UI | Polish pass after tools exist. Depends on Phase D tools having data in graph. |

Total new code estimate: ~600 LOC across 2 new files + modifications to 5 existing files.

---

## Architectural Patterns

### Pattern 1: Entity Type as First-Class Discriminator

**What:** Use `entity_type` values (`workflow_rule`, `user_preference`, `project`, `person`) to classify knowledge categories rather than creating separate tables.

**When to use:** Any time a new "kind" of knowledge needs to participate in semantic recall, FTS search, graph traversal, and embedding search. New types need no schema changes.

**Trade-offs:** Slightly looser schema (entity_type is free text), but uniform query patterns. The `idx_entities_type` index makes type-filtered queries fast.

```typescript
// Correct: workflow_rule participates in semantic recall
remember({ entity_type: 'workflow_rule', entity_name: 'update-docs-policy', content: '...' })

// Incorrect: separate table misses semantic search
INSERT INTO workflow_rules (id, rule_text) VALUES (...)
```

### Pattern 2: Hook Binary as Lightweight DB Reader

**What:** Compile a separate binary (`myco-recall-hook`) for the SessionStart hook, distinct from the MCP server process.

**When to use:** All Claude Code hooks, since hooks are shell commands — not MCP protocol calls. The MCP server process is not accessible.

**Trade-offs:** Second binary to maintain, but extremely small (< 100 LOC). Shares `@myco/core` for DB access. Must be fast: use FTS5 only, no Ollama embedding.

```typescript
// recall-hook.ts — standalone binary, NOT imported by mcp-server
const input = JSON.parse(await readStdin());
const project = findProjectForPath(db, stmts, input.cwd);
const context = buildContextSummary(db, stmts, project);
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: context,
  }
}));
process.exit(0);
```

### Pattern 3: Approval-Gated Batch Write for Automated Extraction

**What:** Route LLM-extracted facts through the existing `approval_queue` rather than writing directly, with high-confidence facts auto-approving.

**When to use:** Any time facts come from automated scanning rather than explicit agent `remember()` calls. The scanner has lower precision than deliberate agent memory.

**Trade-offs:** Low-confidence facts require user approval (1-2 sessions per project), but human oversight is preserved. High-confidence facts (≥0.85) flow through instantly.

### Pattern 4: Temporal Supersession for Corrections

**What:** Never delete a corrected fact — retire it with `valid_until = now` and create the replacement with `valid_from = now`.

**When to use:** Any user-initiated knowledge correction via `update_knowledge`, and any LLM-detected contradiction in dedup-resolver.

**Trade-offs:** Database grows over time but timeline features become richer. Default recall already excludes retired observations via `valid_until IS NULL` filter.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: MCP Resources for Session-Start Context

**What people do:** Expose project context as MCP Resources (URI-based), expecting Claude Code to auto-load them.

**Why it's wrong:** MCP Resources require explicit client request or user `@` mention (confirmed: modelcontextprotocol.io/docs/learn/client-concepts). Claude Code does not auto-inject Resources. Session-start context would require manual user action each session — eliminating "proactive."

**Do this instead:** SessionStart hook writing `hookSpecificOutput.additionalContext` JSON to stdout.

### Anti-Pattern 2: New Table for Workflow Rules

**What people do:** Create a `workflow_rules` table separate from `entities`/`observations`.

**Why it's wrong:** Rules become invisible to semantic recall, FTS search, and embedding similarity. The entity_type discriminator gives rules full participation in all graph features at zero schema cost.

**Do this instead:** `entity_type = 'workflow_rule'` with `decay_exempt = 1` on observations.

### Anti-Pattern 3: Calling the MCP Server from Hooks

**What people do:** Try to call Myco MCP tools from the SessionStart hook script.

**Why it's wrong:** MCP servers communicate over stdio transport with the Claude Code host process — not accessible from shell commands. Validated by PROJECT.md key decisions: "GSD hook: direct SQLite write — MCP tools not callable from shell hooks."

**Do this instead:** Separate `myco-recall-hook` binary with direct SQLite access via `@myco/core`.

### Anti-Pattern 4: Ollama Embedding in the SessionStart Hook

**What people do:** Call Ollama to embed a query for semantic search in the session-start hook.

**Why it's wrong:** Ollama cold starts add 1-5 seconds. SessionStart hooks should complete under 500ms. The structured content surfaced at session start (workflow rules, project observations, user preferences) is well-suited to FTS5 keyword filtering — no semantic search needed.

**Do this instead:** FTS5-only in `recall-hook.ts`. Full semantic search remains in the `recall` MCP tool where latency is acceptable.

### Anti-Pattern 5: Scanning the Full Codebase at Session Start

**What people do:** Run onboarding-style file scanning in every SessionStart hook to refresh project knowledge.

**Why it's wrong:** Scanning the codebase (file reads, git log) is slow (1-10 seconds) and typically unnecessary — project conventions don't change every session.

**Do this instead:** `myco init` runs once at project setup. The recall-hook reads pre-stored knowledge from SQLite instantly. Knowledge updates happen via explicit `remember()` calls or periodic re-runs of `myco init`.

---

## Integration Points Summary

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `myco-recall-hook` ↔ SQLite | Direct `better-sqlite3` synchronous reads | WAL mode handles concurrent reads with MCP server safely |
| `onboarding-scanner` ↔ LLM | Vercel AI SDK v4.3.19 (same as consolidator.ts) | Reuse existing extraction prompt pattern |
| `onboarding-scanner` ↔ `approval_queue` | `stmts.insertApprovalQueueItem` (existing prepared stmt) | Same queue as consolidation output |
| `remember_rule` tool ↔ `rememberEntity()` | Direct function call with `entity_type='workflow_rule'` | Thin wrapper, no new write path |
| `update_knowledge` tool ↔ `retireObservation()` | Direct function call (already exported from dedup-resolver.ts) | No new logic |
| `project_paths` ↔ `recall-hook` | New prepared statement `selectProjectForPath` | Walk-up algorithm in TS |
| SessionStart hook ↔ Claude Code | `~/.claude/settings.json` hooks config | `hookSpecificOutput.additionalContext` format |

---

## Sources

- `/Users/olive/Documents/GitHub/myco/packages/mcp-server/src/tools.ts` — tool implementations, direct read (HIGH confidence)
- `/Users/olive/Documents/GitHub/myco/packages/core/src/schema.ts` — entity/observation schema, direct read (HIGH confidence)
- `/Users/olive/Documents/GitHub/myco/packages/core/src/migrations.ts` — migration history through migration 8, direct read (HIGH confidence)
- `/Users/olive/Documents/GitHub/myco/packages/mcp-server/src/index.ts` — server startup pattern, direct read (HIGH confidence)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — SessionStart input format, `additionalContext` output format (HIGH confidence)
- [MCP Client Concepts](https://modelcontextprotocol.io/docs/learn/client-concepts) — Resources require explicit client request, NOT auto-loaded (HIGH confidence)
- [MCP Build Server Guide](https://modelcontextprotocol.io/docs/develop/build-server) — Tools vs Resources vs Prompts distinction (HIGH confidence)
- [Claude-Mem Hooks Architecture](https://docs.claude-mem.ai/hooks-architecture) — cwd→project detection pattern via SessionStart hook (MEDIUM confidence — third-party implementation)
- [Graphiti/Zep temporal knowledge paper](https://blog.getzep.com/content/files/2025/01/ZEP__USING_KNOWLEDGE_GRAPHS_TO_POWER_LLM_AGENT_MEMORY_2025011700.pdf) — supersession pattern for knowledge correction (MEDIUM confidence)

---

*Architecture research for: Myco v6.0 — Proactive Knowledge & Onboarding*
*Researched: 2026-03-27*
