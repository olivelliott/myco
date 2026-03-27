# Myco

> Myco — your knowledge web.

## What This Is

A persistent cognitive layer for Claude Code agents — an MCP server that gives every agent session access to long-term episodic memory, an open-schema knowledge graph, and entity relationships. A nightly deep sleep cycle consolidates raw episode logs into durable knowledge, surfacing only uncertain or contradictory findings for human approval. A responsive PWA provides a visual command center for exploring the knowledge graph, reviewing agent activity, and handling approval queues.

Open source under Apache 2.0. Everything runs locally — SQLite, Ollama, no cloud dependencies.

## Core Value

Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## Current Milestone: v5.0 Feature Parity & Differentiation

**Goal:** Close competitive gaps and add differentiating features that make Myco the most capable local-first MCP memory server.

**Target features:**
- Import/export: JSON export of entire knowledge graph, import from Mem0/reference server formats
- Temporal fact versioning: facts track when they changed, query "what was true at time X"
- Auto-entity extraction: passive knowledge capture from conversations, not just explicit `remember`
- Auto-dedup / conflict resolution: intelligent ADD/UPDATE/DELETE/NOOP when new memories conflict with existing
- Incremental consolidation: consolidate on-the-fly as memories are added, nightly cycle for deeper analysis
- Codebase-to-graph ingestion: `codify` tool that turns project structure/conventions into graph knowledge
- REST API for non-MCP access: expose memory operations over HTTP for LangGraph, CrewAI, etc.
- Memory importance decay: unreinforced facts fade over time, keeping the graph fresh
- Relationship strength scoring: edges weighted by reinforcement frequency and recency

## Current State

**Shipped:** v3.0 — 2026-03-26
**Codebase:** ~5,000 LOC TypeScript across 4 packages
**Tech Stack:** Node.js 22, TypeScript 5.9, better-sqlite3, sqlite-vec, Ollama, Hono, React 19, Vite 8, Tailwind v4, shadcn/ui
**License:** Apache 2.0
**98 tests** passing across 6 test files

### Architecture
- `packages/core` — shared DB, schema, types, provenance, prepared statement factory
- `packages/mcp-server` — MCP tools (remember, recall, query, log_episode, forget, consolidate, approvals), consolidation pipeline, cron scheduler, CLI
- `packages/api-server` — Hono REST API on port 3001 (5 route groups)
- `packages/dashboard` — React PWA with approval queue, knowledge graph explorer, activity dashboard

## Requirements

### Validated

