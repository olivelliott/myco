# Feature Landscape: v5.0 Feature Parity & Differentiation

**Domain:** Local-first MCP memory server — knowledge graph, agent memory, temporal facts, REST API
**Researched:** 2026-03-27
**Milestone:** v5.0 Feature Parity & Differentiation
**Confidence:** HIGH (codebase audit + multi-source competitive research: Mem0, Zep/Graphiti, mcp-memory-service, Neo4j agent-memory)

---

## Context: What Already Exists (Do Not Re-Implement)

Before categorizing the nine target features, this is what Myco already ships as of v4.0:

| Capability | Where |
|------------|-------|
| `remember` / `recall` / `query` / `forget` / `log_episode` / `consolidate` / `list_pending_approvals` / `resolve_approval` MCP tools | `packages/mcp-server/src/tools.ts` |
| Semantic search via sqlite-vec KNN + FTS5 fallback | `tools.ts recallKnowledge()` |
| Auto-relationship discovery (name mention + semantic similarity) | `relationship-discovery.ts` |
| Entity merge detection via Levenshtein + semantic embedding in consolidation | `consolidator.ts isMergeCandidate()` |
| Nightly 2am consolidation pipeline (episodes → LLM extraction → approval queue) | `consolidator.ts`, `scheduler.ts` |
| Project namespace isolation (nullable `project` column on entities) | `schema.ts`, `tools.ts` |
| Hono REST API on port 3001 with 5 route groups | `packages/api-server/` |
| React PWA dashboard: graph explorer, approval queue, activity feed | `packages/dashboard/` |
| GSD hook for auto-logging phase completions | separate package |
| Prepared statement caching, dotenv config, batch embeddings | `core`, `embed-client.ts` |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any serious memory/knowledge-graph system. Missing = competitive gap, feels incomplete against Mem0 / mcp-memory-service.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **JSON export of full knowledge graph** | Every database tool exports its data. Users need backup, migration, and inspection. Competitive: mcp-memory-service exports to JSON, Mem0 provides API export. | LOW | Single SQLite dump: entities + observations + relationships + metadata as one JSON object. No schema negotiation needed for personal use. |
| **JSON import from export format** | Paired with export — migration, restore from backup, moving between machines. | LOW | Validate schema on load, skip or merge duplicates, log conflicts. Naively trust on import or offer a `--merge` flag. |
| **Import from Anthropic reference server format** | Many users started with the official `@modelcontextprotocol/server-memory` JSONL format. Migration path needed to grow adoption. | MEDIUM | JSONL → entity+observation transform. The reference format stores `{entities: [], relations: []}` per line. Map to Myco's entity+observation+relationship model. |
| **Auto-entity extraction from conversation text** | Mem0 does this. Zep does this. Users expect passive capture — they should not have to manually call `remember` for everything. Explicit `remember` calls are supplemental, not the only path. | HIGH | LLM-based NER + relationship extraction on incoming text. Fits into `log_episode` pipeline: extract entities from episode payload, auto-queue for review or auto-approve above threshold. Requires careful prompt engineering to avoid noise. |
| **Conflict resolution: ADD / UPDATE / NOOP on new memories** | When a new `remember` arrives and an entity already exists with a similar observation, the system should decide intelligently — not blindly append duplicate facts. Mem0's core value proposition is conflict-aware memory management. | HIGH | Classify each new observation: ADD (genuinely new), UPDATE (contradicts existing — supersede), NOOP (duplicate — skip). Embed new content vs existing observations for existing entity; cosine similarity threshold for NOOP gate; LLM call for UPDATE detection. Existing mergeCandidate logic handles entity identity; this is at observation level. |
| **REST API: entity CRUD + recall** | mcp-memory-service ships REST endpoints so LangGraph, CrewAI, and AutoGen can access memory without MCP transport. Any agent framework that is not Claude Code cannot call MCP tools. | MEDIUM | `packages/api-server` already exists with 5 route groups. Need to ensure `POST /entities`, `GET /recall`, `POST /episodes`, `DELETE /entities/:id`, `GET /graph` are all present and OpenAPI-documented. Much may already exist — audit before building. |
| **Memory importance decay scoring** | Without forgetting, the graph grows unboundedly and older irrelevant facts compete equally with current facts in recall. Zep/Graphiti use bi-temporal invalidation; simpler systems use exponential decay. Users expect knowledge to stay current. | MEDIUM | Add `importance` score (0.0–1.0) and `last_accessed_at` timestamp to observations. Decay via: `effective_score = importance * exp(-λ * days_since_access)`. λ tunable per entity type. Decay job runs nightly alongside consolidation. High-importance facts have very slow decay (months). Low-importance facts fade in days. |
| **Relationship strength scoring** | Relationships should carry weight reflecting reinforcement. "TypeScript uses strict mode" mentioned once vs twenty times should have different edge weights for graph queries and visualization. | MEDIUM | Add `strength` (0.0–1.0) and `reinforcement_count` to relationships. Each time a relationship is re-confirmed (same from/to/type), increment count and update strength = min(1.0, count * 0.1 + recency_bonus). Decay similarly to importance. Used in recall ranking and graph edge thickness. |

