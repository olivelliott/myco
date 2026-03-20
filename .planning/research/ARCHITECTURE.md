# Architecture Research

**Domain:** Local-first AI agent persistent memory system (MCP server + knowledge graph + PWA)
**Researched:** 2026-03-20
**Confidence:** HIGH (core patterns) / MEDIUM (consolidation pipeline specifics)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CONSUMER LAYER                                │
│                                                                      │
│  ┌───────────────────────────┐  ┌──────────────────────────────┐    │
│  │   Claude Code Sessions    │  │   PWA (Browser / Homescreen) │    │
│  │   (any project, any time) │  │   Graph Explorer / Dashboard  │    │
│  └────────────┬──────────────┘  └───────────────┬──────────────┘    │
│               │ MCP stdio                        │ HTTP REST         │
└───────────────┼──────────────────────────────────┼───────────────────┘
                │                                  │
┌───────────────▼──────────────────────────────────▼───────────────────┐
│                        SERVICE LAYER                                  │
│                                                                       │
│  ┌──────────────────────────┐  ┌───────────────────────────────────┐ │
│  │     MCP Server           │  │         REST API Server           │ │
│  │  (stdio transport)       │  │         (Hono, HTTP)              │ │
│  │                          │  │                                   │ │
│  │  tools:                  │  │  GET  /graph                      │ │
│  │  - remember()            │  │  GET  /entities/:id               │ │
│  │  - recall()              │  │  GET  /episodes                   │ │
│  │  - query()               │  │  GET  /approval-queue             │ │
│  │  - log_episode()         │  │  POST /approval/:id/approve       │ │
│  │  - get_context()         │  │  POST /approval/:id/reject        │ │
│  └────────────┬─────────────┘  └────────────────┬──────────────────┘ │
│               │                                  │                    │
│               └────────────┬─────────────────────┘                   │
│                            │                                         │
│  ┌─────────────────────────▼──────────────────────────────────────┐  │
│  │                    Brain Core Library                           │  │
│  │  (shared business logic — used by both MCP + REST server)      │  │
│  │                                                                 │  │
│  │  EpisodeStore  |  GraphStore  |  EmbeddingPipeline  |          │  │
│  │  ConsolidationEngine  |  ApprovalQueue                         │  │
│  └──────────────────────────┬──────────────────────────────────────┘ │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│                        STORAGE LAYER                                  │
│                                                                       │
│  ┌───────────────────────┐  ┌──────────────────────────────────────┐ │
│  │   brain.db (SQLite)   │  │   Ollama (local process)             │ │
│  │                       │  │                                      │ │
│  │  - entities           │  │   nomic-embed-text                   │ │
│  │  - relationships      │  │   (768-dim vectors)                  │ │
│  │  - observations       │  │                                      │ │
│  │  - episodes           │  │   HTTP: localhost:11434              │ │
│  │  - vec_embeddings     │  │   POST /api/embeddings               │ │
│  │    (sqlite-vec)       │  │                                      │ │
│  │  - approval_queue     │  └──────────────────────────────────────┘ │
│  └───────────────────────┘                                           │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │   Cron (node-cron)                                             │  │
│  │   2am EST → triggers ConsolidationEngine.runDeepSleep()       │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| MCP Server | Expose brain tools to Claude Code sessions via stdio/JSON-RPC 2.0 | `@modelcontextprotocol/sdk` StdioServerTransport |
| REST API Server | Expose read/write endpoints to PWA; same data, different protocol | Hono (lightweight, Node.js-compatible) |
| Brain Core Library | All business logic; imported by both servers | Pure TypeScript library, no transport coupling |
| EpisodeStore | Write and query episode logs per session | SQLite table with timestamps, session ID, agent ID |
| GraphStore | CRUD for entities, relationships, observations | SQLite adjacency-list schema + sqlite-vec virtual table |
| EmbeddingPipeline | Convert text to vectors via Ollama; cache results | Calls `localhost:11434/api/embeddings`, stores in vec_embeddings |
| ConsolidationEngine | Distill episode logs into graph knowledge; assign confidence | LLM-assisted extraction, confidence thresholds, upsert graph |
| ApprovalQueue | Hold low-confidence/contradictory inferences for human review | SQLite table; drained by PWA UI |
| PWA Frontend | Graph explorer, approval queue UI, activity dashboard | SvelteKit + vite-plugin-pwa, served by REST API or static |
| Cron Scheduler | Trigger nightly consolidation at 2am | node-cron inside the same Node.js process as MCP/REST |

