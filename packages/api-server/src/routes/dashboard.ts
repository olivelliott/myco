import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Episode } from '@myco/core';
import type { MycoStatements } from '@myco/core';

export function dashboardRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const pendingRow = stmts.countPendingApprovals.get() as { n: number };
    const entitiesRow = stmts.countEntities.get() as { n: number };
    const relationshipsRow = stmts.countRelationships.get() as { n: number };
    const observationsRow = stmts.countObservations.get() as { n: number };

    const recentEpisodes = stmts.selectRecentEpisodes.all() as Pick<Episode, 'id' | 'session_id' | 'agent_id' | 'event_type' | 'created_at'>[];

    const topConnected = stmts.selectTopConnected.all() as Array<{ id: string; name: string; type: string; connection_count: number }>;

    const typeBreakdown = stmts.selectTypeBreakdown.all() as Array<{ type: string; count: number }>;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const entitiesLast7d = (stmts.countEntitiesAfter.get(sevenDaysAgo) as { n: number }).n;
    const observationsLast7d = (stmts.countObservationsAfter.get(sevenDaysAgo) as { n: number }).n;
    const relationshipsLast7d = (stmts.countRelationshipsAfter.get(sevenDaysAgo) as { n: number }).n;

    return c.json({
      pending: pendingRow.n,
      entities: entitiesRow.n,
      relationships: relationshipsRow.n,
      observations: observationsRow.n,
      recentEpisodes,
      topConnected,
      typeBreakdown,
      growthStats: {
        entitiesLast7d,
        observationsLast7d,
        relationshipsLast7d,
      },
    });
  });

  return app;
}
