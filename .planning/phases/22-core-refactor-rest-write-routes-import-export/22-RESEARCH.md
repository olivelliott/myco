# Phase 22: Core Refactor + REST Write Routes + Import/Export - Research

**Researched:** 2026-03-27
**Domain:** TypeScript monorepo refactor, Hono OpenAPI, SQLite bulk export/import, format adapters
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Shared business logic in `packages/core/src/memory-ops.ts` — per goal statement
- MCP tools import directly from `@myco/core` — zero overhead
- Operations that move to memory-ops: remember, recall, forget, query (the 4 core MCP tool handlers)
- memory-ops encapsulates full pipeline including embed+classify+write — callers pass raw text, not embeddings
- OpenAPI: `@hono/zod-openapi` + `@hono/swagger-ui` — auto-generate docs from Zod schemas
- Auth: Bearer token via `MYCO_API_KEY` env var — simple, optional
- Auth default: Disabled when env var is unset — frictionless local dev
- Route structure: `POST /api/memory/remember`, `POST /api/memory/recall`, `POST /api/memory/forget`, `POST /api/memory/query`
- OpenAPI docs served at `/api/docs`
- Native export: Single JSON `{entities: [], observations: [], relationships: [], metadata: {version, exported_at}}`
- Export includes retired observations (valid_until set) for complete temporal history
- Import dedup: Skip existing entities by name+type, add new observations only
- Mem0 adapter: `memories[].memory` → observation content, `memories[].metadata` → entity attributes
- Anthropic reference server adapter: JSONL with `{type: "entity", name, entityType, observations: []}` format
- Export/import available as both MCP tools (`export_graph`, `import_graph`) and HTTP endpoints (`GET /api/export`, `POST /api/import`)
- Hono for HTTP API server (CLAUDE.md)
- Zod for schema validation (CLAUDE.md)
- better-sqlite3 synchronous API
- Dedup classification from Phase 19 applies to import operations
- Temporal versioning from Phase 19 applies to imported observations
- Relationship strength from Phase 20 applies to imported relationships

### Claude's Discretion

- Internal structure of memory-ops functions (parameter types, return types, error handling)
- Hono middleware ordering and error handling
- OpenAPI schema detail level
- Import validation and error reporting
- Test structure and fixtures

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | Memory write operations (remember, forget, import, export) accessible via HTTP | `@hono/zod-openapi` route pattern; `memory-ops.ts` shared module enables HTTP callers |
| API-02 | REST API includes OpenAPI/Swagger documentation | `@hono/zod-openapi` 1.2.4 (Zod v4 native) + `@hono/swagger-ui` 0.6.1; served at `/api/docs` |
| API-03 | Optional API key auth protects write endpoints | Bearer token middleware on `MYCO_API_KEY` env var; skip when unset |
| IO-01 | User can export entire knowledge graph as JSON via MCP tool | `export_graph` tool + `GET /api/export`; bulk SELECT all tables |
| IO-02 | User can import knowledge from JSON file via MCP tool | `import_graph` tool + `POST /api/import`; run through dedup classification pipeline |
| IO-03 | Export → import round-trip is idempotent (no data loss or duplication) | Dedup NOOP path prevents duplicate observations; entity upsert by name+type |
| IO-04 | Import supports adapters for Mem0 and MCP reference server JSONL | Mem0 `memories[].memory` field; Anthropic JSONL `{type:"entity",name,entityType,observations:[]}` |
</phase_requirements>

---

## Summary

Phase 22 has three parallel workstreams that share a common motivation: the four core write operations (`remember`, `recall`, `forget`, `query`) currently live inline in `packages/mcp-server/src/tools.ts`. Extracting them to `packages/core/src/memory-ops.ts` is the prerequisite that makes both MCP tools and HTTP routes callers of the same code.

The REST write routes workstream adds POST endpoints for the four core operations plus GET/POST for export/import, wrapped in OpenAPI documentation via `@hono/zod-openapi`. The package is already confirmed to support Zod v4 (peer dep `^4.0.0`, ships `@asteasolutions/zod-to-openapi@^8.5.0`). The main architectural decision is whether to convert the entire `api-server` to `OpenAPIHono` (recommended) or mount a sub-app — the full conversion is cleaner and enables one `app.doc()` call to cover all routes.

