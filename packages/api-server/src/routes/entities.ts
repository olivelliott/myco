import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Entity, Observation, MycoStatements } from '@myco/core';

interface ConnectedEntity {
  relation_type: string;
  from_id: string;
  to_id: string;
  id: string;
  name: string;
  type: string;
}

export function entitiesRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');
    const rawLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const rawOffset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const entities = stmts.selectEntitiesPaginated.all(limit, offset) as Pick<Entity, 'id' | 'name' | 'type' | 'confidence' | 'created_at'>[];

    return c.json(entities);
  });

  app.get('/:id', (c) => {
    const id = c.req.param('id');

    const entity = stmts.selectEntityById.get(id) as Entity | undefined;

    if (!entity) {
      return c.json({ error: 'Entity not found' }, 404);
    }

    const observations = stmts.selectObservationsByEntity.all(id) as Observation[];

    const connected = stmts.selectConnectedEntities.all(id, id, id) as ConnectedEntity[];

    return c.json({ entity, observations, connected });
  });

  return app;
}
