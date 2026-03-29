import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { generateSessionId, buildProvenance } from './provenance.js';
import { computeEffectiveConfidence, DECAY_EXEMPT_TYPES } from './decay.js';
import { embedText, embedBatch } from './embed-client.js';
import { classifyObservation, retireObservation } from './dedup.js';
import { discoverRelationships, createBackLinks, invalidateEntityCache } from './relationship-discovery.js';
import type { MycoStatements } from './statements.js';
import type { SourceType } from './types.js';

// The session ID is created once per module load lifetime.
const SESSION_ID = generateSessionId();

export interface RememberParams {
  content: string;
  entity_name: string;
  entity_type?: string;
  agent_id?: string;
  confidence?: number;
  source_type?: SourceType;
  relations?: Array<{
    target_name: string;
    target_type?: string;
    relation_type: string;
  }>;
  project?: string;
}

export interface RememberResult {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

export interface RecallResult {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

export interface ForgetResult {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

export interface LogEpisodeResult {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

interface RecallRow {
  observation_id: string;
  content: string;
  confidence: number;
  last_accessed_at: string | null;      // for decay scoring
  decay_exempt: number;                 // 0 or 1 from SQLite
  reinforcement_count: number;
  entity_name: string;
  entity_type: string;
  relevance_score: number;
}

interface QueryEntityRow {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  confidence: number;
  observation_count: number;
  relationship_count: number;
}

interface QueryObservationRow {
  id: string;
  content: string;
  confidence: number;
  created_at: string;
  valid_from?: string;
  valid_until?: string | null;
  last_accessed_at: string | null;      // for decay scoring
  decay_exempt: number;                 // 0 or 1 from SQLite
  reinforcement_count: number;
}

/**
 * Core write logic extracted for direct testability.
 * The MCP tool handler is a thin wrapper around this function.
 */
export async function rememberEntity(
  db: Database.Database,
  params: RememberParams,
  stmts: MycoStatements,
): Promise<RememberResult> {
  const {
    content,
    entity_name,
    entity_type = 'concept',
    agent_id,
    confidence = 1.0,
    source_type = 'agent_session',
    relations,
    project,
  } = params;

  const prov = buildProvenance(SESSION_ID, agent_id, source_type, confidence);

  // Upsert entity: find existing by name+type or create new
  const existingEntity = stmts.selectEntityByNameType.get(entity_name, entity_type) as { id: string } | undefined;

  const entityId = existingEntity?.id ?? nanoid();

  if (!existingEntity) {
    stmts.insertEntity.run(
      entityId, entity_name, entity_type,
      prov.session_id, prov.agent_id, prov.source_type, prov.confidence,
      prov.created_at, prov.created_at,
      project ?? null,
    );
    invalidateEntityCache();
  }

  const obsId = nanoid();
  const now = new Date().toISOString();

  // Get embedding BEFORE classification (needed for near-dup check)
  const embedding = await embedText(content);
  const vec = embedding !== null ? new Float32Array(embedding) : null;

  // Classify: ADD / UPDATE / NOOP
  const classification = classifyObservation(db, entityId, content, vec, stmts);

  if (classification.action === 'NOOP') {
    // Duplicate — skip observation insert, but still update entity timestamp
    if (existingEntity) {
      stmts.updateEntityTimestampConfidence.run(now, prov.confidence, entityId);
    }
    // Relations are still processed below (they may be new)
  } else if (classification.action === 'UPDATE') {
    // Near-duplicate — atomically retire old and insert new
    db.transaction(() => {
      retireObservation(db, classification.retireId, now);
      stmts.insertObservation.run(
        obsId, entityId, content,
        prov.session_id, prov.agent_id, prov.source_type, prov.confidence, now, now,
      );
      stmts.insertFtsObservation.run(content, obsId);
    })();
    if (vec !== null) {
      stmts.insertVecEmbedding.run(obsId, 'observation', vec);
    } else {
      stmts.flagObservationNeedsEmbedding.run(obsId);
    }
  } else {
    // ADD — insert new observation
    stmts.insertObservation.run(
      obsId, entityId, content,
      prov.session_id, prov.agent_id, prov.source_type, prov.confidence, now, now,
    );
    stmts.insertFtsObservation.run(content, obsId);
    if (vec !== null) {
      stmts.insertVecEmbedding.run(obsId, 'observation', vec);
    } else {
      stmts.flagObservationNeedsEmbedding.run(obsId);
    }
  }

  // Handle optional relations
  if (relations && relations.length > 0) {
    for (const rel of relations) {
      const targetType = rel.target_type ?? 'concept';

      const existingTarget = stmts.selectEntityByNameType.get(rel.target_name, targetType) as { id: string } | undefined;

      const targetId = existingTarget?.id ?? nanoid();

      if (!existingTarget) {
        stmts.insertEntity.run(
          targetId, rel.target_name, targetType,
          prov.session_id, prov.agent_id, prov.source_type, prov.confidence,
          prov.created_at, prov.created_at,
          project ?? null,
        );
      }

      const relId = nanoid();
      stmts.insertRelationship.run(
        relId, entityId, targetId, rel.relation_type,
        prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at,
      );
    }
  }

  // Auto-discover relationships from observation text and embedding
  await discoverRelationships(db, entityId, content, vec, stmts);

  // If this is a new entity, create back-links from existing observations
  if (!existingEntity) {
    createBackLinks(db, entityId, entity_name, stmts);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: `Stored entity "${entity_name}" (${entityId}) with observation (${classification.action}).`,
      },
    ],
    action: classification.action,
  };
}

export async function recallKnowledge(
  db: Database.Database,
  params: {
    query: string;
    limit: number;
    entity_type?: string;
    min_confidence?: number;
    project?: string;
    as_of?: string;
  },
  stmts: MycoStatements,
): Promise<RecallResult> {
  const { query, limit, entity_type, min_confidence, project, as_of } = params;

  // Build filter conditions (STMT-02 exception pattern — dynamic WHERE)
  // Temporal filter — always applied first
  const conditions: string[] = [];
  const filterParams: unknown[] = [];

  if (as_of !== undefined) {
    // Point-in-time: observations valid at the given timestamp
    conditions.push('o.valid_from <= ?');
    conditions.push('(o.valid_until IS NULL OR o.valid_until > ?)');
    filterParams.push(as_of, as_of);
  } else {
    // Default: current observations only (no retired)
    conditions.push('o.valid_until IS NULL');
  }

  if (entity_type !== undefined) {
    conditions.push('e.type = ?');
    filterParams.push(entity_type);
  }
  if (min_confidence !== undefined) {
    conditions.push('o.confidence >= ?');
    filterParams.push(min_confidence);
  }
  if (project !== undefined) {
    conditions.push('e.project = ?');
    filterParams.push(project);
  }

  // Fast path: only if no filters beyond the default temporal filter
  // (prepared statements already have valid_until IS NULL baked in)
  const useDefaultTemporalOnly = as_of === undefined
    && entity_type === undefined
    && min_confidence === undefined
    && project === undefined;

  // Try semantic search first
  const queryEmbedding = await embedText(query);

  if (queryEmbedding !== null) {
    const queryVec = new Float32Array(queryEmbedding);

    let rows: RecallRow[];

    if (useDefaultTemporalOnly) {
      // No filters beyond default temporal — use prepared statement (fast path)
      // knnSearchObservations already has AND o.valid_until IS NULL
      rows = stmts.knnSearchObservations.all(queryVec, limit) as RecallRow[];
    } else {
      // Filters present — dynamic WHERE (STMT-02 exception)
      const whereClause = `AND ${conditions.join(' AND ')}`;
      rows = db.prepare(`
        WITH knn AS (
          SELECT item_id, distance
          FROM vec_embeddings
          WHERE embedding MATCH ?
            AND k = ?
            AND item_type = 'observation'
        )
        SELECT o.id AS observation_id, o.content, o.confidence,
               o.last_accessed_at, o.decay_exempt, o.reinforcement_count,
               e.name AS entity_name, e.type AS entity_type,
               knn.distance AS relevance_score
        FROM knn
        JOIN observations o ON o.id = knn.item_id
        JOIN entities e ON e.id = o.entity_id
        WHERE 1=1 ${whereClause}
        ORDER BY knn.distance
        LIMIT ?
      `).all(queryVec, limit * 3, ...filterParams, limit) as RecallRow[];
    }

    // Apply decay scoring and compute final_score (semantic path)
    const now = new Date();
    const scoredRows = rows.map(r => {
      const effective_confidence = computeEffectiveConfidence({
        confidence: r.confidence,
        decayExempt: DECAY_EXEMPT_TYPES.has(r.entity_type),
        lastAccessedAt: r.last_accessed_at ?? null,
        reinforcementCount: r.reinforcement_count,
        now,
      });
      // KNN distance: 0 = perfect match — invert to similarity score
      const similarity = Math.max(0, 1 - r.relevance_score);
      return { ...r, effective_confidence, final_score: similarity * effective_confidence };
    });

    // Re-sort by final_score descending (decay-aware ranking)
    scoredRows.sort((a, b) => b.final_score - a.final_score);

    // Lazy write: update last_accessed_at for returned observation IDs (best-effort)
    if (scoredRows.length > 0) {
      const accessedAt = now.toISOString();
      const placeholders = scoredRows.map(() => '?').join(', ');
      const ids = scoredRows.map(r => r.observation_id);
      try {
        // STMT-02 exception: placeholder count varies with result set size
        db.prepare(
          `UPDATE observations SET last_accessed_at = ? WHERE id IN (${placeholders})`
        ).run(accessedAt, ...ids);
      } catch {
        // Best-effort — do not surface as tool error
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          results: scoredRows.map(r => ({
            entity_name: r.entity_name,
            entity_type: r.entity_type,
            observation: r.content,
            confidence: r.confidence,
            effective_confidence: r.effective_confidence,
            relevance_score: r.relevance_score,
          })),
          metadata: {
            method: 'semantic' as const,
            count: scoredRows.length,
            query,
          },
        }),
      }],
    };
  }

  // FTS5 fallback — Ollama unavailable for query embedding
  const ftsQuery = '"' + query.replace(/"/g, '""') + '"';

  let rows: RecallRow[];

  if (useDefaultTemporalOnly) {
    // No filters beyond default temporal — use prepared statement (fast path)
    // ftsSearchObservations already has AND o.valid_until IS NULL
    rows = stmts.ftsSearchObservations.all(ftsQuery, limit) as RecallRow[];
  } else {
    // Filters present — dynamic WHERE (STMT-02 exception)
    const whereClause = conditions.map(c => `AND ${c}`).join('\n        ');
    rows = db.prepare(`
      SELECT o.id AS observation_id, o.content, o.confidence,
             o.last_accessed_at, o.decay_exempt, o.reinforcement_count,
             e.name AS entity_name, e.type AS entity_type,
             fts.rank AS relevance_score
      FROM fts_observations fts
      JOIN observations o ON o.id = fts.observation_id
      JOIN entities e ON e.id = o.entity_id
      WHERE fts_observations MATCH ?
        ${whereClause}
      ORDER BY fts.rank
      LIMIT ?
    `).all(ftsQuery, ...filterParams, limit) as RecallRow[];
  }

  // Apply decay scoring and compute final_score (FTS path)
  const nowFts = new Date();
  const scoredRowsFts = rows.map(r => {
    const effective_confidence = computeEffectiveConfidence({
      confidence: r.confidence,
      decayExempt: DECAY_EXEMPT_TYPES.has(r.entity_type),
      lastAccessedAt: r.last_accessed_at ?? null,
      reinforcementCount: r.reinforcement_count,
      now: nowFts,
    });
    // FTS rank is negative BM25 — negate to get positive score
    const similarity = -r.relevance_score;
    return { ...r, effective_confidence, final_score: similarity * effective_confidence };
  });

  // Re-sort by final_score descending (decay-aware ranking)
  scoredRowsFts.sort((a, b) => b.final_score - a.final_score);

  // Lazy write: update last_accessed_at for returned observation IDs (best-effort)
  if (scoredRowsFts.length > 0) {
    const accessedAt = nowFts.toISOString();
    const placeholders = scoredRowsFts.map(() => '?').join(', ');
    const ids = scoredRowsFts.map(r => r.observation_id);
    try {
      // STMT-02 exception: placeholder count varies with result set size
      db.prepare(
        `UPDATE observations SET last_accessed_at = ? WHERE id IN (${placeholders})`
      ).run(accessedAt, ...ids);
    } catch {
      // Best-effort — do not surface as tool error
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        results: scoredRowsFts.map(r => ({
          entity_name: r.entity_name,
          entity_type: r.entity_type,
          observation: r.content,
          confidence: r.confidence,
          effective_confidence: r.effective_confidence,
          relevance_score: r.relevance_score,
        })),
        metadata: {
          method: 'fts' as const,
          count: scoredRowsFts.length,
          query,
        },
      }),
    }],
  };
}