The import/export workstream is mostly about bulk SQLite reads and idempotent bulk writes, plus two format adapters. Neither adapter is complex: Mem0 exports flat `memories[].memory` strings with optional metadata; the Anthropic reference server exports JSONL where each line is `{type:"entity",name,entityType,observations:[string[]]}`. Both normalize to the same `rememberEntity` call sequence, which routes through the existing dedup/temporal pipeline from Phase 19.

**Primary recommendation:** Extract `memory-ops.ts` first (Wave 1), then add REST routes (Wave 2), then import/export (Wave 3). Each wave is independently testable.

---

## Standard Stack

### Core (already installed — no new installs needed for core functionality)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@hono/zod-openapi` | 1.2.4 | OpenAPI route definition + spec generation | Zod v4 native (peer dep `^4.0.0`); wraps `@asteasolutions/zod-to-openapi@^8.5.0`; integrates with existing Hono app |
| `@hono/swagger-ui` | 0.6.1 | Serve Swagger UI at `/api/docs` | Zero-config; `swaggerUI({ url: '/doc' })` middleware; peer dep `hono>=4.0.0` |
| `hono` | 4.12.9 (installed) | HTTP framework | Already in use; `OpenAPIHono` extends standard `Hono` |
| `zod` | 4.3.6 (installed) | Schema validation | Already in use; required by `@hono/zod-openapi` |
| `better-sqlite3` | 12.8.0 (installed) | Synchronous SQLite for bulk export | Already in use; bulk SELECT is a single sync call |

### New Dependencies to Install
| Library | Version | Purpose |
|---------|---------|---------|
| `@hono/zod-openapi` | `^1.2.4` | Add to `packages/api-server/package.json` |
| `@hono/swagger-ui` | `^0.6.1` | Add to `packages/api-server/package.json` |

**Installation (api-server package only):**
```bash
cd packages/api-server && npm install @hono/zod-openapi @hono/swagger-ui
```

**Version verification (confirmed 2026-03-27):**
- `@hono/zod-openapi`: 1.2.4 — `npm view @hono/zod-openapi version`
- `@hono/swagger-ui`: 0.6.1 — `npm view @hono/swagger-ui version`
- Both confirmed Zod v4 compatible

### Alternatives Considered
| Recommended | Alternative | Tradeoff |
|-------------|-------------|----------|
| `@hono/zod-openapi` | `@hono/zod-validator` (already installed) | `zod-validator` does validation only — no spec generation; keep it for non-documented routes if needed |
| Full `OpenAPIHono` conversion | Mount sub-app with `OpenAPIHono` | Sub-app approach works but splits `app.doc()` scope — full conversion gives one unified spec |
| Native JSON export | `jsonl` streaming | Streaming adds complexity; total graph size for a single user fits in memory without chunking |

---

## Architecture Patterns

### Recommended Project Structure Changes

```
packages/
├── core/
│   └── src/
│       ├── memory-ops.ts       # NEW: extracted from mcp-server/src/tools.ts
│       └── index.ts            # UPDATED: export rememberEntity, recallKnowledge, etc.
├── mcp-server/
│   └── src/
│       └── tools.ts            # UPDATED: thin wrappers calling @myco/core memory-ops
└── api-server/
    └── src/
        ├── index.ts            # UPDATED: switch to OpenAPIHono
        └── routes/
            ├── memory.ts       # NEW: POST /api/memory/* write routes
            └── io.ts           # NEW: GET /api/export, POST /api/import
```

### Pattern 1: memory-ops.ts Extraction

**What:** Move the 4 core operation functions from `mcp-server/src/tools.ts` into `packages/core/src/memory-ops.ts`. The core package already has the DB, statements, and types — memory-ops is a natural fit. The embed dependency (Ollama) is the only external concern: `embedText` / `embedBatch` currently live in `mcp-server/src/embed-client.ts`. These must either move to core or be passed as a dependency parameter.