---

## Recommended Project Structure

```
ai-workbots-brain/
├── packages/
│   ├── core/                      # Brain Core Library (no transport deps)
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      # SQLite table definitions (better-sqlite3)
│   │   │   │   ├── migrations/    # SQL migration files, numbered
│   │   │   │   └── client.ts      # Singleton DB connection, WAL mode on
│   │   │   ├── episodes/
│   │   │   │   ├── EpisodeStore.ts
│   │   │   │   └── types.ts
│   │   │   ├── graph/
│   │   │   │   ├── GraphStore.ts  # Entity/relationship/observation CRUD
│   │   │   │   ├── search.ts      # Semantic search via sqlite-vec
│   │   │   │   └── types.ts
│   │   │   ├── embeddings/
│   │   │   │   ├── OllamaClient.ts # POST /api/embeddings wrapper
│   │   │   │   └── pipeline.ts     # Embed-then-store, cache by content hash
│   │   │   ├── consolidation/
│   │   │   │   ├── ConsolidationEngine.ts
│   │   │   │   ├── extractor.ts   # LLM triplet extraction from episodes
│   │   │   │   ├── scorer.ts      # Confidence scoring logic
│   │   │   │   └── merger.ts      # Entity dedup / relationship merge
│   │   │   └── approval/
│   │   │       └── ApprovalQueue.ts
│   │   └── package.json
│   │
│   ├── mcp-server/                # MCP stdio server process
│   │   ├── src/
│   │   │   ├── index.ts           # McpServer + StdioServerTransport entry
│   │   │   └── tools/
│   │   │       ├── remember.ts
│   │   │       ├── recall.ts
│   │   │       ├── query.ts
│   │   │       ├── logEpisode.ts
│   │   │       └── getContext.ts
│   │   └── package.json
│   │
│   ├── api-server/                # Hono REST server process (also runs cron)
│   │   ├── src/
│   │   │   ├── index.ts           # Hono app + cron scheduler entry
│   │   │   ├── routes/
│   │   │   │   ├── graph.ts
│   │   │   │   ├── episodes.ts
│   │   │   │   └── approval.ts
│   │   │   └── cron.ts            # node-cron 2am consolidation trigger
│   │   └── package.json
│   │
│   └── pwa/                       # SvelteKit PWA
│       ├── src/
│       │   ├── routes/
│       │   │   ├── +page.svelte          # Dashboard / activity feed
│       │   │   ├── graph/+page.svelte    # Knowledge graph explorer
│       │   │   └── approval/+page.svelte # Approval queue
│       │   ├── lib/
│       │   │   ├── api.ts         # Typed REST client (fetch wrapper)
│       │   │   └── graph/
│       │   │       └── ForceGraph.svelte  # D3.js force-directed component
│       │   └── service-worker.ts  # vite-plugin-pwa generated
│       ├── vite.config.ts         # @vite-pwa/sveltekit plugin
│       └── package.json
│
├── data/
│   └── brain.db                   # SQLite database (gitignored)
│
└── package.json                   # Workspace root (pnpm workspaces)
```

### Structure Rationale

