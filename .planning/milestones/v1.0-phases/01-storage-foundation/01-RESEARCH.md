# Phase 1: Storage Foundation - Research

**Researched:** 2026-03-20
**Domain:** Node.js monorepo scaffold, SQLite schema design, MCP server bootstrapping, TypeScript project structure
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Default database location is `~/.local/share/ai-workbots/brain.db` (XDG data directory convention)
- **D-02:** `BRAIN_DB_PATH` env var overrides the default location
- **D-03:** Server auto-creates the directory and database with full schema on first run (zero setup friction)
- **D-04:** Single database file (`brain.db`) holds everything — knowledge graph, episodes, embeddings, approval queue
- **D-05:** Session IDs use nanoid (short, URL-safe, collision-resistant)
- **D-06:** Agent identity is caller-provided string (e.g. `gsd-executor`, `main-session`), falls back to `unknown` if omitted
- **D-07:** Confidence scale is 0.0–1.0 float (0.85 threshold for auto-approval per REQUIREMENTS)
- **D-08:** Provenance includes a `source_type` field with tagged values: `agent_session`, `consolidation`, `human_edit`, `gsd_hook`

### Claude's Discretion
- Schema openness — how flexible entity types and observations are (fixed columns + JSON metadata vs EAV, observation modeling, relationship structure)
- Package boundaries — how to split the monorepo between core, mcp-server, and api packages; workspace tooling choice
- Timestamp format and granularity
- Table naming conventions and index strategy

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-01 | MCP server exposes `remember`, `recall`, and `query` tools to any Claude Code session | MCP SDK bootstrapping, StdioServerTransport, Zod tool registration patterns |
| CORE-02 | All knowledge persists across sessions in a local SQLite database (WAL mode) | better-sqlite3 WAL pragma setup, recommended production PRAGMAs, schema design |
| CORE-03 | Open-schema knowledge graph stores entities with types, observations, and inter-entity relations | Schema design patterns: fixed columns + JSON metadata, adjacency list for relations |
| CORE-04 | Every piece of knowledge includes provenance metadata (source session, agent ID, timestamp, confidence) | Provenance column design, nanoid for session IDs, source_type enum pattern |
| CORE-05 | Agents can write new entities, observations, and relations via MCP tools during a session | MCP tool registration, Zod input schema patterns, synchronous better-sqlite3 INSERT |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire persistence foundation for a multi-phase project. It covers three distinct concerns: (1) monorepo scaffold with npm workspaces and TypeScript project references, (2) SQLite schema with WAL mode and sqlite-vec extension loaded for future use, and (3) a minimal but functional MCP server that boots cleanly and connects to Claude Code.

The technology choices are already locked in CLAUDE.md. The key judgment calls that remain are schema design (how open/flexible to make entities and observations), package boundary decisions (how to split `packages/core`, `packages/mcp-server`, and `packages/api-server`), and the specific PRAGMA settings to apply on every database connection. All three are well-understood problems with standard patterns.

The single most important implementation detail: **better-sqlite3 requires native compilation** — the node_modules setup must succeed with a working node-gyp environment. This is a common blocker on first runs. Pre-empt it by verifying the Node.js version and build toolchain before scaffolding.

**Primary recommendation:** Use npm workspaces + TypeScript project references with a `packages/core` library (db bootstrap, schema, provenance utilities), `packages/mcp-server` (MCP entry point), and `packages/api-server` (Hono HTTP, for Phase 4). Core is the only package Phase 1 fully implements; the others get minimal stubs that prove the import chain works.

---

## Standard Stack

### Core (Phase 1 required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | 12.8.0 | SQLite database access | Synchronous API, fastest Node.js SQLite library, ships SQLite 3.51.3, required by CLAUDE.md |
| `sqlite-vec` | 0.1.7 | Vector search SQLite extension | Load in Phase 1 so the extension column types exist in schema; queries used in Phase 2 |
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP server framework | Official Anthropic SDK — only correct choice for Claude Code integration |
| `zod` | 4.3.6 | Schema validation | Peer dependency of MCP SDK; use for all tool input schemas |
| `nanoid` | 5.1.7 | ID generation | ESM-only, session IDs and entity IDs, URL-safe, collision-resistant |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `tsx` | 4.21.0 | TypeScript execution (dev) | Run `src/index.ts` without compiling during development |
| `tsup` | 8.5.1 | TypeScript bundler | Bundle the MCP server for distribution; ESM output |
| `typescript` | 5.9 | Language | Required across all packages |
| `vitest` | latest | Unit testing | Same config as Vite; test schema creation, provenance helpers |