export function queryEntities(
  db: Database.Database,
  params: { entity_name?: string; entity_type?: string; relation_type?: string; project?: string; as_of?: string; history?: boolean },
  stmts: MycoStatements,
): RecallResult {
  const { entity_name, entity_type, relation_type, project, as_of, history } = params;

  const conditions: string[] = ['e.merged_into IS NULL'];
  const queryParams: unknown[] = [];

  if (entity_name) {
    conditions.push('e.name = ?');
    queryParams.push(entity_name);
  }
  if (entity_type) {
    conditions.push('e.type = ?');
    queryParams.push(entity_type);
  }
  if (relation_type) {
    conditions.push(`EXISTS (
      SELECT 1 FROM relationships r
      WHERE (r.from_id = e.id OR r.to_id = e.id)
        AND r.type = ?
    )`);
    queryParams.push(relation_type);
  }
  if (project) {
    conditions.push('e.project = ?');
    queryParams.push(project);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Dynamic WHERE — cannot be pre-prepared (STMT-02 exception: query-time preparation with bound params)
  const entities = db.prepare(`
    SELECT
      e.id, e.name, e.type, e.summary, e.confidence,
      (SELECT COUNT(*) FROM observations o WHERE o.entity_id = e.id) AS observation_count,
      (SELECT COUNT(*) FROM relationships r WHERE r.from_id = e.id OR r.to_id = e.id) AS relationship_count
    FROM entities e
    ${where}
    LIMIT 50
  `).all(...queryParams) as QueryEntityRow[];

  // For each entity, fetch observations based on temporal mode
  const allReturnedObsIds: string[] = [];

  const results = entities.map(ent => {
    let obsRows: QueryObservationRow[];

    if (history) {
      // History mode: all versions including retired, ordered by valid_from DESC
      obsRows = stmts.selectAllObservationsByEntityId.all(ent.id) as QueryObservationRow[];
    } else if (as_of !== undefined) {
      // Point-in-time: observations valid at the given timestamp
      obsRows = db.prepare(
        `SELECT id, content, confidence, created_at, valid_from, valid_until, last_accessed_at, decay_exempt, reinforcement_count
         FROM observations
         WHERE entity_id = ?
           AND valid_from <= ?
           AND (valid_until IS NULL OR valid_until > ?)
         ORDER BY valid_from DESC`
      ).all(ent.id, as_of, as_of) as QueryObservationRow[];
    } else {
      // Default: current observations only (valid_until IS NULL)
      obsRows = stmts.selectObservationsByEntityId.all(ent.id) as QueryObservationRow[];
    }

    return {
      entity_name: ent.name,
      entity_type: ent.type,
      summary: ent.summary,
      confidence: ent.confidence,
      observation_count: ent.observation_count,
      relationship_count: ent.relationship_count,
      observations: obsRows.map(obs => {
        allReturnedObsIds.push(obs.id);
        const effective_confidence = computeEffectiveConfidence({
          confidence: obs.confidence,
          decayExempt: DECAY_EXEMPT_TYPES.has(ent.type),
          lastAccessedAt: obs.last_accessed_at ?? null,
          reinforcementCount: obs.reinforcement_count,
          now: new Date(),
        });
        const base: Record<string, unknown> = {
          content: obs.content,
          confidence: obs.confidence,
          effective_confidence,
          created_at: obs.created_at,
        };
        // Include temporal fields when history or as_of is requested
        if (history || as_of !== undefined) {
          base.valid_from = obs.valid_from;
          base.valid_until = obs.valid_until ?? null;
        }
        return base;
      }),
    };
  });

  // Lazy write: update last_accessed_at for all observations returned (best-effort)
  if (allReturnedObsIds.length > 0) {
    const accessedAt = new Date().toISOString();
    const placeholders = allReturnedObsIds.map(() => '?').join(', ');
    try {
      // STMT-02 exception: placeholder count varies with result set size
      db.prepare(
        `UPDATE observations SET last_accessed_at = ? WHERE id IN (${placeholders})`
      ).run(accessedAt, ...allReturnedObsIds);
    } catch {
      // Best-effort — do not surface as tool error
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        results,
        metadata: { count: results.length },
      }),
    }],
  };
}

