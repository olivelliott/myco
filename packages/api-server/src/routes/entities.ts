import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Entity, Observation } from '@myco/core';

interface ConnectedEntity {
  relation_type: string;
  from_id: string;
  to_id: string;
  id: string;
  name: string;
  type: string;
}

export function entitiesRoutes(db: Database.Database): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');
    const rawLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const rawOffset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    const entities = db.prepare(
      'SELECT id, name, type, confidence, created_at FROM entities ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as Pick<Entity, 'id' | 'name' | 'type' | 'confidence' | 'created_at'>[];

    return c.json(entities);
  });

  app.get('/:id', (c) => {
    const id = c.req.param('id');

    const entity = db.prepare(
      'SELECT * FROM entities WHERE id = ?'
    ).get(id) as Entity | undefined;

    if (!entity) {
      return c.json({ error: 'Entity not found' }, 404);
    }

    const observations = db.prepare(
      'SELECT * FROM observations WHERE entity_id = ? ORDER BY created_at DESC'
    ).all(id) as Observation[];

    const connected = db.prepare(
      `SELECT r.type as relation_type, r.from_id, r.to_id,
              e.id, e.name, e.type
       FROM relationships r
       JOIN entities e ON (
         e.id = CASE WHEN r.from_id = ? THEN r.to_id ELSE r.from_id END
       )
       WHERE r.from_id = ? OR r.to_id = ?`
    ).all(id, id, id) as ConnectedEntity[];

    return c.json({ entity, observations, connected });
  });

  return app;
}