**Installation (packages/core):**
```bash
npm install better-sqlite3 sqlite-vec @modelcontextprotocol/sdk zod nanoid
npm install -D better-sqlite3 tsx tsup typescript @types/node vitest
```

**Version verification (confirmed 2026-03-20):**
```
better-sqlite3  → 12.8.0 (confirmed via npm view)
sqlite-vec      → 0.1.7  (confirmed via npm view)
@modelcontextprotocol/sdk → 1.27.1 (confirmed via npm view)
zod             → 4.3.6  (confirmed via npm view)
nanoid          → 5.1.7  (confirmed via npm view)
tsup            → 8.5.1  (confirmed via npm view)
tsx             → 4.21.0 (confirmed via npm view)
```

### XDG Data Directory (D-01)

The decision to use `~/.local/share/ai-workbots/brain.db` is correct XDG convention. **Do not use the `xdg-basedir` npm package** — it is Linux-only and will break on macOS. Implement it directly:

```typescript
// Correct cross-platform implementation (no dependency needed)
function getDefaultDbPath(): string {
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, 'ai-workbots', 'brain.db');
}
```

This correctly follows the XDG spec (respects `$XDG_DATA_HOME` if set) and works on macOS where `~/.local/share` is the decided location per D-01. The `BRAIN_DB_PATH` env var check wraps this (D-02).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| npm workspaces | pnpm workspaces | pnpm is faster and stricter; npm workspaces is sufficient for a 3-package repo and avoids requiring pnpm as a project dependency |
| TypeScript project references | Path aliases only | Project references give incremental builds and proper declaration file generation; aliases alone don't enforce compilation boundaries |
| Raw SQL (better-sqlite3) | drizzle-orm + better-sqlite3 | Drizzle gives type-safe queries; add in Phase 2+ if schema evolution accelerates. Phase 1 schema is fixed enough that raw SQL is clearer |
| Inline XDG logic | `@folder/xdg` npm package | Adding a dependency for 3 lines of logic is unnecessary overhead |

---

## Architecture Patterns

### Recommended Project Structure

```
ai-workbots/
├── package.json              # Root: "workspaces": ["packages/*"], no "private" needed but conventional
├── tsconfig.json             # Root: "references" to all packages, "files": []
├── packages/
│   ├── core/                 # Shared DB bootstrap, schema, provenance types
│   │   ├── package.json      # name: "@ai-workbots/core", "main": "dist/index.js"
│   │   ├── tsconfig.json     # composite: true, outDir: "dist"
│   │   └── src/
│   │       ├── index.ts      # Re-exports db, schema, provenance
│   │       ├── db.ts         # Database bootstrap (open, pragmas, schema migration)
│   │       ├── schema.ts     # CREATE TABLE statements as tagged template strings
│   │       └── provenance.ts # ProvenanceRecord type, generateSessionId()
│   ├── mcp-server/
│   │   ├── package.json      # name: "@ai-workbots/mcp-server", bin: "brain-mcp"
│   │   ├── tsconfig.json     # composite: true, references core
│   │   └── src/
│   │       └── index.ts      # McpServer, StdioServerTransport, tool stubs
│   └── api-server/           # Stub only in Phase 1
│       ├── package.json      # name: "@ai-workbots/api-server"
│       ├── tsconfig.json     # composite: true, references core
│       └── src/
│           └── index.ts      # Stub: "API server - implemented in Phase 4"
└── .planning/
```

### Pattern 1: npm Workspaces Root Package

```json
// package.json (root)
{
  "name": "ai-workbots",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "tsc --build",
    "dev": "tsx packages/mcp-server/src/index.ts",
    "test": "vitest run"
  }
}
```

### Pattern 2: TypeScript Project References (per package)

Each package `tsconfig.json` sets `composite: true`. The root tsconfig references all packages:

```json
// tsconfig.json (root)
{
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/mcp-server" },
    { "path": "./packages/api-server" }
  ]
}
```

```json
// packages/mcp-server/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true
  },
  "references": [{ "path": "../core" }]
}
```

**Why `NodeNext` module resolution:** The MCP SDK and nanoid v5 are ESM packages. `NodeNext` correctly handles `.js` extension resolution for ESM interop, which is required for these dependencies.

### Pattern 3: Database Bootstrap Module

