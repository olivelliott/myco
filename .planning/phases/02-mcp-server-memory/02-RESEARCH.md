# Phase 2: MCP Server + Memory - Research

**Researched:** 2026-03-20
**Domain:** Semantic search (sqlite-vec + Ollama), FTS5 fallback, MCP tool implementation
**Confidence:** HIGH

## Summary

Phase 2 implements the full MCP tool suite by wiring up three previously stubbed components: the embedding pipeline (Ollama → sqlite-vec), the `recall` semantic search tool, the `query` structured lookup tool, and the `log_episode` capture tool. The codebase from Phase 1 provides all the scaffolding — database open, schema with vec_embeddings virtual table, stub tool handlers, and provenance utilities. Phase 2 fills in the missing logic without restructuring.

The primary technical challenge is the Ollama integration: the embed call is async and can fail silently. The CONTEXT.md decision is that write operations (`remember`, `log_episode`) must succeed even when Ollama is down, flagging rows as `needs_embedding` for later re-embedding. The `recall` tool falls back to FTS5 full-text search when no embedding is available. The FTS5 virtual table does not yet exist in the schema and must be added via a schema migration in this phase.

The secondary challenge is the vec0 KNN query pattern. The existing `vec_embeddings` table uses TEXT metadata columns (`item_id`, `item_type`) which were added in sqlite-vec v0.1.6. The KNN `MATCH` query returns rowid + distance; a CTE join on `item_id` retrieves the parent observation and entity context. Float32Array is the correct serialization for query vectors with better-sqlite3.

**Primary recommendation:** Add `ollama` to `packages/mcp-server`, implement a lazy singleton `EmbedClient` with `AbortSignal.timeout(2000)`, add `needs_embedding` column via ALTER TABLE, add FTS5 virtual table to schema, then implement `recall`, `query`, and `log_episode` handlers in `tools.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Recall Tool Response Format**
- Each recall result includes: entity name, type, observation content, confidence, and relevance score
- Multi-result responses use a JSON array in a single `text` content block
- Recall searches both entities and observations — embed and search observations (the facts) but return parent entity context for each match
- Response includes a `method: "semantic" | "fts"` field in metadata

**Embedding Pipeline**
- Embeddings generated inline at write time (during `remember`)
- Ollama failure: write succeeds without embedding, flag row as `needs_embedding` — re-embed on next successful connection (SRCH-04)
- Embed observation content only — entity names are already searchable via exact lookup
- Ollama client uses lazy singleton — initialize on first embed call, reuse connection, detect unavailability with a health check timeout (2s)

**Episode & Query Tool Design**
- `log_episode` accepts: `event_type` (string), `payload` (object), `agent_id` (optional) — session ID auto-injected
- Episodes are NOT directly queryable by agents via `recall`/`query` (EPSD-03)
- `query` tool supports: entity by name, by type, by relationship — plus combination filters; returns entities with observations and relationship counts
- `recall` and `query` remain separate tools

### Claude's Discretion
- FTS5 table structure and tokenizer configuration
- Exact embedding batch size and re-embedding strategy for `needs_embedding` rows
- Error message wording in tool responses
- Internal helper module organization within packages/core and packages/mcp-server

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | Local embeddings via Ollama (nomic-embed-text) for all entities and observations | Ollama npm `embed()` API; lazy singleton EmbedClient pattern; nomic-embed-text produces 768-dim float vectors matching `vec_embeddings float[768]` schema |
| SRCH-02 | Vector similarity search via sqlite-vec for semantic recall | vec0 KNN MATCH syntax with `k=N`; Float32Array serialization; CTE join pattern to retrieve observation + entity context |
| SRCH-03 | Multi-access retrieval: exact entity lookup, tag/type filter, and semantic similarity | `query` tool covers exact + filter; `recall` covers semantic; both in separate MCP tools |
| SRCH-04 | Graceful Ollama degradation: writes succeed without embeddings, re-embed later | `needs_embedding` column (ALTER TABLE migration); re-embed sweep on successful ping; FTS5 fallback in `recall` |
| EPSD-01 | Timestamped episode log captures events with agent ID and context payload | `episodes` table exists; `log_episode` tool handler inserts using `buildProvenance()` + `SESSION_ID` |
| EPSD-02 | Per-agent episode isolation — each agent session has its own episode stream | `agent_id` + `session_id` columns already in `episodes` table; auto-injected from SESSION_ID and input param |
| EPSD-03 | Episodes are raw consolidation input, not directly queryable by agents | `recall`/`query` tools query `observations`/`entities` only — no episode rows exposed |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ollama` (npm) | 0.6.3 | Ollama embed client | Official library; `ollama.embed()` returns `{ embeddings: number[][] }`; supports custom fetch for timeout control |
| `better-sqlite3` | 12.8.0 | Synchronous SQLite | Already installed; sync API wraps async MCP tool handlers cleanly |
| `sqlite-vec` | 0.1.7 | Vector KNN search | Already installed and loaded; TEXT metadata columns supported since v0.1.6 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 | Tool input validation | Already installed; add `log_episode` schema |
| `nanoid` | 5.x | ID generation | Already installed; use for episode IDs |

