---
phase: 09-config-embedding-performance
verified: 2026-03-25T15:37:00Z
status: human_needed
score: 6/7 must-haves verified
re_verification: false
human_verification:
  - test: "Place a .env file at project root with OLLAMA_HOST=http://custom-host:11434, start the MCP server, and inspect stderr output"
    expected: "[config] ollamaHost = http://custom-host:11434 appears in stderr and Ollama requests go to that host"
    why_human: "Cannot start an MCP server or inject a .env file programmatically in a static verification pass; requires a live process with a real .env file present"
---

# Phase 9: Config + Embedding Performance Verification Report

**Phase Goal:** The MCP server starts with a reproducible, logged configuration and the embedding client is resilient — singleton-managed, health-cached, and batch-capable
**Verified:** 2026-03-25T15:37:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                      | Status     | Evidence                                                                                                 |
|-----|--------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------------|
| 1   | Running myco with a .env file containing OLLAMA_HOST causes that host to be used           | ? HUMAN    | `loadConfig()` calls `dotenv.config()` then reads `process.env.OLLAMA_HOST`; runtime proof needs live server |
| 2   | The server prints resolved configuration values to stderr at startup                        | ✓ VERIFIED | `console.error('[config] ollamaHost = ...')` etc. in `config.ts` lines 34-39; all 6 keys logged          |
| 3   | A .env.example file exists at the project root documenting all supported env vars           | ✓ VERIFIED | `.env.example` exists at root; contains all 7 vars: MYCO_DB_PATH, BRAIN_DB_PATH, OLLAMA_HOST, OLLAMA_EMBED_MODEL, BRAIN_CONSOLIDATION_MODEL, MYCO_API_PORT, MYCO_LOG_LEVEL |
| 4   | Embedding calls during a consolidation run share a single Ollama client instance            | ✓ VERIFIED | `embed-client.ts`: module-level `let client: Ollama | null = null`; `getClient()` creates once and reuses; `grep -c "new Ollama"` returns 1 |
| 5   | When Ollama is unreachable, subsequent embedding calls within 30s return fast-fail null     | ✓ VERIFIED | `HEALTH_COOLDOWN_MS = 30_000`; `lastFailureMs` set by `markUnhealthy()`; `isHealthy()` gates every call; `embedText` returns `null` immediately when cooldown active |
| 6   | dotenv loads before any module reads process.env at import time                             | ✓ VERIFIED | `index.ts` lines 2-3: `import { loadConfig } from '@myco/core'; loadConfig();` before all other imports; consolidator fixed to lazy `getConsolidationModel()` function |
| 7   | reEmbedPending sends all pending texts in one batch call instead of one-at-a-time          | ✓ VERIFIED | `tools.ts` line 380-381: `const texts = rows.map(r => r.content); const embeddings = await embedBatch(texts);` — single batch call, no per-row loop |

**Score:** 6/7 truths verified (1 requires human confirmation of live .env behaviour)

---

### Required Artifacts

| Artifact                                        | Provides                                   | Exists | Substantive | Wired | Status     |
|-------------------------------------------------|--------------------------------------------|--------|-------------|-------|------------|
| `packages/core/src/config.ts`                   | loadConfig/getConfig with dotenv + logging | yes    | yes (55 lines, full impl) | yes (exported via index.ts, called in 3 entry points) | ✓ VERIFIED |
| `.env.example`                                  | Template of all supported env vars         | yes    | yes (24 lines, 7 vars)    | N/A (documentation file) | ✓ VERIFIED |
| `packages/mcp-server/src/embed-client.ts`       | Singleton, health cooldown, batch API      | yes    | yes (89 lines, full impl) | yes (imported by tools.ts and consolidator.ts) | ✓ VERIFIED |
| `packages/mcp-server/src/tools.ts`              | reEmbedPending using batch embedding       | yes    | yes (modified reEmbedPending at line 369) | yes (called from index.ts at startup) | ✓ VERIFIED |

---

### Key Link Verification

| From                                       | To                              | Via                                         | Status     | Details                                                             |
|--------------------------------------------|---------------------------------|---------------------------------------------|------------|---------------------------------------------------------------------|
| `packages/mcp-server/src/index.ts`         | `packages/core/src/config.ts`   | `import { loadConfig }` line 2, called line 3 | ✓ WIRED    | `loadConfig()` is line 3, before all other imports                  |
| `packages/api-server/src/index.ts`         | `packages/core/src/config.ts`   | `import { loadConfig }` line 1, `const config = loadConfig()` line 2 | ✓ WIRED | Port driven by `config.apiPort` in serve() line 31 and log line 33 |
| `packages/mcp-server/src/cli.ts`           | `packages/core/src/config.ts`   | `import { loadConfig }` line 9, called line 10 | ✓ WIRED  | Appears before `openDatabase` import on line 11                     |
| `packages/mcp-server/src/embed-client.ts`  | ollama npm package              | `let client: Ollama | null = null` at module scope; `new Ollama(...)` inside `getClient()` | ✓ WIRED | Exactly 1 `new Ollama` instantiation confirmed |
| `packages/mcp-server/src/embed-client.ts`  | health cooldown                 | `let lastFailureMs = 0` at module scope; checked in `isHealthy()` | ✓ WIRED | `HEALTH_COOLDOWN_MS = 30_000`; used correctly in both `embedText` and `embedBatch` |
| `packages/mcp-server/src/tools.ts`         | `embed-client.ts`               | `import { embedText, embedBatch }` line 7; `embedBatch(texts)` in reEmbedPending | ✓ WIRED | `embedText` still used at lines 121 and 194 for single-item calls  |

