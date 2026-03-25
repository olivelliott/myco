import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Episode, MycoStatements } from '@myco/core';
import { validationErrorHook } from '../validation.js';

const episodesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50).optional(),
});

export function episodesRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', zValidator('query', episodesQuerySchema, validationErrorHook), (c) => {
    const { limit = 50 } = c.req.valid('query');

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
