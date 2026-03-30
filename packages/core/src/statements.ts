import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

/**
 * Typed interface for all pre-compiled prepared statements used across the
 * MCP server hot paths. Statements are grouped by domain.
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
  selectAllObservationsByEntityId: Statement;
  updateObservationEntityId: Statement;

  // ── Dedup / temporal statements (Phase 19) ──────────────────────────────
  selectObservationsByEntityForDedup: Statement;
  retireObservation: Statement;
  insertObservationTemporal: Statement;
  insertObservationTemporalWithEmbeddingFlag: Statement;

  // ── Entity merge statements (Phase 19) ──────────────────────────────────
  setEntityMergedInto: Statement;
  selectEntitiesByName: Statement;

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

  // ── Dashboard / aggregate statements ─────────────────────────────────────
  countPendingApprovals: Statement;
  countEntities: Statement;
  countRelationships: Statement;
  countObservations: Statement;
  selectRecentEpisodes: Statement;
  selectTopConnected: Statement;
  selectTypeBreakdown: Statement;
  countEntitiesAfter: Statement;
  countObservationsAfter: Statement;
  countRelationshipsAfter: Statement;
  selectGrowthTimeSeries: Statement;
  countEmbeddedObservations: Statement;
  countOrphanedEntities: Statement;
  selectConfidenceDistribution: Statement;
  countUnconsolidatedEpisodes: Statement;
  selectRecentActivity: Statement;

  // ── Forget / delete statements ──────────────────────────────────────────────
  deleteObservationById: Statement;
  deleteRelationshipById: Statement;
  selectObservationById: Statement;
  selectRelationshipById: Statement;
  selectAllObservationIdsByEntityId: Statement;
  selectRelationshipsByEntityIdBoth: Statement;
  deleteVecEmbeddingByItemId: Statement;
  deleteFtsObservationByObsId: Statement;

  // ── User preference promotion statements (Phase 28) ─────────────────────
  selectPreferencesByNameAcrossProjects: Statement;
  updateEntityProject: Statement;
  updateEntityMetadata: Statement;
  updateObservationMetadata: Statement;
  updateObservationEntityId2: Statement;

  // ── API route statements ──────────────────────────────────────────────────
  selectAllPendingApprovals: Statement;
  selectEntitiesPaginated: Statement;
  selectEntityById: Statement;
  selectObservationsByEntity: Statement;
  selectConnectedEntities: Statement;
  selectGraphNodes: Statement;
  selectGraphRelationships: Statement;
  selectEpisodesPaginated: Statement;

  // -- Context scoping statements (Phase 24) ----------------------------------
  insertProjectPath: Statement;
  deleteProjectPath: Statement;
  selectProjectForPath: Statement;
  selectAllProjectPaths: Statement;
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
      `INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at, project)
       VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?, ?)`
    ),

    selectAllEntityNames: db.prepare(
      `SELECT id, name FROM entities WHERE merged_into IS NULL`
    ),

    deleteEntityById: db.prepare(
      `DELETE FROM entities WHERE id = ?`
    ),

    updateEntityTimestampConfidence: db.prepare(
      `UPDATE entities SET updated_at = ?, confidence = MAX(confidence, ?) WHERE id = ?`
    ),

    // ── Observation statements ─────────────────────────────────────────────
    insertObservation: db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, valid_from)
       VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)`
    ),

    insertObservationWithEmbeddingFlag: db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, needs_embedding, valid_from)
       VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?, 1, ?)`
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
      `SELECT id, content, confidence, created_at, last_accessed_at, decay_exempt, reinforcement_count
       FROM observations WHERE entity_id = ? AND valid_until IS NULL ORDER BY created_at DESC LIMIT 20`
    ),

    selectAllObservationsByEntityId: db.prepare(
      `SELECT id, content, confidence, created_at, valid_from, valid_until, last_accessed_at, decay_exempt, reinforcement_count
       FROM observations WHERE entity_id = ? ORDER BY valid_from DESC`
    ),

    updateObservationEntityId: db.prepare(
      `UPDATE observations SET entity_id = ? WHERE entity_id = ?`
    ),

    // ── Dedup / temporal statements (Phase 19) ─────────────────────────────
    selectObservationsByEntityForDedup: db.prepare(
      `SELECT id, content, confidence, valid_from, valid_until
       FROM observations
       WHERE entity_id = ? AND valid_until IS NULL
       ORDER BY created_at DESC`
    ),

    retireObservation: db.prepare(
      `UPDATE observations SET valid_until = ? WHERE id = ?`
    ),

    insertObservationTemporal: db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, valid_from)
       VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)`
    ),

    insertObservationTemporalWithEmbeddingFlag: db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, valid_from, needs_embedding)
       VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, 1)`
    ),

    // ── Entity merge statements (Phase 19) ──────────────────────────────────
    setEntityMergedInto: db.prepare(
      `UPDATE entities SET merged_into = ? WHERE id = ?`
    ),

    // Note: intentionally does NOT filter merged_into IS NULL — used for merge candidate detection,
    // where we want to find even already-merged entities to prevent double-merge.
    selectEntitiesByName: db.prepare(
      `SELECT id, name, type FROM entities WHERE name = ? COLLATE NOCASE AND merged_into IS NULL`
    ),

    // ── Relationship statements ────────────────────────────────────────────
    insertRelationship: db.prepare(
      `INSERT INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)
       ON CONFLICT(from_id, to_id, type)
       DO UPDATE SET
         strength = strength + 1,
         reinforcement_count = reinforcement_count + 1`
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
         o.last_accessed_at,
         o.decay_exempt,
         o.reinforcement_count,
         e.name      AS entity_name,
         e.type      AS entity_type,
         knn.distance AS relevance_score
       FROM knn
       JOIN observations o ON o.id = knn.item_id AND o.valid_until IS NULL
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
       JOIN observations o ON o.id = knn.item_id AND o.valid_until IS NULL
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
         o.last_accessed_at,
         o.decay_exempt,
         o.reinforcement_count,
         e.name      AS entity_name,
         e.type      AS entity_type,
         fts.rank    AS relevance_score
       FROM fts_observations fts
       JOIN observations o ON o.id = fts.observation_id AND o.valid_until IS NULL
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

    // ── Dashboard / aggregate statements ────────────────────────────────────
    countPendingApprovals: db.prepare(
      `SELECT COUNT(*) as n FROM approval_queue WHERE status = 'pending'`
    ),

    countEntities: db.prepare(
      `SELECT COUNT(*) as n FROM entities WHERE merged_into IS NULL`
    ),

    countRelationships: db.prepare(
      `SELECT COUNT(*) as n FROM relationships`
    ),

    countObservations: db.prepare(
      `SELECT COUNT(*) as n FROM observations`
    ),

    selectRecentEpisodes: db.prepare(
      `SELECT id, session_id, agent_id, event_type, created_at FROM episodes ORDER BY created_at DESC LIMIT 20`
    ),

    selectTopConnected: db.prepare(
      `SELECT e.id, e.name, e.type,
         (SELECT COUNT(*) FROM relationships r WHERE r.from_id = e.id OR r.to_id = e.id) AS connection_count
       FROM entities e
       WHERE e.merged_into IS NULL
       ORDER BY connection_count DESC
       LIMIT 5`
    ),

    selectTypeBreakdown: db.prepare(
      `SELECT type, COUNT(*) as count FROM entities WHERE merged_into IS NULL GROUP BY type ORDER BY count DESC`
    ),

    countEntitiesAfter: db.prepare(
      `SELECT COUNT(*) as n FROM entities WHERE created_at > ?`
    ),

    countObservationsAfter: db.prepare(
      `SELECT COUNT(*) as n FROM observations WHERE created_at > ?`
    ),

    countRelationshipsAfter: db.prepare(
      `SELECT COUNT(*) as n FROM relationships WHERE created_at > ?`
    ),

    selectGrowthTimeSeries: db.prepare(
      `SELECT date(created_at) as day,
         SUM(CASE WHEN src = 'entity' THEN 1 ELSE 0 END) as entities,
         SUM(CASE WHEN src = 'observation' THEN 1 ELSE 0 END) as observations,
         SUM(CASE WHEN src = 'relationship' THEN 1 ELSE 0 END) as relationships
       FROM (
         SELECT created_at, 'entity' as src FROM entities WHERE created_at > ?
         UNION ALL
         SELECT created_at, 'observation' as src FROM observations WHERE created_at > ?
         UNION ALL
         SELECT created_at, 'relationship' as src FROM relationships WHERE created_at > ?
       ) combined
       GROUP BY date(created_at)
       ORDER BY day ASC`
    ),

    countEmbeddedObservations: db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM observations) as total,
         (SELECT COUNT(DISTINCT item_id) FROM vec_embeddings WHERE item_type = 'observation') as embedded`
    ),

    countOrphanedEntities: db.prepare(
      `SELECT COUNT(*) as n FROM entities e
       WHERE e.merged_into IS NULL
         AND NOT EXISTS (SELECT 1 FROM relationships r WHERE r.from_id = e.id OR r.to_id = e.id)`
    ),

    selectConfidenceDistribution: db.prepare(
      `SELECT
         CASE
           WHEN confidence >= 0.8 THEN 'high'
           WHEN confidence >= 0.5 THEN 'medium'
           ELSE 'low'
         END as bucket,
         COUNT(*) as count
       FROM entities
       WHERE merged_into IS NULL
       GROUP BY bucket`
    ),

    countUnconsolidatedEpisodes: db.prepare(
      `SELECT COUNT(*) as n FROM episodes WHERE consolidated_at IS NULL`
    ),

    selectRecentActivity: db.prepare(
      `SELECT e.id, e.name, e.type, e.confidence, e.created_at, 'created' as event
       FROM entities e
       WHERE e.merged_into IS NULL
       ORDER BY e.created_at DESC
       LIMIT 20`
    ),

    // ── Forget / delete statements ────────────────────────────────────────────
    deleteObservationById: db.prepare(
      `DELETE FROM observations WHERE id = ?`
    ),

    deleteRelationshipById: db.prepare(
      `DELETE FROM relationships WHERE id = ?`
    ),

    selectObservationById: db.prepare(
      `SELECT id, entity_id FROM observations WHERE id = ?`
    ),

    selectRelationshipById: db.prepare(
      `SELECT id FROM relationships WHERE id = ?`
    ),

    selectAllObservationIdsByEntityId: db.prepare(
      `SELECT id FROM observations WHERE entity_id = ?`
    ),

    selectRelationshipsByEntityIdBoth: db.prepare(
      `SELECT id FROM relationships WHERE from_id = ? OR to_id = ?`
    ),

    deleteVecEmbeddingByItemId: db.prepare(
      `DELETE FROM vec_embeddings WHERE item_id = ?`
    ),

    deleteFtsObservationByObsId: db.prepare(
      `DELETE FROM fts_observations WHERE observation_id = ?`
    ),

    // ── User preference promotion statements (Phase 28) ──────────────────────
    selectPreferencesByNameAcrossProjects: db.prepare(
      `SELECT e.id, e.name, e.project, e.metadata,
              GROUP_CONCAT(o.id, '|') as obs_ids
       FROM entities e
       LEFT JOIN observations o ON o.entity_id = e.id
       WHERE e.name = ? AND e.type = 'user_preference'
         AND e.merged_into IS NULL
       GROUP BY e.id`
    ),

    updateEntityProject: db.prepare(
      `UPDATE entities SET project = ?, updated_at = ? WHERE id = ?`
    ),

    updateEntityMetadata: db.prepare(
      `UPDATE entities SET metadata = ?, updated_at = ? WHERE id = ?`
    ),

    updateObservationMetadata: db.prepare(
      `UPDATE observations SET metadata = ? WHERE id = ?`
    ),

    updateObservationEntityId2: db.prepare(
      `UPDATE observations SET entity_id = ? WHERE entity_id = ?`
    ),

    // ── API route statements ─────────────────────────────────────────────────
    selectAllPendingApprovals: db.prepare(
      `SELECT * FROM approval_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50`
    ),

    selectEntitiesPaginated: db.prepare(
      `SELECT id, name, type, confidence, created_at FROM entities WHERE merged_into IS NULL ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    ),

    selectEntityById: db.prepare(
      `SELECT * FROM entities WHERE id = ?`
    ),

    selectObservationsByEntity: db.prepare(
      `SELECT * FROM observations WHERE entity_id = ? ORDER BY created_at DESC`
    ),

    selectConnectedEntities: db.prepare(
      `SELECT r.type as relation_type, r.from_id, r.to_id,
              e.id, e.name, e.type
       FROM relationships r
       JOIN entities e ON (
         e.id = CASE WHEN r.from_id = ? THEN r.to_id ELSE r.from_id END
       )
       WHERE r.from_id = ? OR r.to_id = ?`
    ),

    selectGraphNodes: db.prepare(
      `SELECT id, name, type, confidence, summary, created_at,
         (SELECT COUNT(*) FROM observations WHERE entity_id = e.id) AS obs_count
       FROM entities e
       WHERE e.merged_into IS NULL`
    ),

    selectGraphRelationships: db.prepare(
      `SELECT id, from_id, to_id, type, confidence, source_type, created_at, strength, reinforcement_count FROM relationships`
    ),

    selectEpisodesPaginated: db.prepare(
      `SELECT id, session_id, agent_id, event_type, payload, created_at FROM episodes ORDER BY created_at DESC LIMIT ?`
    ),

    // -- Context scoping statements (Phase 24) --------------------------------
    insertProjectPath: db.prepare(
      `INSERT INTO project_paths (id, project_name, directory_path, created_at)
       VALUES (?, ?, ?, ?)`
    ),

    deleteProjectPath: db.prepare(
      `DELETE FROM project_paths WHERE directory_path = ?`
    ),

    selectProjectForPath: db.prepare(
      `SELECT id, project_name, directory_path, created_at
       FROM project_paths
       WHERE ($path = directory_path OR $path LIKE directory_path || '/%')
       ORDER BY LENGTH(directory_path) DESC
       LIMIT 1`
    ),

    selectAllProjectPaths: db.prepare(
      `SELECT id, project_name, directory_path, created_at
       FROM project_paths
       ORDER BY directory_path`
    ),
  };
}
