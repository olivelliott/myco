# Technology Stack — v5.0 Feature Parity & Differentiation

**Project:** Myco
**Milestone:** v5.0 — Import/Export, Temporal Versioning, Auto-Extraction, Dedup, Incremental Consolidation, Codebase Ingestion, Memory Decay, Relationship Strength
**Researched:** 2026-03-27
**Overall Confidence:** HIGH for core additions; MEDIUM for entity extraction library choice (alternatives exist with different tradeoffs)

---

## Context: What's Already Validated

The following stack is in production across all 4 packages — do NOT re-research:

| Technology | Installed Version | Role |
|------------|------------------|------|
| Node.js | 22.x LTS | Runtime |
| TypeScript | 5.9 | Language |
| better-sqlite3 | 12.8.0 | SQLite database |
| sqlite-vec | 0.1.7 | Vector similarity search |
| ollama (npm) | 0.6.3 | Embedding client |
| Vercel AI SDK | 4.3.19 | LLM consolidation (ai + ollama-ai-provider 1.2.0) |
| Hono | 4.x | REST API server |
| MCP SDK | 1.27.1 | MCP protocol |
| Zod | 4.3.6 | Schema validation |
| croner | 10.0.1 | Cron scheduler |
| nanoid | 5.x | ID generation |
| React 19 / Vite 8 / Tailwind v4 / shadcn/ui | current | Dashboard PWA |
| graphology + louvain | 0.26.0 | Graph algorithms (dashboard) |

This research covers **only what must be added** for v5.0 new capabilities.

---

## Feature 1: Temporal Fact Versioning

**What's needed:** Store when facts changed, support "what was true at time X" queries.

### Recommendation: Pure SQLite schema design — no new library

**Rationale:** Temporal versioning in SQLite is a schema pattern, not a library problem. The standard approach is an `observation_history` table (or `valid_from` / `valid_to` columns on observations) with a partial index on current records:

```sql
-- Migration: add temporal columns to observations
ALTER TABLE observations ADD COLUMN valid_from TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE observations ADD COLUMN valid_to TEXT;  -- NULL = currently valid
CREATE INDEX idx_observations_valid_from ON observations(valid_from);
CREATE INDEX idx_observations_current ON observations(entity_id) WHERE valid_to IS NULL;
```

**Query pattern:** Point-in-time queries use `WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)`. No external library handles this better than raw SQL on the existing better-sqlite3 connection. Adding a separate temporal DB library (Datomic-style, XTDB) would violate the local-SQLite constraint.

**Migration strategy:** On observation update, mark old row `valid_to = now()`, insert new row with `valid_from = now()`. The current "latest" query adds `WHERE valid_to IS NULL`.

**No new npm dependency needed.**

---

## Feature 2: Auto-Entity Extraction (Passive Knowledge Capture)

**What's needed:** Parse agent conversation text to extract entities (people, places, tech, concepts) without explicit `remember` calls.

### Recommendation: Use existing Vercel AI SDK `generateObject` with Ollama — no new library

**Rationale:** The codebase already uses `ai` + `ollama-ai-provider` for consolidation LLM calls. The extraction problem maps directly onto `generateObject` with a Zod schema:

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const ExtractionSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    type: z.enum(['person', 'technology', 'project', 'concept', 'organization', 'place']),
    observations: z.array(z.string()),
  })),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.string(),
  })),
});

