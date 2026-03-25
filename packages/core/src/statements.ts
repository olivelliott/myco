import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

/**
 * Typed interface for all pre-compiled prepared statements used across the
 * MCP server hot paths. Statements are grouped by domain.
 *
 * CRITICAL: No `project` column referenced here — that column does not exist
 * until Phase 12 (namespace isolation).
 */
export interface MycoStatements {
  // ── Entity statements ────────────────────────────────────────────────────
  selectEntityByNameType: Statement;
  insertEntity: Statement;
  selectAllEntityNames: Statement;
  deleteEntityById: Statement;
  updateEntityTimestampConfidence: Statement;

  // ── Observation statements ───────────────────────────────────────────────
  insertObservation: Statement;
  insertObservationWithEmbeddingFlag: Statement;
  flagObservationNeedsEmbedding: Statement;
  clearObservationEmbeddingFlag: Statement;
  selectPendingEmbeddings: Statement;
  selectObservationsByEntityId: Statement;
  updateObservationEntityId: Statement;

  // ── Relationship statements ──────────────────────────────────────────────
  insertRelationship: Statement;
  selectRelationshipExists: Statement;
  updateRelationshipFromId: Statement;
  updateRelationshipToId: Statement;

  // ── Embedding / vector statements ────────────────────────────────────────
  insertVecEmbedding: Statement;
  knnSearchObservations: Statement;
  knnSearchForContradiction: Statement;
  knnSearchForRelationships: Statement;

  // ── FTS statements ───────────────────────────────────────────────────────
  insertFtsObservation: Statement;
  ftsSearchObservations: Statement;
  ftsSearchEntityMentions: Statement;

  // ── Episode statements ───────────────────────────────────────────────────
  insertEpisode: Statement;
  selectUnconsolidatedEpisodes: Statement;

  // ── Approval queue statements ────────────────────────────────────────────
  selectPendingApprovals: Statement;
  selectApprovalById: Statement;
  updateApprovalStatus: Statement;
  insertApprovalQueueItem: Statement;
}

/**
 * Compile all hot-path prepared statements once after applySchema() completes.
 *
 * Call this exactly once per database connection, immediately after
 * `openDatabase()` returns. Pass the resulting `MycoStatements` object to all
 * tool handlers, consolidator functions, and CLI subcommands.
 *
 * Prepared statements are compiled at call time and reused for every
 * subsequent invocation — eliminating per-request compilation overhead.
 */