**Decision required (discretion):** Since `packages/core` is meant to be a zero-external-dep shared module and Ollama is an mcp-server concern, the cleanest approach is to accept an `EmbedFn` parameter in the memory-ops functions that need embeddings (`rememberEntity`, `recallKnowledge`). Callers (MCP and HTTP) inject their embed client. This keeps `@myco/core` free of the `ollama` npm dependency.

**Example signature:**
```typescript
// packages/core/src/memory-ops.ts
export type EmbedFn = (text: string) => Promise<number[] | null>;

export async function rememberEntity(
  db: Database.Database,
  params: RememberParams,
  stmts: MycoStatements,
  embed: EmbedFn,   // injected — no Ollama dep in core
): Promise<RememberResult>

export async function recallKnowledge(
  db: Database.Database,
  params: RecallParams,
  stmts: MycoStatements,
  embed: EmbedFn,
): Promise<RecallResult>

// Synchronous — no embed needed
export function queryEntities(...): QueryResult
export function forgetEntity(...): ForgetResult
```

MCP caller wires: `import { embedText } from './embed-client.js'`
HTTP caller wires: same `embedText` from mcp-server (if api-server starts Ollama client) or null-returning stub (if no Ollama)

**Alternative (simpler):** Move `embed-client.ts` into `@myco/core` — adds `ollama` as a core dependency. Acceptable if the planner prefers fewer abstraction layers.

### Pattern 2: OpenAPIHono Route Definition

**What:** Replace `new Hono()` in `api-server/src/index.ts` with `new OpenAPIHono()`. Define write routes using `createRoute()` so they appear in the auto-generated spec.

```typescript
// Source: https://github.com/honojs/middleware/tree/main/packages/zod-openapi
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';

const app = new OpenAPIHono();

const RememberBodySchema = z.object({
  content: z.string().openapi({ example: 'TypeScript is great' }),
  entity_name: z.string().openapi({ example: 'TypeScript' }),
  entity_type: z.string().optional().openapi({ example: 'technology' }),
  confidence: z.number().min(0).max(1).optional(),
  relations: z.array(z.object({
    target_name: z.string(),
    target_type: z.string().optional(),
    relation_type: z.string(),
  })).optional(),
}).openapi('RememberBody');

const rememberRoute = createRoute({
  method: 'post',
  path: '/api/memory/remember',
  request: { body: { content: { 'application/json': { schema: RememberBodySchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: RememberResponseSchema } }, description: 'OK' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
  },
});

app.openapi(rememberRoute, async (c) => {
  const body = c.req.valid('json');
  const result = await rememberEntity(db, body, stmts, embedText);
  return c.json(result);
});

// Serve spec
app.doc('/api/spec', { openapi: '3.0.0', info: { title: 'Myco API', version: '1.0.0' } });
// Serve UI — per decisions, served at /api/docs
app.get('/api/docs', swaggerUI({ url: '/api/spec' }));
```

**Note:** The Swagger UI is served at `/api/docs` per the locked decision. The spec JSON is served at `/api/spec` to avoid confusion.

### Pattern 3: Bearer Token Auth Middleware

**What:** Optional middleware that reads `Authorization: Bearer <token>` and compares to `process.env.MYCO_API_KEY`. Applied only to write routes. Skipped entirely when env var is unset.

```typescript
// packages/api-server/src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono';

export function apiKeyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const apiKey = process.env.MYCO_API_KEY;
    if (!apiKey) {
      // Auth disabled — local dev default
      return next();
    }
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 } }, 401);
    }
    const provided = authHeader.slice(7);
    if (provided !== apiKey) {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 } }, 401);
    }
    return next();
  };
}
```

Apply per-route or as a route-group middleware before the write handlers.

### Pattern 4: Export Bulk Query

**What:** A single synchronous pass over all four tables. Export retired observations (all `valid_until` values) for complete temporal history.