const { object } = await generateObject({
  model: ollamaProvider(config.consolidationModel),
  schema: ExtractionSchema,
  prompt: `Extract entities and relationships from: "${text}"`,
});
```

**Why not a dedicated NLP library:**
- `compromise` (v14.15.0) is English-only, rule-based, no custom entity types, misses tech-specific entities ("Hono", "sqlite-vec", "React Server Components"). LOW accuracy for technical conversations.
- `wink-nlp` is faster but same problem — no domain knowledge about software, frameworks, or agent-specific concepts.
- `natural` is unmaintained for NER.
- LLM extraction via `generateObject` handles domain-specific entities correctly, understands context, and uses the same local Ollama instance already running. The model knows what "better-sqlite3" is; a rule-based NER system does not.

**Performance note:** Extraction is async and can be queued. Use `p-limit` (already a transitive dependency) to cap concurrent LLM calls to 2-3. Do NOT block the MCP tool call waiting for extraction — run it as a fire-and-forget async job with error isolation.

**No new npm dependency needed.** The extraction pipeline is a new `AutoExtractor` class in `@myco/mcp-server`, not a new package.

---

## Feature 3: Codebase-to-Graph Ingestion (`codify` tool)

**What's needed:** Parse project files (TypeScript/JS primarily) to extract file structure, exports, imports, function signatures, class hierarchies into graph knowledge.

### Recommendation: TypeScript Compiler API (built-in `typescript` package) + `fast-glob`

**Rationale:**

The TypeScript compiler API (`ts.createProgram`, `ts.createSourceFile`) is the most accurate TypeScript AST parser available — it is the TypeScript compiler itself. It handles generics, decorators, type aliases, and all TypeScript-specific syntax correctly. It is already a dev dependency in the monorepo (`typescript: ~5.9.0`).

For non-TypeScript files (Python, Go, Markdown, config files), a lightweight fallback using regex-based extraction is sufficient — the goal is graph nodes for file relationships, not deep semantic analysis.

`fast-glob` (v3.3.3, 10K+ projects using it) handles file discovery efficiently with `.gitignore` pattern support.

```bash
# In packages/mcp-server
npm install fast-glob
```

**Why not tree-sitter:**
- `tree-sitter` npm package (v0.25.x) requires native Node.js bindings compiled against a specific Node ABI. In an MCP server context, native addons complicate distribution and increase install friction for end users.
- The npm package is at v0.25 while tree-sitter core is at v0.26.5 — there is a tracked version gap issue (#5334 on GitHub) and v0.26 requires Node 24 for native bindings.
- `web-tree-sitter` (v0.26.6, WASM-based) avoids the native binding issue but adds a 5-10MB WASM payload and async initialization complexity for what is essentially a background batch job.
- For TypeScript/JavaScript — the dominant languages in this project's use case — the TypeScript Compiler API is strictly better than tree-sitter because it has full semantic understanding, not just syntax trees.

**Why `fast-glob` over Node's built-in `fs.glob`:** Node 22's `fs.glob` is still experimental (added in Node 22.13). `fast-glob` v3.3.3 is stable, has `.gitignore` integration via `fast-glob`'s cwd option, and is already a transitive dependency via Vite.

**Integration pattern:**
```typescript
import fg from 'fast-glob';
import ts from 'typescript';

// Discover files
const files = await fg(['**/*.ts', '**/*.tsx', '!**/node_modules/**', '!**/dist/**'], { cwd: projectRoot });

