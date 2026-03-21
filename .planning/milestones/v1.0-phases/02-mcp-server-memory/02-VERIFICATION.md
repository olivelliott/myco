---
phase: 02-mcp-server-memory
verified: 2026-03-21T00:45:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 02: MCP Server Memory Verification Report

**Phase Goal:** Claude Code agents can write episodes and retrieve relevant knowledge from the brain using natural language
**Verified:** 2026-03-21T00:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Calling remember stores an embedding vector in vec_embeddings when Ollama is running | VERIFIED | `tools.ts:118-121` — INSERT INTO vec_embeddings with Float32Array after non-null embedText response |
| 2  | Calling remember succeeds and flags the observation as needs_embedding when Ollama is unavailable | VERIFIED | `tools.ts:124-127` — UPDATE observations SET needs_embedding = 1 when embedText returns null; test at line 208 confirms write succeeds |
| 3  | Every observation insert also populates the fts_observations FTS5 table | VERIFIED | `tools.ts:109-112` — INSERT INTO fts_observations (content, observation_id) on every observation write; test at line 190 confirms row exists |
| 4  | The schema migration adds needs_embedding column to existing databases without error | VERIFIED | `schema.ts:88-92` — ALTER TABLE wrapped in try/catch; idempotent on both fresh and existing databases |
| 5  | recall returns semantically relevant results using vector KNN search when embeddings exist | VERIFIED | `tools.ts:184-223` — WITH knn AS (SELECT FROM vec_embeddings WHERE embedding MATCH ? AND k = ?) CTE with observation and entity joins |
| 6  | recall falls back to FTS5 full-text search when Ollama is unavailable for the query embedding | VERIFIED | `tools.ts:226-262` — FTS5 fallback path when embedText returns null; test at line 232 confirms method:"fts" returned |
| 7  | recall response includes entity_name, entity_type, observation content, confidence, relevance_score, and method field | VERIFIED | `tools.ts:209-229` — all six fields present in both semantic and FTS5 response paths |
| 8  | query returns entities filtered by name, type, or relationship with observation counts | VERIFIED | `tools.ts:265-332` — dynamic SQL with observation_count and relationship_count subqueries; tests at lines 280, 298 confirm filtering |
| 9  | log_episode creates a timestamped episode record with session_id, agent_id, event_type, and payload | VERIFIED | `tools.ts:334-350` — INSERT INTO episodes with all required fields; test at line 345 confirms DB row with correct payload |
| 10 | Episodes logged by different agents have distinct agent_id values in the database (EPSD-02) | VERIFIED | `tools.ts:339` — prov.agent_id passed through buildProvenance; test at line 374 asserts two rows with distinct agent-alpha and agent-beta values |
| 11 | Episodes are not queryable via recall or query tools | VERIFIED | No `FROM episodes` in recallKnowledge or queryEntities functions; test at line 263 confirms episode content absent from recall results |
| 12 | Server re-embeds needs_embedding rows on startup when Ollama is available | VERIFIED | `index.ts:11-17` — non-blocking reEmbedPending(db).then(...).catch(...) fires after openDatabase(); reEmbedPending at tools.ts:354-378 processes up to 50 rows |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/mcp-server/src/embed-client.ts` | Lazy singleton Ollama embed client with 2s timeout | VERIFIED | 41 lines; exports `embedText`; `AbortSignal.timeout(HEALTH_TIMEOUT_MS)` on every fetch; returns `number[] | null` |
| `packages/core/src/schema.ts` | FTS5 virtual table + needs_embedding ALTER TABLE migration | VERIFIED | `CREATE VIRTUAL TABLE IF NOT EXISTS fts_observations USING fts5(` at line 70; ALTER TABLE migration at line 89; `idx_observations_needs_embedding` partial index at line 96 |
| `packages/mcp-server/src/tools.ts` | recall, query, log_episode implementations + rememberEntity async | VERIFIED | 465 lines; exports `rememberEntity`, `recallKnowledge`, `queryEntities`, `logEpisode`, `reEmbedPending`, `registerTools`; all four MCP tools registered |
| `packages/mcp-server/src/index.ts` | Startup re-embed sweep | VERIFIED | `reEmbedPending` imported and called async at startup (lines 5, 11-17) |
| `packages/mcp-server/tests/server.test.ts` | Tests for all new functionality | VERIFIED | 43 tests passing; covers FTS5 fallback, query filters, log_episode, EPSD-02 per-agent isolation, EPSD-03 episode recall isolation, reEmbedPending |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tools.ts` | `embed-client.ts` | `import { embedText } from './embed-client.js'` | WIRED | Line 6 of tools.ts; embedText called at lines 115, 179, 364 |
| `tools.ts` (rememberEntity) | `vec_embeddings` table | `INSERT INTO vec_embeddings` with Float32Array | WIRED | Lines 118-121; result used in embedding pipeline |
| `tools.ts` (rememberEntity) | `fts_observations` table | `INSERT INTO fts_observations` | WIRED | Lines 109-112; every observation insert triggers FTS5 row |
| `tools.ts` (recallKnowledge) | `vec_embeddings` table | `embedding MATCH` KNN CTE | WIRED | Lines 185-203; KNN CTE joins observations and entities |
| `tools.ts` (recallKnowledge) | `fts_observations` table | `fts_observations MATCH` fallback | WIRED | Lines 228-242; fallback when embedText returns null |
| `tools.ts` (queryEntities) | `entities + observations + relationships` | `FROM entities e` with dynamic WHERE | WIRED | Lines 293-301; observation and relationship count subqueries |
| `tools.ts` (logEpisode) | `episodes` table | `INSERT INTO episodes` | WIRED | Lines 342-345 |
| `index.ts` | `tools.ts` (reEmbedPending) | `import { reEmbedPending }` | WIRED | Line 5 of index.ts; called at line 11 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SRCH-01 | 02-01 | Local embeddings via Ollama (nomic-embed-text) for all observations | SATISFIED | embed-client.ts uses EMBED_MODEL='nomic-embed-text'; embedText called inline in rememberEntity |
| SRCH-02 | 02-02 | Vector similarity search via sqlite-vec for semantic recall | SATISFIED | recallKnowledge uses KNN CTE with `WHERE embedding MATCH ?` and `k = ?` params |
| SRCH-03 | 02-02 | Multi-access retrieval: exact entity lookup, tag/type filter, and semantic similarity | SATISFIED | query tool handles exact name and type filter; recall handles semantic; FTS5 handles text fallback |
| SRCH-04 | 02-01 | Graceful degradation when Ollama unavailable | SATISFIED | embedText returns null on timeout/error; rememberEntity sets needs_embedding=1; reEmbedPending backfills on startup |
| EPSD-01 | 02-02 | Timestamped episode log with agent_id and context payload | SATISFIED | logEpisode inserts id, session_id, agent_id, event_type, payload, created_at via buildProvenance |
| EPSD-02 | 02-02 | Per-agent episode isolation — each agent session has its own episode stream | SATISFIED | agent_id stored per episode; test at line 374 asserts distinct agent-alpha and agent-beta values |
| EPSD-03 | 02-02 | Episodes are raw consolidation input, not queryable by agents | SATISFIED | No `FROM episodes` in recall or query functions; test confirms episode content absent from recall results |

All 7 requirements for Phase 2 are satisfied. No orphaned requirements found — REQUIREMENTS.md traceability table maps SRCH-01 through EPSD-03 to Phase 2 and marks all as Complete.

---

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments in phase 02 files. The `return null` at embed-client.ts:38 is intentional graceful degradation behavior, not a stub.

---

### Human Verification Required

#### 1. Semantic recall with live Ollama

**Test:** Start the MCP server with Ollama running and `nomic-embed-text` pulled. Use `remember` to store several observations, then use `recall` with a semantically related but lexically different query (e.g., store "TypeScript is a typed superset of JavaScript", recall "statically typed language").
**Expected:** Results return with `metadata.method: "semantic"` and the observation appears in results despite no keyword overlap.
**Why human:** Tests run without Ollama so only the FTS5 path is exercised. The semantic KNN path cannot be integration-tested without a live Ollama instance.

#### 2. FTS5 phrase query special character handling

**Test:** Store an observation containing FTS5 special characters (e.g., `"AND"`, `"OR"`, quotes). Recall using a query containing those characters.
**Expected:** Query does not throw a SQLite FTS5 syntax error; returns graceful empty results or matching results.
**Why human:** The phrase-quoting (`'"' + query.replace(/"/g, '""') + '"'`) sanitizes double quotes but FTS5 has other special tokens. Edge case behavior not covered by tests.

---

### Gaps Summary

No gaps. All 12 must-haves are verified. The phase goal — agents can write episodes and retrieve relevant knowledge using natural language — is fully achieved by the implemented code.

The only two items flagged for human verification are integration-level behaviors (live Ollama semantic search, FTS5 special character edge cases) that cannot be confirmed programmatically. They do not block the goal; the FTS5 fallback ensures the system is functional without Ollama.

---

_Verified: 2026-03-21T00:45:00Z_
_Verifier: Claude (gsd-verifier)_
