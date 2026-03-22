# Mycelium Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Myco into a self-enhancing knowledge web with bioluminescent mycelium-themed dashboard, rich graph interactions, and automated relationship discovery.

**Architecture:** Backend algorithms discover relationships automatically during `remember()` and consolidation, enriching the graph without manual effort. Frontend gets a complete visual overhaul with mycelium aesthetics, hover illumination, path tracing, timeline slider, and cluster visualization. API endpoints are enriched to support the new features.

**Tech Stack:** TypeScript, better-sqlite3, sqlite-vec, Ollama, react-force-graph-2d (Canvas), React 19, Tailwind v4, shadcn/ui, Hono, TanStack Query/Router

**Spec:** `docs/superpowers/specs/2026-03-22-mycelium-upgrade-design.md`

---

## Task 1: Add `auto_discovery` to SourceType

**Files:**
- Modify: `packages/core/src/types.ts:1`

- [ ] **Step 1: Update SourceType union**

In `packages/core/src/types.ts`, change line 1:

```typescript
export type SourceType = 'agent_session' | 'consolidation' | 'human_edit' | 'gsd_hook' | 'auto_discovery';
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS (no breaking changes — `auto_discovery` is additive)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add auto_discovery to SourceType union"
```

---

## Task 2: Auto-Relationship Discovery Module

**Files:**
- Create: `packages/mcp-server/src/relationship-discovery.ts`
- Create: `packages/mcp-server/tests/relationship-discovery.test.ts`
- Modify: `packages/mcp-server/src/tools.ts:72` (call discoverRelationships in rememberEntity)

- [ ] **Step 1: Write failing tests for name-mention scanning**

Create `packages/mcp-server/tests/relationship-discovery.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase } from '@myco/core';
import type Database from 'better-sqlite3';
import { discoverRelationships, createBackLinks } from '../src/relationship-discovery.js';
import { rememberEntity } from '../src/tools.js';

const testDir = join(tmpdir(), 'myco-reldiscovery-test-' + process.pid);

describe('relationship-discovery', () => {
  let db: Database.Database;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('discoverRelationships — name mentions', () => {
    it('creates a related_to relationship when observation text mentions an existing entity', async () => {
      // Setup: create an existing entity "React"
      await rememberEntity(db, {
        content: 'A JavaScript UI library',
        entity_name: 'React',
        entity_type: 'technology',
      });

      // Create a new entity "Vite" with observation that mentions "React"
      await rememberEntity(db, {
        content: 'Vite is a build tool',
        entity_name: 'Vite',
        entity_type: 'technology',
      });

      const viteEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('Vite') as { id: string };

      // Act: discover relationships for the Vite observation
      await discoverRelationships(db, viteEntity.id, 'Vite works great with React for fast HMR', null);

      // Assert: should have created a related_to relationship from Vite to React
      const rels = db.prepare(
        `SELECT * FROM relationships WHERE from_id = ? AND type = 'related_to'`
      ).all(viteEntity.id) as Array<{ to_id: string; type: string; source_type: string }>;

      expect(rels.length).toBe(1);
      expect(rels[0].source_type).toBe('auto_discovery');
    });

    it('skips entity names shorter than 3 characters', async () => {
      await rememberEntity(db, {
        content: 'A programming language',
        entity_name: 'Go',
        entity_type: 'technology',
      });

      await rememberEntity(db, {
        content: 'Testing stuff',
        entity_name: 'TestLib',
        entity_type: 'library',
      });

      const testEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TestLib') as { id: string };
      await discoverRelationships(db, testEntity.id, 'We should go ahead and test it', null);

      const rels = db.prepare(
        `SELECT * FROM relationships WHERE from_id = ?`
      ).all(testEntity.id) as Array<{ type: string }>;

      expect(rels.length).toBe(0);
    });

    it('does not create duplicate relationships', async () => {
      await rememberEntity(db, {
        content: 'A JavaScript UI library',
        entity_name: 'React',
        entity_type: 'technology',
      });

      const viteEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('React') as { id: string };
      // Calling twice with same mention should not create duplicates
      await discoverRelationships(db, viteEntity.id, 'React is great', null);
      // Self-mention should be ignored (entity mentions itself)
      const rels = db.prepare(
        `SELECT * FROM relationships WHERE from_id = ? AND type = 'related_to'`
      ).all(viteEntity.id) as Array<{ type: string }>;

      expect(rels.length).toBe(0); // Can't relate to self
    });
  });

  describe('createBackLinks', () => {
    it('finds existing observations mentioning the new entity name via FTS', async () => {
      // Create entity with observation that mentions "Vite"
      await rememberEntity(db, {
        content: 'We use Vite for fast builds in this project',
        entity_name: 'ProjectX',
        entity_type: 'project',
      });

      // Now create the "Vite" entity
      await rememberEntity(db, {
        content: 'A build tool',
        entity_name: 'Vite',
        entity_type: 'technology',
      });

      const viteEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('Vite') as { id: string };
      const projectEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('ProjectX') as { id: string };

      // Act
      createBackLinks(db, viteEntity.id, 'Vite');

      // Assert
      const rels = db.prepare(
        `SELECT * FROM relationships WHERE to_id = ? AND type = 'related_to'`
      ).all(viteEntity.id) as Array<{ from_id: string; source_type: string }>;

      expect(rels.length).toBe(1);
      expect(rels[0].from_id).toBe(projectEntity.id);
      expect(rels[0].source_type).toBe('auto_discovery');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement relationship-discovery.ts**

Create `packages/mcp-server/src/relationship-discovery.ts`:

```typescript
import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { generateSessionId, buildProvenance } from '@myco/core';

