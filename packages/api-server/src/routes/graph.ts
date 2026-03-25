import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { MycoStatements } from '@myco/core';

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

export function graphRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const nodeRows = stmts.selectGraphNodes.all() as GraphNodeRow[];

    const nodes = nodeRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      confidence: row.confidence,
      summary: row.summary,
      created_at: row.created_at,
      val: Math.max(1, row.obs_count),
    }));

    const relRows = stmts.selectGraphRelationships.all() as RelationshipRow[];

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