- **packages/core/:** All business logic isolated here. Both mcp-server and api-server import it. This enforces a clean boundary — no transport code in business logic, and both surfaces stay in sync automatically.
- **packages/mcp-server/:** Thin process adapter. Registers tools, delegates to core. Runs as subprocess launched by Claude Code's MCP config.
- **packages/api-server/:** Second thin process adapter for Hono + cron. Can run as a persistent background service (launchd / systemd). Shares the same `brain.db` file with mcp-server via WAL mode.
- **packages/pwa/:** Pure frontend. Talks to api-server over localhost. Static build served by api-server or separately.
- **data/brain.db:** Single SQLite file. Both server processes connect with WAL mode enabled — this safely supports concurrent readers with one writer.

---

## SQLite Schema

The graph uses a classic adjacency-list model augmented with a virtual vector table:

```sql
-- Entities (graph nodes)
CREATE TABLE entities (
  id          TEXT PRIMARY KEY,    -- UUID
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,       -- "person", "project", "concept", "file", etc.
  created_at  INTEGER NOT NULL,    -- Unix ms
  updated_at  INTEGER NOT NULL
);

-- Relationships (directed edges)
CREATE TABLE relationships (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL,       -- active voice: "implements", "depends_on"
  confidence  REAL NOT NULL DEFAULT 1.0,
  source      TEXT,                -- "agent", "consolidation", "human"
  created_at  INTEGER NOT NULL
);

-- Observations (atomic facts attached to entities)
CREATE TABLE observations (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  confidence  REAL NOT NULL DEFAULT 1.0,
  source      TEXT,
  created_at  INTEGER NOT NULL
);

-- Episode logs (raw agent session events)
CREATE TABLE episodes (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  agent_id    TEXT,
  event_type  TEXT NOT NULL,       -- "phase_transition", "decision", "finding", etc.
  content     TEXT NOT NULL,       -- free text or JSON blob
  metadata    TEXT,                -- JSON
  consolidated INTEGER DEFAULT 0, -- 0 = pending, 1 = processed
  created_at  INTEGER NOT NULL
);

-- Embeddings (sqlite-vec virtual table for semantic search)
CREATE VIRTUAL TABLE vec_embeddings USING vec0(
  embedding float[768]
);

-- Maps embedding rowid → source entity/observation
CREATE TABLE embedding_refs (
  vec_rowid   INTEGER PRIMARY KEY,
  source_type TEXT NOT NULL,      -- "entity", "observation"
  source_id   TEXT NOT NULL
);

-- Human approval queue
CREATE TABLE approval_queue (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,      -- "inference", "contradiction", "entity_merge"
  payload     TEXT NOT NULL,      -- JSON: proposed change
  reason      TEXT,               -- why flagged
  confidence  REAL,
  status      TEXT DEFAULT 'pending', -- "pending", "approved", "rejected"
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER
);
```

---

## Architectural Patterns

### Pattern 1: Shared Core Library, Dual Transport

**What:** Business logic lives in `packages/core`. Both the MCP stdio server and the Hono REST server import the same library. No duplication of graph queries, consolidation logic, or embedding calls.

**When to use:** Whenever you have two protocol surfaces (MCP + HTTP) over the same data.

**Trade-offs:** Requires a monorepo workspace setup (pnpm workspaces). Worth it — avoids drift between what Claude Code sees and what the PWA shows.

**Example:**
```typescript
// packages/core/src/graph/GraphStore.ts
export class GraphStore {
  constructor(private db: Database) {}
  async findSimilar(text: string, topK = 10): Promise<Entity[]> { ... }
}

// packages/mcp-server/src/tools/recall.ts
import { GraphStore } from '@brain/core'
export async function handleRecall(store: GraphStore, query: string) { ... }

// packages/api-server/src/routes/graph.ts
import { GraphStore } from '@brain/core'
app.get('/graph/search', (c) => store.findSimilar(c.query('q')))
```

### Pattern 2: Two-Phase Write (Episode First, Graph Second)

**What:** Agents write lightweight episode logs immediately (fast, no LLM inference). The consolidation engine processes episodes into the knowledge graph asynchronously — either at 2am or on manual trigger.