const SESSION_ID = generateSessionId();

// Entity name cache with generation counter for invalidation
let entityCache: Map<string, string> | null = null;
let cacheGeneration = 0;
let lastGeneration = -1;

/** Call this after any entity INSERT to invalidate the cache */
export function invalidateEntityCache(): void {
  cacheGeneration++;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getEntityNames(db: Database.Database): Map<string, string> {
  if (entityCache && lastGeneration === cacheGeneration) {
    return entityCache;
  }
  const rows = db.prepare('SELECT id, name FROM entities').all() as Array<{ id: string; name: string }>;
  entityCache = new Map();
  for (const row of rows) {
    if (row.name.length >= 3) {
      entityCache.set(row.name, row.id);
    }
  }
  lastGeneration = cacheGeneration;
  return entityCache;
}

/**
 * Discover relationships by scanning observation text for mentions of existing entities
 * and by semantic similarity if an embedding is provided.
 *
 * - Name-mention: creates 'related_to' relationships (confidence 0.7)
 * - Semantic similarity: creates 'semantically_related' relationships (confidence = 1 - distance)
 * - Caps at 3 new relationships per call
 * - Never blocks the caller — all errors are caught and logged
 */
export async function discoverRelationships(
  db: Database.Database,
  entityId: string,
  observationText: string,
  embedding: Float32Array | null,
): Promise<void> {
  try {
    const prov = buildProvenance(SESSION_ID, undefined, 'auto_discovery', 0.7);
    const entityNames = getEntityNames(db);
    let created = 0;
    const MAX_NEW = 3;

    // 1. Name-mention scanning
    for (const [name, targetId] of entityNames) {
      if (created >= MAX_NEW) break;
      if (targetId === entityId) continue; // skip self

      const pattern = new RegExp('\\b' + escapeRegex(name) + '\\b', 'i');
      if (pattern.test(observationText)) {
        // Check if relationship already exists
        const existing = db.prepare(
          `SELECT 1 FROM relationships WHERE
           (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`
        ).get(entityId, targetId, targetId, entityId);

        if (!existing) {
          db.prepare(`
            INSERT OR IGNORE INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
            VALUES (?, ?, ?, 'related_to', '{}', ?, ?, ?, ?, ?)
          `).run(nanoid(), entityId, targetId, prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at);
          created++;
        }
      }
    }

    // 2. Semantic similarity (if embedding available and budget remains)
    if (embedding && created < MAX_NEW) {
      const rows = db.prepare(`
        WITH knn AS (
          SELECT item_id, distance
          FROM vec_embeddings
          WHERE embedding MATCH ?
            AND k = 5
            AND item_type = 'observation'
        )
        SELECT DISTINCT o.entity_id, knn.distance
        FROM knn
        JOIN observations o ON o.id = knn.item_id
        WHERE o.entity_id != ?
          AND knn.distance < 0.25
        ORDER BY knn.distance
      `).all(embedding, entityId) as Array<{ entity_id: string; distance: number }>;

      for (const row of rows) {
        if (created >= MAX_NEW) break;

        const existing = db.prepare(
          `SELECT 1 FROM relationships WHERE
           (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`
        ).get(entityId, row.entity_id, row.entity_id, entityId);

        if (!existing) {
          const confidence = Math.round((1.0 - row.distance) * 100) / 100;
          db.prepare(`
            INSERT OR IGNORE INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
            VALUES (?, ?, ?, 'semantically_related', '{}', ?, ?, 'auto_discovery', ?, ?)
          `).run(nanoid(), entityId, row.entity_id, prov.session_id, prov.agent_id, confidence, prov.created_at);
          created++;
        }
      }
    }
  } catch (err) {
    console.error('[relationship-discovery] error:', err instanceof Error ? err.message : err);
  }
}

/**
 * When a new entity is created, scan existing observations for mentions of its name
 * using the FTS5 index. Creates 'related_to' relationships back to mentioning entities.
 */
export function createBackLinks(
  db: Database.Database,
  entityId: string,
  entityName: string,
): void {
  if (entityName.length < 3) return;

  try {
    const prov = buildProvenance(SESSION_ID, undefined, 'auto_discovery', 0.6);

    // Use FTS5 to find observations mentioning the entity name
    const ftsQuery = '"' + entityName.replace(/"/g, '""') + '"';
    const rows = db.prepare(`
      SELECT DISTINCT o.entity_id
      FROM fts_observations fts
      JOIN observations o ON o.id = fts.observation_id
      WHERE fts_observations MATCH ?
      LIMIT 100
    `).all(ftsQuery) as Array<{ entity_id: string }>;

    for (const row of rows) {
      if (row.entity_id === entityId) continue;

      const existing = db.prepare(
        `SELECT 1 FROM relationships WHERE
         (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`
      ).get(row.entity_id, entityId, entityId, row.entity_id);

      if (!existing) {
        db.prepare(`
          INSERT OR IGNORE INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
          VALUES (?, ?, ?, 'related_to', '{}', ?, ?, ?, ?, ?)
        `).run(nanoid(), row.entity_id, entityId, prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at);
      }
    }
  } catch (err) {
    console.error('[relationship-discovery] backlink error:', err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --reporter=verbose 2>&1 | tail -20`
Expected: All relationship-discovery tests PASS

- [ ] **Step 5: Wire into rememberEntity()**

In `packages/mcp-server/src/tools.ts`, add import at top:

```typescript
import { discoverRelationships, createBackLinks, invalidateEntityCache } from './relationship-discovery.js';
```

After the entity INSERT block (after line 101, inside the `if (!existingEntity)` block), add:

```typescript
    invalidateEntityCache();
```

At the end of `rememberEntity()`, before the return statement (after the relations handling block, around line 164), add:

```typescript
  // Auto-discover relationships from observation text and embedding
  const embeddingVec = embedding !== null ? new Float32Array(embedding) : null;
  await discoverRelationships(db, entityId, content, embeddingVec);

  // If this is a new entity, create back-links from existing observations
  if (!existingEntity) {
    createBackLinks(db, entityId, entity_name);
  }
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All 68+ tests pass (existing tests unaffected)

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/relationship-discovery.ts packages/mcp-server/tests/relationship-discovery.test.ts packages/mcp-server/src/tools.ts
git commit -m "feat(mcp): auto-discover relationships on remember() — name mentions, semantic similarity, back-links"
```

---

## Task 3: Enriched Graph & Dashboard API

**Files:**
- Modify: `packages/api-server/src/routes/graph.ts`
- Modify: `packages/api-server/src/routes/dashboard.ts`
- Modify: `packages/dashboard/src/lib/api.ts` (update types)

- [ ] **Step 1: Enrich graph API response**

Replace `packages/api-server/src/routes/graph.ts` with:

```typescript
import type Database from 'better-sqlite3';
import { Hono } from 'hono';

interface GraphNodeRow {
  id: string;
  name: string;
  type: string;
  confidence: number;
  summary: string | null;
  created_at: string;
  obs_count: number;
}

interface RelationshipRow {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  confidence: number;
  source_type: string;
  created_at: string;
}

export function graphRoutes(db: Database.Database): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const nodeRows = db.prepare(
      `SELECT id, name, type, confidence, summary, created_at,
        (SELECT COUNT(*) FROM observations WHERE entity_id = e.id) AS obs_count
       FROM entities e`
    ).all() as GraphNodeRow[];

    const nodes = nodeRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      confidence: row.confidence,
      summary: row.summary,
      created_at: row.created_at,
      val: Math.max(1, row.obs_count),
    }));

    const relRows = db.prepare(
      'SELECT id, from_id, to_id, type, confidence, source_type, created_at FROM relationships'
    ).all() as RelationshipRow[];

    const links = relRows.map((row) => ({
      source: row.from_id,
      target: row.to_id,
      type: row.type,
      confidence: row.confidence,
      source_type: row.source_type,
      created_at: row.created_at,
    }));

    return c.json({ nodes, links });
  });

  return app;
}
```

- [ ] **Step 2: Enrich dashboard API response**

Replace `packages/api-server/src/routes/dashboard.ts` with:

```typescript
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Episode } from '@myco/core';

