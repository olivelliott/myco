import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { MycoStatements } from '@myco/core';
import { validationErrorHook } from '../validation.js';

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

const graphQuerySchema = z.object({
  project: z.string().optional(),
});

export function graphRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', zValidator('query', graphQuerySchema, validationErrorHook), (c) => {
    const { project } = c.req.valid('query');

    let nodeRows: GraphNodeRow[];
    let relRows: RelationshipRow[];

    if (project) {
      // STMT-02 exception: dynamic WHERE for project filter
      nodeRows = db.prepare(
        `SELECT id, name, type, confidence, summary, created_at,
           (SELECT COUNT(*) FROM observations WHERE entity_id = e.id) AS obs_count
         FROM entities e WHERE e.project = ?`
      ).all(project) as GraphNodeRow[];

      // Filter relationships in JS: only include links where both endpoints belong to the project
      const entityIds = new Set(nodeRows.map(n => n.id));
      relRows = (stmts.selectGraphRelationships.all() as RelationshipRow[]).filter(
        r => entityIds.has(r.from_id) && entityIds.has(r.to_id)
      );
    } else {
      nodeRows = stmts.selectGraphNodes.all() as GraphNodeRow[];
      relRows = stmts.selectGraphRelationships.all() as RelationshipRow[];
    }

    const nodes = nodeRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      confidence: row.confidence,
      summary: row.summary,
      created_at: row.created_at,
      val: Math.max(1, row.obs_count),
    }));

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