**When to use:** Always. Never have agents block on LLM inference during a session.

**Trade-offs:** Graph knowledge lags behind raw episodes by up to 24 hours (or until manual trigger). For this use case — accumulating knowledge across sessions — that lag is acceptable and even desirable (reduces noise from incomplete sessions).

```
Agent writes            Consolidation engine reads
episode row             unconsolidated episodes
(fast, sync)    →  →  → LLM extracts triplets
                         → scores confidence
                         → high conf → graph directly
                         → low conf → approval_queue
                         marks episodes consolidated=1
```

### Pattern 3: Confidence-Gated Auto-Approve

**What:** Consolidation assigns a confidence score to every extracted fact. Above threshold (e.g., 0.85) — auto-write to graph. Below threshold, or if contradicting existing knowledge — route to approval_queue.

**When to use:** Always in this system. This is the core human-in-the-loop mechanism.

**Trade-offs:** Threshold needs tuning. Start conservatively (0.85) — too low floods the queue, too high lets contradictions silently overwrite.

### Pattern 4: WAL Mode for Concurrent Access

**What:** SQLite with WAL (Write-Ahead Logging) mode allows multiple readers concurrently with one writer. MCP server and REST API server can both query the DB simultaneously without locking.

**When to use:** Any time two Node.js processes share one SQLite file.

```typescript
// packages/core/src/db/client.ts
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('synchronous = NORMAL')
```

---

## Data Flow

### Flow 1: Agent Writes an Episode (Real-Time, During Session)

```
Claude Code agent calls log_episode() MCP tool
    ↓
MCP Server (stdio) receives CallToolRequest
    ↓
EpisodeStore.write({ session_id, event_type, content, metadata })
    ↓
INSERT INTO episodes (consolidated=0)    ← fast, no LLM needed
    ↓
Return success to agent
```

### Flow 2: Agent Recalls Context (Real-Time, During Session)

```
Agent calls recall("what do we know about authentication?")
    ↓
EmbeddingPipeline.embed(query_text)     ← POST localhost:11434/api/embeddings
    ↓
vec_embeddings MATCH query_vector k=10  ← sqlite-vec ANN search
    ↓
JOIN embedding_refs → fetch entities + observations
    ↓
Return ranked results to agent (JSON)
```

### Flow 3: Deep Sleep Consolidation (Nightly / Manual)

```
node-cron fires at 2am EST (or manual trigger via CLI / PWA button)
    ↓
ConsolidationEngine.runDeepSleep()
    ↓
SELECT episodes WHERE consolidated=0     ← batch read pending episodes
    ↓
For each episode batch:
    extractor.extractTriplets(episodes)  ← LLM call: entity + relation + entity
        ↓
    scorer.scoreConfidence(triplets)     ← heuristics + LLM self-rating
        ↓
    confidence >= 0.85?
        YES → GraphStore.upsertFact()    ← write to graph directly
        NO  → ApprovalQueue.enqueue()    ← hold for human review
        CONTRADICTION → ApprovalQueue.enqueue() always
        ↓
    EmbeddingPipeline.embedAndStore()    ← index new entities/observations
        ↓
    UPDATE episodes SET consolidated=1
```

### Flow 4: Human Approves a Queued Inference (PWA)

```
User opens PWA approval queue page
    ↓
GET /approval-queue                      ← REST API reads approval_queue table
    ↓
User reviews: "project X depends_on library Y" (confidence: 0.72)
    ↓
User clicks Approve
    ↓
POST /approval/:id/approve
    ↓
GraphStore.upsertFact(payload)           ← write to graph
UPDATE approval_queue SET status='approved', resolved_at=NOW
```

### Flow 5: PWA Graph Exploration

```
User opens graph explorer
    ↓
GET /graph?depth=2&root=entity_id        ← REST API query
    ↓
GraphStore.subgraph(root, depth)         ← SQLite recursive CTE or iterative BFS
    ↓
Return { nodes: Entity[], edges: Relationship[] }
    ↓
D3.js ForceGraph renders interactive visualization
    ↓
User clicks entity → GET /entities/:id  ← entity detail + observations
```

