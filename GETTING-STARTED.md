# Myco — Getting Started

## What Is This?

A **persistent memory layer** that runs alongside any Claude Code session. Every agent session can store knowledge, recall past context, and build up a shared knowledge graph over time — across all your projects.

It does NOT replace your internal workflows (GSD, swing-trader scripts, etc.). It runs underneath them as infrastructure. Think of it like giving every Claude session a shared long-term memory.

**What agents can do with it:**
- `remember` facts about your projects, preferences, decisions — optionally scoped to a project namespace
- `recall` knowledge using natural language queries (semantic search) — filter by entity type, confidence, or project
- `query` the knowledge graph by entity name/type — with optional project scoping
- `log_episode` to capture session events for later consolidation
- Review a visual knowledge graph and approve/reject AI-extracted insights via a dashboard

---

## Quick Start (5 minutes)

### Prerequisites

1. **Ollama running locally** — needed for embeddings and consolidation
   ```bash
   # Install if you haven't: https://ollama.com
   ollama serve
   ollama pull nomic-embed-text    # embedding model (768 dims)
   ollama pull llama3.2            # consolidation model
   ```

2. **Node.js 22.x** — you likely already have this

### Install & Build

```bash
cd ~/Documents/GitHub/myco
npm install --legacy-peer-deps
npm run build
```

### Wire It Into Claude Code (One-Time Setup)

Add the MCP server to your **global** Claude Code settings so every project has access:

**Option A — Edit `~/.claude/settings.json`** (add to top level):
```json
{
  "mcpServers": {
    "myco": {
      "command": "node",
      "args": ["/path/to/myco/packages/mcp-server/dist/index.js"]
    }
  }
}
```

**Option B — Use `claude mcp add`:**
```bash
claude mcp add myco -s user -- node /path/to/myco/packages/mcp-server/dist/index.js
```

After adding, restart Claude Code. You'll see `myco` in your MCP server list.

### Start the Dashboard (Optional)

The dashboard is for visual exploration and approving consolidation results. You don't need it running for the MCP tools to work.

```bash
# Terminal 1 — API server
npm run api
# → http://localhost:3001

# Terminal 2 — Dashboard
cd packages/dashboard && npm run dev
# → http://localhost:5173
```

---

## Using It Across Projects

### Yes — swing-trader, fathom, anything

Once the MCP server is in your **global** Claude Code settings (`-s user` scope), it's available in every Claude Code session regardless of which project directory you're in.

| Project | How It Helps |
|---------|-------------|
| **swing-trader** | Remember trade patterns, backtest results, strategy decisions. Recall "what did I decide about RSI thresholds?" across sessions. |
| **fathom / Local Sites** | Store client preferences, deployment quirks, "this site uses X plugin." Recall context when switching between sites. |
| **myco itself** | Already wired — GSD hooks auto-log phase completions as episodes. |
| **Any future project** | Same knowledge web, same knowledge. Start a new project and it already knows your preferences. |

### Does It Interfere With My Workflow?

**No.** It's a passive MCP server — tools are available but agents only use them when instructed (or when a hook fires). It doesn't:

- Change how GSD works
- Modify your files
- Send data anywhere (everything stays in `~/.local/share/myco/myco.db`)
- Slow down your session (Ollama calls have 2s timeout with graceful fallback)

Your existing workflows (GSD phases, trade journal, market analysis) continue exactly as-is. Myco just means Claude sessions can accumulate knowledge over time instead of starting from zero.

---

## What to Test

### Tier 1 — Core Memory (Test First)

Start a Claude Code session in any project and try:

```
Use the myco remember tool to store: "I prefer minimal UI, dark themes, and concise responses"
```

```
Use myco recall to search for "UI preferences"
```

```
Use myco query to list all entities of type "person"
```

**What to verify:**
- [ ] `remember` creates an entity and observation without errors
- [ ] `recall` returns relevant results (semantic search working = Ollama is connected)
- [ ] `query` returns structured entity data
- [ ] If Ollama is down, `recall` falls back to full-text search (still works, just less smart)

### Tier 2 — Consolidation Pipeline

This is the "deep sleep" feature — extracts structured facts from raw episodes.

