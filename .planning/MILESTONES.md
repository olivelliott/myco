# Milestones

## v3.0 Performance & Architecture Optimization (Shipped: 2026-03-26)

**Phases completed:** 4 phases, 8 plans, 13 tasks

**Key accomplishments:**

- dotenv configuration layer with OLLAMA_HOST/MYCO_DB_PATH/BRAIN_CONSOLIDATION_MODEL support, stderr startup logging, and .env.example template
- `prepareStatements(db)` factory in @myco/core centralizes all 32 hot-path SQL statements; MCP server refactored to compile statements once at startup instead of per-request
- All 5 API route groups refactored to use pre-compiled prepared statements; 18 new dashboard/query statements added to the @myco/core factory
- One-liner:
- One-liner:
- One-liner:
- One-liner:

---

## v2.0 Open Source Release (Shipped: 2026-03-22)

**Phases completed:** 3 phases, 6 plans, 10 tasks

**Key accomplishments:**

- Dashboard PWA manifest, HTML title, sidebar, and heading updated to Myco; hook default db path moved to ~/.local/share/myco with BRAIN_DB_PATH fallback; GETTING-STARTED.md and CLAUDE.md updated throughout
- Test files updated to MYCO_DB_PATH primary with BRAIN_DB_PATH fallback, all 68 tests pass, zero stale ai-workbots references in source
- Episodes API response wrapped in { episodes: [...] }, dead fetchEpisodes/EpisodeEntry removed, fresh-clone build verified clean
- Apache 2.0 LICENSE (Copyright 2026 Olive) and comprehensive README.md with architecture diagram, 7-tool MCP reference table, and quick-start guide for Myco open source release
- Status:

---

## v1.0 AI Workbots Brain (Shipped: 2026-03-21)

**Phases completed:** 5 phases, 14 plans, 26 tasks

**Key accomplishments:**

- npm workspace monorepo with @ai-workbots/core exporting openDatabase() (WAL + sqlite-vec), full 6-table knowledge graph schema with provenance columns, and nanoid-based session/provenance helpers — 21 vitest tests passing
- MCP server with functional remember tool (entity upsert + observation + relationships + provenance) and stub recall/query tools — 10 tests passing, brain-mcp binary ready for Claude Code registration
- One-liner:
- recall/query/log_episode MCP tools with KNN semantic search via sqlite-vec CTE, FTS5 fallback, per-agent episode isolation, and startup re-embed sweep
- LLM-powered episode-to-knowledge pipeline with Levenshtein merge detection, KNN contradiction detection, and auto-approve/queue routing via Vercel AI SDK + Ollama
- Three MCP tools (consolidate, list_pending_approvals, resolve_approval) + croner nightly schedule wired into server startup
- Thin CLI wrapper over runConsolidation() and approval queue logic — closes CNSLD-05 and APRV-04 gaps by making consolidation and approval management available from a terminal without an MCP session
- Hono REST API server on port 3001 with 5 route groups exposing brain.db over HTTP for the PWA dashboard, including atomic approval resolution with entity merge handling
- Vite 8 + React 19 PWA shell with dark theme, TanStack Router (3 file routes), responsive sidebar/bottom-tabs navigation, 9 shadcn/ui components, and typed API client wrapping all 6 REST endpoints
- Dashboard home view with 3 stat cards (amber-500 pending count first), date-grouped activity feed with relative timestamps, quick-approve list (top 5 with optimistic mutations), and self-wired sidebar pending badge
- Full approval queue page with ApprovalCard and MergeCard components, inline edit, exit animations, optimistic mutations, and accessible aria-labels — the primary human control surface for reviewing agent-extracted knowledge
- ForceGraph2D knowledge graph explorer with entity-type color mapping, search/filter controls, and slide-in entity detail panel using Canvas custom rendering and TanStack Query
- Fire-and-forget PostToolUse hook that writes structured GSD-02 episode payloads to brain.db via direct better-sqlite3 INSERT when `gsd-tools phase complete` commands are detected
- PostToolUse Bash hook registered in project-scoped .claude/settings.json, wiring gsd-brain-episode.js into Claude Code's hook system and human-verified end-to-end

---