### Differentiators (Competitive Advantage)

Features that go beyond what competitors offer for a local-first, privacy-preserving MCP memory server.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Temporal fact versioning (bi-temporal)** | Zep uses bi-temporal modeling — facts have `valid_from` / `valid_until`. Myco can go further: query "what did I know about X on date Y?" This is uniquely powerful for developer agents tracking project decisions over time. | HIGH | Add `valid_from` TEXT and `valid_until` TEXT (NULL = currently valid) to observations. When UPDATE conflict is detected, set `valid_until = now` on old observation, insert new observation with `valid_from = now`. Add `as_of` parameter to `recall` and `query` tools for point-in-time queries. Schema migration with safe defaults. |
| **Incremental consolidation (on-write trigger)** | Currently consolidation only happens at 2am or via manual trigger. Waiting up to 24 hours to process episodes means agents operate on stale knowledge. Competing systems (Graphiti) consolidate synchronously or near-synchronously. | HIGH | After every `log_episode`, check if unconsolidated episode count > threshold (e.g., 20) or time since last consolidation > max interval (e.g., 4 hours). If so, queue a lightweight consolidation job. Full nightly run does deep analysis; incremental run does fast fact extraction only. Avoids blocking the MCP tool response — fire the consolidation asynchronously. |
| **Codebase-to-graph ingestion (`codify` tool)** | No MCP memory server currently has native codebase awareness. An agent can call `codify({ path: './packages/core' })` and Myco automatically ingests the package structure, exported functions, dependencies, and key patterns as graph entities. This closes the gap between "project context" in CLAUDE.md and structured memory. | HIGH | Parse TypeScript/JavaScript via ts-morph or TypeScript Compiler API (not full AST — just module-level: exports, imports, class/function names). Create entities for packages, functions, and key conventions. Create relationships: `package uses library`, `function is_part_of package`. Limit scope to surface structure — not line-by-line semantics. |
| **Auto-dedup with configurable merge strategy** | Existing consolidation catches entity-level duplicates via Levenshtein. But observation-level dedup is missing. Agents often store the same fact multiple times across sessions. A dedup sweep can reduce graph noise by 20–40% based on Mem0's benchmarks. | MEDIUM | Scheduled dedup job: for each entity, embed all observations, compute pairwise cosine similarity, mark pairs above threshold (0.95) as duplicates. Keep the higher-confidence one, tombstone the other. Add `dedup_of` reference column for audit trail. Dashboard shows dedup stats. |
| **`extract` MCP tool for passive entity capture** | Complement `remember` with an `extract` tool: agent passes raw conversation text, Myco extracts entities and facts automatically using the consolidation LLM. Agent does not need to identify what to remember — Myco does it. Differentiates from all current MCP memory servers which require explicit tool invocation. | HIGH | Reuse the consolidation LLM pipeline as a single-shot extraction (not batch). Input: raw text. Output: proposed entities + observations, either auto-queued or returned for agent review. Tool completes in <2s for typical conversation snippets (300–500 tokens). Requires fast Ollama model (llama3.2). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full bi-temporal model with transaction time (T' dimension)** | Zep paper describes both valid-time AND transaction-time (when data was ingested vs when it was true). "Complete" temporal audit trail. | Two timestamp dimensions multiplies schema complexity. Transaction time is the `created_at` column Myco already has. Valid time (valid_from/valid_until) is the differentiating dimension. Storing T' separately is academic overkill for a personal memory server. | Ship valid-time only (`valid_from` / `valid_until`). `created_at` serves as transaction time. |
| **Cloud sync / remote backup** | Users want to access memory from multiple machines. | Violates the core local-first constraint. Adds authentication, network dependency, and privacy concerns. Out of scope by project definition. | Export/import JSON for manual transfer. Power users can sync the SQLite file via their own tooling (rsync, Syncthing). |
| **Multi-model embedding support (swap Ollama for OpenAI embeddings)** | Some users prefer OpenAI text-embedding-3-small for quality or want to avoid running Ollama. | Embedding model changes require re-embedding the entire existing vector store. Storing embeddings from different models in the same `vec_embeddings` table produces incorrect similarity scores. Allows dimension mismatches (768 vs 1536). | Keep Ollama + nomic-embed-text as the only embedding path. If OpenAI support is later added, require a full re-embed operation with clear migration tooling. |
| **Real-time WebSocket memory updates in dashboard** | "The dashboard should update live as agents write to memory." | A single-user local tool doesn't need WebSockets. The overhead is real (connection management, reconnect logic) and the value is low (user is unlikely to be watching the dashboard while an agent is running). | Short-interval polling (10s) on dashboard pages that show live data. Already fits the existing TanStack Query pattern. |
| **Natural language to graph query (text-to-Cypher equivalent)** | "Ask Myco a question and it queries the graph." | SQLite does not have Cypher. Text-to-SQL for graph traversals requires LLM calls on every query, is error-prone, and duplicates what `recall` already does semantically. | `recall` (semantic) + `query` (structured filters) together cover the realistic query patterns. Invest in filter expressiveness before adding LLM query translation. |
| **Full RDF / JSON-LD export** | Standards compliance, interoperability with semantic web tools. | RDF + JSON-LD vocabulary alignment requires ontology design decisions (what namespace, what predicates). A personal dev tool does not benefit from W3C semantic web compliance. Adds schema surface area with no user value for the target audience. | Export as opinionated JSON (entity/observation/relationship arrays). Document the schema clearly. Power users who need RDF can build a thin transform on top. |
| **Codebase ingestion via full AST (line-by-line semantics)** | "Index every function, every variable, every comment." | Full AST ingestion of a 50k LOC codebase creates thousands of entities. Graph becomes a code search tool, not a knowledge tool. Noise drowns signal. Recall performance degrades. | Surface-level only: packages, key exports, conventions, dependencies. The CLAUDE.md file + `remember` calls handle the nuanced project knowledge. `codify` is a bootstrap tool, not a continuous sync. |

---

## Feature Dependencies

```
auto-entity extraction (`extract` tool)
    └──requires──> consolidation LLM pipeline (already exists in consolidator.ts)
    └──enhances──> incremental consolidation (extract can trigger immediate processing)

temporal fact versioning
    └──requires──> schema migration: add valid_from / valid_until to observations
    └──requires──> UPDATE conflict detection in memory (auto-dedup/conflict resolution)
    └──enhances──> recall tool (new as_of parameter)
    └──enhances──> graph timeline in dashboard (edges get validity windows)

auto-dedup / conflict resolution (observation level)
    └──requires──> embeddings exist for all observations (pending re-embed queue already exists)
    └──enhances──> temporal fact versioning (UPDATE action sets valid_until on old observation)
    └──requires──> memory importance decay (need scores to decide which duplicate to keep)

memory importance decay
    └──requires──> importance column + last_accessed_at column on observations (schema migration)
    └──enhances──> recall ranking (weight results by effective score)
    └──enhances──> auto-dedup (keep higher-importance observation on dedup)

relationship strength scoring
    └──requires──> strength + reinforcement_count columns on relationships (schema migration)
    └──enhances──> graph visualization (edge thickness in dashboard)
    └──enhances──> recall ranking (stronger relationships score higher in traversal)

codebase-to-graph ingestion (`codify` tool)
    └──requires──> TypeScript Compiler API / ts-morph (new dev dependency)
    └──uses──> existing remember() and relationship creation flow
    └──uses──> project namespace isolation (codify targets a specific project namespace)

incremental consolidation
    └──requires──> nightly consolidation pipeline (already exists)
    └──uses──> consolidation LLM pipeline (reuses same extraction logic)
    └──enhances──> auto-entity extraction (incremental path for extracted entities)

REST API for non-MCP access
    └──partially exists──> packages/api-server (Hono, 5 route groups)
    └──needs──> OpenAPI spec, recall endpoint, entity CRUD verification
    └──enhances──> all features (exposes every new capability to non-Claude agents)

import/export
    └──requires──> stable schema (no pending migrations)
    └──used by──> migration from reference server format
    └──compatible with──> project namespace (export scoped to project or all)
```

### Dependency Notes

- **Temporal versioning requires conflict resolution:** The UPDATE action in conflict resolution is what creates the version trail — without conflict detection, temporal versioning has no mechanism to activate.
- **Conflict resolution requires decay scores:** When deciding which observation to keep during dedup, importance score is the tiebreaker. Build decay before dedup sweep.
- **Incremental consolidation is independent of all schema changes:** It can ship before temporal versioning, decay, or strength scoring.
- **Import/export should ship before temporal versioning:** Exporting during a schema transition risks incomplete data. Ship export when the schema is stable.
- **REST API audit is a prerequisite for external integrations:** Many features (decay background job, dedup sweep, codify) need API exposure. Verify the existing API coverage before building new endpoints.

---

## MVP Definition for v5.0

### Launch With (Core Parity)

These are the features that close competitive gaps and make Myco the credible choice over mcp-memory-service and Mem0 for local-first MCP use:

- [ ] **JSON export / import** — backup, portability, migration. Low effort, high value, unblocks user trust.
- [ ] **Import from Anthropic reference server format** — migration path for users already using the reference JSONL server.
- [ ] **REST API audit + OpenAPI documentation** — verify existing routes cover CRUD + recall; document them; expose to LangGraph/CrewAI users.
- [ ] **Conflict resolution (ADD / UPDATE / NOOP at observation level)** — the core dedup problem. Prevents graph bloat on repeated agent sessions.
- [ ] **Memory importance decay** — keeps the graph fresh; prevents old irrelevant facts from polluting recall results.
- [ ] **Relationship strength scoring** — enriches the graph; enables weighted recall and visual edge thickness.

### Add After Core Parity (Differentiators)

- [ ] **Temporal fact versioning** — requires conflict resolution to be solid first. High architectural value; point-in-time queries unlock historical debugging.
- [ ] **Incremental consolidation** — requires stable consolidation pipeline (already exists). Unblocks faster knowledge formation.
- [ ] **Auto-dedup sweep (scheduled job)** — requires decay + conflict resolution. Cleanup sweep for existing graph noise.
- [ ] **`extract` MCP tool for passive entity capture** — high value, depends on conflict resolution not blowing up with extracted entities.

### Future Consideration (v5.1+)

- [ ] **Codebase-to-graph ingestion (`codify`)** — highest complexity, unique differentiator. Defer until core memory quality features are solid.
- [ ] **Auto-entity extraction from raw episode text** — similar to `extract` but fully passive; risk of noise is high without robust conflict resolution and dedup already running.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| JSON export / import | HIGH | LOW | P1 |
| Import from reference server format | MEDIUM | MEDIUM | P1 |
| REST API audit + OpenAPI docs | HIGH | LOW | P1 |
| Conflict resolution (ADD/UPDATE/NOOP) | HIGH | HIGH | P1 |
| Memory importance decay | HIGH | MEDIUM | P1 |
| Relationship strength scoring | MEDIUM | MEDIUM | P1 |
| Temporal fact versioning | HIGH | HIGH | P2 |
| Incremental consolidation | MEDIUM | MEDIUM | P2 |
| Auto-dedup sweep (scheduled) | MEDIUM | MEDIUM | P2 |
| `extract` MCP tool | HIGH | HIGH | P2 |
| Codebase-to-graph ingestion (`codify`) | HIGH | HIGH | P3 |
| Auto-entity extraction (fully passive) | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for v5.0 launch — closes competitive gaps
- P2: Strong differentiators — ship in v5.0 if P1 is solid
- P3: Future milestone — defer until product quality is validated

---

## Competitor Feature Analysis

| Feature | Mem0 | Zep/Graphiti | mcp-memory-service | Myco v4.0 | Myco v5.0 target |
|---------|------|-------------|-------------------|-----------|-----------------|
| Auto entity extraction from text | Yes (LLM NER) | Yes (LLM NER) | No | No | P2 (`extract` tool) |
| Conflict resolution (ADD/UPDATE/NOOP) | Yes (core feature) | Yes (via invalidation) | Partial | Partial (entity merge only) | P1 |
| Temporal fact versioning | No | Yes (bi-temporal) | No | No | P2 |
| Memory importance decay | Partial (recency score) | Yes (temporal invalidation) | No | No | P1 |
| Relationship strength scoring | No | Partial | No | No | P1 |
| JSON export/import | Yes | Yes | Yes | No | P1 |
| REST API for non-MCP access | Yes (cloud) | Yes (cloud) | Yes | Partial (audit needed) | P1 |
| Codebase ingestion | No | No | No | No | P3 |
| Incremental consolidation | Yes (real-time) | Yes (real-time) | No | No (nightly only) | P2 |
| Human approval queue | No | No | No | Yes (shipped) | — keep advantage |
| Local-first / no cloud | No | No | Yes | Yes | — keep advantage |
| Project namespacing | No | Partial | No | Yes (shipped) | — keep advantage |
| Nightly consolidation cron | No | No | No | Yes (shipped) | — keep advantage |

---

## Implementation Complexity Notes

### Low complexity (1-2 days each)
- **JSON export**: Single SQL dump across 3 tables, serialize to JSON, add CLI command + API endpoint.
- **JSON import**: Parse + validate, upsert with conflict skip, log results.
- **Reference server import**: Transform JSONL → entity/observation/relationship + call existing rememberEntity().
- **REST API audit**: Read existing route files, verify coverage, write OpenAPI spec (can use Hono's Zod validator introspection).

### Medium complexity (3-5 days each)
- **Memory importance decay**: Schema migration (2 new columns), importance scoring at write time (LLM or heuristic), decay job in nightly cron, integrate into recall ranking.
- **Relationship strength scoring**: Schema migration (2 new columns on relationships), increment on upsert, decay in nightly cron, expose in graph API.
- **Incremental consolidation**: Threshold check after log_episode, async consolidation trigger, avoid double-processing already-consolidated episodes (consolidated_at column already exists).
- **Auto-dedup sweep**: Batch embedding comparison per entity, threshold-based tombstoning, audit log.

### High complexity (1-2 weeks each)
- **Conflict resolution at observation level**: Embed new observation, compare against existing for same entity, classify as ADD/UPDATE/NOOP, UPDATE action requires temporal fact versioning to work correctly.
- **Temporal fact versioning**: Schema migration with valid_from/valid_until, all write paths must set valid_from, UPDATE action supersedes via valid_until, recall as_of parameter, migration for existing data (set valid_from = created_at, valid_until = NULL).
- **`extract` MCP tool**: Reuse consolidation LLM pipeline as synchronous single-shot mode, tune prompts for direct text input (not episode log format), handle auto-approve vs queue routing.
- **Codebase-to-graph ingestion**: ts-morph dependency, package boundary detection, selective export extraction, convention extraction (harder — needs CLAUDE.md awareness), project namespace integration.

---

## Sources

- Zep/Graphiti GitHub — https://github.com/getzep/graphiti
- Zep temporal knowledge graph paper (Jan 2025) — https://arxiv.org/abs/2501.13956
- Mem0 paper (Apr 2025) — https://arxiv.org/abs/2504.19413
- Mem0 graph memory docs — https://docs.mem0.ai/open-source/features/graph-memory
- doobidoo/mcp-memory-service GitHub — https://github.com/doobidoo/mcp-memory-service
- Neo4j agent-memory GitHub — https://github.com/neo4j-labs/agent-memory
- AI agent memory forgetting curve analysis (2025) — https://dev.to/sudarshangouda/ai-agent-memory-part-2-the-case-for-intelligent-forgetting-4i48
- Neo4j codebase knowledge graph blog — https://neo4j.com/blog/developer/codebase-knowledge-graph/
- TypeScript AST analyzer — https://github.com/olasunkanmi-SE/ts-codebase-analyzer
- code-graph-rag (multi-language, tree-sitter) — https://github.com/vitali87/code-graph-rag
- Codebase audit: packages/mcp-server/src/, packages/core/src/, packages/api-server/src/ — direct source read, HIGH confidence

---
*Feature research for: Myco v5.0 — Feature Parity & Differentiation*
*Researched: 2026-03-27*