```typescript
// packages/core/src/db.ts
// Source: better-sqlite3 docs + sqlite-vec official Node.js docs

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.BRAIN_DB_PATH ?? getDefaultDbPath();

  // Auto-create directory (D-03)
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);

  // Load sqlite-vec extension before any queries
  sqliteVec.load(db);

  // Recommended production PRAGMAs (set every connection — not persistent)
  db.pragma('journal_mode = WAL');    // CORE-02: required
  db.pragma('foreign_keys = ON');     // Enforce FK constraints
  db.pragma('busy_timeout = 5000');   // 5s wait on lock before error
  db.pragma('synchronous = NORMAL');  // Safe with WAL, better perf than FULL

  applySchema(db);

  return db;
}
```

**PRAGMA persistence note:** `journal_mode = WAL` is persistent (written to the db file). All other PRAGMAs (`foreign_keys`, `busy_timeout`, `synchronous`) are connection-lifetime only and must be set on every new connection.

### Pattern 4: Minimal MCP Server Bootstrap

```typescript
// packages/mcp-server/src/index.ts
// Source: modelcontextprotocol/typescript-sdk docs

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDatabase } from '@ai-workbots/core';

const db = openDatabase();

const server = new McpServer({
  name: 'ai-workbots-brain',
  version: '0.1.0',
});

// Tool stubs registered in Phase 1; implemented in Phase 2
server.tool('remember', 'Store a memory', { /* zod schema */ }, async () => ({
  content: [{ type: 'text', text: 'Not yet implemented' }]
}));

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Critical:** Never write to stdout in a StdioServerTransport server. stdout is the JSON-RPC wire. Use `process.stderr` or a file logger for all diagnostic output.

### Pattern 5: Schema Design for Open Knowledge Graph (CORE-03)

The recommended approach is **fixed columns + JSON metadata**. This avoids EAV (Entity-Attribute-Value) tables, which are notoriously slow to query and hard to reason about. Observations are their own table linked to entities by foreign key.

```sql
-- Core knowledge graph tables

CREATE TABLE IF NOT EXISTS entities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,             -- open string: "person", "project", "concept"
  summary     TEXT,                      -- human-readable summary
  metadata    TEXT DEFAULT '{}',         -- JSON for open-schema extension
  -- Provenance (CORE-04)
  session_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL DEFAULT 'unknown',
  source_type TEXT NOT NULL DEFAULT 'agent_session',  -- D-08 enum
  confidence  REAL NOT NULL DEFAULT 1.0,
  created_at  TEXT NOT NULL,             -- ISO 8601 UTC
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,             -- the actual observation text
  metadata    TEXT DEFAULT '{}',         -- JSON for tags, categories, etc.
  -- Provenance
  session_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL DEFAULT 'unknown',
  source_type TEXT NOT NULL DEFAULT 'agent_session',
  confidence  REAL NOT NULL DEFAULT 1.0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id           TEXT PRIMARY KEY,
  from_id      TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,            -- open string: "depends_on", "is_part_of"
  metadata     TEXT DEFAULT '{}',
  -- Provenance
  session_id   TEXT NOT NULL,
  agent_id     TEXT NOT NULL DEFAULT 'unknown',
  source_type  TEXT NOT NULL DEFAULT 'agent_session',
  confidence   REAL NOT NULL DEFAULT 1.0,
  created_at   TEXT NOT NULL,
  UNIQUE(from_id, to_id, type)           -- deduplicate same relation
);

CREATE TABLE IF NOT EXISTS episodes (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  agent_id    TEXT NOT NULL DEFAULT 'unknown',
  event_type  TEXT NOT NULL,             -- "phase_complete", "observation", etc.
  payload     TEXT NOT NULL DEFAULT '{}', -- JSON context payload
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_queue (
  id           TEXT PRIMARY KEY,
  item_type    TEXT NOT NULL,            -- "entity", "observation", "relationship"
  item_id      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- "pending", "approved", "rejected"
  reason       TEXT,                     -- why it was queued (low confidence, contradiction)
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);

-- Virtual table for vector embeddings (sqlite-vec)
-- Note: created AFTER sqliteVec.load(db) is called
CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
  item_id     TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  embedding   float[768]                 -- nomic-embed-text dimensions
);
```

**Timestamp format:** ISO 8601 UTC strings (`new Date().toISOString()`). Stored as TEXT — SQLite has no native datetime type. Use `datetime('now')` default or supply from application. Application-supplied is preferred for consistency.

### Pattern 6: Provenance Helper

```typescript
// packages/core/src/provenance.ts
import { nanoid } from 'nanoid';

