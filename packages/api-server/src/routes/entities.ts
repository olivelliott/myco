import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Entity, Observation, MycoStatements } from '@myco/core';
import { validationErrorHook } from '../validation.js';

interface ConnectedEntity {
  relation_type: string;
  from_id: string;
  to_id: string;
  id: string;
  name: string;
  type: string;
}

const entitiesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  project: z.string().optional(),
});

export function entitiesRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', zValidator('query', entitiesQuerySchema, validationErrorHook), (c) => {
    const { limit = 50, offset = 0, project } = c.req.valid('query');

    if (project) {
      // STMT-02 exception: dynamic WHERE for project filter
      const entities = db.prepare(
        `SELECT id, name, type, confidence, created_at
         FROM entities WHERE project = ?
         ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      ).all(project, limit, offset) as Pick<Entity, 'id' | 'name' | 'type' | 'confidence' | 'created_at'>[];
      return c.json(entities);
    }

    const entities = stmts.selectEntitiesPaginated.all(limit, offset) as Pick<Entity, 'id' | 'name' | 'type' | 'confidence' | 'created_at'>[];

    return c.json(entities);
  });

  app.get('/:id', (c) => {
    const id = c.req.param('id');

    const entity = stmts.selectEntityById.get(id) as Entity | undefined;

    if (!entity) {
      return c.json({ error: { message: 'Entity not found', code: 'NOT_FOUND', status: 404 } }, 404);
    }

    const observations = stmts.selectObservationsByEntity.all(id) as Observation[];

    const connected = stmts.selectConnectedEntities.all(id, id, id) as ConnectedEntity[];

    return c.json({ entity, observations, connected });
  });

  return app;
}