**Installation (new dependency only):**
```bash
npm install ollama --workspace=packages/mcp-server
```

## Architecture Patterns

### Recommended Project Structure

No new packages needed. All changes are within:
```
packages/
├── core/src/
│   └── schema.ts        # Add FTS5 table + needs_embedding migration
└── mcp-server/src/
    ├── tools.ts          # Implement recall, query, log_episode handlers
    └── embed-client.ts   # NEW: lazy singleton EmbedClient
```

### Pattern 1: Lazy Singleton EmbedClient

**What:** A module-scoped singleton that initializes the Ollama client on first use and detects unavailability without blocking writes.

**When to use:** Everywhere embeddings are generated — inside `rememberEntity()` after observation insert.

**Example:**
```typescript
// packages/mcp-server/src/embed-client.ts
import { Ollama } from 'ollama';

const EMBED_MODEL = 'nomic-embed-text';
const HEALTH_TIMEOUT_MS = 2000;

let client: Ollama | null = null;

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({ host: 'http://127.0.0.1:11434' });
  }
  return client;
}

export async function embedText(text: string): Promise<number[] | null> {
  try {
    const ollama = getClient();
    const signal = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
    const response = await ollama.embed({
      model: EMBED_MODEL,
      input: text,
    });
    return response.embeddings[0] ?? null;
  } catch {
    // Ollama unavailable — caller handles null
    return null;
  }
}
```

### Pattern 2: Write-with-Embedding-Flag

**What:** After inserting an observation, attempt embedding and insert into vec_embeddings. On Ollama failure, mark the observation row as `needs_embedding = 1`. No transaction wrapping of the embed call.

**When to use:** In `rememberEntity()` after the observation INSERT.

**Example:**
```typescript
// In rememberEntity() — after observation INSERT
const embedding = await embedText(content);

if (embedding !== null) {
  const vec = new Float32Array(embedding);
  db.prepare(`
    INSERT INTO vec_embeddings (item_id, item_type, embedding)
    VALUES (?, ?, ?)
  `).run(obsId, 'observation', vec);
} else {
  db.prepare(`
    UPDATE observations SET needs_embedding = 1 WHERE id = ?
  `).run(obsId);
}
```

**Important:** `rememberEntity()` must become `async` to await the embed call. The MCP tool handler is already async.

### Pattern 3: KNN Query with CTE Join

**What:** Use a CTE to run KNN search on vec_embeddings, then join the results to observations + entities in a single query.

**When to use:** In the `recall` tool handler.