```typescript
// packages/core/src/memory-ops.ts — or api-server/src/routes/io.ts
export interface GraphExport {
  metadata: { version: string; exported_at: string; entity_count: number; observation_count: number; relationship_count: number };
  entities: Entity[];
  observations: Observation[];       // includes retired (valid_until IS NOT NULL)
  relationships: Relationship[];
}

export function exportGraph(db: Database.Database): GraphExport {
  const entities = db.prepare('SELECT * FROM entities WHERE merged_into IS NULL').all() as Entity[];
  const observations = db.prepare('SELECT * FROM observations').all() as Observation[];    // ALL including retired
  const relationships = db.prepare('SELECT * FROM relationships').all() as Relationship[];
  return {
    metadata: {
      version: '1.0',
      exported_at: new Date().toISOString(),
      entity_count: entities.length,
      observation_count: observations.length,
      relationship_count: relationships.length,
    },
    entities,
    observations,
    relationships,
  };
}
```

### Pattern 5: Import Idempotency

**What:** For each entity in the import payload, call the existing `upsert by name+type` logic. For each observation, run through `classifyObservation` — NOOP path prevents duplication on re-import.

```typescript
export async function importGraph(
  db: Database.Database,
  payload: GraphExport,
  stmts: MycoStatements,
  embed: EmbedFn,
): Promise<ImportResult> {
  let entitiesSkipped = 0, entitiesAdded = 0, observationsAdded = 0, observationsSkipped = 0;

  for (const entity of payload.entities) {
    const existing = stmts.selectEntityByNameType.get(entity.name, entity.type);
    if (existing) { entitiesSkipped++; continue; }
    // Insert with original created_at/updated_at preserved
    stmts.insertEntity.run(entity.id, entity.name, entity.type, ...);
    entitiesAdded++;
  }

  for (const obs of payload.observations) {
    // Use classifyObservation — dedup pipeline handles NOOP/UPDATE/ADD
    const embedding = await embed(obs.content);
    const vec = embedding ? new Float32Array(embedding) : null;
    const classification = classifyObservation(db, obs.entity_id, obs.content, vec, stmts);
    if (classification.action === 'NOOP') { observationsSkipped++; continue; }
    // Insert observation preserving original valid_from/valid_until timestamps
    stmts.insertObservation.run(obs.id, obs.entity_id, obs.content, ...);
    observationsAdded++;
  }

  return { entitiesAdded, entitiesSkipped, observationsAdded, observationsSkipped };
}
```

**Critical:** Preserve original `valid_from` / `valid_until` timestamps from the export — do not generate new `now()` timestamps. This is what makes round-trip idempotent.

### Pattern 6: Format Adapters

**Mem0 adapter:**
```typescript
interface Mem0Memory { id: string; memory: string; user_id?: string; metadata?: Record<string, unknown>; created_at?: string; }
interface Mem0Export { results: Mem0Memory[] }   // v1.1 format

export function normalizeMem0(input: Mem0Export): NativeImportPayload {
  return {
    entities: [],   // Mem0 doesn't have explicit entity objects — derive from metadata if present
    observations: input.results.map(m => ({
      id: m.id,
      entity_id: /* derived entity or use a "mem0_import" catch-all entity */,
      content: m.memory,
      // metadata.entity_name and metadata.entity_type if present in metadata
      ...
    })),
    relationships: [],
    metadata: { version: 'mem0-import', exported_at: new Date().toISOString() },
  };
}
```

**Anthropic JSONL adapter:**
```typescript
interface AnthropicEntityLine { type: 'entity'; name: string; entityType: string; observations: string[] }

export function normalizeAnthropicJSONL(jsonl: string): NativeImportPayload {
  const lines = jsonl.split('\n').filter(Boolean);
  const entities: Entity[] = [];
  const observations: Observation[] = [];

  for (const line of lines) {
    const obj = JSON.parse(line) as AnthropicEntityLine;
    if (obj.type !== 'entity') continue;
    const entityId = nanoid();
    entities.push({ id: entityId, name: obj.name, type: obj.entityType, ... });
    for (const obsContent of obj.observations) {
      observations.push({ id: nanoid(), entity_id: entityId, content: obsContent, ... });
    }
  }
  return { entities, observations, relationships: [], metadata: { version: 'anthropic-import', ... } };
}
```

### Anti-Patterns to Avoid

