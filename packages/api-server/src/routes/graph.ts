import type Database from 'better-sqlite3';
import { Hono } from 'hono';

interface GraphNodeRow {
  id: string;
  name: string;
  type: string;
  confidence: number;
  obs_count: number;
}

interface RelationshipRow {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
}

export function graphRoutes(db: Database.Database): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const nodeRows = db.prepare(
      `SELECT id, name, type, confidence,
        (SELECT COUNT(*) FROM observations WHERE entity_id = e.id) AS obs_count
       FROM entities e`
    ).all() as GraphNodeRow[];

    const nodes = nodeRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      confidence: row.confidence,
      val: Math.max(1, row.obs_count),
    }));

    const relRows = db.prepare(
      'SELECT id, from_id, to_id, type FROM relationships'
    ).all() as RelationshipRow[];

    const links = relRows.map((row) => ({
      source: row.from_id,
      target: row.to_id,
      type: row.type,
    }));

    return c.json({ nodes, links });
  });

  return app;
}
