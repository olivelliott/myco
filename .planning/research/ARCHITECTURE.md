# Architecture Research

**Domain:** MCP Memory Server — v5.0 Feature Integration
**Researched:** 2026-03-27
**Confidence:** HIGH (based on direct codebase analysis of all 4 packages)

---

## Existing Architecture (Baseline)

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MCP Clients (Claude Code sessions)                │
│   remember / recall / query / log_episode / consolidate / forget     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ stdio (StdioServerTransport)
┌──────────────────────────────▼──────────────────────────────────────┐
│                     packages/mcp-server                              │
│  tools.ts   consolidator.ts   embed-client.ts   scheduler.ts        │
│  relationship-discovery.ts    cli.ts                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ imports @myco/core
┌──────────────────────────────▼──────────────────────────────────────┐
│                      packages/core                                   │
│  db.ts   schema.ts   statements.ts   types.ts   provenance.ts        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ better-sqlite3 (WAL mode)
┌──────────────────────────────▼──────────────────────────────────────┐
│                    SQLite Database (myco.db)                          │
│  entities   observations   relationships   episodes                  │
│  approval_queue   vec_embeddings (sqlite-vec)   fts_observations     │
└──────────────────────────────▲──────────────────────────────────────┘
                               │ imports @myco/core
┌──────────────────────────────┴──────────────────────────────────────┐
│                     packages/api-server                              │
│  Hono on :3001   /api/dashboard   /api/entities   /api/graph         │
│  /api/approvals   /api/episodes                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ TanStack Query polling
┌──────────────────────────────▼──────────────────────────────────────┐
│                     packages/dashboard                               │
│  React 19 PWA   Graph explorer   Approval queue   Activity log       │
└─────────────────────────────────────────────────────────────────────┘
```

### Existing Component Responsibilities

| Component | Responsibility | Key Files |
|-----------|---------------|-----------|
| `packages/core` | DB connection, schema migrations, all prepared statements, types, provenance factory | `db.ts`, `schema.ts`, `statements.ts`, `types.ts` |
| `packages/mcp-server` | MCP tool registration, consolidation pipeline, embedding client, cron scheduler | `tools.ts`, `consolidator.ts`, `embed-client.ts`, `scheduler.ts` |
| `packages/api-server` | Hono HTTP server for dashboard data access, 5 read-oriented route groups | `routes/*.ts` |
| `packages/dashboard` | React PWA, force-directed graph, approval queue UI | `src/routes/*.tsx` |

### Existing Schema (Relevant to v5.0)

```sql
entities:      id, name, type, summary, metadata, session_id, agent_id,
               source_type, confidence, created_at, updated_at, project

observations:  id, entity_id, content, metadata, session_id, agent_id,
               source_type, confidence, created_at, needs_embedding

relationships: id, from_id, to_id, type, metadata, session_id, agent_id,
               source_type, confidence, created_at
               UNIQUE(from_id, to_id, type)

episodes:      id, session_id, agent_id, event_type, payload, created_at,
               consolidated_at

approval_queue: id, item_type, item_id, status, reason, metadata,
                created_at, resolved_at
```

Key behaviors to preserve:
- `schema.ts` uses try/catch `ALTER TABLE` for all migrations — safe to re-run on startup
- `INSERT OR IGNORE` on relationships enforces UNIQUE(from_id, to_id, type)
- `consolidated_at IS NULL` marks episodes awaiting the nightly cycle
- `needs_embedding = 1` flags observations for deferred embedding when Ollama is offline
- All write logic lives in `mcp-server/src/tools.ts` — `api-server` is currently read-only

---

## v5.0 Feature Integration Map

Each feature is classified as **NEW TABLE**, **ADD COLUMNS**, **NEW MODULE**, **EXTEND EXISTING**, or **REFACTOR**.

---

### Feature 1: Temporal Fact Versioning

**Integration classification:** ADD COLUMNS to `observations` + EXTEND EXISTING write path

**Schema changes:**
```sql
ALTER TABLE observations ADD COLUMN superseded_by TEXT REFERENCES observations(id);
ALTER TABLE observations ADD COLUMN valid_from    TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE observations ADD COLUMN valid_until   TEXT;  -- NULL = currently valid
```

Index:
```sql
CREATE INDEX IF NOT EXISTS idx_observations_valid_until
  ON observations(valid_until) WHERE valid_until IS NULL;
```

**Write path change in `rememberEntity()` (`tools.ts`):**
Before inserting a new observation for an existing entity, check for a semantically near-match in existing observations (cosine distance < 0.2 via `knnSearchForContradiction`). If a near-match is found, "retire" the old observation (`UPDATE observations SET valid_until = now(), superseded_by = newObsId WHERE id = oldObsId`) before inserting the new one. If no match, append as additional fact — temporal versioning only fires on supersession, not on distinct new facts.

**Query path change in `recallKnowledge()`:**
Default filter adds `AND o.valid_until IS NULL`. Add optional `as_of` parameter to the MCP `recall` tool that substitutes `AND o.valid_from <= ? AND (o.valid_until IS NULL OR o.valid_until > ?)`.

**New prepared statements in `MycoStatements`:**
- `retireObservation` — `UPDATE observations SET valid_until = ?, superseded_by = ? WHERE id = ?`
- `selectObservationsAtTime(entity_id, iso)` — point-in-time query
- `selectCurrentObservations(entity_id)` — `WHERE valid_until IS NULL` (replaces the existing `selectObservationsByEntityId`)

**api-server impact:** `GET /api/entities/:id` observation list should default to `valid_until IS NULL`; add `?include_history=true` to expose retired observations.

---

### Feature 2: Auto-Entity Extraction

**Integration classification:** NEW MODULE in `mcp-server` + EXTEND EXISTING `logEpisode()`

**No schema changes.** The existing `consolidated_at` column already tracks whether an episode has been processed.

**New file:** `packages/mcp-server/src/auto-extractor.ts`
- Exports `extractAndStoreEpisode(db, episode, stmts): Promise<void>`
- Reuses `extractFacts()`, `detectContradiction()`, `findMergeCandidates()` already in `consolidator.ts`
- High-confidence facts route to `rememberEntity()`; uncertain ones go to `approval_queue`
- Marks episode `consolidated_at = now()` so the nightly cycle skips it

**`logEpisode()` change in `tools.ts`:**
```typescript
// After stmts.insertEpisode.run(...)
setImmediate(() =>
  extractAndStoreEpisode(db, newEpisode, stmts).catch(err =>
    console.error('[auto-extractor] failed:', err)
  )
);
```
The `setImmediate` is critical — LLM inference takes 1–5 seconds. The episode log tool response must return immediately without blocking on Ollama.

**SourceType extension:** Add `'auto_extraction'` to the `SourceType` union in `core/types.ts`.

---

### Feature 3: Auto-Dedup / Conflict Resolution

**Integration classification:** NEW MODULE in `mcp-server` + EXTEND EXISTING write path

**Dependencies:** Requires Feature 1 (temporal versioning) for the UPDATE action — the `retireObservation` mechanism is its underlying implementation.

**New file:** `packages/mcp-server/src/dedup-resolver.ts`
- Exports `resolveDedup(db, entityName, entityType, newObservation, stmts): Promise<DedupDecision>`

```typescript
type DedupDecision =
  | { action: 'ADD' }                          // no conflict — insert normally
  | { action: 'UPDATE'; retireObsId: string }  // new fact supersedes existing
  | { action: 'NOOP'; reason: string }          // exact duplicate — skip
  | { action: 'QUEUE'; reason: string }         // contradiction — send to approval queue
```

Logic sequence:
1. Check for exact text duplicate (`SELECT 1 FROM observations WHERE entity_id = ? AND content = ?`) → NOOP
2. Check cosine distance < 0.15 → NOOP (functionally identical)
3. Check cosine distance 0.15–0.30 → UPDATE (near-match, new supersedes old)
4. Check cosine distance 0.30–CONTRADICTION_THRESHOLD → QUEUE (potential contradiction)
5. Otherwise → ADD

**`rememberEntity()` change in `tools.ts`:**
Call `resolveDedup()` before inserting an observation on an existing entity. Act on the returned decision.

---

### Feature 4: Incremental Consolidation

**Integration classification:** NEW MODULE in `mcp-server` + EXTEND EXISTING `logEpisode()`

**No schema changes.** Threshold-triggered micro-consolidation uses existing `runConsolidation()`.

**New file:** `packages/mcp-server/src/consolidation-trigger.ts`
- Exports `checkAndTriggerMicroConsolidation(db, stmts): void`
- Counts `SELECT COUNT(*) FROM episodes WHERE consolidated_at IS NULL`
- If count exceeds `MYCO_CONSOLIDATION_THRESHOLD` (default: 5), fires `runConsolidation(db, stmts)` asynchronously

**`logEpisode()` change in `tools.ts`:**
```typescript
// Alongside the auto-extractor setImmediate:
setImmediate(() =>
  checkAndTriggerMicroConsolidation(db, stmts)
);
```

**`config.ts` change in `core`:**
Add `consolidationThreshold: number` (from `MYCO_CONSOLIDATION_THRESHOLD`, default `5`).

The nightly `runConsolidation()` in `scheduler.ts` is unchanged — it becomes a catch-up pass for any episodes not yet consumed by micro-consolidation.

---

### Feature 5: Codebase-to-Graph Ingestion (`codify` tool)

**Integration classification:** NEW MODULE in `mcp-server` + NEW MCP TOOL

**No schema changes.** Uses existing entity/observation write path.

**New file:** `packages/mcp-server/src/codebase-ingester.ts`
- Exports `ingestCodebase(db, rootPath, projectName, maxDepth, stmts): Promise<CodifyResult>`
- Walks the directory tree with Node.js `fs.readdirSync` (max depth 4, configurable)
- Produces a structured JSON summary: file counts by extension, key config files found, package.json scripts, detected framework patterns
- Passes the summary to `extractFacts()` (existing in `consolidator.ts`)
- Each extracted fact goes through `rememberEntity()` with `source_type: 'codebase_ingestion'`

**`tools.ts` change:** Register new `codify` MCP tool.
```typescript
// Input schema
{ root_path: z.string(), project_name: z.string(), max_depth: z.number().default(4).optional() }
```

**SourceType extension:** Add `'codebase_ingestion'` to the union in `types.ts`.

---

### Feature 6: REST API for Non-MCP Access

**Integration classification:** REFACTOR (move business logic to `core`) + NEW ROUTES in `api-server`

**The circular dependency problem.** Today all write logic (`rememberEntity`, `recallKnowledge`, `queryEntities`, `forgetEntity`, `logEpisode`) lives in `mcp-server/src/tools.ts`. `api-server` cannot import from `mcp-server` without creating a circular dependency. The fix is to move pure business logic into `packages/core`.

**Refactor plan (required before REST API routes can be written):**

Step 1 — Move `embed-client.ts` from `mcp-server/src/` to `packages/core/src/`. Both `recallKnowledge` (semantic search) and `rememberEntity` (inline embedding) depend on it.

Step 2 — Create `packages/core/src/memory-ops.ts`. Move these functions from `mcp-server/src/tools.ts`:
- `rememberEntity()`
- `recallKnowledge()`
- `queryEntities()`
- `forgetEntity()`
- `logEpisode()`
- `reEmbedPending()`

Step 3 — `mcp-server/src/tools.ts` becomes a thin MCP adapter: imports all functions from `@myco/core`, registers MCP tool handlers, calls the shared functions.

Step 4 — `api-server` can now import from `@myco/core` for the write routes.

**New file:** `packages/api-server/src/routes/memory.ts`
Mounted at `/api/memory`:

```
POST /api/memory/remember     → rememberEntity()
POST /api/memory/recall       → recallKnowledge()
POST /api/memory/query        → queryEntities()
POST /api/memory/forget       → forgetEntity()
POST /api/memory/log-episode  → logEpisode()
POST /api/memory/consolidate  → runConsolidation()
```

**New file:** `packages/api-server/src/middleware/auth.ts`
Optional API key middleware. If `MYCO_API_KEY` env var is set, require `Authorization: Bearer <key>` header on `/api/memory/*` routes. If unset, no auth (local-only default, backwards compatible).

**`config.ts` change:** Add `apiKey: string | null` (from `MYCO_API_KEY`, default `null`).

---

### Feature 7: Memory Importance Decay

**Integration classification:** ADD COLUMNS to `entities` and `observations` + NEW MODULE in `core`

**Schema changes:**
```sql
ALTER TABLE entities ADD COLUMN last_accessed_at TEXT;
ALTER TABLE entities ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE observations ADD COLUMN last_accessed_at TEXT;
ALTER TABLE observations ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
```

**New file:** `packages/core/src/decay.ts`
```typescript
export function decayFactor(lastAccessedAt: string | null, createdAt: string): number {
  const referenceDate = lastAccessedAt ?? createdAt;
  const ageMs = Date.now() - new Date(referenceDate).getTime();
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

export function computeEffectiveConfidence(
  storedConfidence: number,
  lastAccessedAt: string | null,
  createdAt: string,
  halfLifeDays = 30,
): number {
  return storedConfidence * decayFactor(lastAccessedAt, createdAt, halfLifeDays);
}
```

**Decay is computed lazily on read** — no background writer, no write storms. Accessed facts are reinforced by bumping `last_accessed_at` and `access_count`.

**`recallKnowledge()` and `queryEntities()` changes:**
- On returning results: fire `UPDATE entities SET last_accessed_at = now(), access_count = access_count + 1 WHERE id = ?` for each returned entity
- Include `effective_confidence` (computed via `computeEffectiveConfidence`) as a field in the returned JSON

**Nightly consolidation addition in `consolidator.ts`:**
Add a decay sweep pass after the episode batch loop:
```sql
SELECT id, confidence, last_accessed_at, created_at FROM entities
WHERE effective_confidence_check < 0.1
```
(computed in JS via `computeEffectiveConfidence`) — entities below threshold are surfaced to the `approval_queue` with `reason: 'decay_candidate'` for human review. Not auto-deleted.

**New prepared statements:** `updateEntityAccess`, `updateObservationAccess`, `selectEntitiesForDecayCheck`.

**`config.ts` change:** Add `decayHalfLifeDays: number` (from `MYCO_DECAY_HALF_LIFE_DAYS`, default `30`).

---

### Feature 8: Relationship Strength Scoring

**Integration classification:** ADD COLUMNS to `relationships` + EXTEND EXISTING insert statement

**Schema changes:**
```sql
ALTER TABLE relationships ADD COLUMN strength             REAL NOT NULL DEFAULT 1.0;
ALTER TABLE relationships ADD COLUMN reinforcement_count  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE relationships ADD COLUMN last_reinforced_at   TEXT;
```

**Key change to `insertRelationship` prepared statement:**
The existing statement uses `INSERT OR IGNORE`. Change to upsert:
```sql
INSERT INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at, strength, reinforcement_count, last_reinforced_at)
VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, 1.0, 1, ?)
ON CONFLICT(from_id, to_id, type) DO UPDATE SET
  reinforcement_count = reinforcement_count + 1,
  last_reinforced_at  = excluded.created_at,
  strength            = MIN(1.0, strength + 0.1)
```

The UNIQUE(from_id, to_id, type) constraint is the enforcement mechanism; the conflict action handles the reinforcement increment.

**`selectGraphRelationships` change:** Include `strength` and `reinforcement_count` in SELECT so the dashboard graph can use edge width/opacity.

**Dashboard impact:** `react-force-graph-2d` edge rendering uses `strength` as `linkWidth` or opacity. This change flows through `api-server/routes/graph.ts` → `packages/dashboard/src/hooks/use-graph.ts` → `graph-view.tsx`.

**Decay integration:** `computeEffectiveConfidence` can be applied to relationships using `last_reinforced_at` as the reference date. API returns `effective_strength` alongside `strength` for the dashboard.

---

### Feature 9: Import / Export

**Integration classification:** NEW MODULE in `mcp-server` + NEW MCP TOOLS + NEW API ROUTES

**No schema changes.** Export reads existing tables; import uses existing write path.

**New file:** `packages/mcp-server/src/import-export.ts`

Export format (`MycoExport`):
```typescript
interface MycoExport {
  version: '1.0';
  exported_at: string;
  entities: Entity[];
  observations: Observation[];
  relationships: Relationship[];
}
```

Import formats to handle:
- `myco` — native format above (trivial: call `rememberEntity` for each observation)
- `mem0` — entities with `facts` arrays (map fact text → observation)
- `mcp-memory-service` — entities with `observations` arrays (the JSONL reference format)

**`tools.ts` changes:** Register two new MCP tools — `export_graph` and `import_graph`.

**`cli.ts` changes:** Add `myco export > graph.json` and `myco import graph.json` CLI subcommands.

**`api-server` changes:** Add `GET /api/export` and `POST /api/import` routes to the existing `entitiesRoutes` or a new `importExportRoutes` group.

**SourceType extension:** Add `'import'` to the union in `types.ts`.

---

## Schema Migration Plan

All migrations follow the existing `try/catch ALTER TABLE` pattern in `schema.ts` — safe to run on every startup against both new and existing databases.

### Complete v5.0 Migration Block

```typescript
// v5.0 M1: Temporal fact versioning
try { db.exec(`ALTER TABLE observations ADD COLUMN superseded_by TEXT REFERENCES observations(id)`); } catch {}
try { db.exec(`ALTER TABLE observations ADD COLUMN valid_from TEXT NOT NULL DEFAULT (datetime('now'))`); } catch {}
try { db.exec(`ALTER TABLE observations ADD COLUMN valid_until TEXT`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_active ON observations(valid_until) WHERE valid_until IS NULL`); } catch {}

// v5.0 M2: Entity access tracking (for decay)
try { db.exec(`ALTER TABLE entities ADD COLUMN last_accessed_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE entities ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`); } catch {}

// v5.0 M3: Observation access tracking (for decay)
try { db.exec(`ALTER TABLE observations ADD COLUMN last_accessed_at TEXT`); } catch {}
try { db.exec(`ALTER TABLE observations ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0`); } catch {}

// v5.0 M4: Relationship strength scoring
try { db.exec(`ALTER TABLE relationships ADD COLUMN strength REAL NOT NULL DEFAULT 1.0`); } catch {}
try { db.exec(`ALTER TABLE relationships ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE relationships ADD COLUMN last_reinforced_at TEXT`); } catch {}
```

All new columns have safe defaults — no data backfill required for existing rows.

### Migration Ordering (dependency constraints)

| Migration | Required By | Can Ship Independently? |
|-----------|------------|------------------------|
| M1 (temporal) | Features 1 and 3 | Yes — must ship before F1 and F3 |
| M2-M3 (access tracking) | Feature 7 | Yes — independent |
| M4 (relationship strength) | Feature 8 | Yes — independent |

---

## Package Dependency Graph After v5.0

**Before:**
```
mcp-server → core → SQLite
api-server → core → SQLite
dashboard  → api-server (HTTP)
```

**After:**
```
mcp-server → core (now includes embed-client + memory-ops) → SQLite
api-server → core (now includes embed-client + memory-ops) → SQLite
dashboard  → api-server (HTTP)
```

The only structural change: `embed-client.ts` and the core write/read functions move from `mcp-server` into `core`. The package graph topology is unchanged — no new package-level dependencies are introduced.

---

## New Files Summary

| File | Package | Purpose |
|------|---------|---------|
| `packages/core/src/memory-ops.ts` | core | Business logic extracted from `mcp-server/tools.ts` (enables REST API reuse) |
| `packages/core/src/embed-client.ts` | core | Moved from `mcp-server/` (needed by `memory-ops.ts`) |
| `packages/core/src/decay.ts` | core | `computeEffectiveConfidence()` and `decayFactor()` — lazy decay computation |
| `packages/mcp-server/src/auto-extractor.ts` | mcp-server | Episode-level auto-extraction on `log_episode` |
| `packages/mcp-server/src/dedup-resolver.ts` | mcp-server | Write-path dedup and conflict resolution |
| `packages/mcp-server/src/consolidation-trigger.ts` | mcp-server | Threshold-based micro-consolidation on episode insert |
| `packages/mcp-server/src/codebase-ingester.ts` | mcp-server | `codify` tool — project structure to graph knowledge |
| `packages/mcp-server/src/import-export.ts` | mcp-server | JSON export and multi-format import |
| `packages/api-server/src/routes/memory.ts` | api-server | Write-path REST routes (`/api/memory/*`) |
| `packages/api-server/src/middleware/auth.ts` | api-server | Optional API key guard for write routes |

## Modified Files Summary

| File | Package | Change |
|------|---------|--------|
| `packages/core/src/schema.ts` | core | 4 migration blocks (M1-M4) |
| `packages/core/src/types.ts` | core | Extend `SourceType` union; add new columns to `Entity`, `Observation`, `Relationship` interfaces |
| `packages/core/src/statements.ts` | core | ~15 new prepared statements; update `insertRelationship` to upsert |
| `packages/core/src/config.ts` | core | Add `consolidationThreshold`, `apiKey`, `decayHalfLifeDays` |
| `packages/mcp-server/src/tools.ts` | mcp-server | Becomes thin MCP adapter after logic moves to `core`; registers 4 new tools |
| `packages/mcp-server/src/consolidator.ts` | mcp-server | Add decay sweep pass to nightly cycle |
| `packages/mcp-server/src/cli.ts` | mcp-server | Add `export` and `import` subcommands |
| `packages/api-server/src/index.ts` | api-server | Mount `/api/memory` route group; add auth middleware |
| `packages/api-server/src/routes/entities.ts` | api-server | Filter `valid_until IS NULL` by default; add `?include_history=true` |
| `packages/api-server/src/routes/graph.ts` | api-server | Include `strength`, `reinforcement_count` on relationship edges |

---

## Data Flow Changes

### Write Path (v5.0)

```
rememberEntity(content, entity_name, ...)
    │
    ├── resolveDedup()              [NEW: dedup-resolver.ts]
    │     ├── NOOP  → return early (exact duplicate)
    │     ├── QUEUE → approval_queue insert, return
    │     ├── UPDATE → retireObservation() first, then continue   [uses M1 columns]
    │     └── ADD   → continue normally
    │
    ├── upsertEntity()              [existing — find by name+type or insert]
    ├── insertObservation()         [now sets valid_from, valid_until=NULL]
    ├── embedText() → vec_embeddings
    ├── upsertRelationship()        [CHANGED: INSERT ... ON CONFLICT DO UPDATE strength/count]
    └── discoverRelationships()     [existing]
```

### Episode Log Path (v5.0)

```
logEpisode(event_type, payload, agent_id)
    │
    ├── insertEpisode()            [existing — synchronous, fast]
    │
    ├── setImmediate (async, non-blocking)
    │     ├── extractAndStoreEpisode()       [NEW: auto-extractor.ts]
    │     │     └── extractFacts() → rememberEntity() or approval_queue
    │     └── checkAndTriggerMicroConsolidation()  [NEW: consolidation-trigger.ts]
    │           └── if unconsolidated_count >= threshold: runConsolidation() async
    │
    └── return { id, session_id }  [immediate — not blocked by LLM]
```

### Recall Path (v5.0)

```
recallKnowledge(query, limit, as_of?, ...)
    │
    ├── embedText(query)
    ├── knnSearch with valid_until IS NULL filter  (or point-in-time as_of filter)
    ├── [for each returned result]
    │     ├── updateObservationAccess()   [NEW: bump last_accessed_at, access_count]
    │     └── computeEffectiveConfidence()  [NEW: decay.ts — added to return payload]
    └── return results with effective_confidence field
```

---

## Recommended Build Order

Features have dependencies flowing upward — build phases must respect them.

| Phase | Features | Why This Order |
|-------|----------|----------------|
| **Phase A** | Schema M1-M4 + type updates in `core` | All other features need correct types and columns. Zero functional change — safe to ship first as a standalone migration. |
| **Phase B** | Temporal versioning (F1) + Dedup resolver (F3) | F3 requires the `retireObservation` mechanism from F1. Both modify the write path together — ship atomically to avoid an intermediate broken state where UPDATE action has no retirement target. |
| **Phase C** | Relationship strength (F8) | Independent of Phase B. Can be developed in parallel. Only touches `insertRelationship` statement and `selectGraphRelationships`. |
| **Phase D** | Memory decay (F7) | Independent of B and C. New `decay.ts` module, access column updates on read path, nightly decay sweep. |
| **Phase E** | `memory-ops.ts` refactor (F6 prerequisite) | Must happen before REST write routes. Moving embed-client and functions from mcp-server to core is a refactor, not a feature — do it as its own phase to isolate risk. Tests must pass before moving on. |
| **Phase F** | REST API write routes (F6) | Builds on Phase E. Add `memory.ts` routes and auth middleware. |
| **Phase G** | Auto-extraction (F2) + Incremental consolidation (F4) | F2 is a prerequisite for F4's episode-level trigger. Both touch `logEpisode`. Ship together to avoid multiple modifications to the same function. |
| **Phase H** | Codebase ingestion (F5) + Import/export (F9) | Pure additions on top of stable write path from B-G. No dependencies on each other; can be developed in parallel within Phase H. |

---

## Architectural Patterns

### Pattern 1: Lazy Decay Computation

**What:** `effective_confidence` is computed on the fly at read time using `computeEffectiveConfidence()`, not written back to the database.

**When to use:** Any metric that degrades over time without user interaction. Single-user SQLite at local scale has no need for a decay writer process.

**Trade-offs:** Slightly more CPU on reads; avoids write storms, background job complexity, and stale-value problems. The `last_accessed_at` update on read is a tiny single-row UPDATE (fast path with the access index).

### Pattern 2: Fire-and-Forget Async for LLM Calls

**What:** Background LLM work (auto-extraction, micro-consolidation) is launched via `setImmediate()` inside synchronous MCP tool handlers. The tool response returns before the LLM call completes.

**When to use:** Any operation where the MCP caller should not block on Ollama latency. `log_episode` is the primary case — agents call it frequently.

**Trade-offs:** LLM errors are logged but invisible to the caller. Episodes are always saved (safe); extraction failure is recoverable (nightly cycle catches up). `.catch(console.error)` is the error surface.

### Pattern 3: Shared Business Logic in `packages/core`

**What:** Write operations and embedding logic live in `packages/core` rather than `packages/mcp-server`. Both the MCP tool handlers and the REST API routes import from `@myco/core`.

**When to use:** Any function that both MCP and REST need to call.

**Trade-offs:** `core` grows slightly larger, but the alternative (logic duplication or circular imports) is worse. The move is safe because `core` has no dependency on `mcp-server` — the direction of the refactor is already correct.

### Pattern 4: Migration-Safe Schema Evolution

**What:** Every schema change uses try/catch `ALTER TABLE` blocks in `schema.ts` that are safe to re-run on startup. New columns always have safe defaults.

**When to use:** Always. Never create a migration that fails on an existing database.

**Trade-offs:** No migration version tracking. Acceptable for single-user local SQLite where the schema only ever grows (no column removal, no renames).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Awaiting LLM in MCP Tool Response

**What people do:** Call `extractFacts()` inside `logEpisode()` and await it before returning.

**Why it's wrong:** LLM inference over Ollama takes 1–5 seconds. MCP `log_episode` is called on every agent action. Blocking here creates a 1-5 second freeze in every agent session.

**Do this instead:** `setImmediate(() => extractAndStoreEpisode(...).catch(console.error))`. The episode is written synchronously, the tool returns immediately, extraction happens in background.

### Anti-Pattern 2: Eager Decay Writes

**What people do:** Add a cron job that scans all entities every hour and writes updated decay scores to the DB.

**Why it's wrong:** Creates write pressure against the SQLite WAL, races with concurrent reads from the MCP server and API server, and the written score is stale the moment it's computed.

**Do this instead:** Compute `effective_confidence` lazily in `computeEffectiveConfidence()` at read time. Store only `last_accessed_at` (updated on access). The nightly cycle handles entities that have decayed below a meaningful threshold.

### Anti-Pattern 3: Business Logic Duplication Across MCP and REST

**What people do:** Implement `remember` logic directly in `tools.ts` and then re-implement it in `routes/memory.ts`.

**Why it's wrong:** Two implementations diverge. Bug fixes and feature additions (e.g., dedup, temporal versioning) must be applied twice.

**Do this instead:** `packages/core/src/memory-ops.ts` is the single source of truth. `tools.ts` and `routes/memory.ts` are thin adapters that validate transport-specific input and call the shared function.

### Anti-Pattern 4: `INSERT OR IGNORE` for Reinforceable Relationships

**What people do:** Keep the existing `INSERT OR IGNORE` for relationships after adding the `strength` and `reinforcement_count` columns.

**Why it's wrong:** Every duplicate relationship silently discards the reinforcement event. `reinforcement_count` never increments, `strength` never increases.

**Do this instead:** Use `ON CONFLICT(from_id, to_id, type) DO UPDATE SET reinforcement_count = reinforcement_count + 1, strength = MIN(1.0, strength + 0.1)`. The UNIQUE constraint is still enforced; conflict handling now does useful work.

---

## Integration Points Summary

### packages/core (touched by every feature)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `schema.ts` → DB | SQL DDL on startup | 4 new migration blocks added |
| `statements.ts` → `MycoStatements` | Prepared statements interface | ~15 new entries; `insertRelationship` changes from IGNORE to upsert |
| `types.ts` → all packages | TypeScript interfaces | `SourceType` union gains 3 new values; interfaces gain new optional columns |
| `memory-ops.ts` → mcp-server + api-server | Direct import (`@myco/core`) | The refactor that enables REST write routes |

### packages/mcp-server (new tools)

| Tool | Status | Notes |
|------|--------|-------|
| `remember` | Extended | Dedup resolver on write path |
| `recall` | Extended | `as_of` parameter; decay-adjusted effective_confidence |
| `log_episode` | Extended | Auto-extractor + micro-consolidation trigger (both async) |
| `codify` | New | Codebase ingestion |
| `export_graph` | New | Full JSON export |
| `import_graph` | New | Multi-format import |

### packages/api-server (new write surface)

| Route | Status | Notes |
|-------|--------|-------|
| `POST /api/memory/*` | New | Full write-path REST API; optional API key auth |
| `GET /api/entities/:id` | Extended | `valid_until IS NULL` default filter; `?include_history=true` option |
| `GET /api/graph` | Extended | `strength`, `reinforcement_count` on edges; `effective_strength` field |
| `GET /api/export` | New | Proxies `exportGraph()` |
| `POST /api/import` | New | Proxies `importGraph()` |

---

## Sources

- Direct analysis of `packages/core/src/schema.ts` — confirmed existing columns, migration pattern, all table structures (HIGH confidence)
- Direct analysis of `packages/core/src/statements.ts` — confirmed `INSERT OR IGNORE` on line 159, `MycoStatements` interface, all 88 prepared statements (HIGH confidence)
- Direct analysis of `packages/mcp-server/src/tools.ts` — confirmed `rememberEntity()`, `recallKnowledge()`, `forgetEntity()`, all MCP tool registrations (HIGH confidence)
- Direct analysis of `packages/mcp-server/src/consolidator.ts` — confirmed `extractFacts()`, `detectContradiction()`, `findMergeCandidates()` exist and are importable by new modules (HIGH confidence)
- Direct analysis of `packages/api-server/src/index.ts` — confirmed existing 5 route groups, read-only current state (HIGH confidence)
- SQLite documentation: `ON CONFLICT DO UPDATE` (upsert) syntax — standard SQLite 3.24+ feature (HIGH confidence)
- better-sqlite3 docs: synchronous API pattern — confirmed consistent with existing codebase usage (HIGH confidence)

---

*Architecture research for: Myco v5.0 Feature Parity & Differentiation*
*Researched: 2026-03-27*
