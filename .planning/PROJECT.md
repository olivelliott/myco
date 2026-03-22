# Mnemo

## What This Is

A persistent cognitive layer for Claude Code agents — an MCP server that gives every agent session access to long-term episodic memory, an open-schema knowledge graph, and entity relationships. A nightly deep sleep cycle consolidates raw episode logs into durable knowledge, surfacing only uncertain or contradictory findings for human approval. A responsive PWA provides a visual command center for exploring the knowledge graph, reviewing agent activity, and handling approval queues.

## Core Value

Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## Current Milestone: v2.0 Open Source Release

**Goal:** Rename project to Mnemo, package for public GitHub release with Apache 2.0 license, clean README, contribution guidelines, and resolved tech debt.

**Target features:**
- Rename all packages, imports, branding, CLI commands, and DB paths from "ai-workbots" to "mnemo"
- Apache 2.0 license, README, CONTRIBUTING.md, CODE_OF_CONDUCT.md, GitHub issue/PR templates
- Production README with architecture diagram, quick start, MCP tool reference
- Clean up known tech debt (episodes API mismatch, dead exports)
- Fresh-clone installability — npm install + build works out of the box

## Current State

**Shipped:** v1.0 — 2026-03-21
**Codebase:** ~13,600 LOC TypeScript across 4 packages
**Tech Stack:** Node.js 22, TypeScript 5.9, better-sqlite3, sqlite-vec, Ollama, Hono, React 19, Vite 8, Tailwind v4, shadcn/ui

### Architecture
- `packages/core` — shared DB, schema, types, provenance
- `packages/mcp-server` — MCP tools (remember, recall, query, log_episode, consolidate, approvals), consolidation pipeline, cron scheduler, CLI
- `packages/api-server` — Hono REST API on port 3001 (5 route groups)
- `packages/dashboard` — React PWA with approval queue, knowledge graph explorer, activity dashboard

### What's Working
- Agents remember and recall knowledge semantically via MCP tools
- LLM-powered nightly consolidation extracts facts from episodes with evidence quotes
- Contradiction detection, entity merge candidates, and confidence-based auto-approval
- PWA dashboard for human review of pending approvals and knowledge graph exploration

## Requirements

### Validated (v1.0)

- [x] Open-schema knowledge graph stores entities and relationships in SQLite — *v1.0*
- [x] Episodic memory captures agent session events with timestamps and context — *v1.0*
- [x] MCP server exposes brain tools (remember, recall, query) to any Claude Code session — *v1.0*
- [x] Local embeddings via Ollama for semantic search and similarity — *v1.0*
- [x] Episodic memory log_episode tool with per-agent isolation — *v1.0*
- [x] Deep sleep consolidation cycle distills episode logs into graph knowledge — *v1.0*
- [x] Nightly 2am EST automatic consolidation via cron — *v1.0*
- [x] Manual consolidation trigger via command (brain-cli consolidate) — *v1.0*
- [x] Human approval queue for low-confidence inferences, contradictions, and entity merges — *v1.0*
- [x] High-confidence facts auto-approve into the graph without human intervention — *v1.0*
- [x] PWA with approval queue — review and approve/reject surfaced knowledge — *v1.0*
- [x] PWA with knowledge graph explorer — browse entities, relationships, connections — *v1.0*
- [x] PWA with activity dashboard — episode logs, agent activity, progress monitoring — *v1.0*
- [x] Responsive PWA works equally well on phone and desktop — *v1.0*

### Active

*See REQUIREMENTS.md for v2.0 requirements.*

### Out of Scope

- Cloud storage or external APIs — everything runs locally (SQLite, Ollama)
- Obsidian integration — the brain is the source of truth, not a markdown vault mirror
- Multi-user / team features — single user, single machine
- Real-time collaboration between concurrent agent sessions (eventual consistency is fine)
- New features beyond rename + open source packaging (save for v2.1+)

## Context

- v1.0 shipped with all 30 requirements validated across 5 phases
- 65 tests passing across 3 test files (core, mcp-server, gsd-hook)
- Vercel AI SDK v4.3.19 used for consolidation (v6 incompatible with ollama-ai-provider)
- MCP SDK uses `registerTool()` with Zod v4 (migrated from `server.tool()`)
- GSD hook uses direct SQLite write (MCP tools not callable from shell hooks)
- Renaming to "Mnemo" (from Mnemosyne, Greek goddess of memory) for public release

## Constraints

- **Runtime**: Node.js — MCP servers for Claude Code are Node.js-based
- **Storage**: SQLite — local, portable, no server process needed, good enough for single-user knowledge graphs
- **Embeddings**: Ollama — local inference, no API keys, privacy-preserving
- **Privacy**: Everything stays on the local machine — no cloud dependencies
- **Integration**: Must work as a standard MCP server that any Claude Code session can connect to
- **License**: Apache 2.0 — permissive with patent grant protection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| MCP server (not GSD plugin) | Universal access from any Claude Code session, not just GSD workflows | ✓ Validated v1.0 |
| Shared brain + per-agent episode logs | Agents share knowledge but maintain separate session histories for consolidation | ✓ Validated v1.0 |
| SQLite + Ollama (all local) | Privacy, speed, no external dependencies | ✓ Validated v1.0 |
| High-confidence auto-approve (≥0.85), surface only uncertainty | Keeps approval queue manageable — only contradictions, low-confidence inferences, entity merges need human review | ✓ Validated v1.0 |
| Nightly cron + manual trigger for sleep cycle | Automatic consolidation at 2am EST, plus on-demand when the user wants a checkpoint | ✓ Validated v1.0 |
| Vercel AI SDK v4.3.19 (not v6) | ollama-ai-provider returns LanguageModelV1 which v6 dropped | ✓ Working v1.0 |
| GSD hook: direct SQLite write (not MCP tool call) | MCP tools run over stdio, not callable from shell hooks; same INSERT SQL as logEpisode() | ✓ Validated v1.0 |
| Separate api-server + dashboard packages | Decoupled concerns; API is read-heavy from shared brain.db via WAL mode | ✓ Validated v1.0 |
| Rename to "Mnemo" | Short, unique, googlable — from Mnemosyne (Greek goddess of memory). Better than "AI Workbots Brain" for public release. | — Pending |
| Apache 2.0 license | Permissive like MIT but includes explicit patent grant. Keeps commercial options open. | — Pending |

## Known Tech Debt (v1.0)

- Phase 3: 3 items awaiting manual testing with live Ollama (LLM extraction, merge detection, cron timing)
- Phase 4: `/api/episodes` response shape mismatch with `fetchEpisodes()` client (latent, currently masked)
- Phase 4: Dead `fetchEpisodes` export in api.ts (unused)

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
*Last updated: 2026-03-22 after v2.0 milestone start*
