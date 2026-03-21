# Phase 4: REST API + PWA - Research

**Researched:** 2026-03-20
**Domain:** Hono REST API + React PWA (Vite 8, TanStack Query, react-force-graph-2d, shadcn/ui, vite-plugin-pwa)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sidebar navigation with 3 views: Dashboard (home), Approvals (queue), Knowledge Graph (explorer). Sidebar collapses to bottom tabs on mobile
- Dashboard home shows 3 stat cards (pending approvals, total entities, recent episodes) + recent activity feed + quick-approve list for top pending items
- Activity feed is chronological, grouped by date, with relative timestamps ("2 hours ago") via date-fns
- Dark theme with accent colors for status (green=approved, amber=pending, red=rejected). Minimal, data-focused dashboard aesthetic
- Card list display for approval queue with: entity name, observation preview, confidence badge, reason tag, expandable evidence quote. Most recent first
- Inline actions on each card — approve (green button), reject (red button), edit (opens inline text editor replacing observation content, then approve)
- Toast notification + card animates out on action. Counter updates. No page reload — optimistic update via TanStack Query mutation + invalidation
- Entity merge candidates show both entities side-by-side with observations from each. "Merge" button consolidates, "Keep Separate" dismisses
- `react-force-graph-2d` for Canvas-based force-directed graph visualization
- Nodes: entity name as label, color-coded by entity type, size proportional to observation count. Hover shows type + observation count tooltip
- Clicking a node opens a side panel with entity details, all observations, connected entities with relationship types. Panel dismisses on click-away or Escape
- Search bar at top filters/highlights matching entities. Type filter dropdown. Graph re-renders with filtered subset
- Separate `packages/api-server` package importing from `@ai-workbots/core`. Hono routes: `/api/dashboard` (stats), `/api/approvals` (CRUD), `/api/entities` (list/detail), `/api/episodes` (recent), `/api/graph` (nodes + edges)
- API server opens same `brain.db` via `openDatabase()` — WAL mode supports concurrent readers
- PWA via `vite-plugin-pwa` with runtime caching: API responses use `staleWhileRevalidate` (30s stale time), static assets cached-first
- PWA lives in `packages/dashboard` — separate Vite 8 workspace with React 19 + Tailwind v4 + shadcn/ui. Dev server proxies `/api` to Hono server

### Claude's Discretion
- Exact shadcn/ui component selection for cards, badges, buttons, dialogs
- Graph physics parameters (link distance, charge strength, node repulsion)
- TanStack Query cache timing and refetch intervals
- API pagination strategy and default limits
- PWA manifest details (icons, splash screens, theme color)
- TanStack Router route structure

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PWA-01 | Approval queue UI displays pending items with source session, confidence score, and contradicted facts | TanStack Query useQuery + useMutation patterns; shadcn/ui Card + Badge components; approval_queue table schema |
| PWA-02 | Approve/reject/edit actions on queued items from the PWA | Hono PATCH /api/approvals/:id endpoint; TanStack Query optimistic mutation + invalidateQueries; Sonner toast |
| PWA-03 | Knowledge graph explorer visualizes entities, relationships, and connections interactively | react-force-graph-2d ForceGraph2D component; /api/graph endpoint; nodeCanvasObject for labels; onNodeClick side panel |
| PWA-04 | Activity dashboard shows session timeline, episode counts, graph growth, and pending approval count | /api/dashboard stats endpoint; /api/episodes recent list; shadcn/ui stat cards; date-fns relative timestamps |
| PWA-05 | Responsive design works equally well on phone and desktop | Tailwind v4 responsive breakpoints; sidebar→bottom-tabs collapse pattern; Tailwind sm:/md: prefixes |
| PWA-06 | PWA reads from the same SQLite database as the MCP server via a Hono REST API | better-sqlite3 WAL concurrent reader model; Hono @hono/node-server serve(); BRAIN_DB_PATH env var shared |
</phase_requirements>

---

## Summary