- **Putting `embedText` in `@myco/core` without the caller injection pattern:** Adds `ollama` npm to a shared package that will also be required by the PWA bundle path — breaks the zero-external-dep contract.
- **Re-generating `valid_from` timestamps during import:** Destroys temporal history, breaks `as_of` queries on imported data. Always preserve original timestamps.
- **Calling `stmts.insertObservation` directly during import without dedup:** Bypasses classification, creates duplicates on re-import, breaks IO-03.
- **Using `app.route()` to mount write routes as a separate Hono instance:** The nested `Hono` sub-app won't be seen by `app.doc()` — all write routes must be registered on the same `OpenAPIHono` instance that serves the spec.
- **Hardcoding `Authorization` header check before the env var check:** Auth must short-circuit to `next()` when `MYCO_API_KEY` is not set — otherwise local dev always requires a key.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI spec generation | Manual `paths` JSON construction | `@hono/zod-openapi` `createRoute()` + `app.doc()` | Schema drift between validation and docs; `createRoute` derives spec from the same Zod schema used for runtime validation |
| Swagger UI hosting | Static file serving of swagger-ui-dist | `@hono/swagger-ui` middleware | Already handles CDN vs. local asset, correct MIME types, CSP headers |
| Format detection (native vs. Mem0 vs. JSONL) | Regex or field-count heuristics | Explicit `format` query/body param (`?format=mem0`, `?format=anthropic`, default native) | Avoids misdetection; makes caller contract explicit |
| Dedup on import | Separate "is duplicate?" check before insert | `classifyObservation()` from Phase 19 | Already handles NOOP/UPDATE/ADD with embedding-aware near-dup detection |

**Key insight:** The dedup pipeline from Phase 19 is the correct importer — it already handles all the edge cases (exact dup, near-dup, superseded observations). Import must route through the same pipeline as `remember`, not bypass it.

---

## Common Pitfalls

### Pitfall 1: Sub-app `app.route()` hides OpenAPI routes from spec
**What goes wrong:** `OpenAPIHono` instances created with `new OpenAPIHono()` and mounted as sub-apps via `app.route('/api/memory', memoryRoutes)` may not have their routes included in the parent `app.doc()` output, depending on the version of `@hono/zod-openapi`.
**Why it happens:** `app.doc()` introspects only routes registered directly on that instance.
**How to avoid:** Register all `createRoute()` definitions on the same `OpenAPIHono` instance that calls `app.doc()`. Alternatively, verify sub-app spec merging behavior against the installed version before using route groups.
**Warning signs:** `app.doc()` returns an empty `paths: {}` object even though routes respond correctly.

### Pitfall 2: Import overwrites temporal history with current timestamps
**What goes wrong:** Import code calls `new Date().toISOString()` for `valid_from`, discarding the original timestamps from the export.
**Why it happens:** Copy-paste from the `rememberEntity` path which always uses `now`.
**How to avoid:** Import path must explicitly pass `obs.valid_from` and `obs.valid_until` from the export payload rather than generating new timestamps. Add a test that exports, re-imports, and verifies `valid_from` matches.
**Warning signs:** `as_of` queries on imported data return wrong results; observations appear newer than they were.

### Pitfall 3: Mem0 adapter loses entity structure
**What goes wrong:** Mem0 exports flat memories with no explicit entity objects. Naive import creates one observation per memory with no entity grouping, resulting in a flat entity per memory rather than coherent entity clusters.
**Why it happens:** Mem0's memory field is a string with no structured entity reference; entity name may be in `metadata.entity_name` but this is not guaranteed.
**How to avoid:** Check `metadata.entity_name` / `metadata.entity_type` first. Fall back to a configurable catch-all entity name (e.g., `"mem0_import"` with type `"import_batch"`). Document this behavior clearly in the tool description.
**Warning signs:** After Mem0 import, all observations belong to one entity named `"mem0_import"`.

### Pitfall 4: Bearer token timing-safe comparison
**What goes wrong:** Using `===` for string comparison of API keys is technically vulnerable to timing attacks (though negligible risk for a local server).
**Why it happens:** Simple string equality is the obvious implementation.
**How to avoid:** Use `crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))` — Node.js built-in, zero dependencies. Only matters for production/network-exposed deployments; acceptable to skip for local-only dev.
**Warning signs:** Security audit flags timing oracle on auth middleware.

