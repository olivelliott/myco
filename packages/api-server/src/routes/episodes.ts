import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Episode } from '@ai-workbots/core';

export function episodesRoutes(db: Database.Database): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const limitParam = c.req.query('limit');
    const rawLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

    const episodes = db.prepare(
      'SELECT id, session_id, agent_id, event_type, payload, created_at FROM episodes ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as Episode[];

    const parsed = episodes.map((e) => ({
      ...e,
      payload: (() => {
        try {
          return JSON.parse(e.payload);
        } catch {
          return e.payload;
        }
      })(),
    }));

    return c.json(parsed);
  });

  return app;
}