Phase 4 delivers the human-facing interface: a Hono HTTP server that exposes brain.db over REST, and a React PWA dashboard that consumes it. Both components are new packages in the existing monorepo (`packages/api-server` and `packages/dashboard`). The api-server is a thin Hono app that opens `brain.db` read-write (same `openDatabase()` from core) and exposes five route groups. The dashboard is a Vite 8 + React 19 SPA with TanStack Router for views, TanStack Query for data fetching and mutations, react-force-graph-2d for the knowledge graph, shadcn/ui + Tailwind v4 for UI, and vite-plugin-pwa for offline/installable behavior.

WAL mode (already set in Phase 1) allows the API server and MCP server to read from the same brain.db simultaneously without locking. The API server is the only writer for approval resolutions; the MCP server is the only writer for entities, observations, and episodes. This concurrent-reader model is safe with WAL and busy_timeout already configured.

The key complexity areas are: (1) the Hono API package setup in the monorepo with NodeNext module resolution, (2) react-force-graph-2d node rendering and filtering without re-mounting the component, and (3) TanStack Query optimistic mutation for the approval queue with correct rollback on error.

**Primary recommendation:** Build api-server as a Node.js ESM package with Hono + @hono/node-server + @hono/zod-validator. Build dashboard as a separate Vite 8 workspace package; do not attempt a monorepo TypeScript project reference for the frontend — Vite handles its own build.

---

## Standard Stack

### Core (API Server)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | 4.12.8 | HTTP framework | TypeScript-native, ultrafast, Web Standards API, minimal setup on Node.js |
| @hono/node-server | 1.19.11 | Node.js adapter for Hono | Required to run Hono's Web-standard `fetch` handler on Node.js HTTP |
| @hono/zod-validator | 0.7.6 | Request body/param validation | Thin middleware over Zod; `c.req.valid('json')` gives typed inputs; matches existing Zod v4 stack |
| @ai-workbots/core | workspace:* | DB access + types | `openDatabase()` and all TypeScript types already defined |

### Core (Dashboard)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.4 | UI runtime | Per CLAUDE.md decision; shadcn/ui targets React 19 |
| Vite | 8.0.1 | Build tool | Per CLAUDE.md; Rolldown/Oxc based; required by vite-plugin-pwa 1.2 |
| vite-plugin-pwa | 1.2.0 | PWA + service worker | Zero-config SW generation; Workbox StaleWhileRevalidate for API caching |
| Tailwind CSS | 4.2.2 | Styling | Per CLAUDE.md; CSS-first config, no `tailwind.config.js` needed |
| shadcn/ui | latest (CLI) | Component library | Copy-paste components; officially supports Tailwind v4 + React 19 as of 2025 |
| @tanstack/react-query | 5.91.3 | Server state management | Data fetching, mutation, optimistic updates for approval queue |
| @tanstack/react-router | 1.168.1 | Client-side routing | Type-safe routes; pairs well with TanStack Query; file-based routing available |
| @tanstack/router-plugin | 1.167.2 | Vite plugin for TanStack Router | Enables file-based routing code generation in Vite build |
| react-force-graph-2d | 1.29.1 | Knowledge graph visualization | Canvas-based force-directed graph; onNodeClick; nodeCanvasObject custom rendering |
| sonner | 2.0.7 | Toast notifications | Recommended by shadcn/ui (replaces deprecated toast component); simple API |
| date-fns | 3.x | Date formatting | Relative timestamps in activity feed; tree-shakable |

### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | TypeScript dev execution (api-server) | `npx tsx packages/api-server/src/index.ts` |
| tsup | Build (api-server) | Bundles api-server to ESM; consistent with mcp-server |
| @vitejs/plugin-react | React Fast Refresh in Vite | Standard Vite React plugin |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Router | React Router v6 | TanStack Router has better TypeScript inference, type-safe search params; more setup |
| sonner | shadcn toast (radix) | shadcn/ui explicitly deprecated their toast in favor of sonner; use sonner |
| react-force-graph-2d | Cytoscape.js | Cytoscape has graph analysis features; react-force-graph-2d is lighter for visual explorer |
| vite-plugin-pwa generateSW | injectManifest | generateSW is zero-config and sufficient; injectManifest only needed for custom SW logic |

