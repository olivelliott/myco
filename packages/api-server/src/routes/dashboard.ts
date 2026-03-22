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

    const recentEpisodes = db.prepare(
      'SELECT id, session_id, agent_id, event_type, created_at FROM episodes ORDER BY created_at DESC LIMIT 20'
    ).all() as Pick<Episode, 'id' | 'session_id' | 'agent_id' | 'event_type' | 'created_at'>[];

    return c.json({
      pending: pendingRow.n,
      entities: entitiesRow.n,
      recentEpisodes,
    });
  });

  return app;
}