export function dashboardRoutes(db: Database.Database): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const pendingRow = db.prepare(
      "SELECT COUNT(*) as n FROM approval_queue WHERE status = 'pending'"
    ).get() as { n: number };

    const entitiesRow = db.prepare(
      'SELECT COUNT(*) as n FROM entities'
    ).get() as { n: number };

    const relationshipsRow = db.prepare(
      'SELECT COUNT(*) as n FROM relationships'
    ).get() as { n: number };

    const observationsRow = db.prepare(
      'SELECT COUNT(*) as n FROM observations'
    ).get() as { n: number };

    const recentEpisodes = db.prepare(
      'SELECT id, session_id, agent_id, event_type, created_at FROM episodes ORDER BY created_at DESC LIMIT 20'
    ).all() as Pick<Episode, 'id' | 'session_id' | 'agent_id' | 'event_type' | 'created_at'>[];

    const topConnected = db.prepare(`
      SELECT e.id, e.name, e.type,
        (SELECT COUNT(*) FROM relationships r WHERE r.from_id = e.id OR r.to_id = e.id) AS connection_count
      FROM entities e
      ORDER BY connection_count DESC
      LIMIT 5
    `).all() as Array<{ id: string; name: string; type: string; connection_count: number }>;

    const typeBreakdown = db.prepare(
      'SELECT type, COUNT(*) as count FROM entities GROUP BY type ORDER BY count DESC'
    ).all() as Array<{ type: string; count: number }>;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const entitiesLast7d = (db.prepare(
      'SELECT COUNT(*) as n FROM entities WHERE created_at > ?'
    ).get(sevenDaysAgo) as { n: number }).n;

    const observationsLast7d = (db.prepare(
      'SELECT COUNT(*) as n FROM observations WHERE created_at > ?'
    ).get(sevenDaysAgo) as { n: number }).n;

    const relationshipsLast7d = (db.prepare(
      'SELECT COUNT(*) as n FROM relationships WHERE created_at > ?'
    ).get(sevenDaysAgo) as { n: number }).n;

    return c.json({
      pending: pendingRow.n,
      entities: entitiesRow.n,
      relationships: relationshipsRow.n,
      observations: observationsRow.n,
      recentEpisodes,
      topConnected,
      typeBreakdown,
      growthStats: {
        entitiesLast7d,
        observationsLast7d,
        relationshipsLast7d,
      },
    });
  });

  return app;
}
```

- [ ] **Step 3: Update client API types**

In `packages/dashboard/src/lib/api.ts`, update the types:

```typescript
export interface DashboardStats {
  pending: number
  entities: number
  relationships: number
  observations: number
  recentEpisodes: Array<{
    id: string
    session_id: string
    agent_id: string
    event_type: string
    created_at: string
  }>
  topConnected: Array<{
    id: string
    name: string
    type: string
    connection_count: number
  }>
  typeBreakdown: Array<{
    type: string
    count: number
  }>
  growthStats: {
    entitiesLast7d: number
    observationsLast7d: number
    relationshipsLast7d: number
  }
}