**Installation (api-server):**
```bash
npm install hono @hono/node-server @hono/zod-validator --workspace=packages/api-server
npm install -D tsup tsx @types/node --workspace=packages/api-server
```

**Installation (dashboard — new package):**
```bash
npm create vite@latest packages/dashboard -- --template react-ts
cd packages/dashboard
npm install @tanstack/react-query @tanstack/react-router @tanstack/router-plugin
npm install react-force-graph-2d sonner date-fns
npm install -D vite-plugin-pwa tailwindcss @tailwindcss/vite @vitejs/plugin-react
npx shadcn@latest init
```

**Version verification (confirmed 2026-03-20):**
- hono: 4.12.8
- @hono/node-server: 1.19.11
- @hono/zod-validator: 0.7.6
- react-force-graph-2d: 1.29.1
- @tanstack/react-query: 5.91.3
- @tanstack/react-router: 1.168.1
- vite-plugin-pwa: 1.2.0
- tailwindcss: 4.2.2
- react: 19.2.4
- vite: 8.0.1
- sonner: 2.0.7

---

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── api-server/
│   ├── src/
│   │   ├── index.ts          # Entry: serve() + graceful shutdown
│   │   ├── routes/
│   │   │   ├── dashboard.ts  # GET /api/dashboard
│   │   │   ├── approvals.ts  # GET/PATCH /api/approvals
│   │   │   ├── entities.ts   # GET /api/entities, GET /api/entities/:id
│   │   │   ├── episodes.ts   # GET /api/episodes
│   │   │   └── graph.ts      # GET /api/graph
│   │   └── db.ts             # Singleton DB instance for api-server process
│   ├── package.json
│   └── tsconfig.json
│
└── dashboard/
    ├── public/
    │   ├── pwa-192x192.png   # PWA manifest icons (required for installability)
    │   └── pwa-512x512.png
    ├── src/
    │   ├── main.tsx          # QueryClient, RouterProvider, Toaster mount
    │   ├── routes/
    │   │   ├── __root.tsx    # Root layout: sidebar + outlet
    │   │   ├── index.tsx     # Dashboard home (stats + activity feed)
    │   │   ├── approvals.tsx # Approval queue
    │   │   └── graph.tsx     # Knowledge graph explorer
    │   ├── components/
    │   │   ├── sidebar.tsx   # Collapsible sidebar (desktop) / bottom tabs (mobile)
    │   │   ├── stat-card.tsx
    │   │   ├── approval-card.tsx
    │   │   ├── entity-panel.tsx  # Side panel on node click
    │   │   └── graph-view.tsx    # ForceGraph2D wrapper
    │   ├── hooks/
    │   │   ├── use-approvals.ts
    │   │   ├── use-graph.ts
    │   │   └── use-dashboard.ts
    │   └── lib/
    │       └── api.ts        # Typed fetch wrappers for all endpoints
    ├── vite.config.ts
    └── package.json
```

### Pattern 1: Hono App Entry Point (Node.js)

```typescript
// packages/api-server/src/index.ts
// Source: https://hono.dev/docs/getting-started/nodejs
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { openDatabase } from '@ai-workbots/core'
import { dashboardRoutes } from './routes/dashboard.js'
import { approvalsRoutes } from './routes/approvals.js'

const db = openDatabase()  // Shares brain.db with MCP server via WAL

const app = new Hono()

// CORS must be registered BEFORE routes
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:4173'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type'],
}))

app.route('/api/dashboard', dashboardRoutes(db))
app.route('/api/approvals', approvalsRoutes(db))
// ... remaining routes

const server = serve({ fetch: app.fetch, port: 3001 })

process.on('SIGINT', () => { server.close(); process.exit(0) })
process.on('SIGTERM', () => { server.close(); process.exit(0) })
```

### Pattern 2: Hono Route with Zod Validation

```typescript
// packages/api-server/src/routes/approvals.ts
// Source: https://hono.dev/docs/guides/validation
import { Hono } from 'hono'
import * as z from 'zod'
import { zValidator } from '@hono/zod-validator'
import type Database from 'better-sqlite3'

const resolveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  edited_content: z.string().optional(),
})

