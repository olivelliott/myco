# Project Research Summary

**Project:** ai-workbots — AI Agent Persistent Memory System
**Domain:** Local-first MCP server + knowledge graph + embedding pipeline + PWA dashboard
**Researched:** 2026-03-20
**Confidence:** HIGH

## Executive Summary

This project is a local-first persistent memory system for Claude Code agents — a domain where production patterns are well-established (Mem0, Zep, Letta, mcp-memory-service) but no existing solution combines all the required capabilities: local-only operation, semantic retrieval, offline consolidation with LLM assistance, human-in-the-loop approval, and a visual PWA. The correct architecture is a dual-transport monorepo: an MCP stdio server and a Hono REST API server both importing a shared `core` library, all backed by a single SQLite database. This separates business logic from transport concerns and avoids the drift that occurs when the MCP surface and the PWA surface are built independently.

The recommended approach is a two-phase write model: agents write lightweight episode logs synchronously during sessions (no LLM inference on the hot path), and a nightly consolidation pass uses an LLM to extract facts, score confidence, and route high-confidence findings directly to the knowledge graph while surfacing contradictions and low-confidence inferences to a human approval queue. This pattern — validated by MAGMA and AriGraph research — produces higher-quality knowledge than inline extraction because it can reason across multiple episodes and because it never blocks agent sessions with slow inference calls.

The primary risks are three-fold: (1) security — memory poisoning via injected episodes can create persistent, trust-elevated false memories that survive consolidation; (2) quality — LLM hallucination during consolidation can auto-approve fabricated facts into the graph; (3) usability — an approval queue with poor threshold calibration will either flood the user (causing them to ignore it) or silently accept bad facts. All three risks are mitigable through provenance tracking at episode write time, evidence-quote requirements in consolidation prompts, and disciplined confidence threshold tuning. These must be designed in from day one, not retrofitted.

---

## Key Findings

### Recommended Stack

