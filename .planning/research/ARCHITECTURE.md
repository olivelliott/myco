# Architecture Research

**Domain:** MCP Server Performance & Architecture Optimization
**Researched:** 2026-03-25
**Confidence:** HIGH (existing codebase well-understood from audit)

## Current Architecture

```
packages/
  core/         → db.ts, schema.ts, types.ts, provenance.ts
  mcp-server/   → index.ts, tools.ts, embed-client.ts, consolidator.ts, scheduler.ts, relationship-discovery.ts, cli.ts
  api-server/   → index.ts, db.ts, routes/{dashboard,approvals,entities,episodes,graph}.ts
  dashboard/    → React PWA (no changes needed for v3.0)
```

## Changes Per Package

### packages/core (4 changes)

| File | Change | Type |
|------|--------|------|
| `schema.ts` | Add `project` column to entities/observations/relationships + migration | Modified |
| `schema.ts` | Add indexes on project column | Modified |
| `db.ts` | Load dotenv at module level before DB path resolution | Modified |
| `types.ts` | Add `project` to entity/observation/relationship types | Modified |

### packages/mcp-server (6 changes)

| File | Change | Type |
|------|--------|------|
| `embed-client.ts` | Singleton Ollama client + health check cooldown + batch API | Modified (major) |
| `tools.ts` | Add filter params to recall, use prepared statements, add project param | Modified (major) |
| `tools.ts` | Extract prepared statements to factory | Modified |
| `index.ts` | Initialize prepared statements at startup, load dotenv | Modified |
| `consolidator.ts` | Use prepared statements, add project awareness | Modified |
| `relationship-discovery.ts` | Use prepared statements, project-scoped queries | Modified |
| `cli.ts` | Load dotenv before commands | Modified |

### packages/api-server (3 changes)

| File | Change | Type |
|------|--------|------|
| `index.ts` | Load dotenv, add Zod validation middleware | Modified |
| `routes/*.ts` | Add input validation, project filter support | Modified |
| `db.ts` | Initialize prepared statements | Modified |

### packages/dashboard (0 changes)

No changes needed. Dashboard consumes API — filter params are additive.

## New Files

| File | Purpose |
|------|---------|
| `.env.example` | Template with all supported env vars |
| `packages/core/src/statements.ts` | Prepared statement factory (`prepareStatements(db)`) |
| `packages/core/src/config.ts` | Config loader (dotenv + validation + stderr log) |

## Integration Points

### 1. Dotenv Loading (First thing at process start)

```
Process start → dotenv.config() → resolve DB path → open DB → load schema → prepare statements
```

Must happen before `db.ts` reads `MYCO_DB_PATH`. Both `mcp-server/index.ts` and `api-server/index.ts` need it. Extract to `core/config.ts`.

### 2. Prepared Statement Lifecycle

```
DB opened → schema applied → prepareStatements(db) → statements object passed to tools
```

Statements must be created AFTER schema migrations run (migrations may add columns that statements reference). Factory returns typed object with all named statements.

### 3. Embedding Client Singleton

```
Module load → create singleton → first embedText() call → lazy connect
                                                        → on failure: set lastFailure timestamp
                                                        → on next call: check cooldown before attempting
```

Singleton lives in `embed-client.ts` module scope. Health state (lastFailure timestamp) is module-level. `embedBatch()` new export alongside `embedText()`.

### 4. Query Filter Flow

```
recall({ query, limit, entity_type?, min_confidence?, project? })
  → embedText(query)
  → KNN search (vec_embeddings)
  → JOIN with entities WHERE entity_type = ? AND confidence >= ? AND project = ?
  → Return filtered results
```

Filters applied as SQL WHERE clauses on the JOIN, not post-filter in JS. This is important for performance.

### 5. Namespace Isolation

```
remember({ content, entity_name, project? })
  → Default project = 'default'
  → Insert entity with project column
  → All observations/relationships inherit project from entity

recall({ query, project? })
  → If project specified: scope KNN results to project
  → If not specified: search all projects (backward compatible)
```

## Suggested Build Order

### Phase 1: Foundation (Config + Embedding)
**Why first:** Zero schema changes, zero breaking changes. Pure additive.

1. `core/config.ts` — dotenv loading + config validation
2. `.env.example` — template file
3. `embed-client.ts` — singleton + health cooldown + batch API
4. Wire dotenv loading into mcp-server, api-server, cli entry points
5. Update `reEmbedPending()` to use batch embedding

### Phase 2: Query Performance (Prepared Statements)
**Why second:** Requires understanding all query paths. No schema changes.

1. `core/statements.ts` — prepared statement factory
2. Update `tools.ts` to use prepared statements
3. Update `consolidator.ts` to use prepared statements
4. Update `relationship-discovery.ts` to use prepared statements
5. Update API routes to use prepared statements

### Phase 3: Query Power (Filters + Validation)
**Why third:** Builds on prepared statements. May want to add project filter in Phase 4.

1. Extend `recall` tool Zod schema with optional filters
2. Update `recallKnowledge()` SQL to apply filters
3. Add Zod validation to API routes
4. Standardize error responses

### Phase 4: Namespace Isolation (Schema Migration)
**Why last:** Highest risk. Changes schema, affects all queries.

1. Schema migration: ALTER TABLE ADD COLUMN project
2. Update types
3. Update all INSERT/SELECT queries to include project
4. Update MCP tool schemas to accept project param
5. Update API routes to support project filter
6. Test migration with existing data

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| dotenv loading | Low | Env vars override .env (dotenv default) |
| Singleton embedding | Low | Same behavior, fewer instances |
| Health cooldown | Low | Graceful degradation already works |
| Batch embedding | Low | Ollama API is stable |
| Prepared statements | Medium | Must extract carefully, test all paths |
| Query filters | Medium | SQL injection risk if params not bound |
| Schema migration | High | ALTER TABLE on existing data; need DEFAULT value |

---
*Researched: 2026-03-25*
*Sources: Codebase audit of all 4 packages, better-sqlite3 docs, Ollama API docs*
