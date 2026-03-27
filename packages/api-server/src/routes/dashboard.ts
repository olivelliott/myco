import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Episode } from '@myco/core';
import type { MycoStatements } from '@myco/core';
import { validationErrorHook } from '../validation.js';

const dashboardQuerySchema = z.object({
  project: z.string().optional(),
});

export function dashboardRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', zValidator('query', dashboardQuerySchema, validationErrorHook), (c) => {
    const { project } = c.req.valid('query');

    const pendingRow = stmts.countPendingApprovals.get() as { n: number };

    let entitiesCount: number;
    let relationshipsCount: number;
    let observationsCount: number;
    let entitiesLast7d: number;
    let observationsLast7d: number;
    let relationshipsLast7d: number;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    if (project) {
      // STMT-02 exception: dynamic WHERE for project filter
      entitiesCount = (db.prepare(
        `SELECT COUNT(*) as n FROM entities WHERE project = ?`
      ).get(project) as { n: number }).n;

      observationsCount = (db.prepare(
        `SELECT COUNT(*) as n FROM observations o
         JOIN entities e ON e.id = o.entity_id
         WHERE e.project = ?`
      ).get(project) as { n: number }).n;

      relationshipsCount = (db.prepare(
        `SELECT COUNT(*) as n FROM relationships r
         JOIN entities e1 ON e1.id = r.from_id
         JOIN entities e2 ON e2.id = r.to_id
         WHERE e1.project = ? AND e2.project = ?`
      ).get(project, project) as { n: number }).n;

      entitiesLast7d = (db.prepare(
        `SELECT COUNT(*) as n FROM entities WHERE project = ? AND created_at > ?`
      ).get(project, sevenDaysAgo) as { n: number }).n;

      observationsLast7d = (db.prepare(
        `SELECT COUNT(*) as n FROM observations o
         JOIN entities e ON e.id = o.entity_id
         WHERE e.project = ? AND o.created_at > ?`
      ).get(project, sevenDaysAgo) as { n: number }).n;

      relationshipsLast7d = (db.prepare(
        `SELECT COUNT(*) as n FROM relationships r
         JOIN entities e1 ON e1.id = r.from_id
         JOIN entities e2 ON e2.id = r.to_id
         WHERE e1.project = ? AND e2.project = ? AND r.created_at > ?`
      ).get(project, project, sevenDaysAgo) as { n: number }).n;
    } else {
      entitiesCount = (stmts.countEntities.get() as { n: number }).n;
      relationshipsCount = (stmts.countRelationships.get() as { n: number }).n;
      observationsCount = (stmts.countObservations.get() as { n: number }).n;
      entitiesLast7d = (stmts.countEntitiesAfter.get(sevenDaysAgo) as { n: number }).n;
      observationsLast7d = (stmts.countObservationsAfter.get(sevenDaysAgo) as { n: number }).n;
      relationshipsLast7d = (stmts.countRelationshipsAfter.get(sevenDaysAgo) as { n: number }).n;
    }

    // These are always global (not project-scoped) per CONTEXT.md locked decision
    const recentEpisodes = stmts.selectRecentEpisodes.all() as Pick<Episode, 'id' | 'session_id' | 'agent_id' | 'event_type' | 'created_at'>[];
    const topConnected = stmts.selectTopConnected.all() as Array<{ id: string; name: string; type: string; connection_count: number }>;
    const typeBreakdown = stmts.selectTypeBreakdown.all() as Array<{ type: string; count: number }>;
    const recentActivity = stmts.selectRecentActivity.all() as Array<{ id: string; name: string; type: string; confidence: number; created_at: string; event: string }>;

    // Health metrics
    const embeddingRow = stmts.countEmbeddedObservations.get() as { total: number; embedded: number };
    const embeddingCoverage = embeddingRow.total > 0 ? Math.round((embeddingRow.embedded / embeddingRow.total) * 100) : 100;
    const orphanedNodes = (stmts.countOrphanedEntities.get() as { n: number }).n;
    const confidenceDistribution = stmts.selectConfidenceDistribution.all() as Array<{ bucket: string; count: number }>;
    const unconsolidatedEpisodes = (stmts.countUnconsolidatedEpisodes.get() as { n: number }).n;

    return c.json({
      pending: pendingRow.n,
      entities: entitiesCount,
      relationships: relationshipsCount,
      observations: observationsCount,
      recentEpisodes,
      recentActivity,
      topConnected,
      typeBreakdown,
      growthStats: {
        entitiesLast7d,
        observationsLast7d,
        relationshipsLast7d,
      },
      health: {
        embeddingCoverage,
        orphanedNodes,
        confidenceDistribution,
        unconsolidatedEpisodes,
      },
    });
  });

  app.get('/stats/growth', (c) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = stmts.selectGrowthTimeSeries.all(thirtyDaysAgo, thirtyDaysAgo, thirtyDaysAgo) as Array<{
      day: string;
      entities: number;
      observations: number;
      relationships: number;
    }>;
    return c.json({ points: result });
  });

  return app;
}