### Pitfall 5: `classifyObservation` requires `entity_id` to exist in DB before being called
**What goes wrong:** Import processes observations before their parent entities are inserted. `classifyObservation` calls `stmts.selectEntityByNameType` and then queries observations by `entity_id` — if the entity doesn't exist yet, classification may produce misleading results or insert observations with a dangling FK.
**Why it happens:** Import payload has all three arrays; processing order matters.
**How to avoid:** Always process entities first, then observations, then relationships. Assert entity insertion success before processing that entity's observations.
**Warning signs:** `FOREIGN KEY constraint failed` errors during import.

### Pitfall 6: `@hono/zod-openapi` requires `.openapi()` calls on Zod schemas
**What goes wrong:** Existing Zod schemas in the codebase (e.g., from `mcp-server/src/tools.ts`) don't have `.openapi({ example: ... })` annotations. The spec generates but fields have no examples or descriptions.
**Why it happens:** `.openapi()` is the `@hono/zod-openapi` extension — it's additive to standard Zod, not required for validation, only for documentation quality.
**How to avoid:** Add `.openapi()` metadata to schemas defined for the write routes. Existing schemas used only for MCP tools don't need it.
**Warning signs:** OpenAPI spec generates with all fields having `type: string` but no examples — functional but low-quality docs.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### OpenAPIHono App Setup
```typescript
// Source: https://github.com/honojs/middleware/tree/main/packages/zod-openapi
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';

const app = new OpenAPIHono();

// ... register routes with app.openapi(route, handler) ...

app.doc('/api/spec', {
  openapi: '3.0.0',
  info: { title: 'Myco Memory API', version: '1.0.0' },
});
app.get('/api/docs', swaggerUI({ url: '/api/spec' }));
```

### Route Definition with createRoute
```typescript
// Source: https://github.com/honojs/middleware/tree/main/packages/zod-openapi
import { createRoute, z } from '@hono/zod-openapi';

const rememberRoute = createRoute({
  method: 'post',
  path: '/api/memory/remember',
  request: {
    body: {
      content: { 'application/json': { schema: RememberBodySchema } },
      required: true,
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: RememberResponseSchema } }, description: 'Memory stored' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Invalid input' },
  },
  tags: ['memory'],
});
```

### Bearer Auth Middleware
```typescript
// packages/api-server/src/middleware/auth.ts
import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';

export function apiKeyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const apiKey = process.env.MYCO_API_KEY;
    if (!apiKey) return next();  // disabled when unset
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 } }, 401);
    }
    const provided = header.slice(7);
    try {
      const equal = timingSafeEqual(Buffer.from(provided), Buffer.from(apiKey));
      if (!equal) throw new Error();
    } catch {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 } }, 401);
    }
    return next();
  };
}
```

### Export Graph (bulk sync query)
```typescript
// All tables in one synchronous pass — faster than multiple round-trips
export function exportGraph(db: Database.Database): GraphExport {
  const entities = db.prepare(
    `SELECT * FROM entities WHERE merged_into IS NULL ORDER BY created_at`
  ).all() as Entity[];
  const observations = db.prepare(
    `SELECT * FROM observations ORDER BY created_at`
  ).all() as Observation[];
  const relationships = db.prepare(
    `SELECT * FROM relationships ORDER BY created_at`
  ).all() as Relationship[];
  return {
    metadata: { version: '1.0', exported_at: new Date().toISOString(),
                 entity_count: entities.length, observation_count: observations.length,
                 relationship_count: relationships.length },
    entities, observations, relationships,
  };
}
```

### Test Pattern (existing convention from mcp-server/tests/)
```typescript
// packages/api-server/tests/memory-ops.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import { rememberEntity, exportGraph, importGraph } from '@myco/core';

const testDir = join(tmpdir(), 'myco-22-test-' + process.pid);
// Null embed stub — tests don't need Ollama
const nullEmbed = async (_: string) => null;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@hono/zod-openapi` required Zod v3 | Zod v4 is peer dep `^4.0.0` | Issue #1177 closed ~June 2025 | No version pinning needed; use installed zod@4.3.6 |
| `@asteasolutions/zod-to-openapi` v6/v7 | v8.5.0 (Zod v4 native) | 2025 | Transitive dep; no direct interaction needed |
| `swaggerUI({ url })` at custom path | Same pattern, works with `/api/docs` | — | Per locked decision: docs at `/api/docs`, spec at `/api/spec` |

