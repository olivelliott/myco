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
