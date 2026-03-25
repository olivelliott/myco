# Stack Research

**Domain:** MCP Server Performance & Architecture Optimization
**Researched:** 2026-03-25
**Confidence:** HIGH (existing stack validated, additions minimal)

## Existing Stack (DO NOT CHANGE)

| Technology | Version | Status |
|------------|---------|--------|
| Node.js | 22.x LTS | Keep |
| TypeScript | 5.9 | Keep |
| better-sqlite3 | 12.8.0 | Keep |
| sqlite-vec | 0.1.7 | Keep |
| ollama (npm) | 0.6.3 | Keep |
| @modelcontextprotocol/sdk | 1.27.1 | Keep |
| Zod | 4.3.6 | Keep |
| Croner | latest | Keep |
| Hono | 4.x | Keep |

## Stack Additions

### Required

| Library | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| dotenv | 16.x | .env file loading | Standard Node.js dotenv. Zero-config, loads `.env` into `process.env`. Used by virtually every Node.js server. No alternative needed. |

**That's it.** All other optimizations are code-level changes using existing libraries:

- **Singleton pattern**: Pure TypeScript, no library needed
- **Health check caching**: `Date.now()` comparison, no library
- **Batch embedding**: Already supported by `ollama` npm package (`embed({ input: string[] })`)
- **Prepared statements**: Already supported by `better-sqlite3` (`db.prepare()`)
- **Query filters**: Zod schema extension + SQL WHERE clause building
- **Namespace isolation**: SQLite ALTER TABLE + column addition
- **Error handling**: Zod + Hono middleware (both already in stack)

### Optional (Nice-to-have)

| Library | Version | Purpose | When |
|---------|---------|---------|------|
| @hono/zod-validator | 0.4.x | Hono middleware for Zod request validation | If API validation is complex enough to warrant middleware |

## Comparable Server Patterns

### Chroma MCP (Python)
- **Config**: argparse + python-dotenv with re-parse after dotenv load
- **Client**: Module-level singleton, lazy init
- **Embedding**: Delegated to ChromaDB (6 provider options per collection)
- **Takeaway**: Configuration layering is good, but their O(n) duplicate-ID check is terrible

### Basic-memory (Python)
- **Config**: Pydantic Settings with `env_file='.env'`
- **Client**: Singleton with startup validation
- **Takeaway**: Typed config validation at startup is the right pattern

### MCP Reference Knowledge Graph (TypeScript)
- **Storage**: JSONL file (anti-pattern for production)
- **No embeddings, no vector search**
- **Takeaway**: What NOT to do. Myco already far exceeds this.

## What NOT to Add

| Avoid | Why |
|-------|-----|
| drizzle-orm | Schema is stable, raw SQL + prepared statements is faster and simpler |
| config file parser (convict, conf, etc.) | Env vars + dotenv sufficient for single-user local server |
| connection pool library | better-sqlite3 is synchronous, pooling doesn't apply |
| retry library (p-retry, etc.) | Health check cooldown is simpler and more appropriate |
| logging library (pino, winston) | console.error to stderr is correct for MCP servers |
| OpenTelemetry | Over-engineering for local single-user server |

## Integration Notes

### dotenv loading order
1. Load `.env` file via `dotenv.config()` at process start (before any other imports that read env)
2. Existing env vars take precedence (dotenv default behavior)
3. Log resolved config to stderr for debugging
4. Create `.env.example` with all supported vars + comments

### Prepared statement lifecycle
- `db.prepare()` returns a reusable `Statement` object
- Statement is bound to the database connection
- Must be created AFTER database is opened and schema applied
- Can be stored in a Map or object for lookup
- Automatically finalized when database closes

### Batch embedding API
- `ollama.embed({ model: 'nomic-embed-text', input: ['text1', 'text2', ...] })`
- Returns `{ embeddings: number[][] }` — one per input
- Max batch size: limited by Ollama memory, test with 50-100
- Single HTTP call vs N sequential calls

---
*Researched: 2026-03-25*
*Sources: npm registry, Ollama API docs, better-sqlite3 docs, comparable MCP server codebases*