export type SourceType = 'agent_session' | 'consolidation' | 'human_edit' | 'gsd_hook';

export interface ProvenanceRecord {
  session_id: string;
  agent_id: string;
  source_type: SourceType;
  confidence: number;
  created_at: string;
}

export function generateSessionId(): string {
  return nanoid(); // ~21 char URL-safe ID
}

export function buildProvenance(
  sessionId: string,
  agentId: string = 'unknown',
  sourceType: SourceType = 'agent_session',
  confidence: number = 1.0,
): ProvenanceRecord {
  return {
    session_id: sessionId,
    agent_id: agentId,
    source_type: sourceType,
    confidence,
    created_at: new Date().toISOString(),
  };
}
```

### Anti-Patterns to Avoid

- **Writing to stdout from an MCP server:** Crashes the stdio transport. All logs go to stderr.
- **Using `PRAGMA journal_mode = WAL` inside a transaction:** WAL mode must be set outside any transaction.
- **Loading sqlite-vec after schema creation:** Load the extension before any `CREATE VIRTUAL TABLE` that uses `vec0`.
- **Using `require()` with nanoid v5:** nanoid 5+ is ESM-only. Project must use `"type": "module"` or use dynamic `import()`.
- **Copying the reference MCP memory server pattern:** Anthropic's reference implementation uses JSONL files — no indexing, full-file rewrites. Do not copy it.
- **EAV schema for observations:** Avoid `(entity_id, attribute_name, attribute_value)` triples — hard to query, join-heavy, schema-less metadata goes in a JSON column instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom cosine distance in JS | `sqlite-vec` with `vec0` virtual table | Vectorized C extension, handles Float32Array binding, HNSW-like search |
| Collision-resistant IDs | Custom UUID v4 or timestamp IDs | `nanoid` | UUID v4 has 36 chars; nanoid gives 21 URL-safe chars with equivalent collision resistance |
| MCP protocol compliance | Custom JSON-RPC stdio handler | `@modelcontextprotocol/sdk` | Handles spec compliance, tool schema validation, error formatting |
| Schema validation | Manual type checking in tool handlers | Zod (already a peer dep) | The MCP SDK validates tool inputs with Zod; don't bypass it |
| WAL mode setup | Custom SQLite build flags | `db.pragma('journal_mode = WAL')` | One call, handled entirely by better-sqlite3 |

**Key insight:** The sqlite-vec extension provides SQLite-native vector search with zero external processes. Creating a custom JS implementation would miss platform-specific float packing, SIMD acceleration, and index management.

---

## Common Pitfalls

### Pitfall 1: better-sqlite3 Native Build Failure

**What goes wrong:** `npm install` fails with `node-gyp` errors: missing Python, missing Xcode CLT, or ABI mismatch after a Node.js version change.

**Why it happens:** better-sqlite3 includes native C++ code that must be compiled for the exact Node.js ABI. Prebuilt binaries exist for LTS versions; non-LTS or nightly versions may require local compilation.

**How to avoid:** Verify `node --version` returns 22.x before scaffolding. If prebuilt binaries fail, install Xcode Command Line Tools (`xcode-select --install`) on macOS. On CI, pin the Node.js version to match the prebuilt binary.

**Warning signs:** `gyp ERR! build error` during `npm install`, or `Error: The module was compiled against a different Node.js version` at runtime.

### Pitfall 2: sqlite-vec Loaded After Virtual Table Creation

**What goes wrong:** `CREATE VIRTUAL TABLE ... USING vec0` throws `no such module: vec0`.

**Why it happens:** SQLite extensions must be loaded before any statements that reference their registered functions or modules. `applySchema()` must be called after `sqliteVec.load(db)`.

**How to avoid:** Always follow this order in `openDatabase()`:
1. `new Database(path)`
2. `sqliteVec.load(db)` — load extension
3. `db.pragma(...)` — set pragmas
4. `applySchema(db)` — run CREATE TABLE IF NOT EXISTS

**Warning signs:** `SqliteError: no such module: vec0` on first run.

### Pitfall 3: nanoid ESM in CommonJS Context

**What goes wrong:** `require('nanoid')` throws `ERR_REQUIRE_ESM`.

**Why it happens:** nanoid v5+ is ESM-only. If any package in the monorepo uses `"type": "commonjs"` (or omits `"type": "module"`) and tries to require nanoid, it fails.

**How to avoid:** Set `"type": "module"` in all `package.json` files in the monorepo. Use `import` everywhere. If a legacy CJS package must coexist, use dynamic `await import('nanoid')`.

**Warning signs:** `ERR_REQUIRE_ESM` at startup.

### Pitfall 4: WAL PRAGMA Inside a Transaction

**What goes wrong:** `db.pragma('journal_mode = WAL')` throws or silently fails when called inside an active transaction.

**Why it happens:** Changing journal mode requires an exclusive lock that cannot be obtained inside a transaction.

**How to avoid:** Call all PRAGMAs before any `db.transaction()` blocks — right after `new Database()` and the extension load.

### Pitfall 5: TypeScript `NodeNext` Module Resolution with ESM

**What goes wrong:** Import of `@ai-workbots/core` in `mcp-server` resolves at type-check time but fails at runtime with `Cannot find module`.

**Why it happens:** With `"module": "NodeNext"`, TypeScript requires explicit `.js` extensions in relative imports (e.g., `import { foo } from './provenance.js'` not `'./provenance'`). Workspace package imports resolve through the package.json `exports` field.

**How to avoid:** Add an `exports` field to `packages/core/package.json`:
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```
Use `.js` extensions in all relative imports within `packages/core/src/`.