export function approvalsRoutes(db: Database.Database) {
  const app = new Hono()

  app.get('/', (c) => {
    const items = db.prepare(
      `SELECT * FROM approval_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50`
    ).all()
    return c.json({ items })
  })

  app.patch('/:id', zValidator('json', resolveSchema), (c) => {
    const { id } = c.req.param()
    const data = c.req.valid('json')
    // apply resolution logic
    return c.json({ success: true })
  })

  return app
}
```

### Pattern 3: TanStack Query Optimistic Mutation (Approval Queue)

```typescript
// Source: https://tanstack.com/query/v5/docs/react/guides/mutations
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

function useResolveApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status, edited_content }: ResolveParams) => {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, edited_content }),
      })
      if (!res.ok) throw new Error('Failed to resolve')
      return res.json()
    },
    onMutate: async (vars) => {
      // Cancel in-flight refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['approvals'] })
      const previous = queryClient.getQueryData(['approvals'])
      // Optimistically remove the card from the list
      queryClient.setQueryData(['approvals'], (old: ApprovalList) => ({
        ...old,
        items: old.items.filter(i => i.id !== vars.id),
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['approvals'], context?.previous)
      toast.error('Action failed — changes rolled back')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.status === 'approved' ? 'Approved' : 'Rejected')
    },
  })
}
```

### Pattern 4: ForceGraph2D with Custom Node Rendering

```typescript
// Source: https://github.com/vasturiano/react-force-graph
import ForceGraph2D from 'react-force-graph-2d'

type GraphNode = { id: string; name: string; type: string; val: number; color: string }
type GraphLink = { source: string; target: string; type: string }