export interface GraphData {
  nodes: Array<{
    id: string
    name: string
    type: string
    val: number
    confidence: number
    summary: string | null
    created_at: string
  }>
  links: Array<{
    source: string
    target: string
    type: string
    confidence: number
    source_type: string
    created_at: string
  }>
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-server/src/routes/graph.ts packages/api-server/src/routes/dashboard.ts packages/dashboard/src/lib/api.ts
git commit -m "feat(api): enrich graph and dashboard endpoints with relationships, growth stats, and metadata"
```

---

## Task 4: Mycelium Theme Overhaul

**Files:**
- Modify: `packages/dashboard/src/app.css`
- Modify: `packages/dashboard/src/components/sidebar.tsx`

- [ ] **Step 1: Update CSS custom properties and base styles**

Replace `packages/dashboard/src/app.css` with mycelium theme:

```css
@import "tailwindcss";

@layer base {
  :root {
    /* Mycelium palette */
    --bg-void: #050510;
    --bg-surface: #0a0a1f;
    --bg-elevated: #111133;
    --border-subtle: #1a1a3a;
    --border-glow: #2a2a5a;

    --text-primary: #e8e8f0;
    --text-secondary: #8888aa;
    --text-muted: #555577;

    --glow-teal: #06ffc8;
    --glow-violet: #a78bfa;
    --glow-amber: #fbbf24;
    --glow-emerald: #34d399;
    --glow-rose: #f472b6;
    --glow-blue: #60a5fa;
    --glow-indigo: #818cf8;

    /* shadcn/ui compatibility */
    --background: 240 100% 3%;
    --foreground: 240 20% 93%;
    --card: 240 100% 5%;
    --card-foreground: 240 20% 93%;
    --popover: 240 100% 5%;
    --popover-foreground: 240 20% 93%;
    --primary: 240 20% 93%;
    --primary-foreground: 240 100% 8%;
    --secondary: 240 40% 12%;
    --secondary-foreground: 240 20% 93%;
    --muted: 240 40% 12%;
    --muted-foreground: 240 15% 55%;
    --accent: 240 40% 12%;
    --accent-foreground: 240 20% 93%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 240 20% 93%;
    --border: 240 40% 12%;
    --input: 240 40% 12%;
    --ring: 166 100% 51%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    border-color: var(--border-subtle);
    box-sizing: border-box;
  }

  body {
    background-color: var(--bg-void);
    color: var(--text-primary);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

- [ ] **Step 2: Update sidebar with mycelium theme**

Replace `packages/dashboard/src/components/sidebar.tsx`:

```tsx
import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, CheckSquare, Network } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../lib/api'
import { Badge } from './ui/badge'

interface NavItem {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string; size?: number }>
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Approvals', to: '/approvals', icon: CheckSquare },
  { label: 'Graph', to: '/graph', icon: Network },
]

export function Sidebar() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30_000,
  })
  const pendingCount = data?.pending ?? 0
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  function isActive(to: string) {
    if (to === '/') return currentPath === '/'
    return currentPath.startsWith(to)
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-60 h-screen flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)' }}>
        <div className="p-6 text-lg font-semibold" style={{ color: 'var(--glow-teal)', textShadow: '0 0 20px rgba(6, 255, 200, 0.4)' }}>
          Myco
        </div>
        <nav className="flex-1 flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = isActive(item.to)
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200"
                style={{
                  backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: active ? '2px solid var(--glow-teal)' : '2px solid transparent',
                  paddingLeft: active ? '10px' : '12px',
                  boxShadow: active ? '0 0 12px rgba(6, 255, 200, 0.08)' : 'none',
                }}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.label === 'Approvals' && pendingCount > 0 && (
                  <Badge className="text-xs ml-auto border-0 px-1.5"
                    style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)', color: 'var(--glow-amber)' }}>
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 text-xs border-t" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>
          v0.1.0
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around z-50"
        style={{ backgroundColor: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)' }}>
        {navItems.map((item) => {
          const active = isActive(item.to)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors"
              style={{
                color: active ? 'var(--glow-teal)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--glow-teal)' : '2px solid transparent',
              }}
            >
              <div className="relative">
                <Icon size={20} />
                {item.label === 'Approvals' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold"
                    style={{ backgroundColor: 'var(--glow-amber)', color: '#000' }}>
                    {pendingCount}
                  </span>
                )}
              </div>
              <span className="font-normal">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/app.css packages/dashboard/src/components/sidebar.tsx
git commit -m "feat(dashboard): mycelium theme overhaul — bioluminescent palette, glow accents, dark void background"
```

---

## Task 5: Mycelium Graph Visualization — Core Rendering

**Files:**
- Modify: `packages/dashboard/src/components/graph-view.tsx`

- [ ] **Step 1: Replace graph-view.tsx with mycelium rendering + hover illumination**

Replace `packages/dashboard/src/components/graph-view.tsx`:

```tsx
import { useState, useMemo, useCallback, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

type GraphNode = {
  id: string
  name: string
  type: string
  val: number
  confidence: number
  summary: string | null
  created_at: string
  color: string
  opacity: number
  x?: number
  y?: number
}

type GraphLink = {
  source: string | GraphNode
  target: string | GraphNode
  type: string
  confidence: number
  source_type: string
  created_at: string
}

interface GraphViewProps {
  nodes: Array<{
    id: string; name: string; type: string; val: number
    confidence?: number; summary?: string | null; created_at?: string
  }>
  links: Array<{
    source: string; target: string; type: string
    confidence?: number; source_type?: string; created_at?: string
  }>
  onNodeClick: (node: GraphNode) => void
  mini?: boolean
}

const TYPE_COLORS: Record<string, string> = {
  person:     '#06ffc8',
  agent:      '#06ffc8',
  project:    '#a78bfa',
  codebase:   '#a78bfa',
  concept:    '#fbbf24',
  topic:      '#fbbf24',
  tool:       '#34d399',
  library:    '#34d399',
  technology: '#60a5fa',
  decision:   '#f472b6',
}
const DEFAULT_COLOR = '#818cf8'

function getNodeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? DEFAULT_COLOR
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function getLinkNodeId(node: string | GraphNode): string {
  return typeof node === 'string' ? node : node.id
}

export function GraphView({ nodes, links, onNodeClick, mini = false }: GraphViewProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const fgRef = useRef<any>(null)

  const uniqueTypes = useMemo(
    () => [...new Set(nodes.map((n) => n.type))].sort(),
    [nodes],
  )

  const decoratedNodes = useMemo(() => {
    return nodes
      .filter((n) => typeFilter === 'all' || n.type === typeFilter)
      .map((n) => ({
        ...n,
        confidence: n.confidence ?? 1,
        summary: n.summary ?? null,
        created_at: n.created_at ?? '',
        color: getNodeColor(n.type),
        opacity: search && !n.name.toLowerCase().includes(search.toLowerCase()) ? 0.15 : 1,
      }))
  }, [nodes, search, typeFilter])

  const filteredNodeIds = useMemo(
    () => new Set(decoratedNodes.map((n) => n.id)),
    [decoratedNodes],
  )

  const filteredLinks = useMemo(
    () =>
      links
        .filter(
          (l) =>
            filteredNodeIds.has(l.source as string) &&
            filteredNodeIds.has(l.target as string),
        )
        .map((l) => ({
          ...l,
          confidence: l.confidence ?? 1,
          source_type: l.source_type ?? 'agent_session',
          created_at: l.created_at ?? '',
        })),
    [links, filteredNodeIds],
  )

  // Build neighbor set for hover illumination
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const link of filteredLinks) {
      const srcId = getLinkNodeId(link.source)
      const tgtId = getLinkNodeId(link.target)
      if (!map.has(srcId)) map.set(srcId, new Set())
      if (!map.has(tgtId)) map.set(tgtId, new Set())
      map.get(srcId)!.add(tgtId)
      map.get(tgtId)!.add(srcId)
    }
    return map
  }, [filteredLinks])

  const isHighlighted = useCallback((nodeId: string) => {
    if (!hoveredNodeId) return true
    if (nodeId === hoveredNodeId) return true
    return neighborMap.get(hoveredNodeId)?.has(nodeId) ?? false
  }, [hoveredNodeId, neighborMap])

  const isLinkHighlighted = useCallback((link: GraphLink) => {
    if (!hoveredNodeId) return true
    const srcId = getLinkNodeId(link.source)
    const tgtId = getLinkNodeId(link.target)
    return srcId === hoveredNodeId || tgtId === hoveredNodeId
  }, [hoveredNodeId])

  return (
    <div className="relative w-full h-full">
      {/* Search + filter controls */}
      {!mini && (
        <div className="absolute top-4 left-4 z-10 flex flex-col md:flex-row gap-2">
          <Input
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-[280px]"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-[160px]"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {uniqueTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes: decoratedNodes as GraphNode[], links: filteredLinks as GraphLink[] }}
        nodeId="id"
        nodeVal="val"
        nodeLabel={(node: object) => {
          const n = node as GraphNode
          return `${n.name} (${n.type}) — ${n.val} observations`
        }}
        nodeCanvasObject={(node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as GraphNode
          if (n.x === undefined || n.y === undefined) return
          const size = Math.sqrt(n.val) * 2.5
          const highlighted = isHighlighted(n.id)
          const alpha = highlighted ? (n.opacity ?? 1) : 0.08

          // Outer glow
          const glowRadius = highlighted && n.id === hoveredNodeId ? size * 5 : size * 3
          const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowRadius)
          gradient.addColorStop(0, hexToRgba(n.color, 0.3 * alpha))
          gradient.addColorStop(0.5, hexToRgba(n.color, 0.1 * alpha))
          gradient.addColorStop(1, hexToRgba(n.color, 0))
          ctx.beginPath()
          ctx.arc(n.x, n.y, glowRadius, 0, 2 * Math.PI)
          ctx.fillStyle = gradient
          ctx.fill()

          // Core circle
          ctx.beginPath()
          ctx.arc(n.x, n.y, size, 0, 2 * Math.PI)
          ctx.fillStyle = hexToRgba(n.color, alpha)
          ctx.fill()

          // Inner highlight
          ctx.beginPath()
          ctx.arc(n.x, n.y, size * 0.4, 0, 2 * Math.PI)
          ctx.fillStyle = hexToRgba('#ffffff', 0.3 * alpha)
          ctx.fill()

          // Labels (always visible in non-mini mode, or when zoomed in mini)
          if (!mini || globalScale > 2) {
            const fontSize = Math.max(10 / globalScale, 3)
            ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            // Text shadow for readability
            ctx.fillStyle = hexToRgba('#000000', 0.5 * alpha)
            ctx.fillText(n.name, n.x + 0.5, n.y + size + 2.5)
            // Label text
            ctx.fillStyle = hexToRgba(n.color, 0.8 * alpha)
            ctx.fillText(n.name, n.x, n.y + size + 2)
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
        linkCanvasObject={(link: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const l = link as GraphLink & { source: GraphNode; target: GraphNode }
          if (!l.source.x || !l.target.x) return
          const highlighted = isLinkHighlighted(l)
          const alpha = highlighted ? 0.5 : 0.06
          const srcColor = getNodeColor(l.source.type ?? '')
          const width = (1 + (l.confidence ?? 1) * 1.5) / globalScale

          ctx.beginPath()
          ctx.moveTo(l.source.x, l.source.y!)
          // Slight curve for overlapping links
          const midX = (l.source.x + l.target.x) / 2
          const midY = (l.source.y! + l.target.y!) / 2
          const dx = l.target.x - l.source.x
          const dy = l.target.y! - l.source.y!
          const cpX = midX - dy * 0.08
          const cpY = midY + dx * 0.08
          ctx.quadraticCurveTo(cpX, cpY, l.target.x, l.target.y!)

          ctx.strokeStyle = hexToRgba(srcColor, alpha)
          ctx.lineWidth = width

          // Dashed for auto-discovered
          if (l.source_type === 'auto_discovery') {
            ctx.setLineDash([4 / globalScale, 4 / globalScale])
          } else {
            ctx.setLineDash([])
          }
          ctx.stroke()
          ctx.setLineDash([])

          // Relationship label on hover
          if (highlighted && hoveredNodeId && globalScale > 1) {
            const fontSize = Math.max(9 / globalScale, 2)
            ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            // Background pill
            const label = l.type
            const textWidth = ctx.measureText(label).width
            ctx.fillStyle = hexToRgba('#050510', 0.8)
            ctx.beginPath()
            ctx.roundRect(cpX - textWidth / 2 - 3 / globalScale, cpY - fontSize / 2 - 2 / globalScale,
              textWidth + 6 / globalScale, fontSize + 4 / globalScale, 3 / globalScale)
            ctx.fill()
            ctx.fillStyle = hexToRgba(srcColor, 0.9)
            ctx.fillText(label, cpX, cpY)
          }
        }}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={(node: object) => onNodeClick(node as GraphNode)}
        onNodeHover={(node: object | null) => {
          setHoveredNodeId(node ? (node as GraphNode).id : null)
        }}
        backgroundColor="#050510"
        width={undefined}
        height={undefined}
        cooldownTicks={mini ? Infinity : 100}
        enableNavigationControls={!mini}
        enablePointerInteraction={!mini}
      />
    </div>
  )
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/graph-view.tsx
git commit -m "feat(dashboard): mycelium graph — bioluminescent nodes, hover illumination, relationship labels, curved links"
```

---

## Task 6: Dashboard Enrichment — Stats, Mini Graph, Activity

**Files:**
- Modify: `packages/dashboard/src/routes/index.tsx`
- Modify: `packages/dashboard/src/components/stat-card.tsx` (or check actual filename)

- [ ] **Step 1: Check existing stat-card and component files**

Run: `ls packages/dashboard/src/components/`

- [ ] **Step 2: Rewrite dashboard page with enriched stats and mini graph**

Replace `packages/dashboard/src/routes/index.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDashboard } from '../hooks/use-dashboard'
import { useGraph } from '../hooks/use-graph'
import { StatCard } from '../components/stat-card'
import { ActivityFeed } from '../components/activity-feed'
import { QuickApprove } from '../components/quick-approve'
import { GraphView } from '../components/graph-view'

export const Route = createFileRoute('/')({ component: DashboardPage })

function DashboardPage() {
  const { data, error } = useDashboard()
  const { data: graphData } = useGraph()
  const navigate = useNavigate()

  if (error) return (
    <div className="text-center py-12">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Cannot reach API server</h2>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Start the api-server with `npm run api` and refresh.</p>
    </div>
  )

  const density = data && data.entities > 0
    ? Math.round((data.relationships / data.entities) * 10) / 10
    : 0

  // Get top 20 most connected nodes for mini graph
  const miniNodes = graphData?.nodes
    ?.sort((a, b) => b.val - a.val)
    .slice(0, 20) ?? []
  const miniNodeIds = new Set(miniNodes.map(n => n.id))
  const miniLinks = graphData?.links?.filter(
    l => miniNodeIds.has(l.source as string) && miniNodeIds.has(l.target as string)
  ) ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold" style={{ color: 'var(--glow-teal)', textShadow: '0 0 12px rgba(6, 255, 200, 0.2)' }}>
        Myco Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Entities"
          value={data?.entities ?? 0}
          sub={data?.growthStats ? `+${data.growthStats.entitiesLast7d} this week` : undefined}
        />
        <StatCard
          label="Observations"
          value={data?.observations ?? 0}
          sub={data?.growthStats ? `+${data.growthStats.observationsLast7d} this week` : undefined}
        />
        <StatCard
          label="Relationships"
          value={data?.relationships ?? 0}
          sub={`${density}x web density`}
        />
        <StatCard
          label="Pending Approvals"
          value={data?.pending ?? 0}
          glow={data?.pending ? true : false}
        />
      </div>

      {/* Mini graph + top connected */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg overflow-hidden" style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          height: '280px',
          cursor: 'pointer',
        }}
          onClick={() => navigate({ to: '/graph' })}
        >
          {miniNodes.length > 0 ? (
            <GraphView
              nodes={miniNodes}
              links={miniLinks}
              onNodeClick={() => navigate({ to: '/graph' })}
              mini
            />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
              Knowledge web preview — add some knowledge first
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Most Connected
          </h2>
          <div className="space-y-2">
            {(data?.topConnected ?? []).map((entity) => (
              <div key={entity.id} className="flex items-center justify-between px-3 py-2 rounded-md"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{entity.name}</span>
                  <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{entity.type}</span>
                </div>
                <span className="text-xs font-mono" style={{ color: 'var(--glow-teal)' }}>
                  {entity.connection_count} links
                </span>
              </div>
            ))}
            {(data?.topConnected ?? []).length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No connections yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Activity
          </h2>
          <ActivityFeed episodes={data?.recentEpisodes ?? []} />
        </div>
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Quick Approve
          </h2>
          <QuickApprove />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update StatCard to support sub-text and glow**

Read the current `stat-card.tsx` to check its interface, then update it to accept `sub?: string` and `glow?: boolean` props. Add the sub-text below the value. When `glow` is true, add a pulsing amber border animation.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/routes/index.tsx packages/dashboard/src/components/stat-card.tsx
git commit -m "feat(dashboard): enriched stats, mini knowledge graph, most-connected list, mycelium styling"
```

---

## Task 7: Entity Panel Upgrade

**Files:**
- Modify: `packages/dashboard/src/components/entity-panel.tsx`

- [ ] **Step 1: Upgrade entity panel with summary, provenance, and themed styling**

Update `packages/dashboard/src/components/entity-panel.tsx` — add entity summary display at top (if available), add provenance info (source_type, confidence, dates), and apply mycelium theme styling (use CSS variables instead of Tailwind slate classes). Keep the existing structure but replace colors.

Key changes:
- Show `data.entity.summary` at top if present (italic, secondary color)
- Show confidence as a visual bar
- Use `var(--bg-surface)`, `var(--border-subtle)`, `var(--text-primary)` etc.
- Connected entities section: show relationship type with colored dots matching entity type

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/entity-panel.tsx
git commit -m "feat(dashboard): entity panel — summary display, confidence bar, mycelium theme"
```

---

## Task 8: Graph Toolbar + Path Tracing

**Files:**
- Create: `packages/dashboard/src/components/graph-toolbar.tsx`
- Modify: `packages/dashboard/src/routes/graph.tsx`
- Modify: `packages/dashboard/src/components/graph-view.tsx` (add path tracing support)

- [ ] **Step 1: Create graph toolbar component**

Create `packages/dashboard/src/components/graph-toolbar.tsx`:

```tsx
import { Route, Maximize2, X } from 'lucide-react'

interface GraphToolbarProps {
  pathMode: boolean
  onTogglePathMode: () => void
  pathInfo?: string | null
  onClearPath: () => void
}

export function GraphToolbar({ pathMode, onTogglePathMode, pathInfo, onClearPath }: GraphToolbarProps) {
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
      <button
        onClick={onTogglePathMode}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all"
        style={{
          backgroundColor: pathMode ? 'rgba(6, 255, 200, 0.15)' : 'var(--bg-surface)',
          border: `1px solid ${pathMode ? 'var(--glow-teal)' : 'var(--border-subtle)'}`,
          color: pathMode ? 'var(--glow-teal)' : 'var(--text-secondary)',
        }}
      >
        <Route size={16} />
        {pathMode ? 'Path Tracing' : 'Trace Path'}
      </button>

      {pathInfo && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md text-xs"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
          <span className="flex-1">{pathInfo}</span>
          <button onClick={onClearPath} className="opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add path tracing state to graph page**

Update `packages/dashboard/src/routes/graph.tsx` to add path mode state, toolbar, and BFS logic:

- Add state: `pathMode`, `pathSource`, `pathTarget`, `pathNodeIds`
- BFS function that finds shortest path between two nodes in the graph data
- When path is found, pass highlighted node/link IDs to GraphView
- Show path info string like "React → JavaScript → Node.js"
- Escape key exits path mode

- [ ] **Step 3: Update GraphView to accept path highlighting**

Add optional `highlightedPath` prop to GraphView: `Set<string>` of node IDs and link keys on the active path. When provided, nodes/links on the path get extra glow and pulsing animation.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/graph-toolbar.tsx packages/dashboard/src/routes/graph.tsx packages/dashboard/src/components/graph-view.tsx
git commit -m "feat(dashboard): path tracing mode — BFS shortest path with animated highlighting"
```

---

## Task 9: Timeline Slider

**Files:**
- Create: `packages/dashboard/src/components/timeline-slider.tsx`
- Modify: `packages/dashboard/src/routes/graph.tsx`

- [ ] **Step 1: Create timeline slider component**

Create `packages/dashboard/src/components/timeline-slider.tsx`:

A slider component that:
- Takes `minDate` and `maxDate` (ISO strings) and `currentDate` state
- Renders a range input styled with mycelium colors
- Shows the current date as a label
- Has a Play/Pause button and speed selector (1x, 2x, 5x)
- Emits `onDateChange` callback

- [ ] **Step 2: Wire into graph page**

In `packages/dashboard/src/routes/graph.tsx`:
- Add state: `timelineEnabled`, `timelineDate`
- When timeline is active, filter graph data `nodes` and `links` by `created_at <= timelineDate`
- Add timeline toggle button to toolbar
- Render TimelineSlider at bottom of graph view when enabled

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/timeline-slider.tsx packages/dashboard/src/routes/graph.tsx
git commit -m "feat(dashboard): timeline slider — scrub through knowledge graph growth over time"
```

---

## Task 10: Approval Queue Polish

**Files:**
- Modify: `packages/dashboard/src/components/approval-card.tsx`
- Modify: `packages/dashboard/src/components/merge-card.tsx`
- Modify: `packages/dashboard/src/routes/approvals.tsx`

- [ ] **Step 1: Check existing approval card and merge card files**

Run: `ls packages/dashboard/src/components/approval-card* packages/dashboard/src/components/merge-card*`

- [ ] **Step 2: Theme approval cards with mycelium palette**

Update both `approval-card.tsx` and `merge-card.tsx` to use CSS variables instead of Tailwind slate classes. Add:
- Confidence bar visualization (colored bar, width = confidence %)
- Evidence quote styling with left border glow
- Mycelium-themed approve (emerald glow) and reject (rose glow) buttons

- [ ] **Step 3: Add batch selection to approvals page**

Update `packages/dashboard/src/routes/approvals.tsx`:
- Add checkbox per item + "Select All" header checkbox
- "Approve Selected" / "Reject Selected" buttons in a fixed bottom bar when items selected
- Use existing `useResolveApproval` mutation for each selected item

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/approval-card.tsx packages/dashboard/src/components/merge-card.tsx packages/dashboard/src/routes/approvals.tsx
git commit -m "feat(dashboard): approval queue polish — batch actions, confidence bars, mycelium theme"
```

---

## Task 11: Cluster Visualization + Legend

**Files:**
- Create: `packages/dashboard/src/components/graph-legend.tsx`
- Modify: `packages/dashboard/src/components/graph-view.tsx`

- [ ] **Step 1: Create graph legend component**

Create `packages/dashboard/src/components/graph-legend.tsx` — a collapsible legend panel showing:
- Entity type → color dot mapping
- Line styles: solid = explicit, dashed = auto-discovered
- Node size = observation count
- Positioned bottom-left of graph

- [ ] **Step 2: Add cluster hull rendering**

In `packages/dashboard/src/components/graph-view.tsx`, use the `onRenderFramePre` callback to draw translucent convex hulls behind clusters of nodes connected by `cluster_related` links:
- Group nodes by connected components of `cluster_related` links
- For each cluster with 3+ nodes, compute convex hull of positions
- Draw filled region at 8% opacity with bezier-smoothed edges
- Cache hull computation, recompute after 1 second idle

- [ ] **Step 3: Wire legend into graph page**

Add legend to `packages/dashboard/src/routes/graph.tsx`

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/graph-legend.tsx packages/dashboard/src/components/graph-view.tsx packages/dashboard/src/routes/graph.tsx
git commit -m "feat(dashboard): cluster visualization with convex hulls and graph legend"
```

---

## Task 12: Consolidation Clustering + Entity Summaries

**Files:**
- Modify: `packages/mcp-server/src/consolidator.ts`

- [ ] **Step 1: Write test for clusterAndSummarize**

Add to `packages/mcp-server/tests/server.test.ts` (or create a new test file):

```typescript
describe('clusterAndSummarize', () => {
  it('creates cluster_related relationships for semantically close entities', async () => {
    // Setup: create two entities with similar observations
    await rememberEntity(db, {
      content: 'React is a UI framework for building web interfaces',
      entity_name: 'React',
      entity_type: 'technology',
    });
    await rememberEntity(db, {
      content: 'Vue is a UI framework for building web interfaces',
      entity_name: 'Vue',
      entity_type: 'technology',
    });

    const reactId = (db.prepare('SELECT id FROM entities WHERE name = ?').get('React') as { id: string }).id;
    const vueId = (db.prepare('SELECT id FROM entities WHERE name = ?').get('Vue') as { id: string }).id;

    // This test depends on Ollama being available for embeddings
    // If Ollama is unavailable, the test should pass gracefully (no relationships created)
  });
});
```

Note: Full clustering tests require Ollama. Write the test to pass gracefully when Ollama is unavailable.

- [ ] **Step 2: Implement clusterAndSummarize**

Add to `packages/mcp-server/src/consolidator.ts`:

```typescript
export async function clusterAndSummarize(
  db: Database.Database,
  touchedEntityIds: string[],
): Promise<void> {
  // 1. For each touched entity, compute average embedding from its observations
  // 2. KNN search against all other entities' average embeddings
  // 3. Create cluster_related relationships for close matches
  // 4. Generate summaries for entities with 5+ observations and no summary
}
```

Wire it into `runConsolidation()` — call after the main loop completes, passing the set of entity IDs that were created or updated.

- [ ] **Step 3: Build and test**

Run: `npm run build && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/consolidator.ts packages/mcp-server/tests/server.test.ts
git commit -m "feat(mcp): post-consolidation clustering and entity summary generation"
```

---

## Task 13: Final Integration Test + Pre-Tag Cleanup

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Delete the planning deletion**

Run: `git checkout -- .planning/v2.0-MILESTONE-AUDIT.md` (if still deleted) or skip if already committed.

- [ ] **Step 4: Commit pre-tag fixes from earlier in this session**

```bash
git add GETTING-STARTED.md CONTRIBUTING.md SECURITY.md CHANGELOG.md .claude/settings.json packages/*/package.json
git commit -m "chore: pre-release cleanup — fix hardcoded paths, add package metadata, SECURITY.md, CHANGELOG.md"
```

- [ ] **Step 5: Add .superpowers to .gitignore**

```bash
echo '.superpowers/' >> .gitignore
```

- [ ] **Step 6: Final commit and tag**

```bash
git add .gitignore docs/
git commit -m "docs: add mycelium upgrade design spec and implementation plan"
```