export async function logEpisode(
  db: Database.Database,
  params: { event_type: string; payload: object; agent_id?: string },
  stmts: MycoStatements,
): Promise<LogEpisodeResult> {
  const { event_type, payload, agent_id } = params;
  const prov = buildProvenance(SESSION_ID, agent_id, 'agent_session', 1.0);
  const id = nanoid();

  stmts.insertEpisode.run(id, prov.session_id, prov.agent_id, event_type, JSON.stringify(payload), prov.created_at);

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ id, session_id: prov.session_id }) }],
  };
}

const RE_EMBED_BATCH_SIZE = 50;

export async function reEmbedPending(db: Database.Database, stmts: MycoStatements): Promise<number> {
  const rows = stmts.selectPendingEmbeddings.all(RE_EMBED_BATCH_SIZE) as Array<{ id: string; content: string }>;

  if (rows.length === 0) return 0;

  // EMBED-04: Batch all texts in a single Ollama API call
  const texts = rows.map(r => r.content);
  const embeddings = await embedBatch(texts);

  let embedded = 0;

  for (let i = 0; i < rows.length; i++) {
    const embedding = embeddings[i];
    if (embedding === null) continue; // skip failed individual embeddings
    const vec = new Float32Array(embedding);
    stmts.insertVecEmbedding.run(rows[i].id, 'observation', vec);
    stmts.clearObservationEmbeddingFlag.run(rows[i].id);
    embedded++;
  }
  return embedded;
}