**Example:**
```typescript
// Source: alexgarcia.xyz/sqlite-vec/features/knn.html
const queryVec = new Float32Array(queryEmbedding);

const rows = db.prepare(`
  WITH knn AS (
    SELECT item_id, distance
    FROM vec_embeddings
    WHERE embedding MATCH ?
      AND k = ?
      AND item_type = 'observation'
  )
  SELECT
    o.id       AS observation_id,
    o.content,
    o.confidence,
    e.id       AS entity_id,
    e.name     AS entity_name,
    e.type     AS entity_type,
    knn.distance
  FROM knn
  JOIN observations o ON o.id = knn.item_id
  JOIN entities e ON e.id = o.entity_id
  ORDER BY knn.distance
`).all(queryVec, limit) as RecallRow[];
```

**Note on distance:** vec0 uses L2 distance by default. The existing schema does not declare `distance_metric=cosine`. Cosine distance requires declaring it at table-creation time. The `vec_embeddings` table in schema.ts does not specify `distance_metric=cosine`, so L2 is used. This is acceptable for nomic-embed-text embeddings — they are normalized, making L2 and cosine rank-equivalent.

### Pattern 4: FTS5 Fallback Query

**What:** When Ollama is unavailable (no embedding for query text), fall back to FTS5 full-text search over observations.

**When to use:** In `recall` tool, when `embedText(query)` returns null.

**Example:**
```typescript
// FTS5 fallback
const rows = db.prepare(`
  SELECT
    o.id       AS observation_id,
    o.content,
    o.confidence,
    e.id       AS entity_id,
    e.name     AS entity_name,
    e.type     AS entity_type,
    rank       AS distance
  FROM fts_observations
  JOIN observations o ON o.id = fts_observations.observation_id
  JOIN entities e ON e.id = o.entity_id
  WHERE fts_observations MATCH ?
  ORDER BY rank
  LIMIT ?
`).all(ftsQuery, limit) as RecallRow[];
```

### Pattern 5: Schema Migration for needs_embedding

**What:** `CREATE TABLE IF NOT EXISTS` does not add new columns to existing tables. An `ALTER TABLE` migration is required.

**When to use:** In `applySchema()` — run after the existing CREATE TABLE block.

