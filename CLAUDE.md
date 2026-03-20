<!-- GSD:project-start source:PROJECT.md -->
## Project

**AI Workbots Brain**

A persistent cognitive layer for Claude Code agents — an MCP server that gives every agent session access to long-term episodic memory, an open-schema knowledge graph, and entity relationships. A nightly deep sleep cycle consolidates raw episode logs into durable knowledge, surfacing only uncertain or contradictory findings for human approval. A responsive PWA provides a visual command center for exploring the knowledge graph, reviewing agent activity, and handling approval queues.

**Core Value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

### Constraints

- **Runtime**: Node.js — MCP servers for Claude Code are Node.js-based
- **Storage**: SQLite — local, portable, no server process needed, good enough for single-user knowledge graphs
- **Embeddings**: Ollama — local inference, no API keys, privacy-preserving
- **Privacy**: Everything stays on the local machine — no cloud dependencies
- **Integration**: Must work as a standard MCP server that any Claude Code session can connect to
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x LTS | Runtime | MCP servers for Claude Code are Node.js-based; v22 is current LTS and satisfies Vite 8's Node.js 20.19+/22.12+ requirement. Single runtime for both MCP server and API layer. |
| TypeScript | 5.9 | Language | MCP SDK and Zod are TypeScript-first. Full type inference across tool schemas, DB models, and API contracts prevents entire categories of runtime errors in schema-heavy code. |
| `@modelcontextprotocol/sdk` | 1.27.1 | MCP server framework | Official Anthropic SDK — the only correct choice. Handles stdio transport, tool registration, schema validation via Zod, and spec compliance. `StdioServerTransport` is Claude Code's expected transport. |
| better-sqlite3 | 12.8.0 | SQLite database | Synchronous API is a feature for an MCP server: no async/await overhead on every query, simpler code paths, battle-tested. Ships SQLite 3.51.3. Requires Node.js v20+. |
| sqlite-vec | 0.1.7 | Vector similarity search | SQLite extension adding KNN search over float32 vectors. Provides `vec_distance_cosine()`. Replaces the need for a separate vector DB — keeps everything in one SQLite file. npm package: `sqlite-vec`. |
| ollama (npm) | 0.6.3 | Ollama JS client | Official Ollama library. `ollama.embed({ model, input })` accepts a string or string array, returns float vectors. Works with `nomic-embed-text` (768 dims) for local privacy-preserving embeddings. |
| Zod | 4.3.6 | Schema validation | Peer dependency of `@modelcontextprotocol/sdk`. Used for all tool input schemas. v4 is 14x faster than v3 with 57% smaller core. SDK requires Zod ≥ 3.25 but recommends v4. |
| node-cron | 4.2.1 | Scheduled jobs | In-process cron scheduler for the 2am consolidation. Crontab syntax, zero infrastructure overhead, colocated with the server code. Alternative: `croner` (more actively maintained). |
### Frontend Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2 | UI framework | Current stable. shadcn/ui components support React 19 + Tailwind v4. React 19 Actions API simplifies mutation patterns in the approval queue. |
| Vite | 8.0 | Build tool | Current stable. Uses Rolldown/Oxc for faster builds. Required by vite-plugin-pwa 1.1.0. |
| vite-plugin-pwa | 1.1.0 | PWA support | Zero-config service worker generation, manifest, offline caching. Add-installable behavior for phone home screen. Works with Vite 8. |
| Tailwind CSS | 4.x | Styling | shadcn/ui now targets Tailwind v4. CSS-first config, no `tailwind.config.js` needed. |
| shadcn/ui | latest | Component library | Copy-paste components (not an npm package). Designed for Tailwind v4 + React 19. Provides the table, badge, button, dialog, and sheet primitives the dashboard needs without a heavy UI library dependency. |
| TanStack Query | 5.91.2 | Server state / data fetching | Handles polling, cache invalidation, background refetch for the approval queue and episode log. React 19 doesn't eliminate the need for TanStack Query on complex mutation flows. |
| react-force-graph-2d | latest | Knowledge graph visualization | React wrapper over d3-force + Canvas. Handles force-directed entity/relationship graphs. 2D canvas performs well for graphs of 100–10k nodes. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 | Schema validation | Always — peer dep of MCP SDK, also use for API request validation in the HTTP layer |
| `@tanstack/react-router` | 1.x | Client-side routing | Use if the dashboard has multiple views (graph explorer, queue, activity log). Pairs well with TanStack Query — type-safe routes. |
| `hono` | 4.x | HTTP API server | Expose the MCP server's data over HTTP for the PWA. Hono is ultrafast, TypeScript-native, and runs on Node.js. Smaller and faster than Express; better DX than raw http module. |
| `date-fns` | 3.x | Date utilities | Episode timestamps, relative time display ("2 hours ago"), cron scheduling display. Lightweight, tree-shakable. |
| `nanoid` | 5.x | ID generation | Collision-resistant IDs for entities, episodes, and observations. Smaller than uuid, no crypto dep. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` | TypeScript execution (dev) | Run TypeScript directly without compiling. Use for MCP server development. `npx tsx src/server.ts` |
| `tsup` | TypeScript bundler | Bundle the MCP server for distribution. ESM output. Much simpler than raw tsc for server packages. |
| ESLint + `@typescript-eslint` | Linting | Catch schema mismatches early. Required in a codebase where tool contracts are the API surface. |
| Vitest | Unit testing | Same config as Vite. Test consolidation logic, entity merge rules, and embedding similarity thresholds in isolation before wiring to Ollama. |
## Installation
# MCP Server core
# HTTP API layer (serving data to PWA)
# Dev dependencies — MCP server
# PWA / Dashboard (separate workspace or directory)
# Dev dependencies — Dashboard
# shadcn/ui installed via CLI: npx shadcn@latest init
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| better-sqlite3 | `node:sqlite` (Node.js built-in) | Node.js 22.5+ experimental built-in. Not yet stable enough for production use (API still changing). Revisit in 2027. |
| better-sqlite3 | `drizzle-orm` + better-sqlite3 | Use Drizzle if you want type-safe query builder and migrations as code. Adds ~15KB overhead. Worthwhile if the schema evolves frequently across phases. |
| sqlite-vec | Chroma / Qdrant / FAISS | Use a dedicated vector DB only if you need HNSW indexing at 10M+ vectors. For single-user agent memory (< 100k episodes), sqlite-vec in the same file is strictly better — no extra process, no network hop. |
| ollama npm | Vercel AI SDK + Ollama provider | Use AI SDK if you need model orchestration beyond embeddings (e.g., calling the consolidation LLM too). Adds provider abstraction; useful for Phase 2 deep sleep LLM calls. |
| node-cron | `croner` | `croner` is more actively maintained (last publish was recent vs node-cron's 8+ months). Both work fine. Use `croner` for new projects going forward. |
| Hono | Express | Express is fine but has no TypeScript-native request validation. Hono's middleware typing is better. Express makes sense if team is already fluent in it. |
| react-force-graph-2d | Cytoscape.js | Use Cytoscape for graph analysis features (shortest path, clustering). For a visual explorer with pan/zoom/click, react-force-graph-2d is lighter and needs less setup. |
| shadcn/ui | Radix UI primitives (raw) | shadcn/ui is Radix + styling already done. Only bypass it if you need deeply custom component internals. |
| TanStack Query | SWR | TanStack Query v5 has better TypeScript inference, supports mutations, and has offline/background sync. SWR is simpler but lacks the approval queue mutation patterns needed here. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `sqlite3` (npm) | Async callback API, unmaintained feel, requires native build toolchain. Inferior performance to better-sqlite3 in every benchmark. | `better-sqlite3` |
| `sqlite-vss` | Deprecated — replaced by sqlite-vec. Author explicitly deprecated it in 2024. | `sqlite-vec` |
| Sequelize / TypeORM | ORMs designed for Postgres/MySQL with SQLite as an afterthought. Heavy, poor WAL support, bad performance with the synchronous pattern an MCP server needs. | Raw SQL via `better-sqlite3` (or `drizzle-orm` for type safety) |
| `jsonl` file storage (reference MCP server pattern) | Anthropic's reference knowledge graph MCP server stores data in a `.jsonl` file. This is a demo pattern — no indexing, no vector search, full-file rewrites on every update. Do not copy it. | SQLite with proper schema |
| Next.js (for PWA) | Overkill for a local dashboard with no SSR requirements. Adds ~300KB to bundle. PWA + service worker is more complex with Next.js App Router. | React + Vite + vite-plugin-pwa |
| Cloud vector databases (Pinecone, Weaviate, Qdrant cloud) | Violates the local-only constraint. Sends embeddings to external services. | sqlite-vec in the same SQLite file |
| `@xenova/transformers` (in-process embeddings) | Runs a full ML model inside Node.js — large memory footprint (500MB+), slow cold start, requires ONNX runtime. Ollama handles this better in a dedicated process with GPU acceleration. | `ollama` npm package against a running Ollama instance |
## Stack Patterns by Variant
- Use `better-sqlite3` + `sqlite-vec` + `ollama` + `@modelcontextprotocol/sdk`
- Skip Hono until you need HTTP access
- Use `tsx` for development, `tsup` for packaging
- Serve the dashboard as a static PWA that caches the last-fetched data
- Use TanStack Query's `staleTime` + service worker precaching for offline reads
- Writes (approvals, rejections) queue locally and sync when server reconnects
- Wrap the LLM interface behind a `Consolidator` interface
- Use Vercel AI SDK (`ai` npm package) with `@ai-sdk/ollama` provider — it gives a unified `generateText`/`generateObject` API that works with local Ollama or any cloud model
- This is the right pattern for Phase 2 deep sleep consolidation
- Add `drizzle-orm` with SQLite dialect for type-safe query builder
- Schema defined once, types inferred — prevents `SELECT *` sprawl as the schema evolves
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@modelcontextprotocol/sdk@1.27.1` | `zod@>=3.25` | SDK imports from `zod/v4` internally; install zod@4.x |
| `better-sqlite3@12.8.0` | Node.js 20+ | Requires Node.js v20 per March 2026 release notes |
| `sqlite-vec@0.1.7` | `better-sqlite3@12.x` | Load via `Database.loadExtension()` after installing sqlite-vec npm package |
| `vite@8.0` | Node.js 20.19+ or 22.12+ | Vite 8 uses Rolldown/Oxc; breaking change from Vite 7 config format — check migration guide |
| `vite-plugin-pwa@1.1.0` | Vite 5+ (tested with Vite 8) | Requires Vite 5+; Vite 8 is compatible |
| `react@19.2` | `@tanstack/react-query@5.91` | TanStack Query v5 requires React 18+ (React 19 is supported) |
| `shadcn/ui` | Tailwind CSS v4 + React 19 | shadcn officially targets Tailwind v4 + React 19 as of 2025 |
## Sources
- GitHub: modelcontextprotocol/typescript-sdk releases — v1.27.1 confirmed (Feb 24, 2025)
- GitHub: WiseLibs/better-sqlite3 releases — v12.8.0 confirmed (March 13, 2026), Node.js 20+ required
- GitHub: ollama/ollama-js releases — v0.6.3 confirmed
- GitHub: asg017/sqlite-vec releases — v0.1.7 confirmed (March 17, 2026)
- npm search: zod — v4.3.6 current stable (August 2025 initial release, 4.3.6 most recent)
- npm search: @tanstack/react-query — v5.91.2 current
- WebSearch: Vite 8.0.1 current latest (Rolldown/Oxc based)
- WebSearch: React 19.2.x current stable
- WebSearch: vite-plugin-pwa 1.1.0 current
- WebSearch: node-cron 4.2.1 (last publish 8 months ago — consider `croner` as alternative)
- WebSearch: shadcn/ui officially supports Tailwind v4 + React 19
- GitHub: vasturiano/react-force-graph — react-force-graph-2d npm package, Canvas/WebGL, d3-force physics
- GitHub: modelcontextprotocol/servers/src/memory — reference implementation uses JSONL (confirmed: do NOT copy this pattern for production)
- Ollama docs: `ollama.embed({ model, input })` API confirmed, nomic-embed-text is 768-dimension model
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