```bash
# Log some test episodes manually
cd ~/Documents/GitHub/myco
myco-cli consolidate
```

Or from a Claude session:
```
Use myco log_episode with event_type "decision" and payload {"context": "swing-trader", "decision": "Use 20-period EMA as primary trend filter", "reason": "backtested across 500 tickers with 62% win rate"}
```

Then trigger consolidation:
```
Use myco consolidate tool
```

**What to verify:**
- [ ] Episodes get processed (check `totalProcessed` in response)
- [ ] Facts extracted (check `totalExtracted`)
- [ ] High-confidence facts auto-approved (`totalAutoApproved`)
- [ ] Low-confidence or contradictory facts queued (`totalQueued`)
- [ ] The 2am nightly cron is just automatic consolidation — same thing

### Tier 3 — Dashboard & Approvals

1. Open http://localhost:5173 (with API server running)
2. **Dashboard page** — stats cards showing entity count, pending approvals, recent episodes
3. **Approvals page** — review queued items, approve/reject/edit observations
4. **Graph page** — force-directed knowledge graph, click entities to see details

**What to verify:**
- [ ] Dashboard loads with real data
- [ ] Approval cards show fact details and evidence quotes
- [ ] Approve/reject actually updates the knowledge graph
- [ ] Graph visualization renders nodes and relationships
- [ ] Entity panel slides open on click with observations

### Tier 4 — GSD Hook Integration

This only fires inside the `myco` project (project-scoped hook).

**What to verify:**
- [ ] When GSD completes a phase, an episode gets logged automatically
- [ ] Episode shows up in dashboard activity feed
- [ ] After consolidation, phase completion facts appear in the knowledge graph

---

## Future Ideas

| Feature | Description |
|---------|-------------|
| **Cross-project hooks** | Move the GSD episode hook to global scope so ALL projects auto-log episodes |
| **Agent instructions via myco** | Agents query myco at session start for "what do I know about this project?" |
| **Smarter recall** | Contextual recall that factors in current project, recent topics, entity relationships |
| **Dashboard PWA install** | Build + deploy as installable PWA (currently dev-only) |
| **Backup/export** | Export knowledge graph as JSON/Markdown for portability |
| **Multi-model consolidation** | Use Claude API for higher-quality fact extraction instead of local llama3.2 |
| **Confidence decay** | Old observations lose confidence over time unless reinforced |
| **Relationship inference** | Auto-detect implied relationships between entities |

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────┐
│  Your Claude Code Sessions                      │
│  (swing-trader, fathom, myco, anything)          │
│                                                 │
│  Claude uses MCP tools:                         │
│  remember / recall / query / forget / log_episode│
└──────────────────┬──────────────────────────────┘
                   │ stdio (MCP protocol)
                   ▼
┌──────────────────────────────────────────────────┐
│  myco  (MCP Server)                              │
│  • Tool handlers                                 │
│  • Embedding via Ollama (nomic-embed-text)        │
│  • 2am consolidation cron                        │
│  • Auto-approval / queue routing                 │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  myco.db  (SQLite + sqlite-vec)                 │
│  ~/.local/share/myco/myco.db                    │
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

---

## File Locations

| What | Where |
|------|-------|
| Database | `~/.local/share/myco/myco.db` |
| MCP server entry | `packages/mcp-server/dist/index.js` |
| CLI tool | `myco-cli` (after `npm run build`) |
| API server | `packages/api-server/src/index.ts` |
| Dashboard | `packages/dashboard/` |
| GSD hook | `.claude/hooks/gsd-myco-episode.js` |
| Project settings | `.claude/settings.json` |

## Environment Variables (All Optional)

All variables can be set in a `.env` file at the project root (loaded automatically via dotenv at startup). See `.env.example` for the full list.

| Variable | Default | Purpose |
|----------|---------|---------|
| `MYCO_DB_PATH` | `~/.local/share/myco/myco.db` | Override database location |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama embedding model |
| `MYCO_CONSOLIDATION_MODEL` | `llama3.2` | LLM model for fact extraction |
| `MYCO_API_PORT` | `3001` | API server port |
| `MYCO_LOG_LEVEL` | `info` | Log level (`info` or `debug`) |

Resolved configuration is logged to stderr at startup so you can verify what values the server is using.
