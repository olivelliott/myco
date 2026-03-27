# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - v3.0 Milestone (2026-03-26)

Performance and architecture optimization — hardened MCP server with configuration, query filters, error handling, and project namespace isolation.

### Added

- **dotenv configuration** — `.env` file support for `OLLAMA_HOST`, `MYCO_DB_PATH`, `MYCO_CONSOLIDATION_MODEL`, `OLLAMA_EMBED_MODEL`, `MYCO_API_PORT`, `MYCO_LOG_LEVEL`
- **Startup logging** — resolved configuration values printed to stderr at startup
- **Query filters on recall** — optional `entity_type`, `min_confidence`, and `project` parameters narrow search results
- **Project namespace isolation** — `remember` accepts optional `project` param to scope entities; `recall`/`query` filter by project when specified
- **Structured error handling** — Zod validation on all API route inputs, global error handler, consistent `{ error, code }` format on MCP tools
- **Prepared statement factory** — `prepareStatements()` in `@myco/core` compiles 50+ SQL statements once at startup

### Changed

- **Singleton embedding client** — single Ollama client instance reused across all embedding calls (was: new instance per call)
- **Health-check cooldown** — 30-second fast-fail on Ollama connection failure (was: retry every call)
- **Batch embedding** — `reEmbedPending` processes all pending observations in a single Ollama batch call (was: one-at-a-time)
- All MCP tool handlers wrapped in try/catch — no unhandled exceptions leak to clients
- API validation uses `@hono/zod-validator` with human-readable error messages
- All API route files refactored to use prepared statements (no inline `db.prepare()` in handlers)

### Fixed

- `approvals.ts` missing project parameter on `insertEntity` calls (caught during milestone audit)

## [0.1.0] - 2026-03-22

Initial pre-release of Myco — a persistent cognitive layer for Claude Code agents.

### Added

- **MCP Server** with four tools: `remember`, `recall`, `query`, `log_episode`
- **Knowledge graph** backed by SQLite with entity, observation, and relationship storage
- **Semantic search** via Ollama embeddings (`nomic-embed-text`) and sqlite-vec
- **Consolidation pipeline** — LLM-powered extraction of structured facts from raw episode logs
- **Contradiction detection** — flags conflicting observations for human review
- **Human approval queue** — confidence-based auto-approve (>=0.85 threshold), manual review for uncertain findings
- **Nightly deep sleep** — 2am cron job runs consolidation automatically
- **REST API** (Hono, port 3001) exposing knowledge graph data
- **React PWA dashboard** with:
  - Dashboard overview (stats cards, recent activity)
  - Approval queue (approve/reject/edit observations)
  - Knowledge graph explorer (force-directed visualization)
  - Entity detail panel
- **CLI tool** (`myco-cli`) for manual consolidation and management
- Apache 2.0 license, README, CONTRIBUTING guide, GitHub templates
