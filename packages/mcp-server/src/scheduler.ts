import { Cron } from 'croner';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { runConsolidation } from './consolidator.js';

/**
 * Schedule the nightly consolidation run at 2am EST.
 * Uses croner with timezone support for DST-safe scheduling.
 * The cron job is registered but does not run immediately.
 *
 * Returns the Cron instance for potential .stop() in tests.
 */
export function scheduleDailyConsolidation(db: Database.Database, stmts: MycoStatements): Cron {
  return new Cron('0 2 * * *', {
    timezone: 'America/New_York',
    catch: (err: unknown) => {
      console.error('[consolidation] cron error:', err instanceof Error ? err.message : String(err));
    },
  }, async () => {
    console.error('[consolidation] nightly run starting');
    try {
      const summary = await runConsolidation(db, stmts);
      console.error(`[consolidation] nightly run complete: ${JSON.stringify(summary)}`);
    } catch (err: unknown) {
      console.error('[consolidation] nightly run failed:', err instanceof Error ? err.message : String(err));
    }
  });
}