---

### Data-Flow Trace (Level 4)

| Artifact                  | Data Variable     | Source                     | Produces Real Data | Status      |
|---------------------------|-------------------|----------------------------|--------------------|-------------|
| `config.ts:loadConfig()`  | `config.ollamaHost` | `process.env.OLLAMA_HOST` via `dotenv.config()` | Yes — reads live env after dotenv.config() populates process.env | ✓ FLOWING |
| `embed-client.ts:getClient()` | `client` (Ollama instance) | `process.env.OLLAMA_HOST` at first call | Yes — lazy read after dotenv loads | ✓ FLOWING |
| `tools.ts:reEmbedPending()` | `embeddings` | `embedBatch(texts)` → single Ollama call | Yes — real batch API call (falls back to sequential on error) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior                                         | Command                                  | Result                        | Status  |
|--------------------------------------------------|------------------------------------------|-------------------------------|---------|
| Test suite passes (72 tests, all modules loaded) | `npx vitest run`                         | 72/72 passed, 4 test files    | ✓ PASS  |
| `loadConfig` and `getConfig` exported from core barrel | `grep "loadConfig\|getConfig" packages/core/src/index.ts` | Both present on line 4 | ✓ PASS |
| Single Ollama instantiation in embed-client      | `grep -c "new Ollama" packages/mcp-server/src/embed-client.ts` | Returns 1 | ✓ PASS |
| No module-scope env read in consolidator         | `grep "const CONSOLIDATION_MODEL = process.env" packages/mcp-server/src/consolidator.ts` | No match | ✓ PASS |
| `embedBatch` wired in reEmbedPending             | `grep "embedBatch" packages/mcp-server/src/tools.ts` | Lines 7 and 381 | ✓ PASS |
| .env.example contains all required vars          | File read directly                       | 7 vars present with defaults  | ✓ PASS  |
| .env file with OLLAMA_HOST changes active host   | Requires live server with .env file      | Cannot test statically        | ? SKIP  |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                              | Status      | Evidence                                                              |
|-------------|-------------|--------------------------------------------------------------------------|-------------|-----------------------------------------------------------------------|
| CONFIG-01   | 09-01       | Server loads .env file at startup via dotenv before reading any env vars | ✓ SATISFIED | `dotenv.config()` called in `loadConfig()`; all 3 entry points call `loadConfig()` as first code |
| CONFIG-02   | 09-01       | Resolved configuration is logged to stderr at startup                    | ✓ SATISFIED | `console.error('[config] ...')` for all 6 config keys in `config.ts` lines 34-39 |
| CONFIG-03   | 09-01       | .env.example documents all supported environment variables               | ✓ SATISFIED | `.env.example` at project root with all 7 vars and defaults/comments  |
| EMBED-01    | 09-02       | Ollama client is a singleton reused across all embedding calls           | ✓ SATISFIED | `let client: Ollama | null = null`; `getClient()` creates once; 1 `new Ollama(` in file |
| EMBED-02    | 09-02       | Failed Ollama connections trigger 30s cooldown before retrying           | ✓ SATISFIED | `HEALTH_COOLDOWN_MS = 30_000`; `lastFailureMs` + `isHealthy()` + `markUnhealthy()` present and called |
| EMBED-03    | 09-02       | Batch embedding uses Ollama's string[] input for multiple texts in one call | ✓ SATISFIED | `ollama.embed({ model: EMBED_MODEL, input: batch })` where `batch` is `string[]` |
| EMBED-04    | 09-02       | reEmbedPending processes all pending observations in a single batch call | ✓ SATISFIED | `embedBatch(texts)` called once with `texts = rows.map(r => r.content)` in reEmbedPending |

All 7 requirement IDs from plan frontmatter are accounted for. No orphaned requirements detected.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TODOs, FIXMEs, placeholders, empty returns, or hardcoded stubs found in any phase-modified file.

---

### Human Verification Required

#### 1. OLLAMA_HOST .env override reaches the Ollama client

**Test:** Create a `.env` file at the project root containing `OLLAMA_HOST=http://custom-host:11434`, then start the MCP server (e.g. `npx tsx packages/mcp-server/src/index.ts`).

**Expected:** Stderr shows `[config] ollamaHost = http://custom-host:11434`. Any embedding call should attempt to reach `http://custom-host:11434` (will fail if unreachable, but the host string should appear in the error).

**Why human:** Static verification cannot start a live Node.js process with a .env file in place. The code path (`dotenv.config()` → `process.env.OLLAMA_HOST` → `getClient()`) is structurally correct, but the end-to-end .env → active host substitution requires a running process to confirm.

---

### Gaps Summary

No gaps blocking goal achievement. All artifacts exist with substantive implementations and are correctly wired. The one item flagged for human verification (OLLAMA_HOST .env round-trip) is a runtime confirmation of a mechanically correct code path, not a missing implementation.

---

_Verified: 2026-03-25T15:37:00Z_
_Verifier: Claude (gsd-verifier)_