**Deprecated/outdated:**
- `@hono/zod-openapi@<1.2.0`: Zod v3 only — do not install older versions
- Mem0 v1.0 API format (direct array response, no `results` key): Deprecated; use v1.1 `{results: [...]}` shape

---

## Open Questions

1. **Where does `embed-client.ts` live after refactor?**
   - What we know: It currently lives in `mcp-server/src/`; `memory-ops.ts` in `@myco/core` needs to call embed for `remember` and `recall`
   - What's unclear: Whether to inject as `EmbedFn` parameter (keeps core lean) or move to core (simpler call sites)
   - Recommendation: Inject as parameter — keeps `@myco/core` free of `ollama` npm dep. Both MCP server and HTTP server inject their own `embedText` from `mcp-server/src/embed-client.ts` (api-server can `import` from mcp-server as a dev dep, or the embed client can be co-located in core as a separate optional export)

2. **How should HTTP API server access the embed client?**
   - What we know: `api-server` doesn't currently depend on `mcp-server`; Ollama client is in `mcp-server`
   - What's unclear: Should api-server import from mcp-server (creates circular-ish dep) or duplicate the embed client?
   - Recommendation: Move `embed-client.ts` to `packages/core/src/embed-client.ts` as an optional export. Both servers then import from `@myco/core`. This is the cleanest dependency graph. Adds `ollama` as a peer/optional dep to core — acceptable since core is not bundled for browser.

3. **Import file handling in MCP tool vs HTTP endpoint**
   - What we know: MCP tools can only exchange text — no file upload mechanism; HTTP endpoint can accept raw JSON body
   - What's unclear: How the `import_graph` MCP tool receives data — as an inline JSON string argument, or as a file path?
   - Recommendation: MCP `import_graph` tool accepts either a file path (reads file) or an inline JSON string (parses directly). File path is more practical for large graphs. HTTP `POST /api/import` accepts `Content-Type: application/json` body.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v22.x | — |
| `@hono/zod-openapi` | API-02 OpenAPI docs | Not yet installed (1.2.4 available on npm) | — | None — must install |
| `@hono/swagger-ui` | API-02 Swagger UI | Not yet installed (0.6.1 available on npm) | — | None — must install |
| Ollama | `rememberEntity`, `recallKnowledge` (embedding) | Runtime dependency — assumed running | varies | FTS fallback for recall; `needs_embedding` flag for remember (already implemented) |

**Missing dependencies with no fallback:**
- `@hono/zod-openapi` — must be added to `packages/api-server/package.json`
- `@hono/swagger-ui` — must be added to `packages/api-server/package.json`

