import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Episode, MycoStatements } from '@myco/core';

export function episodesRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const limitParam = c.req.query('limit');
    const rawLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);

    const episodes = stmts.selectEpisodesPaginated.all(limit) as Episode[];

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

    return c.json({ episodes: parsed });
  });

  return app;
}
