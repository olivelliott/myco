---
phase: 22-core-refactor-rest-write-routes-import-export
verified: 2026-03-29T15:01:51Z
status: gaps_found
score: 11/12 must-haves verified
gaps:
  - truth: "MCP tools produce identical results after refactor — no behavioral change"
    status: failed
    reason: "The vi.spyOn mock in the FTS5 fallback test targets '@myco/core/embed-client' (the subpath export), but recallKnowledge in memory-ops.ts imports embedText from the local './embed-client.js' module. After the phase 22-01 refactor the spy no longer intercepts the actual call, so recallKnowledge returns 'semantic' instead of 'fts', causing 1 test failure."
    artifacts:
      - path: "packages/mcp-server/tests/server.test.ts"
        issue: "vi.spyOn(embedClient, 'embedText') at line 238 mocks '@myco/core/embed-client' — a different module instance than the one imported by memory-ops.ts"
    missing:
      - "Fix the test spy to mock the correct module. Option A: update the test to import '../../core/src/embed-client.js' directly and spy on that. Option B: use vi.mock('@myco/core', ...) to replace the entire module. Option C: restructure the spy to use the resolved path that memory-ops resolves at runtime."
---

# Phase 22: Core Refactor — REST Write Routes & Import/Export Verification Report

**Phase Goal:** Business logic is accessible to both MCP tools and REST clients from a shared packages/core/memory-ops.ts module, the REST API exposes full write operations with OpenAPI documentation and optional auth, and users can export or import their entire knowledge graph via MCP tool or HTTP endpoint
**Verified:** 2026-03-29T15:01:51Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | rememberEntity, recallKnowledge, queryEntities, forgetEntity are importable from @myco/core | VERIFIED | All four exported from packages/core/src/memory-ops.ts and re-exported through packages/core/src/index.ts |
| 2 | MCP tools produce identical results after refactor — no behavioral change | FAILED | 1 test failing: FTS5 fallback test returns 'semantic' instead of 'fts' — spy no longer intercepts the correct module instance after refactor |
| 3 | embed-client, dedup, and relationship-discovery live in @myco/core | VERIFIED | All three files exist in packages/core/src/ with correct exports |
| 4 | POST /api/memory/remember, recall, forget, query return same results as MCP tools | VERIFIED | All four routes defined in packages/api-server/src/routes/memory.ts calling @myco/core functions |
| 5 | GET /api/docs serves interactive Swagger UI documentation | VERIFIED | swaggerUI({ url: '/api/spec' }) registered at /api/docs in index.ts; app.doc('/api/spec', ...) present |
| 6 | Requests without API key are rejected with 401 when MYCO_API_KEY is set | VERIFIED | apiKeyAuth() middleware checks process.env.MYCO_API_KEY, returns 401 with UNAUTHORIZED code when header missing or invalid |
| 7 | Requests pass through when MYCO_API_KEY is not set (auth disabled) | VERIFIED | auth.ts line 14: if (!apiKey) return next(); |
| 8 | export_graph MCP tool or GET /api/export produces complete JSON of entities, observations, relationships | VERIFIED | exportGraph() queries all three tables; export_graph MCP tool registered in tools.ts; GET /api/export registered in io.ts |
| 9 | Exported JSON includes retired observations (valid_until set) for temporal history | VERIFIED | importGraph SELECT: `SELECT * FROM observations ORDER BY created_at` — no valid_until filter, includes all observations |
| 10 | import_graph MCP tool or POST /api/import restores data with no duplication on re-import | VERIFIED | importGraph routes through classifyObservation for dedup; entity upsert checks selectEntityByNameType; relationship dedup via selectRelationshipExists |
| 11 | Mem0 format JSON is correctly imported via adapter | VERIFIED | normalizeMem0() in format-adapters.ts handles metadata.entity_name/entity_type grouping and catch-all 'mem0_import' entity |
| 12 | Anthropic JSONL format is correctly imported via adapter | VERIFIED | normalizeAnthropicJSONL() in format-adapters.ts parses JSONL lines, filters type='entity', processes observations array |

