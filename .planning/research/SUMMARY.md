# Project Research Summary

**Project:** Myco v3.0 — Performance & Architecture Optimization
**Domain:** MCP server optimization, embedding performance, query capabilities, project isolation
**Researched:** 2026-03-25

## Key Findings

### Stack Additions
- **Only 1 new dependency needed:** `dotenv` (16.x) for .env file loading
- All other optimizations use existing libraries (better-sqlite3, ollama, Zod, Hono)
- Optional: `@hono/zod-validator` for API validation middleware

### Feature Table Stakes
- Singleton embedding client with health check cooldown (every comparable server does this)
- Batch embedding via Ollama's `embed({ input: string[] })` API
- dotenv configuration with stderr logging of resolved config
- Prepared statement caching (standard better-sqlite3 pattern)
- Input validation on API routes

### Differentiators
- Typed query filter params on recall (entity_type, min_confidence, agent_id, project)
- Namespace/project isolation via logical partition column
- 30s fast-fail cooldown on Ollama failure (most servers have no health recovery)

### Watch Out For
1. **P1 (HIGH):** Prepared statements must NOT reference Phase 4's `project` column — add those statements in Phase 4
2. **P2 (HIGH):** SQLite ALTER TABLE can't modify virtual tables (vec_embeddings, fts_observations) — filter at query time
3. **P3 (MEDIUM):** Ollama batch embed fails entirely on error — need fallback to one-at-a-time
4. **P4 (MEDIUM):** dotenv must load before any module reads process.env at import time
5. **P5 (MEDIUM):** Dynamic WHERE clauses for filters must use parameterized queries (SQL injection risk)

### Build Order (Risk-Ascending)
1. **Config + Embedding** — dotenv, singleton, health cooldown, batch (zero schema changes)
2. **Prepared Statements** — statement factory, extract inline prepares (no schema changes)
3. **Query Filters + Validation** — typed params, API validation, error standardization (no schema changes)
4. **Namespace Isolation** — schema migration, project column, all query updates (highest risk)

### Anti-Features (Do NOT Build)
- Generic filter DSL ($gt/$lt/$and/$or) — LLMs can't use it
- Separate DB files per project — maintenance nightmare
- Config files (YAML/JSON) — env vars + dotenv is sufficient
- Connection pooling — better-sqlite3 is synchronous, single connection is correct
- Logging library — console.error to stderr is the MCP convention

## Architecture Impact

| Package | Changes | Risk |
|---------|---------|------|
| core | config.ts (new), statements.ts (new), schema migration, types | Medium |
| mcp-server | embed-client.ts (major), tools.ts (major), consolidator, cli | Medium |
| api-server | validation middleware, prepared statements | Low |
| dashboard | None | None |

---
*Synthesized: 2026-03-25*
