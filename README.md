# Myco

> Myco — your knowledge web.

A persistent cognitive layer for Claude Code agents — an MCP server that gives every agent session access to long-term episodic memory, an open-schema knowledge graph, and entity relationships. A nightly deep sleep cycle consolidates raw episode logs into durable knowledge. Everything stays local.

## Features

- Persistent memory across Claude Code sessions
- Semantic search via local Ollama embeddings (nomic-embed-text, 768 dims)
- Knowledge graph with entities, observations, and relationships
- Nightly consolidation extracts structured facts from raw episodes
- Human-in-the-loop approval queue for uncertain or contradictory findings
- Visual dashboard (React 19 PWA) for graph exploration and approvals
- Force-directed knowledge graph visualization — explore entities, relationships, and connections with an interactive canvas-based graph powered by react-force-graph-2d. Click nodes to see observations, filter by entity type, search across the web
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
│  • Tool handlers                                 │
│  • Embedding via Ollama (nomic-embed-text)        │
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
git clone https://github.com/your-org/myco.git
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
    "brain": {
      "command": "node",
      "args": ["path/to/myco/packages/mcp-server/dist/index.js"]
    }
  }
}
```

**Option B — Use `claude mcp add`:**
```bash
claude mcp add brain -s user -- node path/to/myco/packages/mcp-server/dist/index.js
```

Restart Claude Code after adding. You will see `brain` in your MCP server list.

### Try It

Start a Claude Code session in any project and run:

```
Use brain remember to store: "Project prefers minimal UI and dark themes"
```

```
Use brain recall to search for "UI preferences"
```

```
Use brain query to list all entities of type "preference"
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
| `remember` | Store knowledge — creates entity with observation and optional relationships | `content`, `entity_name`, `entity_type`, `relations[]` |
| `recall` | Semantic search over stored knowledge | `query`, `limit` |
| `query` | Query knowledge graph by entity name, type, or relationship | `entity_name`, `entity_type`, `relation_type` |
| `log_episode` | Log a session event for later consolidation | `event_type`, `payload` |
| `consolidate` | Trigger the consolidation pipeline (extracts facts from episodes) | none |
| `list_pending_approvals` | List items awaiting human review | `limit` |
| `resolve_approval` | Approve, reject, or edit a queued item | `id`, `action`, `edited_content` |

## Project Structure

```
packages/
  core/           # Shared SQLite schema, DB helpers, types
  mcp-server/     # MCP server (stdio transport)
  api-server/     # Hono REST API (port 3001)
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
| `BRAIN_CONSOLIDATION_MODEL` | `llama3.2` | LLM model for fact extraction |

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.