### Pitfall 6: stdout Pollution in MCP Server

**What goes wrong:** Claude Code shows JSON parse errors or hangs when connecting to the MCP server.

**Why it happens:** `console.log()` writes to stdout, which the MCP SDK uses exclusively for JSON-RPC messages. Any non-JSON output breaks the protocol parser.

**How to avoid:** Replace all `console.log` with `console.error` in the MCP server package. Only `console.error` (which writes to stderr) is safe.

---

## Code Examples

### Database Bootstrap (complete)

```typescript
// packages/core/src/db.ts
// Source: better-sqlite3 npm docs, sqlite-vec official Node.js docs (alexgarcia.xyz/sqlite-vec/js.html)
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function getDefaultDbPath(): string {
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, 'ai-workbots', 'brain.db');
}

export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.BRAIN_DB_PATH ?? getDefaultDbPath();
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);

  // 1. Load extension FIRST
  sqliteVec.load(db);

  // 2. Set connection PRAGMAs
  db.pragma('journal_mode = WAL');   // persistent after first run
  db.pragma('foreign_keys = ON');    // connection-lifetime only
  db.pragma('busy_timeout = 5000');  // connection-lifetime only
  db.pragma('synchronous = NORMAL'); // connection-lifetime only (safe with WAL)

  // 3. Apply schema
  applySchema(db);

  return db;
}
```

### MCP Server Registration Pattern

```typescript
// Source: modelcontextprotocol/typescript-sdk docs/server.md
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'ai-workbots-brain', version: '0.1.0' });

server.tool(
  'remember',
  'Store a piece of knowledge in the brain',
  {
    content: z.string().describe('The knowledge to store'),
    entity_type: z.string().optional().describe('Entity type (e.g. "person", "project")'),
    agent_id: z.string().optional().describe('Calling agent identifier'),
  },
  async ({ content, entity_type, agent_id }) => {
    // Phase 2 implementation
    return { content: [{ type: 'text', text: 'Stored.' }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
// After connect(), process.stdout is owned by the transport.
// All diagnostic output MUST use process.stderr.
```

### nanoid Usage (ESM)

```typescript
// Source: nanoid npm docs
import { nanoid } from 'nanoid';

const sessionId = nanoid(); // "V1StGXR8_Z5jdHi6B-myT" (21 chars)
const entityId = nanoid();  // same distribution, separate ID
```

### sqlite-vec Load Pattern

```typescript
// Source: alexgarcia.xyz/sqlite-vec/js.html
import * as sqliteVec from 'sqlite-vec';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
sqliteVec.load(db); // must call before any vec0 usage

// Verify load succeeded
const { result } = db.prepare('SELECT vec_length(?)').get(new Float32Array([0.1, 0.2, 0.3]));
// result === 3
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sqlite-vss` extension | `sqlite-vec` | 2024 (author deprecated vss) | sqlite-vss is broken/unmaintained; sqlite-vec is the replacement |
| JSONL flat file (reference MCP server) | SQLite with proper schema | N/A (was always a demo) | No indexing, full-file rewrites — do not copy |
| `sqlite3` (async callbacks) | `better-sqlite3` (sync API) | 2016+ | Synchronous API is a feature for an MCP server, not a bug |
| `node:sqlite` (Node built-in) | `better-sqlite3` | Node 22.5+ (experimental) | Built-in API still changing; revisit in 2027 |
| CJS require for nanoid | ESM import | nanoid v4 (2021) | nanoid v5 is ESM-only; `require('nanoid')` throws |