---

## Build Order (Phase Dependencies)

The architecture has a strict dependency chain. Each phase unlocks the next.

```
Phase 1: Storage Foundation
  brain.db schema (entities, relationships, observations, episodes,
  vec_embeddings, embedding_refs, approval_queue)
  better-sqlite3 client with WAL mode
  Migration system (numbered SQL files)
  ↓ (everything else depends on this)

Phase 2: MCP Server + Episode Logging
  MCP server skeleton (StdioServerTransport, tool registry)
  EpisodeStore (write, query)
  log_episode() tool — agents can now write events
  Basic get_context() tool — reads recent episodes (no embeddings yet)
  ↓ (agents can now capture memory, even without semantic search)

Phase 3: Embedding Pipeline + Semantic Recall
  OllamaClient wrapper
  EmbeddingPipeline (embed, store, cache by content hash)
  vec_embeddings population
  recall() and query() MCP tools using semantic search
  ↓ (agents now have semantic recall across sessions)

Phase 4: Consolidation Engine
  extractor.ts — LLM triplet extraction from episode batches
  scorer.ts — confidence assignment
  merger.ts — entity dedup, relationship merge detection
  ConsolidationEngine.runDeepSleep()
  ApprovalQueue.enqueue() + status management
  Manual CLI trigger (npx brain consolidate)
  ↓ (raw episodes now distill into durable knowledge)

Phase 5: REST API + Cron
  Hono server exposing /graph, /episodes, /approval-queue routes
  node-cron 2am scheduler
  ↓ (PWA can now talk to the brain)

Phase 6: PWA Frontend
  SvelteKit + vite-plugin-pwa setup
  Approval queue UI (review, approve, reject)
  Activity dashboard (episode feed, session history)
  Graph explorer (D3.js force-directed, entity detail panel)
  ↓ (human control surface complete)

Phase 7: GSD Hooks Integration
  Hook scripts in ~/.claude/get-shit-done/hooks/
  Auto-capture phase transitions as episodes
  Auto-recall relevant context at session start
```

---

## Scaling Considerations

This is a single-user, local system. Scaling means "handles heavy GSD usage without slowing down," not "handles 10k users."

| Concern | Reality at Scale | Mitigation |
|---------|-----------------|------------|
| Episode table growth | 1,000s of episodes/month is realistic | Partition by consolidated=1, archive older sessions; WAL keeps reads fast |
| Vector search latency | sqlite-vec is fast for <100k rows; degradation above that | Index only observations (not raw episodes); content-hash cache avoids re-embedding |
| Consolidation time | LLM inference for large episode batches can take minutes | Process in batches (50 episodes max per run); skip sessions already consolidated |
| PWA graph render | D3.js force layout struggles above ~500 nodes | Default subgraph depth=2 limits to neighborhood; paginate entity lists |
| Concurrent DB access | WAL handles MCP + REST + cron simultaneously | Keep writes short; no long-running transactions during consolidation |

---

## Anti-Patterns

### Anti-Pattern 1: Embedding Inside the MCP Hot Path

**What people do:** Call Ollama to generate embeddings synchronously inside `remember()` or `log_episode()` MCP tools.

**Why it's wrong:** Ollama embedding takes 100–500ms per call. Agent sessions stall waiting for inference. This adds visible latency to every Claude Code interaction.

**Do this instead:** Write raw text to `episodes` table synchronously. Run embeddings in the consolidation pipeline (async, batch). Cache by content hash so re-consolidation is free.

### Anti-Pattern 2: One Process for Everything

**What people do:** Put MCP server, REST API, and cron in a single `index.ts` file.