The stack is fully local and TypeScript-native throughout. The MCP server layer uses `@modelcontextprotocol/sdk@1.27.1` with `StdioServerTransport` — the only correct choice for Claude Code integration. Storage is `better-sqlite3@12.8.0` (synchronous API suits MCP's request/response model) with `sqlite-vec@0.1.7` for vector similarity search in the same SQLite file. Embeddings are generated via the `ollama@0.6.3` npm client against a locally running `nomic-embed-text` model (768 dimensions). The HTTP layer is `hono@4.x` — TypeScript-native and lightweight. The PWA frontend is React 19 + Vite 8 + `vite-plugin-pwa@1.1.0` with TanStack Query for the approval queue mutation flow and `react-force-graph-2d` for the graph explorer. Key constraint: do NOT use Next.js for the PWA (SSR overhead, complex service worker), do NOT use `@xenova/transformers` in-process embeddings (500MB+ RAM, no GPU), do NOT copy the official Anthropic memory server's JSONL storage pattern.

**Core technologies:**
- `@modelcontextprotocol/sdk@1.27.1`: MCP server framework — official, handles stdio transport and Zod-validated tool schemas
- `better-sqlite3@12.8.0`: SQLite driver — synchronous API is a feature for MCP; Node.js 20+ required
- `sqlite-vec@0.1.7`: Vector search extension — KNN search in the same SQLite file, no separate vector DB needed
- `ollama@0.6.3` + `nomic-embed-text`: Local embeddings — privacy-preserving, GPU-accelerated, 768-dim vectors
- `hono@4.x`: HTTP API server — TypeScript-native, serves PWA data from the same brain.db
- `React 19 + Vite 8 + vite-plugin-pwa@1.1.0`: PWA frontend — installable, offline-capable dashboard
- `TanStack Query@5.91.2`: Server state management — handles approval queue mutations and polling
- `react-force-graph-2d`: Graph visualization — Canvas-based, handles 100–10k nodes comfortably
- `node-cron@4.2.1` (or `croner`): Scheduled consolidation — 2am nightly batch trigger, in-process
- `Zod@4.3.6`: Schema validation — peer dep of MCP SDK; 14x faster than v3, use v4 throughout

### Expected Features

**Must have (table stakes) — these define the product:**
- MCP tool surface (`remember`, `recall`, `query`, `log_episode`, `get_context`) — without these, agents cannot interact with memory at all
- Cross-session persistence via SQLite — the entire value proposition
- Entity + relation + observation knowledge graph — the standard primitive across all serious MCP memory servers
- Episodic log with provenance (session ID, agent ID, source type, timestamps) — required input for consolidation AND the primary memory poisoning defense
- Semantic search via Ollama + sqlite-vec — keyword-only search produces unacceptable recall quality in 2026
- Deep sleep consolidation pipeline — nightly batch LLM pass over unconsolidated episodes, writes to graph
- Confidence-scored approval queue — auto-approve high-confidence facts, surface contradictions and merges to human review

**Should have (differentiators — reason this project exists):**
- PWA approval queue UI — the human-in-the-loop workflow is unusable without a UI; this is P1, not P2
- PWA knowledge graph explorer — no existing local MCP memory server has visual introspection
- PWA activity dashboard — session timeline, auto-approve log, pending queue count
- GSD hook integration — captures structured phase transitions as high-signal episodes
- Per-agent episode isolation with shared knowledge graph — separate episode histories, shared brain
- Manual consolidation trigger (CLI + PWA button) — "checkpoint now" before starting a new project

**Defer (v2+):**
- Cloud sync / multi-device — contradicts local-first privacy constraint; separate product
- Richer typed relation schemas — defer until usage patterns reveal needed structure
- Larger embedding models (mxbai-embed-large) — profile quality gap before taking on overhead
- Push notifications for pending approvals — nice-to-have, not blocking value

### Architecture Approach

The system uses a shared-core, dual-transport monorepo pattern. A `packages/core` library contains all business logic (EpisodeStore, GraphStore, EmbeddingPipeline, ConsolidationEngine, ApprovalQueue) and is imported by both the MCP server process and the REST API server process. These two processes communicate only through the shared `brain.db` SQLite file in WAL mode — never via IPC. This is intentional: WAL mode handles concurrent readers/writers safely, and the separation keeps MCP server lifecycle (launched per-session by Claude Code) cleanly isolated from the REST API server lifecycle (persistent background service managed by launchd or pm2).

**Major components:**
1. **MCP Server** (`packages/mcp-server`) — thin stdio adapter; registers tools, delegates to core; launched by Claude Code
2. **REST API Server** (`packages/api-server`) — Hono HTTP server + node-cron scheduler; serves PWA; runs as persistent background service
3. **Brain Core Library** (`packages/core`) — all business logic; EpisodeStore, GraphStore, EmbeddingPipeline, ConsolidationEngine, ApprovalQueue
4. **SQLite brain.db** — single file, WAL mode, shared by both server processes; stores entities, relationships, observations, episodes, vec_embeddings, approval_queue
5. **Ollama (external)** — local embedding service on localhost:11434; system must degrade gracefully when unavailable
6. **PWA** (`packages/pwa`) — React + Vite; talks to REST API over localhost; never accesses SQLite directly

### Critical Pitfalls

1. **SQLite without WAL mode** — concurrent MCP sessions silently drop episodes with `SQLITE_BUSY`. Enable `journal_mode = WAL` and `busy_timeout = 5000` at connection open time. Run `PRAGMA wal_checkpoint(TRUNCATE)` at consolidation start. Must be in Phase 1 — cannot be retrofitted.

2. **Memory poisoning via injected episodes** — documents/files the agent reads can contain embedded instructions that survive consolidation into permanent graph facts. Tag every episode with `source_type` (agent-reasoned vs file-read vs tool-output) at write time. Apply lower confidence and mandatory human review to all externally-sourced fact extractions during consolidation.

3. **LLM hallucination during consolidation** — the LLM fills gaps in ambiguous episode logs with plausible but fabricated facts, which get auto-approved at high confidence. The consolidation prompt must require a direct evidence quote from the episode text for every extracted fact. Start auto-approve threshold at 0.90, not 0.75. Spot-check 10% of auto-approved facts in early cycles.

4. **Approval queue fatigue** — conservative thresholds produce 30–50 queue items per consolidation cycle; users bulk-approve or disable the feature. Target no more than 5–10 items per cycle. Only three categories belong in the queue: direct contradictions, entity merge proposals, and externally-sourced facts. Routine low-confidence facts that don't contradict anything go to a "tentative" graph layer, not the queue.

5. **Ollama dependency on the critical path** — if Ollama is not running, all memory operations fail. Episode writes must succeed without embeddings (write text, flag for re-embedding). `recall` must fall back to FTS5 full-text search when Ollama is unavailable. Health check on MCP server startup with a clear user-facing message, not a crash.

---

## Implications for Roadmap

The architecture research defines a strict build-order dependency chain. Each phase unlocks the next. Feature research confirms this ordering — the approval queue needs consolidation, consolidation needs the episode log, the PWA needs the REST API, and so on. The suggested phases map directly to architectural components.

### Phase 1: Storage Foundation

**Rationale:** Everything depends on a correctly configured database. SQLite schema and WAL mode must be established before any other code is written — retrofitting WAL mode and concurrent-access patterns is high-cost. This is also where the critical pitfall (WAL mode) must be addressed.

**Delivers:** `brain.db` with full schema (entities, relationships, observations, episodes, vec_embeddings, embedding_refs, approval_queue), WAL mode + busy_timeout enabled, numbered SQL migration system, singleton DB client in `packages/core`.

**Addresses features:** Cross-session persistence (table stakes), provenance/source tracking on all tables.

**Avoids pitfalls:** SQLite concurrency failure; PWA-cannot-access-SQLite-directly (HTTP API architecture must be decided here, before PWA phase begins).

**Research flag:** Standard — well-documented SQLite patterns. Skip phase research.

---

### Phase 2: MCP Server + Episode Logging

**Rationale:** The MCP server is the primary interface between agents and the brain. Episode logging must come before semantic search or consolidation — you cannot consolidate episodes that haven't been captured. This phase also establishes the provenance schema that defends against memory poisoning.

**Delivers:** Working MCP server (StdioServerTransport), `log_episode()` and basic `get_context()` tools, EpisodeStore with full provenance fields (source_type, agent_session_id, trust_level), Claude Code MCP config.

**Addresses features:** MCP tool surface (table stakes), episodic log capture (table stakes), write operations from agent tools.

**Avoids pitfalls:** Memory poisoning — provenance fields are cheap to add here and expensive to retrofit later.

**Research flag:** Standard — MCP SDK patterns are well-documented. Skip phase research.

---

### Phase 3: Embedding Pipeline + Semantic Recall

**Rationale:** Semantic recall is table stakes in 2026. This phase wires Ollama to the episode and graph stores and implements the recall/query MCP tools. Must be designed with graceful degradation (Ollama unavailable = FTS5 fallback) from the start, not added later.

**Delivers:** OllamaClient wrapper with health check and graceful degradation, EmbeddingPipeline (embed-then-store, content-hash cache, async — never on hot path), `recall()` and `query()` MCP tools with recency-weighted semantic search (max 7 results, 0.7 cosine threshold), FTS5 fallback for when Ollama is unavailable.

**Addresses features:** Semantic search (table stakes), basic retrieval operations (exact + tag + semantic).

**Avoids pitfalls:** Ollama dependency failures; context rot (recall result count bounded to 7 from day one).

**Research flag:** Standard patterns for Ollama + sqlite-vec integration. Skip phase research.

---

### Phase 4: Consolidation Engine

**Rationale:** This is the most complex and highest-risk phase. The consolidation engine is the core differentiator — no existing local MCP memory server has a dedicated offline pass. It must be built with evidence-quote requirements, trust-level differentiation, and properly calibrated confidence thresholds. The approval queue is populated here.

**Delivers:** ConsolidationEngine.runDeepSleep(), LLM triplet extractor (evidence-quote required per fact), confidence scorer (separate thresholds for facts vs entity merges: 0.90 for auto-approve, 0.95 for merges), entity merger with alias tracking, ApprovalQueue routing (contradictions + merges + external-source facts only), manual CLI trigger (`brain consolidate`), episode batching (50 episodes max per LLM call).

**Addresses features:** Deep sleep consolidation (key differentiator), confidence-scored approval queue (key differentiator), per-agent isolation with shared brain.

**Avoids pitfalls:** LLM hallucination (evidence-quote requirement in prompt); approval queue fatigue (three-category routing, not confidence-only); entity identity collapse (two-pass resolution + alias tracking).

**Research flag:** NEEDS PHASE RESEARCH — consolidation prompt engineering, confidence calibration, and entity resolution strategies are nuanced and domain-specific. The LLM extraction prompt design is not well-documented for this use case.

---

### Phase 5: REST API + Cron Scheduler

**Rationale:** The PWA cannot access SQLite directly. The REST API must exist before any PWA development begins. Cron scheduler colocates with the API server (same process), not the MCP server (per-session subprocess). This phase is a thin adapter over the existing Core library.

**Delivers:** Hono REST API server on localhost:3747 bound to 127.0.0.1 (not 0.0.0.0), full route set (/graph, /entities/:id, /episodes, /approval-queue, /approval/:id/approve, /approval/:id/reject), node-cron 2am EST consolidation trigger, CORS for localhost only, launchd/pm2 service configuration.

**Addresses features:** PWA backend requirement (all PWA features depend on this); manual consolidation trigger exposed via API.

**Avoids pitfalls:** PWA-cannot-access-SQLite directly (this phase resolves it); localhost binding security.

**Research flag:** Standard — Hono patterns are well-documented. Skip phase research.

---

### Phase 6: PWA Frontend

**Rationale:** The PWA is the human control surface. It cannot be built until the REST API and knowledge graph have real data. Build the approval queue UI first (it has direct product value and validates the consolidation loop), then the graph explorer (requires meaningful graph data), then the activity dashboard.

**Delivers:** React 19 + Vite 8 PWA with vite-plugin-pwa (installable, offline-capable), approval queue UI (natural-language rendering of queue items, approve/reject/edit, confidence context, source episode snippet), knowledge graph explorer (react-force-graph-2d, entity-centric default view, click-to-inspect observations), activity dashboard (session timeline, auto-approve log, pending count), TanStack Query for all data fetching and mutation.

**Addresses features:** PWA approval queue UI (P1 differentiator), PWA knowledge graph explorer (P2), PWA activity dashboard (P2), mobile-responsive PWA.

**Avoids pitfalls:** Approval queue UX pitfalls (natural-language rendering, context per item, inline edit); graph explorer UX pitfalls (entity-centric view, not raw node/edge list).

**Research flag:** Standard — React + Vite + PWA patterns are mature. react-force-graph-2d setup may need a brief spike. Skip phase research but plan a graph visualization spike.

---

### Phase 7: GSD Hook Integration

**Rationale:** Hooks are additive, not foundational. The core system must be working and validated before adding GSD-specific automation. Hooks just call existing MCP tools with structured payloads — they have no new infrastructure requirements.

**Delivers:** Hook scripts in `~/.claude/get-shit-done/hooks/` that fire on GSD phase transitions and milestone completions, auto-recall of relevant context at session start, auto-capture of phase transition events as high-signal episodes, failure isolation (hook errors never interrupt GSD workflow).

**Addresses features:** GSD workflow hook integration (P2 differentiator), structured episode capture.

**Avoids pitfalls:** GSD hooks must fire-and-forget — hook failure must never block the GSD workflow.

**Research flag:** Standard — hooks call existing MCP tools. No new patterns needed. Skip phase research.

---

### Phase Ordering Rationale

- **Storage first:** Every component reads/writes brain.db. WAL mode and schema cannot be retrofitted without risk.
- **MCP before embedding:** Episode capture must exist before there are episodes to embed. Provenance schema is established here.
- **Embedding before consolidation:** Consolidation needs embeddings for semantic deduplication and entity resolution.
- **Consolidation before REST API:** The REST API exposes approval queue items that consolidation creates. Building the API first would expose empty endpoints.
- **REST API before PWA:** Browser cannot access SQLite. The API is the prerequisite, not an afterthought.
- **PWA before GSD hooks:** Hooks need to verify that episodes are captured correctly. The PWA's activity dashboard is the validation surface.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Consolidation Engine):** Consolidation prompt engineering for evidence-quote extraction, confidence calibration across fact types, and two-pass entity resolution strategy are complex and not well-documented for this exact use case. Worth a dedicated research-phase pass before implementation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Storage Foundation):** SQLite WAL mode and schema design are fully documented.
- **Phase 2 (MCP Server):** MCP SDK patterns are well-documented via official sources.
- **Phase 3 (Embedding Pipeline):** Ollama + sqlite-vec integration has clear documented patterns.
- **Phase 5 (REST API):** Hono on Node.js is straightforward.
- **Phase 6 (PWA):** React + Vite + PWA stack is mature. A brief react-force-graph-2d spike is advisable but not a full research phase.
- **Phase 7 (GSD Hooks):** Hooks call existing tools — no new research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified via GitHub releases and npm. Compatibility matrix checked. Core choices (MCP SDK, better-sqlite3, sqlite-vec, Ollama) are unambiguous. |
| Features | HIGH (core) / MEDIUM (consolidation details) | Table stakes and differentiators are well-grounded in competitor analysis. Consolidation quality thresholds require empirical calibration during implementation. |
| Architecture | HIGH (patterns) / MEDIUM (consolidation pipeline specifics) | Dual-transport monorepo and two-phase write patterns are well-validated. LLM extraction prompt design is less documented for this exact domain. |
| Pitfalls | HIGH | Multiple independent sources (SQLite official docs, peer-reviewed NeurIPS security research, official Ollama issue trackers). All critical pitfalls have verified prevention strategies. |

**Overall confidence:** HIGH

### Gaps to Address

- **Consolidation prompt design:** The exact prompts for LLM triplet extraction with evidence-quote requirements are not documented for this domain. Start conservatively, spot-check outputs in early cycles, and iterate. Flag Phase 4 for a research-phase pass.
- **Confidence threshold calibration:** Initial thresholds (0.90 for facts, 0.95 for merges) are conservative starting points based on general guidance. Expect to tune these after 2–3 weeks of real usage data. Build in observability (log all threshold decisions) from the start.
- **Embedding model quality vs. nomic-embed-text:** nomic-embed-text (768 dims) is the right starting model. If semantic recall quality is insufficient after initial validation, profile against mxbai-embed-large before upgrading — do not upgrade speculatively.
- **Entity resolution edge cases:** Two-pass resolution (exact match + 0.92 cosine similarity threshold for human review) is the recommended approach, but "same entity, different names" edge cases are highly project-specific. Expect to refine merge heuristics based on the entities that actually appear in the graph.

---

## Sources

### Primary (HIGH confidence)
- GitHub: modelcontextprotocol/typescript-sdk — v1.27.1 confirmed, StdioServerTransport patterns
- GitHub: WiseLibs/better-sqlite3 — v12.8.0 confirmed, Node.js 20+ requirement, WAL mode setup
- GitHub: asg017/sqlite-vec — v0.1.7 confirmed, vec0 virtual table schema and query patterns
- SQLite official documentation (sqlite.org/wal.html) — WAL mode, busy_timeout, checkpoint
- MemoryGraft (arXiv 2512.16962, NeurIPS 2025) — memory poisoning attack rates and prevention
- Palo Alto Networks Unit 42 — indirect prompt injection into AI long-term memory
- AriGraph (arXiv 2407.04363) — episodic-to-semantic consolidation via triplet extraction
- Memory in the Age of AI Agents (arXiv 2512.13564) — consolidation mechanisms, confidence-gated approval
- Ollama official docs — nomic-embed-text, `/api/embeddings` endpoint
- Ollama GitHub issues #14314, #13552 — embedding performance degradation, confirmed by multiple users
- MCP Transport Specification (modelcontextprotocol.io) — stdio framing, JSON-RPC 2.0

### Secondary (MEDIUM confidence)
- GitHub: doobidoo/mcp-memory-service — competitor feature set, D3.js graph visualization validation
- GitHub: shaneholloman/mcp-knowledge-graph — entity/relation/observation schema reference
- MAGMA Multi-Graph Agentic Memory Architecture (arXiv 2601.03236) — dual-stream consolidation pattern
- DEV/MachineLearningMastery/Vectorize.io — 2026 AI agent memory framework comparisons
- Community articles on SQLite WAL mode for concurrent MCP sessions
- Entity resolution deduplication strategies (Medium, corroborated by multiple sources)

### Tertiary (LOW confidence)
- Context rot framing from community articles — pattern is real, specific thresholds (5–7 results) are heuristic and need empirical validation
- Approval queue target (5–10 items/day) — derived from UX research principles, not benchmarked against this system specifically

---

*Research completed: 2026-03-20*
*Ready for roadmap: yes*
