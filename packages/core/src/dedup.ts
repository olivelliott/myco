import type Database from 'better-sqlite3';
import type { MycoStatements } from './statements.js';

/**
 * Cosine distance threshold for near-duplicate detection.
 * Observations with distance < 0.08 (similarity > 0.92) are near-duplicates.
 * sqlite-vec vec_distance_cosine() returns distance where lower = more similar.
 */
export const NEAR_DUP_DISTANCE_THRESHOLD = 0.08;

/**
 * Classification result for an incoming observation.
 * - NOOP: exact duplicate — skip insert entirely
 * - UPDATE: near-duplicate — retire old observation and insert new version
 * - ADD: genuinely new observation — insert fresh
 */
export type ClassificationResult =
  | { action: 'NOOP'; existingId: string }
  | { action: 'UPDATE'; retireId: string }
  | { action: 'ADD' };

interface CurrentObsRow {
  id: string;
  content: string;
  valid_from: string | null;
}

interface NearDupRow {
  id: string;
  valid_from: string | null;
}

/**
 * Classify an incoming observation before committing it to the database.
 *
 * Algorithm:
 * 1. Fetch all current (non-retired) observations for the entity.
 * 2. If exact text match found → NOOP.
 * 3. If embedding provided and a near-duplicate exists (distance < threshold) → UPDATE.
 * 4. Otherwise → ADD.
 *
 * When multiple near-duplicates exist, the most recent (highest valid_from) is selected
 * as the retire candidate.
 */
export function classifyObservation(
  db: Database.Database,
  entityId: string,
  content: string,
  embedding: Float32Array | null,
  stmts: MycoStatements,
): ClassificationResult {
  // Step 1: Fetch current (non-retired) observations for this entity
  const currentObs = db.prepare<[string], CurrentObsRow>(
    `SELECT id, content, valid_from
     FROM observations
     WHERE entity_id = ? AND valid_until IS NULL
     ORDER BY valid_from DESC`
  ).all(entityId);

  // Step 2: Exact content match → NOOP
  for (const obs of currentObs) {
    if (obs.content === content) {
      return { action: 'NOOP', existingId: obs.id };
    }
  }

  // Step 3: Near-duplicate via embedding similarity → UPDATE
  if (embedding !== null && currentObs.length > 0) {
    // KNN search against vec_embeddings, filtered to current observations for this entity
    // STMT-02 exception: dynamic JOIN filter requires inline db.prepare()
    const nearDups = db.prepare<[Float32Array, number, string], NearDupRow>(
      `WITH knn AS (
         SELECT item_id, distance
         FROM vec_embeddings
         WHERE embedding MATCH ?
           AND k = ?
           AND item_type = 'observation'
       )
       SELECT o.id, o.valid_from
       FROM knn
       JOIN observations o ON o.id = knn.item_id
       WHERE o.entity_id = ?
         AND o.valid_until IS NULL
         AND knn.distance < ${NEAR_DUP_DISTANCE_THRESHOLD}
       ORDER BY o.valid_from DESC
       LIMIT 1`
    ).all(embedding, 20, entityId);

    if (nearDups.length > 0) {
      return { action: 'UPDATE', retireId: nearDups[0].id };
    }
  }

  // Step 4: No match → ADD
  return { action: 'ADD' };
}

/**
 * Set valid_until on an observation, marking it as retired.
 * Used inside transactions by callers (retire + insert is atomic).
 */
export function retireObservation(
  db: Database.Database,
  observationId: string,
  now: string,
): void {
  db.prepare<[string, string]>(
    `UPDATE observations SET valid_until = ? WHERE id = ?`
  ).run(now, observationId);
}