**Why it's wrong:** MCP servers use stdio transport — they're designed to be launched as subprocesses by Claude Code. A combined process that also runs an HTTP server will have lifecycle complications (who restarts it? what if the HTTP port is in use?). Also makes testing harder.

**Do this instead:** Separate processes. MCP server launched on-demand by Claude Code. REST API + cron as a persistent background service managed by launchd or a simple `pm2` process manager.

### Anti-Pattern 3: Auto-Approving Everything

**What people do:** Skip the approval queue and write all consolidation results directly to the graph, reasoning that "the LLM is usually right."

**Why it's wrong:** Contradictions silently overwrite existing knowledge. Low-confidence inferences accumulate. Entity merges collapse distinct entities. The graph becomes unreliable.

**Do this instead:** Enforce confidence thresholds. Route contradictions and low-confidence inferences to the queue unconditionally. The queue is only valuable if it has real teeth — items in it should not auto-resolve.

### Anti-Pattern 4: JSONL Storage (from Official Anthropic Memory Server)

**What people do:** Use the official `@modelcontextprotocol/server-memory` JSONL-based storage as-is.

**Why it's wrong:** JSONL appends forever and requires full-file reads for queries. No vector search. No approval queue. No episode/graph separation. Good for a prototype demo; wrong for a durable brain.

**Do this instead:** SQLite from day one. The sqlite-vec extension gives vector search without a separate service. Structured tables enable proper querying, indexing, and the two-phase episode → graph pipeline.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Ollama | HTTP POST `localhost:11434/api/embeddings` | Must be running; check health on startup; fail gracefully if down (episode writes still work, semantic search degraded) |
| Claude Code | MCP stdio transport (subprocess launch) | Configured in `~/.claude/mcp_servers.json`; server launched per-session |
| node-cron | In-process scheduler (api-server process) | Runs in the same Node.js event loop as Hono; cron job triggers consolidation |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP Server ↔ Core Library | Direct import (same process) | No IPC overhead; core lib is synchronous-friendly (better-sqlite3) |
| REST API ↔ Core Library | Direct import (same process) | Hono handles async; better-sqlite3 sync calls are fine in async handlers |
| MCP Server ↔ REST API | Shared SQLite file (WAL mode) | Not direct IPC — they communicate through the DB. This is intentional and correct. |
| PWA ↔ REST API | Fetch over localhost HTTP | CORS: allow `localhost` origins only; no auth needed (local machine) |
| ConsolidationEngine ↔ Ollama | HTTP (via OllamaClient) | Batch requests; retry on 503 (model loading); timeout after 30s per batch |

---

## Sources

- [Knowledge Graph Memory MCP Server (Anthropic official)](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) — reference for entity/relation/observation schema and tool API surface
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — StdioServerTransport, McpServer, tool registration patterns
- [MCP Transport Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) — stdio framing, JSON-RPC 2.0 message format
- [SQLite-vec: Local Vector Search](https://dev.to/aairom/embedded-intelligence-how-sqlite-vec-delivers-fast-local-vector-search-for-ai-3dpb) — vec0 virtual table schema, embedding ingestion and retrieval query patterns
- [Ollama Embeddings Documentation](https://docs.ollama.com/capabilities/embeddings) — nomic-embed-text model, `/api/embeddings` endpoint
- [AriGraph: Episodic + Semantic Memory Architecture](https://arxiv.org/abs/2407.04363) — episodic-to-semantic consolidation via triplet extraction
- [Memory in the Age of AI Agents (survey, 2025)](https://arxiv.org/abs/2512.13564) — consolidation mechanisms, confidence-gated approval patterns
- [Hono + MCP HTTP bridge](https://github.com/mhart/mcp-hono-stateless) — Hono as MCP transport adapter
- [SvelteKit PWA plugin](https://github.com/vite-pwa/sveltekit) — vite-plugin-pwa + SvelteKit integration
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — synchronous SQLite Node.js driver, WAL mode setup

---

*Architecture research for: local-first AI agent persistent memory system*
*Researched: 2026-03-20*
