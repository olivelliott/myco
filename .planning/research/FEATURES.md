# Feature Research

**Domain:** MCP Server Performance & Architecture Optimization
**Researched:** 2026-03-25
**Confidence:** HIGH (codebase audit + comparable server analysis)

## Feature Categories

### 1. Embedding Client Management

| Feature | Category | Complexity | Dependencies |
|---------|----------|------------|--------------|
| Singleton Ollama client | Table Stakes | Low | None |
| Health check cooldown (30s fast-fail) | Table Stakes | Low | Singleton |
| Batch embedding (string[] input) | Table Stakes | Medium | Singleton |
| Re-embed pending batch optimization | Table Stakes | Medium | Batch embedding |

**Current state:** `embed-client.ts` creates new `Ollama()` instance per `embedText()` call. Under Ollama downtime, every `remember`/`recall` wastes 2s in timeout. `reEmbedPending()` calls `embedText()` one at a time for 50 observations.

**Comparable servers:**
- Chroma MCP: Module-level singleton `_chroma_client`, lazily initialized once. No health recovery.
- Cognee: No runtime health checks.
- Myco advantage: FTS5 fallback already better than most. Adding cooldown makes degradation instant.

**Recommendation:** Singleton + 30s cooldown + batch API. Turns O(N x latency) into O(1 x latency) for re-embed.

### 2. Configuration

| Feature | Category | Complexity | Dependencies |
|---------|----------|------------|--------------|
| dotenv file loading | Table Stakes | Low | None |
| Config validation + stderr log | Table Stakes | Low | dotenv |
| .env.example template | Table Stakes | Low | dotenv |

**Current state:** Only reads env vars directly. No `.env` file support. Critical for `myco-cli` terminal workflows where Claude Desktop doesn't inject env vars.

**Comparable servers:**
- Chroma MCP: CLI args > env vars > `.chroma_env` file with re-parse. Best pattern.
- Basic-memory: Pydantic Settings with `env_file='.env'`, startup validation.

**Recommendation:** Add `dotenv` package, load at server/CLI startup, print resolved config to stderr. No CLI args needed (MCP servers don't take args).

### 3. Query Filtering

| Feature | Category | Complexity | Dependencies |
|---------|----------|------------|--------------|
| entity_type filter on recall | Differentiator | Low | None |
| min_confidence filter on recall | Differentiator | Low | None |
| agent_id filter on recall | Differentiator | Low | None |
| project filter on recall | Differentiator | Low | Namespace isolation |

**Current state:** `recall` only takes `query` + `limit`. `query` tool does exact match on name/type but no semantic search.

**Comparable servers:**
- Chroma MCP: Generic `$gt/$lt/$and/$or` DSL — powerful but poor LLM UX (agents struggle with operator syntax).
- Basic-memory: Typed named params — correct approach for MCP tools.
- Mem0: AND/OR combinator objects — LLM-hostile.

**Recommendation:** Typed Zod params (`min_confidence`, `entity_type`, `agent_id`, `project`) — NOT a filter DSL. Confined change to `recallKnowledge()`. LLMs work best with named params.

**Anti-feature:** Generic filter DSL. Agents can't reliably construct operator queries.

### 4. Namespace/Project Isolation

| Feature | Category | Complexity | Dependencies |
|---------|----------|------------|--------------|
| project column on entities | Differentiator | Medium | Schema migration |
| project column on observations | Differentiator | Medium | Schema migration |
| project column on relationships | Differentiator | Medium | Schema migration |
| Default project for existing data | Table Stakes | Low | Migration |

**Current state:** Single flat entity space. All entities from all projects share the same namespace.

**Comparable servers:**
- Chroma MCP: Collection-as-namespace (physical separation). Overkill for single-user.
- Mem0: `user_id` field (logical partition). Right approach.
- Cognee: Datasets (logical partition).

**Recommendation:** Add `project TEXT DEFAULT 'default'` to entities/observations/relationships. Logical partition, not separate DB files. Existing data gets `'default'` project. Phase LAST due to schema migration risk.

**Anti-feature:** Separate DB files per project. Creates backup/maintenance nightmare.

### 5. Prepared Statement Caching

| Feature | Category | Complexity | Dependencies |
|---------|----------|------------|--------------|
| Statement factory (prepareStatements) | Table Stakes | Medium | None |
| Extract inline db.prepare() calls | Table Stakes | Medium | Statement factory |

**Current state:** Calls `db.prepare()` inline in every tool function — recompiles SQL on every invocation. `rememberEntity()` calls `.prepare()` 5-7 times per call. `queryEntities()` prepares statements inside loop bodies.

**Recommendation:** Extract all statements to a `prepareStatements(db)` factory called once at startup. Standard better-sqlite3 pattern. Free performance.

### 6. Error Handling & Validation

| Feature | Category | Complexity | Dependencies |
|---------|----------|------------|--------------|
| API input validation (Zod) | Table Stakes | Low | None |
| Structured error responses | Table Stakes | Low | None |
| MCP tool error standardization | Table Stakes | Low | None |
| SQL injection prevention audit | Table Stakes | Low | Query filters |

**Current state:** API routes have minimal validation. MCP tools use Zod for input but error responses are inconsistent. No explicit SQL injection audit.

**Recommendation:** Add Zod validation middleware to Hono routes. Standardize MCP tool error format. Audit all dynamic SQL for injection risks (especially with new query filters).

## Phase Ordering Recommendation

1. **Config + Embedding** (lowest risk): dotenv, singleton client, health cooldown, batch embedding
2. **Prepared Statements** (medium risk): statement factory, extract inline prepares
3. **Query Filters + Validation** (medium risk): typed params on recall, API validation, error standardization
4. **Namespace Isolation** (highest risk): schema migration, project column, update all queries

## Anti-Features (Do NOT Build)

| Feature | Why Not |
|---------|---------|
| Generic filter DSL ($gt/$lt/$and/$or) | LLMs can't reliably construct operator queries |
| Separate DB files per project | Backup/maintenance nightmare |
| Config file (YAML/JSON) | Env vars + dotenv sufficient for single-user |
| Runtime model hot-swap | Unnecessary complexity |
| Per-query LRU statement cache | better-sqlite3 prepared statements already cached |
| Connection pooling | better-sqlite3 is synchronous, single connection is correct |

---
*Researched: 2026-03-25*
*Sources: Codebase audit, Chroma MCP (github.com/chroma-core/chroma-mcp), basic-memory, mem0, cognee patterns*