**Missing dependencies with fallback:**
- Ollama at test time — use null embed stub `async () => null`; existing test pattern confirms this works

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (latest, installed at root) |
| Config file | `/vitest.config.ts` — `include: ['packages/*/tests/**/*.test.ts']` |
| Quick run command | `npm test -- --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | `rememberEntity` produces same result via HTTP as MCP | unit (memory-ops) | `npm test -- packages/core/tests/memory-ops.test.ts` | ❌ Wave 0 |
| API-02 | `GET /api/spec` returns valid OpenAPI JSON | integration | `npm test -- packages/api-server/tests/openapi.test.ts` | ❌ Wave 0 |
| API-03 | Missing key → 401; valid key passes; no key set → 200 | unit | `npm test -- packages/api-server/tests/auth.test.ts` | ❌ Wave 0 |
| IO-01 | `exportGraph()` returns all entities/observations/relationships | unit | `npm test -- packages/core/tests/memory-ops.test.ts` | ❌ Wave 0 |
| IO-02 | `importGraph()` populates DB from native export JSON | unit | `npm test -- packages/core/tests/memory-ops.test.ts` | ❌ Wave 0 |
| IO-03 | Export → import → export produces identical payloads | unit | `npm test -- packages/core/tests/memory-ops.test.ts` | ❌ Wave 0 |
| IO-04 | Mem0 adapter maps `memories[].memory` to observations | unit | `npm test -- packages/core/tests/import-adapters.test.ts` | ❌ Wave 0 |
| IO-04 | Anthropic JSONL adapter parses `{type:"entity",observations:[]}` | unit | `npm test -- packages/core/tests/import-adapters.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- packages/core/tests/memory-ops.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/core/tests/memory-ops.test.ts` — covers API-01, IO-01, IO-02, IO-03
- [ ] `packages/core/tests/import-adapters.test.ts` — covers IO-04 (Mem0 + Anthropic adapters)
- [ ] `packages/api-server/tests/openapi.test.ts` — covers API-02 (spec endpoint)
- [ ] `packages/api-server/tests/auth.test.ts` — covers API-03 (auth middleware)

*(Existing `packages/mcp-server/tests/server.test.ts` already imports from `tools.ts` — will need updating after extraction to `@myco/core`)*

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 22 |
|-----------|-------------------|
| Runtime: Node.js | All packages are Node.js ESM; no browser-only APIs |
| Storage: SQLite via better-sqlite3 synchronous API | Export is a sync bulk SELECT; import uses sync inserts inside transaction |
| Embeddings: Ollama | `embedText` caller must handle null return (Ollama unavailable) — already implemented pattern |
| Privacy: Everything local | No cloud upload of export data; HTTP API is local-only by default |
| Integration: Standard MCP server | MCP tools remain the primary interface; REST is an additional surface, not a replacement |
| Use `@hono/zod-openapi` + `@hono/swagger-ui` | Locked in CONTEXT.md — already confirmed Zod v4 compatible |
| Use `Hono` for HTTP API | Already in use in `packages/api-server` |
| Use `Zod` for validation | Already in use; `@hono/zod-openapi` requires it |
| Do NOT use `sqlite3` (async callback API) | Use `better-sqlite3` only |
| Do NOT use `jsonl` file storage | Export/import uses structured JSON, not JSONL (except Anthropic adapter input) |

---

## Sources

### Primary (HIGH confidence)
- `packages/mcp-server/src/tools.ts` — full source of functions to extract; read directly
- `packages/api-server/src/` — full source of existing Hono app pattern; read directly
- `packages/core/src/` — types, statements, db; read directly
- `npm view @hono/zod-openapi` — version 1.2.4, peer dep `zod: ^4.0.0`, dep `@asteasolutions/zod-to-openapi@^8.5.0` — confirmed 2026-03-27
- `npm view @hono/swagger-ui` — version 0.6.1, peer dep `hono: >=4.0.0` — confirmed 2026-03-27

### Secondary (MEDIUM confidence)
- [GitHub: honojs/middleware/packages/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) — `createRoute`, `OpenAPIHono`, `app.doc()`, `app.openapi()` usage patterns
- [GitHub: honojs/middleware issues #1177](https://github.com/honojs/middleware/issues/1177) — Zod v4 support confirmed closed/merged
- [GitHub: honojs/middleware/packages/swagger-ui README](https://github.com/honojs/middleware/blob/main/packages/swagger-ui/README.md) — `swaggerUI({ url })` middleware pattern
- Mem0 v1.1 API format — `{results: [{id, memory, user_id, metadata, created_at}]}` — from WebSearch (multiple sources agree)
- [GitHub: modelcontextprotocol/servers/src/memory](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/index.ts) — Anthropic JSONL format: `{type:"entity",name,entityType,observations:[string[]]}`

### Tertiary (LOW confidence — none)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via `npm view`; existing packages verified in node_modules
- Architecture: HIGH — based on direct reading of existing source files; patterns are extensions of Phase 19-21 established patterns
- Pitfalls: HIGH for items derived from code reading; MEDIUM for Zod v4 timeline (confirmed by issue closure but not smoke-tested)
- Import adapters: MEDIUM — Mem0 format from multiple corroborating web sources; Anthropic JSONL from direct source read

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable ecosystem; `@hono/zod-openapi` stable)