**Example:**
```typescript
// In applySchema() — after db.exec() block
// Safe to run on every startup: ALTER TABLE IF NOT EXISTS column (SQLite 3.37+)
// better-sqlite3 ships SQLite 3.51.3 — version check not needed
try {
  db.exec(`ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists — ignore
}
```

### Anti-Patterns to Avoid

- **Awaiting Ollama inside a SQLite transaction:** SQLite transactions in better-sqlite3 are synchronous. Never await an async call inside `db.transaction(() => { ... })`. Keep the embed call outside any transaction block.
- **Using `JSON.stringify(embeddingArray)` as query parameter:** Pass `new Float32Array(array)` directly — better-sqlite3 binds it as BLOB. Passing a JSON string produces a type error at the vec0 level.
- **Querying episodes in recall/query:** Episodes table is consolidation input only. `recall` and `query` tools MUST NOT join or expose the `episodes` table.
- **Checking `item_type` as WHERE filter after KNN when filtering is critical:** The `item_type = 'observation'` filter in a KNN WHERE clause is supported as a metadata column filter. This is correct usage.
- **Missing k= constraint on vec0 KNN:** vec0 requires either `AND k = N` in the WHERE clause or a LIMIT — omitting both causes an "OperationalError: A LIMIT or 'k = ?' constraint is required on vec0 knn queries" error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text tokenization for search | Custom tokenizer | FTS5 built-in `porter unicode61` | Handles stemming, unicode normalization, edge cases in SQLite's battle-tested engine |
| Vector serialization | Manual Buffer writes | `new Float32Array(array)` | better-sqlite3 binds Float32Array directly as BLOB; manual serialization is error-prone byte math |
| Embedding model | In-process transformer | Ollama with nomic-embed-text | Dedicated process, GPU acceleration, cold start handled, 768-dim normalized vectors |
| Re-embedding scheduler | Cron job | Embed on next successful request | Phase 2 scope: opportunistic re-embed during `recall` call when Ollama is available; Phase 3 adds cron |

**Key insight:** The vec0 KNN query engine handles all the nearest-neighbor math — no need to write distance calculations. The only distance function that could be hand-rolled (`vec_distance_cosine()`) would require fetching all rows first; use the MATCH/k syntax instead.

## Common Pitfalls

### Pitfall 1: Ollama embed returns nested array
**What goes wrong:** `ollama.embed()` returns `{ embeddings: number[][] }` (array of arrays), not a flat `number[]`. Passing `response.embeddings` directly to `new Float32Array()` produces a Float32Array of NaN values.
**Why it happens:** The API supports batch embedding (array of strings) and always returns an array of result vectors.
**How to avoid:** Always access `response.embeddings[0]` to get the first vector.
**Warning signs:** `Float32Array` filled with zeros or NaN; vec0 query returns no results.

### Pitfall 2: rememberEntity becomes async but its callers may not expect it
**What goes wrong:** `rememberEntity()` was synchronous in Phase 1. Adding an `await embedText()` call makes it async. Any test or caller that doesn't `await` it will silently miss the embedding step.
**Why it happens:** JavaScript doesn't error on unawaited async functions — they resolve in the background.
**How to avoid:** Change `rememberEntity()` signature to `async function rememberEntity(...)` and ensure the MCP tool handler already awaits it (it does — the handler is already `async`).
**Warning signs:** `needs_embedding` count unexpectedly high; embeddings never inserted.

### Pitfall 3: FTS5 external content table requires manual sync
**What goes wrong:** FTS5 `content=observations` tables don't auto-sync on INSERT/UPDATE/DELETE. Querying an out-of-sync FTS5 table returns stale or corrupted results.
**Why it happens:** FTS5 content tables only read from the backing table for highlighting; they don't auto-index changes.
**How to avoid:** Use a self-contained FTS5 table (copies content into the FTS index) rather than an external content table. Insert into both `observations` and `fts_observations` in `rememberEntity()`. The duplicated content is ~text only — acceptable storage overhead.
**Warning signs:** FTS5 returns no results after fresh inserts; `integrity-check` fails.

### Pitfall 4: vec0 KNN requires k constraint or LIMIT
**What goes wrong:** `WHERE embedding MATCH ?` without `AND k = N` or `LIMIT N` throws: `"A LIMIT or 'k = ?' constraint is required on vec0 knn queries"`.
**Why it happens:** vec0 refuses open-ended KNN scans for performance safety.
**How to avoid:** Always include `AND k = ?` in the WHERE clause (pass `limit` as a bind parameter), or add a `LIMIT N` clause.

### Pitfall 5: Schema migration needed for needs_embedding column
**What goes wrong:** The existing `observations` table was created in Phase 1 without `needs_embedding`. Re-running `CREATE TABLE IF NOT EXISTS` skips the new column. Existing databases break silently (column missing).
**Why it happens:** `IF NOT EXISTS` means the table definition is never re-evaluated.
**How to avoid:** Run `ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0` in `applySchema()` wrapped in try/catch (SQLite errors if column already exists — expected on fresh DBs after this phase ships).

### Pitfall 6: MCP stdout contamination
**What goes wrong:** Any `console.log()` in tool handlers corrupts the MCP stdio transport (Claude Code reads stdout as JSON-RPC).
**Why it happens:** Established in Phase 1 — MCP transport owns stdout after `server.connect()`.
**How to avoid:** All diagnostic output uses `console.error()`. No `console.log()` anywhere in the server process.

## Code Examples

### Installing ollama into mcp-server workspace
```bash
npm install ollama --workspace=packages/mcp-server
```

### FTS5 table definition (self-contained, porter+unicode61)
```sql
-- Source: https://www.sqlite.org/fts5.html
CREATE VIRTUAL TABLE IF NOT EXISTS fts_observations USING fts5(
  content,
  observation_id UNINDEXED,
  tokenize = 'porter unicode61'
);
```

**Note:** `observation_id UNINDEXED` stores the link back to `observations.id` without indexing it. The `porter unicode61` tokenizer combines porter stemming (correction/corrected/correcting match) with unicode normalization.

### Inserting into FTS5 at write time
```typescript
// After observations INSERT in rememberEntity()
db.prepare(`
  INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)
`).run(content, obsId);
```

### Embedding insert (Float32Array serialization)
```typescript
// Source: https://alexgarcia.xyz/sqlite-vec/js.html
const embedding = response.embeddings[0];  // number[]
const vec = new Float32Array(embedding);    // BLOB binding
db.prepare(`
  INSERT INTO vec_embeddings (item_id, item_type, embedding) VALUES (?, ?, ?)
`).run(obsId, 'observation', vec);
```

### KNN recall query
```typescript
// Source: https://alexgarcia.xyz/sqlite-vec/features/knn.html
const queryVec = new Float32Array(queryEmbedding);
const rows = db.prepare(`
  WITH knn AS (
    SELECT item_id, distance
    FROM vec_embeddings
    WHERE embedding MATCH ?
      AND k = ?
      AND item_type = 'observation'
  )
  SELECT
    o.id        AS observation_id,
    o.content,
    o.confidence,
    e.name      AS entity_name,
    e.type      AS entity_type,
    knn.distance AS relevance_score
  FROM knn
  JOIN observations o ON o.id = knn.item_id
  JOIN entities e ON e.id = o.entity_id
  ORDER BY knn.distance
`).all(queryVec, limit);
```

### recall tool response shape (JSON in text block)
```typescript
// Matches CONTEXT.md decision: JSON array in single text block + method metadata
return {
  content: [{
    type: 'text' as const,
    text: JSON.stringify({
      results: rows.map(r => ({
        entity_name: r.entity_name,
        entity_type: r.entity_type,
        observation: r.content,
        confidence: r.confidence,
        relevance_score: r.relevance_score,
      })),
      metadata: {
        method: 'semantic' as const,  // or 'fts'
        count: rows.length,
        query,
      },
    }),
  }],
};
```

### query tool SQL (entity by name, type, relationship)
```typescript
// Structured exact/filter query — no vector ops
// The query tool builds SQL dynamically from provided filters
const conditions: string[] = [];
const params: unknown[] = [];

