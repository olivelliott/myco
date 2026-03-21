# Roadmap: AI Workbots Brain

## Overview

Build a local-first persistent memory system for Claude Code agents in five phases. The database schema and MCP server form the foundation; semantic search and episode capture make it usable in sessions; consolidation and approval give the brain its ability to distill and curate knowledge over time; the REST API and PWA provide the human control surface; and GSD hook integration automates episode capture at workflow boundaries. Each phase fully depends on the previous — nothing can be reordered.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Storage Foundation** - Monorepo scaffold, SQLite schema with WAL mode, shared Core library (completed 2026-03-20)
- [ ] **Phase 2: MCP Server + Memory** - MCP tools, episode logging with provenance, semantic search via Ollama
- [x] **Phase 3: Consolidation + Approval** - Deep sleep pipeline, LLM extraction, confidence scoring, human approval queue (completed 2026-03-21)
- [x] **Phase 4: REST API + PWA** - Hono API server, cron scheduler, React PWA with approval queue and graph explorer (completed 2026-03-21)
- [ ] **Phase 5: GSD Integration** - Hook scripts for phase/milestone transitions, auto-capture structured episodes

## Phase Details

### Phase 1: Storage Foundation
**Goal**: The project compiles, the database exists with the correct schema, and every future component has a working place to write and read data
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05
**Success Criteria** (what must be TRUE):
  1. Running `brain-mcp` connects to Claude Code without error and the brain.db file is created on first run
  2. The SQLite database contains all schema tables (entities, relationships, observations, episodes, vec_embeddings, approval_queue) with WAL mode enabled
  3. A TypeScript import of `packages/core` in either the MCP server or API server resolves without errors
  4. Every knowledge record written to the database includes provenance fields (session ID, agent ID, timestamp, confidence)
**Plans:** 2/2 plans complete

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold + Core library (db bootstrap, schema, provenance, types)
- [x] 01-02-PLAN.md — MCP server with remember/recall/query tools

### Phase 2: MCP Server + Memory
**Goal**: Claude Code agents can write episodes and retrieve relevant knowledge from the brain using natural language
**Depends on**: Phase 1
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, EPSD-01, EPSD-02, EPSD-03
**Success Criteria** (what must be TRUE):
  1. An agent calling `log_episode` during a session produces a timestamped record in the episode log with correct provenance and source_type tagging
  2. An agent calling `recall` returns semantically relevant knowledge even when the query uses different words than the stored content
  3. When Ollama is unavailable, `log_episode` still succeeds and `recall` falls back to FTS5 full-text search without crashing
  4. Episode logs from two different agent sessions are isolated per-agent and not directly queryable via the `recall` or `query` tools
**Plans:** 1/2 plans executed

Plans:
- [x] 02-01-PLAN.md — Schema migration (FTS5 + needs_embedding) + EmbedClient + remember enhancement
- [x] 02-02-PLAN.md — recall, query, log_episode tool implementations + startup re-embed sweep

### Phase 3: Consolidation + Approval
**Goal**: The brain distills raw episode logs into durable graph knowledge nightly, and the human can review and control what becomes permanent
**Depends on**: Phase 2
**Requirements**: CNSLD-01, CNSLD-02, CNSLD-03, CNSLD-04, CNSLD-05, APRV-01, APRV-02, APRV-03, APRV-04
**Success Criteria** (what must be TRUE):
  1. Running `brain consolidate` processes unconsolidated episodes, extracts facts with evidence quotes, and writes high-confidence facts directly into the knowledge graph
  2. The nightly cron job runs at 2am EST without manual intervention and produces a consolidation log
  3. Facts that contradict existing knowledge, entity merge candidates, and externally-sourced facts appear in the approval queue rather than auto-approving
  4. A human can approve, reject, or edit a queued item from the CLI and the graph reflects the decision immediately
  5. Every auto-approved fact has a direct evidence quote traceable to the source episode
**Plans:** 3/3 plans complete

Plans:
- [x] 03-01-PLAN.md — Consolidation core: deps, schema migrations, consolidator.ts (LLM extraction, contradiction detection, entity merge, batch routing)
- [x] 03-02-PLAN.md — MCP tools (consolidate, list_pending_approvals, resolve_approval) + croner scheduler wiring
- [x] 03-03-PLAN.md — CLI wrapper (brain-cli) for consolidation trigger and approval management (gap closure)

### Phase 4: REST API + PWA
**Goal**: The human has a visual interface to review pending approvals, explore the knowledge graph, and monitor agent activity from any device
**Depends on**: Phase 3
**Requirements**: PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, PWA-06
**Success Criteria** (what must be TRUE):
  1. Opening the PWA in a browser shows live data from brain.db — pending approval count, recent episodes, and entity count
  2. A human can approve, reject, or edit a queued approval item in the PWA and the change persists in brain.db
  3. The knowledge graph explorer renders entities and relationships as an interactive graph; clicking a node shows its observations and connected entities
  4. The PWA installs on a phone home screen and remains usable at mobile screen widths
**Plans:** 5/5 plans complete

Plans:
- [x] 04-01-PLAN.md — Hono REST API server with all route groups (dashboard, approvals, entities, episodes, graph)
- [x] 04-02-PLAN.md — Dashboard scaffold: Vite 8, React 19, TanStack Router, shadcn/ui, PWA config, responsive root layout
- [x] 04-03-PLAN.md — Dashboard home view: stat cards, activity feed, quick-approve list, pending count badge
- [x] 04-04-PLAN.md — Approval queue UI: approval cards with actions, merge candidate cards, optimistic mutations
- [x] 04-05-PLAN.md — Knowledge graph explorer: force-directed graph, search/filter, entity detail side panel

### Phase 5: GSD Integration
**Goal**: GSD workflow transitions automatically feed high-signal episodes into the brain without any manual action from the user
**Depends on**: Phase 4
**Requirements**: GSD-01, GSD-02, GSD-03
**Success Criteria** (what must be TRUE):
  1. Completing a GSD phase transition via `/gsd:transition` automatically creates an episode log entry with phase name, requirements covered, and outcome summary
  2. A hook failure during a GSD workflow does not interrupt or error the GSD workflow itself
  3. GSD-captured episodes appear in the PWA activity dashboard within one page refresh
**Plans:** 2 plans

Plans:
- [ ] 05-01-PLAN.md — GSD phase transition hook script + unit tests
- [ ] 05-02-PLAN.md — Hook registration in project settings + integration verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Storage Foundation | 2/2 | Complete   | 2026-03-20 |
| 2. MCP Server + Memory | 1/2 | In Progress|  |
| 3. Consolidation + Approval | 3/3 | Complete   | 2026-03-21 |
| 4. REST API + PWA | 5/5 | Complete   | 2026-03-21 |
| 5. GSD Integration | 0/2 | Not started | - |
