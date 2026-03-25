# Pitfalls Research

**Domain:** MCP Server Performance & Architecture Optimization
**Researched:** 2026-03-25
**Confidence:** HIGH (better-sqlite3/Ollama gotchas well-documented)

## Critical Pitfalls

### P1: Prepared Statement + Schema Migration Ordering

**Risk:** HIGH
**Affects:** Phase 2 (statements) + Phase 4 (namespace)

If prepared statements reference columns added in Phase 4's migration, and the statement factory runs before migration, statements will fail. Example: a prepared statement for `SELECT * FROM entities WHERE project = ?` will crash if the `project` column doesn't exist yet.

**Prevention:**
- Run schema migrations BEFORE preparing statements (already the case in db.ts)
- Statement factory must be called AFTER `applySchema(db)` completes
- Phase 2 statements must NOT reference `project` column — add those in Phase 4
- Test: open a pre-migration database, verify statement factory works without new columns

### P2: SQLite ALTER TABLE Limitations

**Risk:** HIGH
**Affects:** Phase 4 (namespace isolation)

SQLite's `ALTER TABLE ADD COLUMN` has restrictions:
- Column MUST have a DEFAULT value (can't be NOT NULL without default)
- Can't add UNIQUE constraint inline
- Can't reference other tables (no FK on added columns)
- Virtual tables (vec_embeddings, fts_observations) CANNOT be altered

**Prevention:**
- Use `ALTER TABLE entities ADD COLUMN project TEXT DEFAULT 'default'`
- Add index separately: `CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)`
- Don't try to alter vec_embeddings or fts_observations — filter at query time
- Wrap migration in try/catch (idempotent — column may already exist)

### P3: Ollama Batch Embedding Edge Cases

**Risk:** MEDIUM
**Affects:** Phase 1 (embedding)

Ollama's `embed({ input: string[] })` behavior:
- Empty array → error (not empty response)
- Single string vs string[] → different response shapes (single returns `embeddings[0]`, array returns `embeddings[]`)
- Very long texts may cause OOM on small GPU — no per-item error, whole batch fails
- Model not loaded → first call triggers model load (30s+ delay), may timeout

**Prevention:**
- Guard: if array empty, return early
- Always use string[] form for consistency
- Cap batch size at 50 (matches current reEmbedPending limit)
- Set longer timeout for batch calls (10s vs 2s for single)
- If batch fails, fall back to one-at-a-time (don't lose the whole batch)

### P4: dotenv Loading Order

**Risk:** MEDIUM
**Affects:** Phase 1 (config)

`dotenv.config()` must run before ANY code reads `process.env`:
- `db.ts` reads `MYCO_DB_PATH` at import time if using top-level const
- `embed-client.ts` reads `OLLAMA_HOST`
- `consolidator.ts` reads `BRAIN_CONSOLIDATION_MODEL`

If dotenv loads after these modules initialize, env vars from `.env` won't be seen.

**Prevention:**
- Load dotenv at the very top of entry points (index.ts, cli.ts) before other imports
- Or use a `config.ts` that's imported first and calls `dotenv.config()`
- Verify: `embed-client.ts` reads OLLAMA_HOST lazily (inside function, not at module scope) — if it's at module scope, refactor to lazy read
- Test: set var only in .env (not shell), verify it's picked up

### P5: SQL Injection in Query Filters

**Risk:** MEDIUM
**Affects:** Phase 3 (query filters)

Adding dynamic WHERE clauses for filters creates injection risk if parameters are concatenated into SQL strings instead of bound.

**Prevention:**
- ALWAYS use parameterized queries: `WHERE entity_type = ?` with bound params
- Never interpolate user input into SQL strings
- For optional filters, build WHERE clause conditionally but always bind:
  ```
  let sql = 'SELECT ... FROM entities WHERE 1=1'
  const params = []
  if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type) }
  ```
- Audit existing code for any string interpolation in SQL

### P6: Prepared Statement Finalization

**Risk:** LOW
**Affects:** Phase 2 (prepared statements)

better-sqlite3 prepared statements are NOT automatically garbage collected. If you create statements in a loop or per-request, they leak memory.

**Prevention:**
- Create ALL statements once at startup via factory
- Never call `db.prepare()` inside request handlers
- Statements are automatically finalized when `db.close()` is called
- If database is re-opened (unlikely in MCP server), re-create all statements

### P7: Health Check Cooldown + Concurrent Requests

**Risk:** LOW
**Affects:** Phase 1 (embedding)

If multiple MCP tool calls arrive concurrently during cooldown, they all skip embedding. This is correct behavior (fast-fail), but:
- `lastFailure` timestamp must be module-level (not per-function)
- `Date.now()` comparison is safe for concurrent reads (no race condition in single-threaded Node.js)
- After cooldown expires, first request retries — if it fails, resets cooldown

**Prevention:**
- Use simple module-level `let lastFailure = 0` — no Map, no class
- MCP servers are single-threaded (stdio transport), so no true concurrency issues
- Log cooldown skip to stderr for debugging

### P8: Backward Compatibility — Existing Data Without Project Column

**Risk:** MEDIUM
**Affects:** Phase 4 (namespace)

After adding `project` column, all existing data gets `DEFAULT 'default'`. But:
- `recall` without project param must still search ALL projects (not just 'default')
- `remember` without project param should use 'default'
- API routes that don't pass project should return all projects
- Dashboard graph view should show all projects unless filtered

**Prevention:**
- Make project param optional everywhere
- `WHERE project = ?` only when project is explicitly provided
- Never add `WHERE project = 'default'` as implicit filter
- Test: existing data still appears in all queries after migration

## Pitfall-to-Phase Mapping

| Pitfall | Phase | Priority |
|---------|-------|----------|
| P4: dotenv loading order | Phase 1 | Address first |
| P3: Ollama batch edge cases | Phase 1 | Handle in implementation |
| P7: Health check concurrency | Phase 1 | Simple, just be aware |
| P6: Statement finalization | Phase 2 | Design pattern prevents it |
| P1: Statement + migration ordering | Phase 2 + 4 | Cross-phase dependency |
| P5: SQL injection in filters | Phase 3 | Audit during implementation |
| P2: ALTER TABLE limitations | Phase 4 | Know constraints upfront |
| P8: Backward compatibility | Phase 4 | Test plan needed |

---
*Researched: 2026-03-25*
*Sources: better-sqlite3 docs, SQLite ALTER TABLE docs, Ollama API behavior, Node.js dotenv docs*
