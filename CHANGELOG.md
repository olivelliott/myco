# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
