# Myco

> Myco — your knowledge web.

A persistent cognitive layer for Claude Code agents — an MCP server that gives every agent session access to long-term episodic memory, an open-schema knowledge graph, and entity relationships. A nightly deep sleep cycle consolidates raw episode logs into durable knowledge. Everything stays local.

## Features

- Persistent memory across Claude Code sessions
- Semantic search via local Ollama embeddings (nomic-embed-text, 768 dims)
- Knowledge graph with entities, observations, and relationships
- **Self-enhancing web** — auto-discovers relationships via name-mention scanning, semantic similarity, and back-linking on every `remember()` call
- **Project namespace isolation** — scope entities to specific projects, or keep them global
- **Query filters** — narrow recall results by entity type, confidence threshold, or project
- Nightly consolidation extracts structured facts from raw episodes
- Human-in-the-loop approval queue for uncertain or contradictory findings
- **Structured error handling** — Zod validation on API routes, consistent error responses
- **Prepared statements** — all hot-path queries compiled once at startup for performance
- **dotenv configuration** — customize Ollama host, DB path, models via `.env` file
- **Mycelium dashboard** (React 19 PWA) — bioluminescent graph visualization with hover illumination, path tracing, timeline slider, and cluster grouping
- SQLite + sqlite-vec — no external database, no cloud dependencies

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Your Claude Code Sessions                      │
│  (any project — swing-trader, client work, etc) │
│                                                 │
│  Claude uses MCP tools:                         │
│  remember / recall / query / log_episode        │
└──────────────────┬──────────────────────────────┘
                   │ stdio (MCP protocol)
                   ▼
┌──────────────────────────────────────────────────┐
│  mcp-server  (MCP Server)                        │
│  • Tool handlers (prepared statements)           │
│  • Embedding via Ollama (nomic-embed-text)        │
│  • Query filters (entity_type, confidence, project)│
│  • 2am consolidation cron                        │
│  • Auto-approval / queue routing                 │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  brain.db  (SQLite + sqlite-vec)                 │
│  ~/.local/share/myco/brain.db                    │
│                                                  │
│  entities │ observations │ relationships         │
│  episodes │ approval_queue │ vec_embeddings       │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  api-server  (Hono, port 3001)                   │
│  GET /api/dashboard, /entities, /graph, etc.     │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Dashboard PWA  (React 19, port 5173)            │
│  Knowledge graph • Approval queue • Activity     │
└──────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. **Ollama running locally** — required for embeddings and consolidation
   ```bash
   # Install: https://ollama.com
   ollama serve
   ollama pull nomic-embed-text    # embedding model (768 dims)
   ollama pull llama3.2            # consolidation model
   ```

2. **Node.js 22.x**

### Clone and Build

```bash
git clone https://github.com/olivelliott/myco.git
cd myco
npm install --legacy-peer-deps
npm run build
```

### Add to Claude Code

Add the MCP server to your **global** Claude Code settings so every project has access.

**Option A — Edit `~/.claude/settings.json`:**
```json
{
  "mcpServers": {
    "myco": {
      "command": "node",
      "args": ["path/to/myco/packages/mcp-server/dist/index.js"]
    }
  }
}
```

**Option B — Use `claude mcp add`:**
```bash
claude mcp add myco -s user -- node path/to/myco/packages/mcp-server/dist/index.js
```

Restart Claude Code after adding. You will see `myco` in your MCP server list.

### Try It

Start a Claude Code session in any project and run:

```
Use myco remember to store: "Project prefers minimal UI and dark themes"
```

```
Use myco recall to search for "UI preferences"
```

```
Use myco query to list all entities of type "preference"
```

### Dashboard (Optional)

The dashboard is for visual exploration and reviewing consolidation results. The MCP tools work without it.

```bash
# Terminal 1 — API server
npm run api
# → http://localhost:3001

# Terminal 2 — Dashboard
cd packages/dashboard && npm run dev
# → http://localhost:5173
```

## MCP Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `remember` | Store knowledge — creates entity with observation and optional relationships | `content`, `entity_name`, `entity_type`, `relations[]`, `project?` |
| `recall` | Semantic search over stored knowledge with optional filters | `query`, `limit`, `entity_type?`, `min_confidence?`, `project?` |
| `query` | Query knowledge graph by entity name, type, or relationship | `entity_name`, `entity_type`, `relation_type`, `project?` |
| `log_episode` | Log a session event for later consolidation | `event_type`, `payload` |
| `consolidate` | Trigger the consolidation pipeline (extracts facts from episodes) | none |
| `list_pending_approvals` | List items awaiting human review | `limit` |
| `resolve_approval` | Approve, reject, or edit a queued item | `id`, `action`, `edited_content` |
| `forget` | Remove an entity, observation, or relationship from the knowledge graph | `entity_name?`, `entity_type?`, `observation_id?`, `relationship_id?` |

## Project Structure

```
packages/
  core/           # Shared SQLite schema, DB helpers, types, prepared statement factory
  mcp-server/     # MCP server (stdio transport), query filters, error handling
  api-server/     # Hono REST API (port 3001), Zod validation
  dashboard/      # React 19 PWA (Vite 8, Tailwind v4, shadcn/ui)
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22.x, TypeScript 5.9 |
| MCP | @modelcontextprotocol/sdk |
| Database | SQLite (better-sqlite3) + sqlite-vec |
| Embeddings | Ollama (nomic-embed-text) |
| API | Hono |
| Dashboard | React 19, Vite 8, Tailwind v4, shadcn/ui |
| Graph viz | react-force-graph-2d |

## Development

```bash
npm run dev     # run MCP server in dev mode (tsx watch)
npm run build   # build all packages
npm test        # run tests (Vitest)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full development setup and contribution guidelines.

## Environment Variables

All variables are optional — defaults work for a standard Ollama + local install.

| Variable | Default | Purpose |
|----------|---------|---------|
| `MYCO_DB_PATH` | `~/.local/share/myco/brain.db` | Override database location (`BRAIN_DB_PATH` also accepted as fallback) |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama embedding model |
| `BRAIN_CONSOLIDATION_MODEL` | `llama3.2` | LLM model for fact extraction |
| `MYCO_API_PORT` | `3001` | API server port |
| `MYCO_LOG_LEVEL` | `info` | Log level (`info` or `debug`) |

See [.env.example](.env.example) for the full list with comments.

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.
