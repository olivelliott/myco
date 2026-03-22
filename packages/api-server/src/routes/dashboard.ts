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