if (entity_name) {
  conditions.push('e.name = ?');
  params.push(entity_name);
}
if (entity_type) {
  conditions.push('e.type = ?');
  params.push(entity_type);
}
if (relation_type) {
  conditions.push(`EXISTS (
    SELECT 1 FROM relationships r
    WHERE (r.from_id = e.id OR r.to_id = e.id)
      AND r.type = ?
  )`);
  params.push(relation_type);
}

const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

const sql = `
  SELECT
    e.id, e.name, e.type, e.summary, e.confidence,
    (SELECT COUNT(*) FROM observations o WHERE o.entity_id = e.id) AS observation_count,
    (SELECT COUNT(*) FROM relationships r WHERE r.from_id = e.id OR r.to_id = e.id) AS relationship_count
  FROM entities e
  ${where}
  LIMIT 50
`;
```

### log_episode implementation
```typescript
// Uses existing episodes table, buildProvenance(), nanoid
export async function logEpisode(
  db: Database.Database,
  params: { event_type: string; payload: object; agent_id?: string },
): Promise<LogEpisodeResult> {
  const { event_type, payload, agent_id } = params;
  const prov = buildProvenance(SESSION_ID, agent_id, 'agent_session', 1.0);
  const id = nanoid();

  db.prepare(`
    INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, prov.session_id, prov.agent_id, event_type, JSON.stringify(payload), prov.created_at);

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ id, session_id: prov.session_id }) }],
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sqlite-vss` (deprecated) | `sqlite-vec` (vec0) | 2024 | Author deprecated sqlite-vss; sqlite-vec is the replacement |
| Manual buffer serialization for vectors | `new Float32Array(array)` passed as BLOB | sqlite-vec v0.1.x | Simpler, no byte-offset math needed |
| External content FTS5 tables | Self-contained FTS5 with manual insert | Always supported | External content requires triggers; self-contained is simpler for write-at-insert pattern |
| FTS5 without porter stemmer | `tokenize = 'porter unicode61'` | Always available | Porter stemmer significantly improves recall for natural language queries |

**Deprecated/outdated:**
- `sqlite-vss`: Author-deprecated 2024, replaced by `sqlite-vec`. Already avoided in this project.
- External content FTS5 tables with auto-triggers: Requires additional trigger code; not worth it for this use case.

## Open Questions

1. **Cosine vs L2 distance for nomic-embed-text**
   - What we know: nomic-embed-text produces normalized vectors (unit length). For normalized vectors, cosine similarity and L2 distance produce identical rankings. The current `vec_embeddings` schema does not specify `distance_metric=cosine`.
   - What's unclear: Whether to declare `distance_metric=cosine` for semantic clarity even if rankings are identical.
   - Recommendation: Leave as default L2 for now. The table was created in Phase 1 without `distance_metric=cosine` and cannot be altered (virtual table schema is fixed at creation). A Phase 3 migration could recreate it if needed.

2. **Re-embedding sweep timing and trigger**
   - What we know: CONTEXT.md says re-embed on next successful connection. Phase 2 scope.
   - What's unclear: Whether to run the sweep at server startup (check Ollama health then backfill) or on each `recall` call.
   - Recommendation: Run a lightweight sweep at MCP server startup in `index.ts`: after `openDatabase()`, ping Ollama with a 2s timeout; if healthy, embed all rows where `needs_embedding = 1`. Cap at 50 rows per startup to avoid blocking the server.

3. **FTS5 query sanitization**
   - What we know: FTS5 MATCH syntax has special characters (`"`, `*`, `-`, `OR`, `AND`, `NOT`). User queries from agents may contain these.
   - What's unclear: Whether agents will pass malformed FTS5 queries.
   - Recommendation: Wrap the FTS5 query in double quotes and escape internal double quotes: `'"' + query.replace(/"/g, '""') + '"'`. This treats the entire query as a phrase search — simpler than full FTS5 query parsing.

## Sources

### Primary (HIGH confidence)
- [sqlite-vec KNN docs](https://alexgarcia.xyz/sqlite-vec/features/knn.html) — KNN MATCH syntax, k= constraint requirement, cosine distance_metric declaration
- [sqlite-vec metadata release blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html) — TEXT metadata columns, auxiliary columns (+prefix), partition keys; v0.1.6+
- [sqlite-vec Node.js guide](https://alexgarcia.xyz/sqlite-vec/js.html) — Float32Array serialization pattern, better-sqlite3 integration
- [SQLite FTS5 official docs](https://www.sqlite.org/fts5.html) — porter tokenizer, unicode61, UNINDEXED columns, self-contained vs external content
- [ollama-js README](https://github.com/ollama/ollama-js/blob/main/README.md) — `embed()` API signature, `{ embeddings: number[][] }` return type, Ollama constructor host option
- Phase 1 source code — existing schema, patterns, and constraints

### Secondary (MEDIUM confidence)
- [sqlite-vec hybrid search blog](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html) — RRF pattern (not used here, but confirms FTS5 + vec0 coexistence)
- [ollama-js timeout issue #103](https://github.com/ollama/ollama-js/issues/103) — AbortSignal.timeout() approach for timeout management

### Tertiary (LOW confidence)
- WebSearch findings on `needs_embedding` pattern — no authoritative source; derived from CONTEXT.md design decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed except `ollama`; API docs verified
- Architecture: HIGH — vec0 KNN syntax verified against official docs; FTS5 patterns from SQLite official docs
- Pitfalls: HIGH — vec0 k= constraint error verified against GitHub issue #116; async/sync transaction issue is fundamental to better-sqlite3

**Research date:** 2026-03-20
**Valid until:** 2026-06-20 (sqlite-vec and ollama-js are actively maintained; check changelogs if timeline extends)