function GraphView({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  return (
    <>
      <ForceGraph2D
        graphData={{ nodes, links }}
        nodeId="id"
        nodeColor="color"
        nodeVal="val"
        nodeLabel="name"
        nodeCanvasObject={(node, ctx, scale) => {
          // Draw node circle
          ctx.beginPath()
          ctx.arc(node.x!, node.y!, Math.sqrt(node.val) * 2, 0, 2 * Math.PI)
          ctx.fillStyle = node.color
          ctx.fill()
          // Draw label at sufficient zoom
          if (scale > 1.5) {
            ctx.font = `${10 / scale}px Sans-Serif`
            ctx.fillStyle = '#e5e7eb'
            ctx.textAlign = 'center'
            ctx.fillText(node.name, node.x!, node.y! + Math.sqrt(node.val) * 2 + 4)
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
        onNodeClick={(node) => setSelectedNode(node as GraphNode)}
        backgroundColor="#0f172a"
        linkColor={() => '#374151'}
      />
      {selectedNode && (
        <EntityPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </>
  )
}
```

### Pattern 5: VitePWA Configuration (vite.config.ts)

```typescript
// Source: https://vite-pwa-org.netlify.app/workbox/
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^http:\/\/localhost:3001\/api\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
      manifest: {
        name: 'AI Workbots Brain',
        short_name: 'Brain',
        description: 'Agent knowledge graph dashboard',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

### Pattern 6: shadcn/ui Init (Tailwind v4 + React 19)

The shadcn CLI now auto-detects Tailwind v4 and React 19 for new projects:
```bash
npx shadcn@latest init
```
This replaces the old `npx shadcn-ui@latest init`. The CLI generates a CSS-first config (no `tailwind.config.js`). Colors use OKLCH instead of HSL. Toast component is replaced by Sonner — do not add the `toast` component from shadcn, use `sonner` directly.

### Anti-Patterns to Avoid

- **Opening brain.db with `new Database()` directly in api-server**: Use `openDatabase()` from core — it applies WAL pragmas, loads sqlite-vec, and applies schema migrations. Skipping it means the vec0 extension is not loaded and WAL is not confirmed.
- **Using Next.js for the dashboard**: Overkill, no SSR needed, complicates service worker with App Router. Vite + vite-plugin-pwa is the correct choice.
- **Adding the api-server as a TypeScript project reference to the dashboard**: The dashboard is a Vite build, not a tsc composite build. Reference the API types via a shared types file or duplicate minimal types.
- **Using shadcn's built-in `toast` component**: shadcn/ui officially deprecated it in favour of Sonner. Use `import { toast } from 'sonner'` instead.
- **Forgetting PWA icon files in `public/`**: The vite-plugin-pwa manifest references `pwa-192x192.png` and `pwa-512x512.png`. These must exist in `packages/dashboard/public/` or the PWA will not be installable.
- **Querying the approval_queue without parsing `metadata`**: The `metadata` column is a JSON string. Parse it on the API side before sending to the client — don't send raw JSON strings to the dashboard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Force-directed graph layout | Custom d3-force React wrapper | `react-force-graph-2d` | Physics simulation, pan/zoom, interaction, Canvas perf — hundreds of lines of d3 code |
| Request body validation | Manual `z.safeParse()` + error response | `@hono/zod-validator` middleware | Handles error response format, type inference, validation target selection |
| Optimistic cache update + rollback | `useState` + manual rollback logic | TanStack Query `onMutate/onError/onSettled` | Built-in cancelQueries, snapshot/restore, settled invalidation |
| Service worker + offline caching | Custom SW code | vite-plugin-pwa Workbox generateSW | SW registration, cache strategies, manifest — zero-config |
| Toast notifications | Custom portal + animation | `sonner` | Stacking, deduplication, promise toasts, accessibility |
| CORS headers | Manual `c.header()` calls | `cors` from `hono/cors` | Handles OPTIONS preflight, origin validation, header allow-lists |

**Key insight:** This phase is primarily integration work, not new logic. Every UI concern (toasts, routing, graph, data fetching, mutations) has a mature library. The custom code is the SQL queries in Hono route handlers and the data shape mapping between DB rows and graph nodes/links.

---

## Common Pitfalls

### Pitfall 1: WAL Checkpoint Starvation
**What goes wrong:** The WAL file grows unbounded when the API server continuously reads while the MCP server writes. Eventually brain.db directory balloons in size.
**Why it happens:** SQLite cannot checkpoint (reclaim WAL) while any reader has an active read transaction.
**How to avoid:** Keep read transactions short (better-sqlite3 synchronous queries already close immediately). Add `db.pragma('wal_autocheckpoint = 1000')` to openDatabase() or in the API server's connection. WAL autocheckpoint runs every 1000 pages by default — verify this is set.
**Warning signs:** `brain.db-wal` file growing > 10MB during normal operation.

### Pitfall 2: react-force-graph-2d NodeNextmodule Import Failure
**What goes wrong:** `import ForceGraph2D from 'react-force-graph-2d'` may fail in Vite with ESM/CJS interop issues because the package ships CJS.
**Why it happens:** react-force-graph-2d is a CommonJS package. Vite pre-bundles CJS deps via esbuild, which usually works, but if the dependency chain is complex the transform can fail.
**How to avoid:** Add to `optimizeDeps.include` in vite.config.ts:
```typescript
optimizeDeps: {
  include: ['react-force-graph-2d'],
}
```
**Warning signs:** Vite dev server error mentioning `require is not defined` or `default is not a function`.

### Pitfall 3: Optimistic Update Race Condition
**What goes wrong:** User clicks approve, card animates out (optimistic), then `onSettled` refetch brings it back because the PATCH hasn't committed yet.
**Why it happens:** `invalidateQueries` in `onSettled` fires immediately and the background refetch races the write.
**How to avoid:** Use `cancelQueries` in `onMutate` (already shown in Pattern 3). The cancel ensures no in-flight GET can overwrite the optimistic state before the mutation resolves.
**Warning signs:** Cards briefly reappearing after action then disappearing again.

### Pitfall 4: PWA Not Installable — Missing Icons
**What goes wrong:** Browser install prompt never appears on mobile despite PWA being configured.
**Why it happens:** PWA installability requires: HTTPS (or localhost), a web app manifest, a registered service worker, AND icon files of the correct sizes present. Missing `pwa-192x192.png` or `pwa-512x512.png` in `public/` silently fails.
**How to avoid:** Place actual PNG files (even simple solid-color squares) in `packages/dashboard/public/` before first deploy. Use browser DevTools > Application > Manifest to verify no errors.
**Warning signs:** Chrome/Safari DevTools > Application > Manifest shows "No matching service worker" or icon errors.

### Pitfall 5: NodeNext .js Extensions in api-server
**What goes wrong:** Import `./routes/approvals` fails at runtime with "Cannot find module".
**Why it happens:** The monorepo uses `moduleResolution: NodeNext` which requires explicit `.js` extensions in relative imports (even for `.ts` source files).
**How to avoid:** All relative imports in api-server must use `.js` extension: `import { approvalsRoutes } from './routes/approvals.js'`. Consistent with existing packages.
**Warning signs:** `Error [ERR_MODULE_NOT_FOUND]: Cannot find module './routes/approvals'`.

### Pitfall 6: metadata Column Raw JSON in API Response
**What goes wrong:** Client receives `{ metadata: "{\"fact\":...}" }` — a string containing JSON — instead of a parsed object.
**Why it happens:** better-sqlite3 returns SQLite TEXT columns as strings. The `approval_queue.metadata` column stores JSON text.
**How to avoid:** Parse in the route handler before `c.json()`:
```typescript
items = raw.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null }))
```
**Warning signs:** Client code sees `item.metadata.fact` as `undefined` while `typeof item.metadata === 'string'` is true.

---

## Code Examples

### GET /api/graph — Nodes and Links Query
```typescript
// packages/api-server/src/routes/graph.ts
export function graphRoutes(db: Database.Database) {
  const app = new Hono()

  app.get('/', (c) => {
    const entities = db.prepare(
      `SELECT id, name, type, confidence,
              (SELECT COUNT(*) FROM observations WHERE entity_id = e.id) AS obs_count
       FROM entities e`
    ).all() as Array<{ id: string; name: string; type: string; confidence: number; obs_count: number }>

    const relationships = db.prepare(
      `SELECT id, from_id, to_id, type FROM relationships`
    ).all() as Array<{ id: string; from_id: string; to_id: string; type: string }>

    const nodes = entities.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      val: Math.max(1, e.obs_count),   // controls node size in ForceGraph2D
    }))

    const links = relationships.map(r => ({
      source: r.from_id,
      target: r.to_id,
      type: r.type,
    }))

    return c.json({ nodes, links })
  })

  return app
}
```

### GET /api/dashboard — Stats Aggregation
```typescript
// Single query pass for dashboard stats
app.get('/', (c) => {
  const pending = (db.prepare(
    `SELECT COUNT(*) as n FROM approval_queue WHERE status = 'pending'`
  ).get() as { n: number }).n

  const entities = (db.prepare(
    `SELECT COUNT(*) as n FROM entities`
  ).get() as { n: number }).n

  const recentEpisodes = db.prepare(
    `SELECT id, session_id, agent_id, event_type, created_at
     FROM episodes ORDER BY created_at DESC LIMIT 20`
  ).all()

  return c.json({ pending, entities, recentEpisodes })
})
```

### TanStack Router Root Layout Pattern
```typescript
// packages/dashboard/src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar'

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  ),
})
```

### Sonner Toast Integration
```typescript
// packages/dashboard/src/main.tsx
import { Toaster } from 'sonner'

root.render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <Toaster theme="dark" position="bottom-right" />
  </QueryClientProvider>
)

// Usage anywhere:
import { toast } from 'sonner'
toast.success('Approved')
toast.error('Failed to resolve approval')
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| shadcn toast component | sonner (separate package) | 2024-2025 | shadcn deprecated their toast; sonner is the official recommendation now |
| shadcn/ui targets Tailwind v3 | Tailwind v4 + React 19 | 2025 | CSS-first config; OKLCH colors; `@theme inline`; no `tailwind.config.js` |
| `npx shadcn-ui@latest init` | `npx shadcn@latest init` | 2024 | Package renamed from `shadcn-ui` to `shadcn` |
| Vite config with `plugins: [...]` standard | Vite 8 Rolldown/Oxc based | 2025 | Config format changes — review Vite 8 migration guide if upgrading existing project |
| TanStack Router code-based routing | File-based routing (recommended) | 2024 | File-based is now the default recommendation for most projects |

**Deprecated/outdated:**
- `sqlite-vss`: Deprecated, replaced by `sqlite-vec` (already using vec in this project)
- `shadcn/ui toast` component: Deprecated, replaced by `sonner`
- `npx shadcn-ui@latest`: Old package name; use `npx shadcn@latest` instead
- `react-force-graph` (the combined package): Separate `react-force-graph-2d` is the correct install for 2D canvas only

---

## Open Questions

1. **Production API URL in PWA**
   - What we know: Dev server proxies `/api` to `localhost:3001`; vite-plugin-pwa `runtimeCaching` urlPattern uses localhost
   - What's unclear: Where does the API server run in "production" (local machine, not deployed)? What port? How does the built PWA know the API URL?
   - Recommendation: Use a `VITE_API_URL` env var, default to `http://localhost:3001`. PWA caching urlPattern should use a regex that works for both dev and prod local URLs.

2. **PWA icons — generate or placeholder**
   - What we know: vite-plugin-pwa requires `pwa-192x192.png` and `pwa-512x512.png` in `public/` for installability
   - What's unclear: Should the planner include a wave to generate actual icons, or use simple colored squares as placeholders?
   - Recommendation: Create minimal placeholder PNGs programmatically in a setup task (`sharp` or `canvas` npm package), or use a base64-encoded minimal PNG inline in a build script. Don't block shipping the feature on icon design.

3. **Entity detail side panel — from graph or from API**
   - What we know: Graph nodes only have `id, name, type, val` from `/api/graph`. Full entity detail (observations, relationships) requires a separate call.
   - What's unclear: Should there be a `/api/entities/:id` that returns the full entity with observations and connected entities?
   - Recommendation: Yes. Add `/api/entities/:id` returning `{ entity, observations: [], connected: [] }`. The side panel fetches this lazily on node click using TanStack Query `useQuery({ enabled: !!selectedNodeId })`.

---

## Sources

### Primary (HIGH confidence)
- https://hono.dev/docs/getting-started/nodejs — Hono Node.js adapter, serve() API, port config, graceful shutdown
- https://hono.dev/docs/middleware/builtin/cors — CORS middleware, all options with defaults verified
- https://hono.dev/docs/guides/validation — @hono/zod-validator, c.req.valid() pattern
- https://github.com/vasturiano/react-force-graph — ForceGraph2D props: graphData, nodeCanvasObject, onNodeClick, nodeVal, nodeColor
- https://tanstack.com/query/v5/docs/react/guides/mutations — useMutation, onMutate, onError rollback, onSettled invalidation
- https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates — cancelQueries + snapshot pattern
- https://ui.shadcn.com/docs/tailwind-v4 — Tailwind v4 + React 19 support; CLI init command; Sonner recommendation
- https://vite-pwa-org.netlify.app/workbox/ — runtimeCaching, StaleWhileRevalidate, workbox config object
- npm registry (verified 2026-03-20): hono@4.12.8, @hono/node-server@1.19.11, @hono/zod-validator@0.7.6, react-force-graph-2d@1.29.1, @tanstack/react-query@5.91.3, @tanstack/react-router@1.168.1, vite@8.0.1, vite-plugin-pwa@1.2.0, tailwindcss@4.2.2, react@19.2.4, sonner@2.0.7

### Secondary (MEDIUM confidence)
- https://tanstack.com/router/v1/docs/framework/react/guide/file-based-routing — TanStack Router file-based routing with Vite plugin; @tanstack/router-plugin in vite.config
- WebSearch verified: shadcn/ui official Sonner docs at ui.shadcn.com confirm deprecation of built-in toast component

### Tertiary (LOW confidence)
- WAL checkpoint starvation: described in SQLite docs and better-sqlite3 performance docs; specific wal_autocheckpoint pragma behavior not re-verified against current better-sqlite3 12.x docs — treat as established pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-03-20
- Architecture: HIGH — patterns derived from official docs and existing project conventions
- Pitfalls: MEDIUM — WAL checkpoint and CJS interop are well-known; specific edge cases flagged as needing runtime verification
- PWA installability: HIGH — official vite-plugin-pwa docs confirm icon + manifest requirements

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable libraries; Tailwind v4 / shadcn evolving but core API locked)