**Score:** 11/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/core/src/memory-ops.ts` | Core business logic for remember, recall, query, forget | VERIFIED | Exports rememberEntity, recallKnowledge, queryEntities, forgetEntity, logEpisode, reEmbedPending |
| `packages/core/src/embed-client.ts` | Ollama embedding functions | VERIFIED | Exports embedText, embedBatch — full implementation with timeout, health cooldown, batch fallback |
| `packages/core/src/dedup.ts` | Observation classification pipeline | VERIFIED | Exports classifyObservation, retireObservation, NEAR_DUP_DISTANCE_THRESHOLD |
| `packages/core/src/relationship-discovery.ts` | Auto-relationship discovery | VERIFIED | Exports discoverRelationships, createBackLinks, invalidateEntityCache |
| `packages/core/src/index.ts` | Updated barrel exports | VERIFIED | Exports all new modules including memory-ops, embed-client, dedup, relationship-discovery, import-export, format-adapters |
| `packages/api-server/src/routes/memory.ts` | Write route handlers for remember, recall, forget, query | VERIFIED | OpenAPIHono routes with createRoute, Zod schemas, openapi annotations |
| `packages/api-server/src/middleware/auth.ts` | Bearer token auth middleware | VERIFIED | apiKeyAuth() with timingSafeEqual, MYCO_API_KEY check, disabled when unset |
| `packages/api-server/src/index.ts` | OpenAPIHono app with spec and swagger UI | VERIFIED | new OpenAPIHono(), app.doc('/api/spec'), swaggerUI at /api/docs |
| `packages/core/src/import-export.ts` | exportGraph and importGraph functions | VERIFIED | exportGraph selects all three tables; importGraph with entity/observation/relationship processing order |
| `packages/core/src/format-adapters.ts` | Mem0 and Anthropic JSONL format normalizers | VERIFIED | normalizeMem0 and normalizeAnthropicJSONL fully implemented |
| `packages/api-server/src/routes/io.ts` | GET /api/export and POST /api/import endpoints | VERIFIED | registerIORoutes with both routes; auth applied to POST /api/import only |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| packages/mcp-server/src/tools.ts | @myco/core | import { rememberEntity, recallKnowledge, queryEntities, forgetEntity } | WIRED | Confirmed at lines 8-19 of tools.ts |
| packages/core/src/memory-ops.ts | packages/core/src/embed-client.ts | import { embedText } from './embed-client.js' | WIRED | Line 5 of memory-ops.ts |
| packages/api-server/src/routes/memory.ts | @myco/core | import { rememberEntity, recallKnowledge, queryEntities, forgetEntity } | WIRED | Lines 3-8 of memory.ts |
| packages/api-server/src/index.ts | /api/docs | swaggerUI({ url: '/api/spec' }) | WIRED | Line 61 of index.ts |
| packages/api-server/src/index.ts | /api/spec | app.doc('/api/spec', ...) | WIRED | Lines 57-60 of index.ts |
| packages/core/src/import-export.ts | packages/core/src/dedup.ts | classifyObservation | WIRED | Line 5 of import-export.ts; used at line 127 |
| packages/core/src/import-export.ts | packages/core/src/embed-client.ts | embedText for import observation embeddings | WIRED | Line 6 of import-export.ts; used at line 124 |
| packages/mcp-server/src/tools.ts | @myco/core | import { exportGraph, importGraph } from '@myco/core' | WIRED | Lines 15-18 of tools.ts |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| packages/api-server/src/routes/memory.ts | result from rememberEntity/recallKnowledge/queryEntities/forgetEntity | @myco/core functions → SQLite queries | Yes — functions execute real DB queries | FLOWING |
| packages/api-server/src/routes/io.ts | result from exportGraph/importGraph | @myco/core functions → full table SELECTs and INSERT pipeline | Yes — exportGraph queries all three tables; importGraph writes through dedup pipeline | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Core build succeeds | npx tsup ... --outDir packages/core/dist | Build success in 50ms, all modules emitted | PASS |
| Test suite: 146/147 tests pass | npx vitest run | 146 passed, 1 failed (FTS5 spy scoping issue) | FAIL |
| memory-ops.ts exports 5+ functions | grep export functions | rememberEntity, recallKnowledge, queryEntities, logEpisode, reEmbedPending, forgetEntity — 6 exported functions | PASS |
| MCP tools import from @myco/core | grep import.*rememberEntity.*@myco/core | Confirmed in tools.ts lines 8-19 | PASS |
| OpenAPIHono in api-server index.ts | grep OpenAPIHono | Confirmed at line 4 (import) and line 19 (instantiation) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| API-01 | 22-01, 22-02 | Memory write operations (remember, forget, import, export) accessible via HTTP endpoints | SATISFIED | POST /api/memory/remember, /recall, /forget, /query and POST /api/import all implemented and calling @myco/core |
| API-02 | 22-02 | REST API includes OpenAPI/Swagger documentation | SATISFIED | /api/spec (OpenAPI JSON) and /api/docs (Swagger UI) both present in api-server/src/index.ts |
| API-03 | 22-02 | Optional API key authentication protects write endpoints | SATISFIED | apiKeyAuth() middleware applied to /api/memory/* and /api/import; disabled when MYCO_API_KEY unset |
| IO-01 | 22-03 | User can export the entire knowledge graph as a JSON file via MCP tool | SATISFIED | export_graph MCP tool registered in tools.ts; exportGraph() exports all entities, observations, relationships |
| IO-02 | 22-03 | User can import knowledge from a JSON file via MCP tool | SATISFIED | import_graph MCP tool registered in tools.ts with file path + inline JSON support; all three formats handled |
| IO-03 | 22-03 | Export → import round-trip is idempotent (no data loss or duplication) | SATISFIED | importGraph skips existing entities (selectEntityByNameType check), routes observations through classifyObservation (NOOP/UPDATE/ADD), skips existing relationships (selectRelationshipExists check) |
| IO-04 | 22-03 | Import supports adapters for common formats (Mem0, MCP reference server JSONL) | SATISFIED | normalizeMem0() and normalizeAnthropicJSONL() implemented in format-adapters.ts; both exposed via MCP import_graph tool and POST /api/import |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| packages/mcp-server/tests/server.test.ts | 238 | `vi.spyOn(embedClient, 'embedText').mockResolvedValue(null)` mocks wrong module instance | Warning (Blocker for goal truth #2) | Spy targets the @myco/core/embed-client subpath export; memory-ops.ts resolves embedText from a different module instance, so the mock has no effect — FTS5 fallback path not exercised, test asserts 'fts' but gets 'semantic' |

### Human Verification Required

#### 1. Swagger UI renders correctly in browser

**Test:** Start the api-server and navigate to `http://localhost:{apiPort}/api/docs`
**Expected:** Interactive Swagger UI loads showing all four /api/memory/* routes and /api/export, /api/import with request/response schemas
**Why human:** Cannot start server programmatically in verification; OpenAPI spec correctness and Swagger UI rendering require visual confirmation

#### 2. Auth rejection when MYCO_API_KEY is set

**Test:** Set `MYCO_API_KEY=test123`, start api-server, send `POST /api/memory/remember` without an Authorization header
**Expected:** Response is `401 { "error": { "message": "Unauthorized", "code": "UNAUTHORIZED", "status": 401 } }`
**Why human:** Requires a running server with env var configuration

#### 3. Idempotent round-trip (IO-03 end-to-end)

**Test:** Call `export_graph` MCP tool, then `import_graph` with the exported JSON, then call `export_graph` again and compare entity/observation/relationship counts
**Expected:** Counts are identical before and after import (no duplication)
**Why human:** Requires a running MCP server with live data

### Gaps Summary

One gap blocks full goal achievement: the FTS5 fallback test regression introduced by the phase 22-01 refactor.

**Root cause:** Before the refactor, the test at `packages/mcp-server/tests/server.test.ts:238` imported and spied on `../src/embed-client.js` directly — the exact module instance that `tools.ts` (and through it, the business logic) would use. The phase 22-01 refactor correctly moved `embedText` to `@myco/core`, and the test import was updated to `@myco/core/embed-client`. However, `memory-ops.ts` imports `embedText` via a relative `./embed-client.js` path, which at runtime resolves to a *different* module instance than the `@myco/core/embed-client` subpath export. Vitest's ESM module cache treats them as distinct, so the spy never intercepts the actual `embedText` call inside `recallKnowledge`.

The fix is small and isolated to the test file. The business logic and all production code are correct — this gap only affects test coverage fidelity.

---

_Verified: 2026-03-29T15:01:51Z_
_Verifier: Claude (gsd-verifier)_