/**
 * Remove an entity (by name, with full cascade), a single observation (by ID),
 * or a single relationship (by ID) from the knowledge graph.
 *
 * Manually cleans up vec_embeddings and fts_observations entries that do not
 * cascade via SQLite foreign keys.
 */
export function forgetEntity(
  db: Database.Database,
  params: { entity_name?: string; entity_type?: string; observation_id?: string; relationship_id?: string },
  stmts: MycoStatements,
): ForgetResult {
  const { entity_name, entity_type, observation_id, relationship_id } = params;

  // Validation: exactly one mode required
  if (!entity_name && !observation_id && !relationship_id) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ error: 'Provide entity_name, observation_id, or relationship_id', code: 'INVALID_INPUT' }),
      }],
    };
  }

  // Mode 1: Forget entire entity by name
  if (entity_name) {
    const type = entity_type ?? 'concept';
    const entity = stmts.selectEntityByNameType.get(entity_name, type) as { id: string } | undefined;

    if (!entity) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `Entity '${entity_name}' (type: ${type}) not found`, code: 'NOT_FOUND' }),
        }],
      };
    }

    const entityId = entity.id;

    // Get all observation IDs for manual cleanup of vec_embeddings and fts_observations
    const obsRows = stmts.selectAllObservationIdsByEntityId.all(entityId) as Array<{ id: string }>;
    for (const obs of obsRows) {
      // vec_embeddings is a virtual table (sqlite-vec) that throws when deleting nonexistent rows
      try { stmts.deleteVecEmbeddingByItemId.run(obs.id); } catch { /* no embedding stored */ }
      stmts.deleteFtsObservationByObsId.run(obs.id);
    }

    // Count relationships before cascade delete
    const relRows = stmts.selectRelationshipsByEntityIdBoth.all(entityId, entityId) as Array<{ id: string }>;
    const relationshipsRemoved = relRows.length;

    // Delete entity — CASCADE handles observations and relationships rows
    stmts.deleteEntityById.run(entityId);
    invalidateEntityCache();

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: 'forgotten',
          type: 'entity',
          entity_name,
          observations_removed: obsRows.length,
          relationships_removed: relationshipsRemoved,
        }),
      }],
    };
  }

  // Mode 2: Forget single observation by ID
  if (observation_id) {
    const obs = stmts.selectObservationById.get(observation_id) as { id: string; entity_id: string } | undefined;

    if (!obs) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `Observation '${observation_id}' not found`, code: 'NOT_FOUND' }),
        }],
      };
    }

    // Clean up vec_embeddings and fts_observations
    // vec_embeddings is a virtual table (sqlite-vec) that throws when deleting nonexistent rows
    try { stmts.deleteVecEmbeddingByItemId.run(observation_id); } catch { /* no embedding stored */ }
    stmts.deleteFtsObservationByObsId.run(observation_id);
    stmts.deleteObservationById.run(observation_id);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ status: 'forgotten', type: 'observation', observation_id }),
      }],
    };
  }

  // Mode 3: Forget single relationship by ID
  if (relationship_id) {
    const rel = stmts.selectRelationshipById.get(relationship_id) as { id: string } | undefined;

    if (!rel) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `Relationship '${relationship_id}' not found`, code: 'NOT_FOUND' }),
        }],
      };
    }

    stmts.deleteRelationshipById.run(relationship_id);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ status: 'forgotten', type: 'relationship', relationship_id }),
      }],
    };
  }

  // Should not reach here, but TypeScript needs exhaustive return
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ error: 'Provide entity_name, observation_id, or relationship_id', code: 'INVALID_INPUT' }),
    }],
  };
}