// Parse each file
for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  // Visit nodes: ts.SyntaxKind.ImportDeclaration, ClassDeclaration, FunctionDeclaration, etc.
}
```

**New dependencies:**
```bash
# packages/mcp-server
npm install fast-glob
```

`typescript` is already a devDependency — import it as a dependency for the runtime codify tool.

---

## Feature 4: Auto-Dedup / Conflict Resolution

**What's needed:** When new memories arrive, detect if they conflict with or duplicate existing entities/observations, then decide ADD/UPDATE/DELETE/NOOP.

### Recommendation: Existing `sqlite-vec` cosine similarity + Vercel AI SDK `generateObject` — no new library

**Rationale:** This is already partially implemented in the consolidation pipeline. The full dedup flow is:

1. **Embedding similarity** (existing sqlite-vec): Find candidate duplicates where cosine similarity > 0.92 threshold.
2. **LLM resolution** (existing Vercel AI SDK): Pass candidate pairs to `generateObject` with a conflict resolution schema to decide ADD/UPDATE/DELETE/NOOP + rationale.
3. **Confidence routing** (existing approval queue): High-confidence resolutions auto-apply; low-confidence go to approval queue.

The existing `ConsolidationPipeline` in `@myco/mcp-server` already implements a version of this. The v5.0 work is extending it to run incrementally (see Feature 5), not adding new libraries.

**No new npm dependency needed.**

---

## Feature 5: Incremental Consolidation

**What's needed:** Run consolidation on-the-fly as memories are added, not just nightly. The nightly cycle handles deep analysis; incremental handles immediate dedup/conflict.

### Recommendation: `p-queue` for job throttling — one new dependency

**Rationale:** Incremental consolidation means every `remember` call potentially triggers an async LLM check. Without throttling, concurrent LLM calls stack up and overwhelm Ollama. `p-queue` (by Sindresorhus, 10M+ weekly downloads) provides a promise queue with concurrency control:

```typescript
import PQueue from 'p-queue';
const consolidationQueue = new PQueue({ concurrency: 1, timeout: 30000 });
consolidationQueue.add(() => runIncrementalConsolidation(entityId));
```

**Why not `p-limit`:** `p-limit` caps concurrent promises but has no queue. When the MCP server receives rapid-fire `remember` calls, `p-limit` drops excess; `p-queue` serializes them. Serialization is correct for incremental consolidation where order matters (entity A must be processed before checking if entity B is a duplicate).

**Version:** p-queue v8.1.0 (latest, ESM-only, compatible with Node.js 22 and the monorepo's `"type": "module"` setting).

```bash
# packages/mcp-server
npm install p-queue
```

---

## Feature 6: Import / Export

**What's needed:** JSON export of the entire knowledge graph; import from Mem0 and reference server formats.

### Recommendation: Custom serialization using existing better-sqlite3 — no new library

**Rationale:** The export format should be Myco's own JSON schema (simple and documented), with adapters for Mem0's format. This is straightforward data transformation:

**Myco export format (v1):**
```json
{
  "version": "1",
  "exported_at": "ISO8601",
  "entities": [...],
  "observations": [...],
  "relationships": [...],
  "episodes": [...]
}
```

**Mem0 import adapter:** Mem0's export format uses a `"memories"` array with `{ id, content, metadata, created_at }` properties. Map each memory to a Myco entity + observation. This is ~50 lines of TypeScript, not a library.

**Reference server import adapter:** The Anthropic reference memory server stores data as JSONL with `{ type: "entity"|"relation", ... }` lines. Parse with Node's readline stream.

**Why not a formal serialization library (protobuf, avro, etc.):** The knowledge graph is a few thousand records at most for a single-user local tool. JSON + SQLite transactions handle the full export/import cycle in seconds. Formal serialization formats add complexity without benefit at this scale.

**New REST endpoints on existing Hono server:** `GET /export` and `POST /import` — no new routing library needed.

**No new npm dependency needed.**

---

## Feature 7: Memory Importance Decay

**What's needed:** Unreinforced facts fade over time; importance score decreases if an entity/observation is never recalled.

### Recommendation: Pure SQL via scheduled job — no new library

**Rationale:** The Ebbinghaus forgetting curve formula is well-understood and implementable as a SQL UPDATE:

```sql
-- Run during nightly consolidation cycle (already scheduled via croner)
UPDATE observations
SET importance = importance * exp(-0.16 * (1 - importance * 0.8) * julianday('now') - julianday(created_at))
WHERE julianday('now') - julianday(last_accessed_at) > 7
  AND importance > 0.1;  -- floor to avoid full decay