export function prepareStatements(db: Database.Database): MycoStatements {
  return {
    // ── Entity statements ──────────────────────────────────────────────────
    selectEntityByNameType: db.prepare(
      `SELECT id FROM entities WHERE name = ? AND type = ?`
    ),

    insertEntity: db.prepare(
      `INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
       VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?)`
    ),

    selectAllEntityNames: db.prepare(
      `SELECT id, name FROM entities`
    ),

    deleteEntityById: db.prepare(
      `DELETE FROM entities WHERE id = ?`
    ),

    updateEntityTimestampConfidence: db.prepare(
      `UPDATE entities SET updated_at = ?, confidence = MAX(confidence, ?) WHERE id = ?`
    ),

    // ── Observation statements ─────────────────────────────────────────────
    insertObservation: db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at)
       VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?)`
    ),

    insertObservationWithEmbeddingFlag: db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, needs_embedding)
       VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?, 1)`
    ),

    flagObservationNeedsEmbedding: db.prepare(
      `UPDATE observations SET needs_embedding = 1 WHERE id = ?`
    ),

    clearObservationEmbeddingFlag: db.prepare(
      `UPDATE observations SET needs_embedding = 0 WHERE id = ?`
    ),

    selectPendingEmbeddings: db.prepare(
      `SELECT o.id, o.content FROM observations o WHERE o.needs_embedding = 1 LIMIT ?`
    ),

    selectObservationsByEntityId: db.prepare(
      `SELECT id, content, confidence, created_at
       FROM observations WHERE entity_id = ? ORDER BY created_at DESC LIMIT 20`
    ),

    updateObservationEntityId: db.prepare(
      `UPDATE observations SET entity_id = ? WHERE entity_id = ?`
    ),

    // ── Relationship statements ────────────────────────────────────────────
    insertRelationship: db.prepare(
      `INSERT OR IGNORE INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)`
    ),

    selectRelationshipExists: db.prepare(
      `SELECT 1 FROM relationships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`
    ),

    updateRelationshipFromId: db.prepare(
      `UPDATE relationships SET from_id = ? WHERE from_id = ?`
    ),

    updateRelationshipToId: db.prepare(
      `UPDATE relationships SET to_id = ? WHERE to_id = ?`
    ),

    // ── Embedding / vector statements ──────────────────────────────────────
    insertVecEmbedding: db.prepare(
      `INSERT INTO vec_embeddings (item_id, item_type, embedding) VALUES (?, ?, ?)`
    ),

    knnSearchObservations: db.prepare(
      `WITH knn AS (
         SELECT item_id, distance
         FROM vec_embeddings
         WHERE embedding MATCH ?
           AND k = ?
           AND item_type = 'observation'
       )
       SELECT
         o.id        AS observation_id,
         o.content,
         o.confidence,
         e.name      AS entity_name,
         e.type      AS entity_type,
         knn.distance AS relevance_score
       FROM knn
       JOIN observations o ON o.id = knn.item_id
       JOIN entities e ON e.id = o.entity_id
       ORDER BY knn.distance`
    ),

    knnSearchForContradiction: db.prepare(
      `WITH knn AS (
         SELECT item_id, distance
         FROM vec_embeddings
         WHERE embedding MATCH ?
           AND k = 5
           AND item_type = 'observation'
       )
       SELECT knn.distance
       FROM knn
       JOIN observations o ON o.id = knn.item_id
       WHERE o.entity_id = ?
       ORDER BY knn.distance
       LIMIT 1`
    ),

    knnSearchForRelationships: db.prepare(
      `WITH knn AS (
         SELECT item_id, distance
         FROM vec_embeddings
         WHERE embedding MATCH ?
           AND k = 5
           AND item_type = 'observation'
       )
       SELECT DISTINCT o.entity_id, knn.distance
       FROM knn
       JOIN observations o ON o.id = knn.item_id
       WHERE o.entity_id != ?
         AND knn.distance < 0.25
       ORDER BY knn.distance`
    ),

    // ── FTS statements ─────────────────────────────────────────────────────
    insertFtsObservation: db.prepare(
      `INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)`
    ),

    ftsSearchObservations: db.prepare(
      `SELECT
         o.id        AS observation_id,
         o.content,
         o.confidence,
         e.name      AS entity_name,
         e.type      AS entity_type,
         fts.rank    AS relevance_score
       FROM fts_observations fts
       JOIN observations o ON o.id = fts.observation_id
       JOIN entities e ON e.id = o.entity_id
       WHERE fts_observations MATCH ?
       ORDER BY fts.rank
       LIMIT ?`
    ),

    ftsSearchEntityMentions: db.prepare(
      `SELECT DISTINCT o.entity_id
       FROM fts_observations fts
       JOIN observations o ON o.id = fts.observation_id
       WHERE fts_observations MATCH ?
       LIMIT 100`
    ),

    // ── Episode statements ─────────────────────────────────────────────────
    insertEpisode: db.prepare(
      `INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ),

    selectUnconsolidatedEpisodes: db.prepare(
      `SELECT id, session_id, agent_id, event_type, payload, created_at
       FROM episodes WHERE consolidated_at IS NULL ORDER BY created_at LIMIT ?`
    ),

    // ── Approval queue statements ──────────────────────────────────────────
    selectPendingApprovals: db.prepare(
      `SELECT id, item_type, item_id, status, reason, metadata, created_at
       FROM approval_queue
       WHERE status = 'pending'
       ORDER BY created_at
       LIMIT ?`
    ),

    selectApprovalById: db.prepare(
      `SELECT id, item_type, metadata, status FROM approval_queue WHERE id = ?`
    ),

    updateApprovalStatus: db.prepare(
      `UPDATE approval_queue SET status = ?, resolved_at = ? WHERE id = ?`
    ),

    insertApprovalQueueItem: db.prepare(
      `INSERT INTO approval_queue (id, item_type, item_id, status, reason, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ),
  };
}
