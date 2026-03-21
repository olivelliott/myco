# AI Workbots Brain

## What This Is

A persistent cognitive layer for Claude Code agents — an MCP server that gives every agent session access to long-term episodic memory, an open-schema knowledge graph, and entity relationships. A nightly deep sleep cycle consolidates raw episode logs into durable knowledge, surfacing only uncertain or contradictory findings for human approval. A responsive PWA provides a visual command center for exploring the knowledge graph, reviewing agent activity, and handling approval queues.

## Core Value

Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## Requirements

### Validated

- [x] Open-schema knowledge graph stores entities and relationships in SQLite — *Validated in Phase 01: storage-foundation*
- [x] Episodic memory captures agent session events with timestamps and context — *Validated in Phase 01: storage-foundation*
- [x] MCP server exposes brain tools (remember, recall, query) to any Claude Code session — *Validated in Phase 02: mcp-server-memory (all tools fully implemented)*
- [x] Local embeddings via Ollama for semantic search and similarity — *Validated in Phase 02: mcp-server-memory*
- [x] Episodic memory log_episode tool with per-agent isolation — *Validated in Phase 02: mcp-server-memory*

- [x] Deep sleep consolidation cycle distills episode logs into graph knowledge — *Validated in Phase 03: consolidation-approval*
- [x] Nightly 2am EST automatic consolidation via cron — *Validated in Phase 03: consolidation-approval*
- [x] Manual consolidation trigger via command — *Validated in Phase 03: consolidation-approval (brain-cli consolidate)*
- [x] Human approval queue for low-confidence inferences, contradictions, and entity merges — *Validated in Phase 03: consolidation-approval*
- [x] High-confidence facts auto-approve into the graph without human intervention — *Validated in Phase 03: consolidation-approval*

- [x] PWA with approval queue — review and approve/reject surfaced knowledge — *Validated in Phase 04: rest-api-pwa*
- [x] PWA with knowledge graph explorer — browse entities, relationships, connections — *Validated in Phase 04: rest-api-pwa*
- [x] PWA with activity dashboard — episode logs, agent activity, progress monitoring — *Validated in Phase 04: rest-api-pwa*
- [x] Responsive PWA works equally well on phone and desktop — *Validated in Phase 04: rest-api-pwa*

### Active
- [ ] GSD hooks auto-capture episodes at phase transitions and key workflow moments

### Out of Scope

- Cloud storage or external APIs — everything runs locally (SQLite, Ollama)
- Obsidian integration — the brain is the source of truth, not a markdown vault mirror
- Multi-user / team features — single user, single machine
- Real-time collaboration between concurrent agent sessions (eventual consistency is fine)

## Context

- The user runs Claude Code with GSD (Get Shit Done) for project management workflows
- Agents currently lose all learned context between sessions — GSD has `.planning/` files but no semantic memory
- Claude Code's native memory system (`~/.claude/projects/`) is flat key-value, not a knowledge graph
- MCP is the standard protocol for extending Claude Code with new tools — any session automatically gets access
- Ollama runs locally and provides embedding models (e.g., nomic-embed-text) for semantic search
- The PWA needs to talk to the same data store the MCP server uses — shared SQLite database

## Constraints

- **Runtime**: Node.js — MCP servers for Claude Code are Node.js-based
- **Storage**: SQLite — local, portable, no server process needed, good enough for single-user knowledge graphs
- **Embeddings**: Ollama — local inference, no API keys, privacy-preserving
- **Privacy**: Everything stays on the local machine — no cloud dependencies
- **Integration**: Must work as a standard MCP server that any Claude Code session can connect to

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MCP server (not GSD plugin) | Universal access from any Claude Code session, not just GSD workflows | ✓ Validated Phase 01 |
| Shared brain + per-agent episode logs | Agents share knowledge but maintain separate session histories for consolidation | ✓ Validated Phase 01 |
| SQLite + Ollama (all local) | Privacy, speed, no external dependencies | ✓ Validated Phase 01 (SQLite done, Ollama Phase 2) |
| High-confidence auto-approve, surface only uncertainty | Keeps approval queue manageable — only contradictions, low-confidence inferences, entity merges need human review | — Pending |
| Nightly cron + manual trigger for sleep cycle | Automatic consolidation at 2am EST, plus on-demand when the user wants a checkpoint | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-21 after Phase 04 completion*