```

**Schema addition needed:** `importance REAL DEFAULT 1.0` and `last_accessed_at TEXT` columns on observations. The existing recall path updates `last_accessed_at` on retrieval, resetting the decay clock.

The `YourMemory` MCP server confirmed this exact formula pattern works well for MCP memory servers (DEV Community article, 2025).

**Why not a specialized decay/spaced-repetition library:** Libraries like `ts-fsrs` (FSRS algorithm) are designed for flashcard scheduling with explicit user feedback signals. Myco's decay is passive and automated — no user feedback loop. A pure SQL exponential decay with a recency floor is the right level of complexity.

**No new npm dependency needed.**

---

## Feature 8: Relationship Strength Scoring

**What's needed:** Edges in the knowledge graph weighted by reinforcement frequency (how often a relationship is observed) and recency (recent observations count more).

### Recommendation: Pure SQL + existing sqlite schema — no new library

**Rationale:** Relationship strength is a derived metric updated on the existing `relationships` table:

```sql
ALTER TABLE relationships ADD COLUMN strength REAL NOT NULL DEFAULT 1.0;
ALTER TABLE relationships ADD COLUMN observation_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE relationships ADD COLUMN last_reinforced_at TEXT;
```

**Strength formula on reinforcement:**
```typescript
// Called when a duplicate/confirming relationship is found during consolidation
const daysSince = (Date.now() - new Date(relationship.last_reinforced_at).getTime()) / 86400000;
const recencyWeight = Math.exp(-0.1 * daysSince);  // Decay factor for time since last reinforcement
const newStrength = Math.min(1.0, (relationship.strength * 0.9) + (0.1 * recencyWeight));
```

This combines frequency (each reinforcement increments `observation_count`) with recency (exponential decay on the gap since last reinforcement). The formula is a standard weighted moving average with a time discount — no library needed.

**Dashboard integration:** `react-force-graph-2d` already supports `link.value` as edge weight for rendering thickness. Pass `relationship.strength` as `link.value`.

**No new npm dependency needed.**

---

## REST API for Non-MCP Access

**What's needed:** HTTP API for LangGraph, CrewAI, and other non-Claude clients to access memory operations.

### Recommendation: Extend existing Hono server — no new library

The `@myco/api-server` package already runs Hono on port 3001 with 5 route groups. New endpoints (`POST /memories`, `GET /memories/search`, `POST /extract`, `GET /graph`) extend the existing Hono router. The MCP tools and the REST API should share the same underlying service layer in `@myco/core`.

**No new npm dependency needed.**

---

## Complete New Dependencies for v5.0

| Library | Version | Purpose | Package | Justification |
|---------|---------|---------|---------|---------------|
| `fast-glob` | 3.3.3 | File discovery for `codify` tool | `@myco/mcp-server` | No native bindings, stable, .gitignore aware |
| `p-queue` | 8.1.0 | Incremental consolidation job queue | `@myco/mcp-server` | Serializes async LLM jobs; p-limit insufficient |

**That's it. Two new dependencies for all 8 features.**

Everything else is schema migrations, new TypeScript classes/functions using the existing stack, and SQL patterns.

---

## What NOT to Add

| Library | Why Not | What to Use Instead |
|---------|---------|-------------------|
| `tree-sitter` (native npm) | Native Node.js bindings required; v0.25 ≠ v0.26 core; v0.26 requires Node 24; distribution friction for MCP server | TypeScript Compiler API (`typescript` package already present) |
| `web-tree-sitter` | 5-10MB WASM payload + async initialization; overkill for TypeScript AST parsing | TypeScript Compiler API |
| `compromise` (NLP) | English-only, rule-based, no awareness of tech-specific entities; LOW accuracy for software/agent conversations | LLM `generateObject` via existing Vercel AI SDK |
| `wink-nlp` | Same rule-based limitations as compromise; adds ~8MB model download | LLM `generateObject` |
| `natural` | Effectively unmaintained for NER use cases | LLM `generateObject` |
| `ts-fsrs` / spaced-repetition libraries | Designed for explicit user feedback (flashcard review); Myco decay is passive/automated | SQL exponential decay formula |
| XTDB / Datomic patterns (bitemporal DB) | Full separate process or library dependency; violates local-SQLite constraint | SQLite schema with `valid_from`/`valid_to` columns |
| `p-limit` (for consolidation queue) | Drops excess work rather than serializing it; incorrect behavior for ordered consolidation jobs | `p-queue` (serializes, doesn't drop) |
| `drizzle-orm` | Adds query builder complexity; raw SQL prepared statements already validated in production | Raw SQL via better-sqlite3 + prepared statement factory |
| Any cloud vector DB (Pinecone, Weaviate) | Violates local-only constraint | sqlite-vec (already in use) |
| `ai-sdk-ollama` v3.x | Requires Vercel AI SDK v6; project is locked to v4.3.19 due to `ollama-ai-provider` v1.x compatibility | Continue using `ollama-ai-provider` v1.2.0 with `ai` v4.3.19 |

---

## Schema Migrations Required (No New Libraries)

These are SQLite `ALTER TABLE` migrations, not library additions. List here for completeness:

| Table | New Columns | Feature |
|-------|-------------|---------|
| `observations` | `valid_from TEXT`, `valid_to TEXT`, `importance REAL DEFAULT 1.0`, `last_accessed_at TEXT` | Temporal versioning + decay |
| `relationships` | `strength REAL DEFAULT 1.0`, `observation_count INTEGER DEFAULT 1`, `last_reinforced_at TEXT` | Relationship strength |
| `entities` | No new columns needed | — |
| New table: `observation_history` (optional) | Full row snapshots for audit trail | Temporal versioning (alternative to valid_from/valid_to) |

**Migration delivery pattern:** Continue using the existing startup `try/catch ALTER TABLE` pattern in `schema.ts`. No migration runner library needed at this scale.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|----------------|-------|
| `fast-glob@3.3.3` | Node.js 18+, ESM | Stable; last release Jan 2025; 10K+ dependents; no breaking changes expected |
| `p-queue@8.1.0` | Node.js 18+, ESM-only | Uses ESM; compatible with `"type": "module"` in all 4 packages |
| TypeScript Compiler API (via `typescript@5.9`) | Already installed | `ts.createSourceFile` is stable public API; no version risk |
| Vercel AI SDK `generateObject` | Existing `ai@4.3.19` + `ollama-ai-provider@1.2.0` | Entity extraction reuses existing LLM call infrastructure; no upgrade needed |
| `p-queue@8.x` vs `p-limit` (transitive) | Both can coexist | Different packages; no conflict |

---

## Architectural Notes

**Where new code lives:**

- `@myco/core` — Schema migrations, new column types, `ObservationHistory` table helpers, decay/strength SQL queries as prepared statements
- `@myco/mcp-server` — `AutoExtractor` class (LLM-based extraction), `IncrementalConsolidator` class (p-queue + existing consolidation pipeline), `CodebaseIngester` class (TypeScript compiler API + fast-glob), new `codify` MCP tool
- `@myco/api-server` — `/export`, `/import`, extended `/memories` endpoints on existing Hono router
- `@myco/dashboard` — Relationship strength as `link.value` in force graph (existing react-force-graph-2d prop), temporal timeline filter in graph explorer (existing slider UI)

**Critical integration constraint:** Incremental consolidation must NOT block MCP tool responses. The `remember` tool should return immediately, then fire-and-forget into the `p-queue`. Use `setImmediate` or `process.nextTick` to ensure the MCP response returns before consolidation work begins.

**Vercel AI SDK version lock:** Do NOT upgrade `ai` or `ollama-ai-provider` in v5.0. The `ai@4.3.19` + `ollama-ai-provider@1.2.0` combination is validated. `ai-sdk-ollama@3.x` requires AI SDK v6, which dropped `LanguageModelV1` — the interface `ollama-ai-provider` v1.x returns. This constraint was explicitly documented in PROJECT.md.

---

## Sources

- TypeScript wiki: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API — `createProgram`, `createSourceFile` API confirmed stable
- GitHub: tree-sitter/tree-sitter issue #5334 — npm package v0.25 gap vs v0.26 core; Node 24 requirement for v0.26 native bindings (MEDIUM confidence — GitHub issue thread, March 2026)
- npm: fast-glob — v3.3.3, last published January 5, 2025, confirmed stable
- npm: p-queue — v8.1.0, ESM-only, sindresorhus, 10M+ weekly downloads
- Vercel AI SDK docs: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data — `generateObject` with Zod schema confirmed
- DEV Community: "I built memory decay for AI agents using the Ebbinghaus forgetting curve" (2025) — confirms decay formula pattern for MCP memory servers
- GitHub: sgomez/ollama-ai-provider — v1.2.0 confirmed; ai-sdk-ollama v3.x requires AI SDK v6 (incompatible with current stack)
- WebSearch: Mem0 export format — `{ memories: [{ id, content, metadata, created_at }] }` JSON schema confirmed
- SQLite documentation: `julianday()` function for date arithmetic — confirmed for decay calculations
- npm: compromise — v14.15.0 current; English-only limitation confirmed; LOW confidence for technical entity extraction

---

*Stack research for: Myco v5.0 Feature Parity & Differentiation*
*Researched: 2026-03-27*