**Deprecated/outdated:**
- `sqlite-vss`: Explicitly deprecated by author asg017 in 2024. Replaced by `sqlite-vec`.
- Reference MCP memory server JSONL pattern: Demo code, not production-ready.

---

## Open Questions

1. **vec0 virtual table CREATE IF NOT EXISTS behavior**
   - What we know: `CREATE TABLE IF NOT EXISTS` works on regular tables; unclear if `CREATE VIRTUAL TABLE IF NOT EXISTS USING vec0` behaves identically
   - What's unclear: Whether repeated calls on an already-initialized vec0 table are safe
   - Recommendation: Wrap schema creation in a transaction and test with an existing database file before shipping

2. **tsup bundling of better-sqlite3 native bindings**
   - What we know: better-sqlite3 ships a `.node` native binary; tsup bundles JS, not native binaries
   - What's unclear: Whether `tsup` correctly handles the `better-sqlite3` native dependency in the output bundle when `brain-mcp` is invoked as a global CLI tool
   - Recommendation: Set `external: ['better-sqlite3', 'sqlite-vec']` in `tsup.config.ts` so native packages are not bundled — they resolve from `node_modules` at runtime

3. **MCP server `package.json` `bin` field and Claude Code registration**
   - What we know: Claude Code's MCP server config typically references a command string; `bin` entry in package.json provides the `brain-mcp` command after `npm link` or global install
   - What's unclear: Whether the `brain-mcp` command needs to be globally linked or can be invoked via `npx`
   - Recommendation: Support both — document `npx @ai-workbots/mcp-server` and `npm link` paths in the README; confirm in Phase 1 verification

---

## Sources

### Primary (HIGH confidence)
- `npm view better-sqlite3 version` — 12.8.0 verified 2026-03-20
- `npm view sqlite-vec version` — 0.1.7 verified 2026-03-20
- `npm view @modelcontextprotocol/sdk version` — 1.27.1 verified 2026-03-20
- `npm view zod version` — 4.3.6 verified 2026-03-20
- `npm view nanoid version` — 5.1.7 verified 2026-03-20
- `npm view tsup version` — 8.5.1 verified 2026-03-20
- [sqlite-vec Node.js official docs](https://alexgarcia.xyz/sqlite-vec/js.html) — `sqliteVec.load(db)` pattern confirmed
- [TypeScript SDK server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — McpServer, StdioServerTransport, tool registration
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) — `$XDG_DATA_HOME` default `~/.local/share`
- CLAUDE.md project instructions — locked technology decisions, versions, and what NOT to use

### Secondary (MEDIUM confidence)
- [SQLite recommended PRAGMAs](https://highperformancesqlite.com/articles/sqlite-recommended-pragmas) — busy_timeout, synchronous=NORMAL with WAL
- [better-sqlite3 npm docs](https://www.npmjs.com/package/better-sqlite3) — WAL pragma, synchronous API
- [TypeScript project references handbook](https://www.typescriptlang.org/docs/handbook/project-references.html) — composite, references, incremental builds
- [npm workspaces setup guide](https://medium.com/@cecylia.borek/setting-up-a-monorepo-using-npm-workspaces-and-typescript-project-references-307841e0ba4a) — workspaces field, symlinks, devDep placement
- [nanoid npm docs](https://www.npmjs.com/package/nanoid) — ESM-only since v4, current version 5.1.7

### Tertiary (LOW confidence)
- Community reports of better-sqlite3 prebuilt binary issues on Node.js 22.11.0 — verify on target machine before committing to monorepo scaffold task

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions confirmed via `npm view` on 2026-03-20
- Architecture: HIGH — npm workspaces + TypeScript project references is the established standard; schema design patterns verified against knowledge graph examples
- Database bootstrap: HIGH — confirmed via sqlite-vec official docs and better-sqlite3 npm docs
- Pitfalls: MEDIUM-HIGH — most confirmed via official sources; native build pitfall is HIGH (well-documented), tsup external config is MEDIUM (standard pattern, not verified against this exact setup)

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days — stable ecosystem)