- [x] Open-schema knowledge graph stores entities and relationships in SQLite — *v1.0*
- [x] Episodic memory captures agent session events with timestamps and context — *v1.0*
- [x] MCP server exposes brain tools (remember, recall, query) to any Claude Code session — *v1.0*
- [x] Local embeddings via Ollama for semantic search and similarity — *v1.0*
- [x] Episodic memory log_episode tool with per-agent isolation — *v1.0*
- [x] Deep sleep consolidation cycle distills episode logs into graph knowledge — *v1.0*
- [x] Nightly 2am EST automatic consolidation via cron — *v1.0*
- [x] Manual consolidation trigger via command (myco-cli consolidate) — *v1.0*
- [x] Human approval queue for low-confidence inferences, contradictions, and entity merges — *v1.0*
- [x] High-confidence facts auto-approve into the graph without human intervention — *v1.0*
- [x] PWA with approval queue — review and approve/reject surfaced knowledge — *v1.0*
- [x] PWA with knowledge graph explorer — browse entities, relationships, connections — *v1.0*
- [x] PWA with activity dashboard — episode logs, agent activity, progress monitoring — *v1.0*
- [x] Responsive PWA works equally well on phone and desktop — *v1.0*
- [x] All packages renamed to @myco/* with myco/myco-cli binaries — *v2.0*
- [x] Apache 2.0 LICENSE, README, CONTRIBUTING, CODE_OF_CONDUCT, GitHub templates — *v2.0*
- [x] Known tech debt resolved (episodes API, dead exports, clean build) — *v2.0*
- [x] Embedding client singleton with health check caching (30s cooldown on Ollama failure) — *v3.0 Phase 9*
- [x] Batch embedding support for reEmbedPending using Ollama's string[] input — *v3.0 Phase 9*
- [x] dotenv configuration support for OLLAMA_HOST, MYCO_DB_PATH, BRAIN_CONSOLIDATION_MODEL — *v3.0 Phase 9*
- [x] Prepared statement caching for hot-path queries — *v3.0 Phase 10*
- [x] Query filtering operators on recall tool (entity_type, min_confidence) — *v3.0 Phase 11*
- [x] Error handling hardening and API input validation (Zod, structured errors) — *v3.0 Phase 11*

- [x] Namespace/project isolation via project column on entities — *v3.0 Phase 12*

### Active

- [ ] Knowledge graph: stable hover physics, no node drift on interaction
- [ ] Knowledge graph: full timeline scrub with animated playback from first to latest entity
- [ ] Knowledge graph: auto-detected cluster visualization with group boundaries
- [ ] Knowledge graph: neighborhood explorer isolating a node's local subgraph
- [ ] Knowledge graph: confidence threshold filter slider
- [ ] Knowledge graph: search with animated highlight and auto-zoom
- [ ] Knowledge graph: enhanced analytics panel with graph intelligence
- [ ] Dashboard: bioluminescent deep-sea visual theme across all pages
- [ ] Home page: knowledge growth chart (entities/observations/relationships over time)
- [ ] Home page: rich activity stream with entity cards
- [ ] Home page: health metrics (consolidation, embeddings, orphans, confidence)
- [ ] Home page: larger interactive graph preview
- [ ] Approvals: guided onboarding explaining Myco's approval flow
- [ ] Approvals: batch approve/reject actions
- [ ] Approvals: confidence visualization with source evidence
- [ ] Approvals: inline mini-graph preview for entities under review
- [ ] All "brain" language updated to "Myco" throughout dashboard

## Completed Milestones

- **v1.0** (2026-03-21) — Core MCP server, knowledge graph, consolidation, PWA dashboard
- **v2.0** (2026-03-22) — Rename to Myco, Apache 2.0 open source, tech debt cleanup
- **v3.0** (2026-03-26) — Performance & architecture: config, prepared statements, query filters, error handling, namespace isolation
- **v4.0** (2026-03-27) — Dashboard & graph experience: bioluminescent theme, graph core features, timeline, approvals refresh

### Out of Scope

- Cloud storage or external APIs — everything runs locally (SQLite, Ollama)
- Obsidian integration — the brain is the source of truth, not a markdown vault mirror
- Multi-user / team features — single user, single machine
- Real-time collaboration between concurrent agent sessions (eventual consistency is fine)

## Context

- v1.0 shipped 2026-03-21 with all 15 requirements validated across 5 phases
- v2.0 shipped 2026-03-22 — rename to Myco, open source packaging, tech debt cleanup
- v3.0 shipped 2026-03-26 — 20 requirements validated across 4 phases (config, prepared statements, query filters, error handling, namespace isolation)
- v4.0 shipped 2026-03-27 — dashboard & graph experience overhaul
- v5.0 started 2026-03-27 — feature parity & differentiation (driven by competitive analysis vs Mem0, Zep, Cognee, mcp-memory-service)
- 98 tests passing across 6 test files (core, mcp-server, gsd-hook, statements, embed-client, recall-filters)
- Design direction: bioluminescent deep-sea aesthetic — dark void, rich glows, organic depth, mycorrhizal metaphor
- Vercel AI SDK v4.3.19 used for consolidation (v6 incompatible with ollama-ai-provider)
- MCP SDK uses `registerTool()` with Zod v4
- Named "Myco" from mycorrhizal networks — underground fungal webs connecting ecosystems

## Constraints

- **Runtime**: Node.js — MCP servers for Claude Code are Node.js-based
- **Storage**: SQLite — local, portable, no server process needed
- **Embeddings**: Ollama — local inference, no API keys, privacy-preserving
- **Privacy**: Everything stays on the local machine — no cloud dependencies
- **Integration**: Must work as a standard MCP server that any Claude Code session can connect to
- **License**: Apache 2.0 — permissive with patent grant protection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MCP server (not GSD plugin) | Universal access from any Claude Code session | ✓ Validated v1.0 |
| Shared brain + per-agent episode logs | Agents share knowledge but maintain separate session histories | ✓ Validated v1.0 |
| SQLite + Ollama (all local) | Privacy, speed, no external dependencies | ✓ Validated v1.0 |
| High-confidence auto-approve (≥0.85) | Keeps approval queue manageable | ✓ Validated v1.0 |
| Nightly cron + manual trigger | Automatic + on-demand consolidation | ✓ Validated v1.0 |
| Vercel AI SDK v4.3.19 (not v6) | ollama-ai-provider returns LanguageModelV1 which v6 dropped | ✓ Working v1.0 |
| GSD hook: direct SQLite write | MCP tools not callable from shell hooks | ✓ Validated v1.0 |
| Separate api-server + dashboard | Decoupled concerns; WAL mode concurrent reads | ✓ Validated v1.0 |
| Rename to "Myco" | Mycorrhizal network metaphor — underground knowledge web | ✓ Shipped v2.0 |
| Apache 2.0 license | Permissive with patent grant, keeps commercial options open | ✓ Shipped v2.0 |
| dotenv + stderr config logging | Reproducible config, visible in MCP logs | ✓ Shipped v3.0 |
| Prepared statement factory | Compile SQL once at startup, not per-request | ✓ Shipped v3.0 |
| STMT-02 exception for dynamic WHERE | queryEntities and recall filters need runtime SQL construction | ✓ Shipped v3.0 |
| Nullable project column (DEFAULT NULL) | Backward compatible — NULL = globally visible, avoids data migration | ✓ Shipped v3.0 |
| Graceful degradation for invalid filters | Warning in metadata, not 400 error — agents recover better | ✓ Shipped v3.0 |

## Known Tech Debt

- Phase 3 (v1.0): 3 items awaiting manual testing with live Ollama (LLM extraction, merge detection, cron timing)
- Phase 9 (v3.0): embed-client.ts hardcodes EMBED_MODEL='nomic-embed-text' instead of reading getConfig().ollamaModel

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-27 after v5.0 milestone start*
