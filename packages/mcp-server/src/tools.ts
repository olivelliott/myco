import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { generateSessionId, buildProvenance } from '@myco/core';
import type { SourceType } from '@myco/core';
import type { MycoStatements } from '@myco/core';
import { nanoid } from 'nanoid';
import { embedText, embedBatch } from './embed-client.js';
import { runConsolidation } from './consolidator.js';
import { discoverRelationships, createBackLinks, invalidateEntityCache } from './relationship-discovery.js';
import { classifyObservation, retireObservation } from './dedup-resolver.js';
import { scanProject } from './onboarding-scanner.js';

// The session ID is created once per server process lifetime.
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

interface RecallRow {
  observation_id: string;
  content: string;
  confidence: number;
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
}

export interface ForgetResult {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

export interface RecallResult {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
}

export interface LogEpisodeResult {
  content: Array<{ type: 'text'; text: string }>;
  [key: string]: unknown;
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

  // Generate now BEFORE opening any transactions (SQLite CURRENT_TIMESTAMP instability)
  const now = new Date().toISOString();
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

  // Dedup classification — gate observation write
  const classification = await classifyObservation(db, stmts, entityId, content);

  if (classification.classification === 'NOOP') {
    // Near-duplicate — skip write entirely
    // Still update entity timestamp to reflect the reinforcement
    stmts.updateEntityTimestampConfidence.run(now, confidence, entityId);
    return {
      content: [{
        type: 'text' as const,
        text: `Observation already exists for "${entity_name}" — skipped (${classification.reason}).`,
      }],
    };
  }

  if (classification.classification === 'UPDATE' && classification.superseded_observation_id) {
    // Retire the old observation (set valid_until) before inserting the new one
    retireObservation(stmts, classification.superseded_observation_id, now);
  }

  const action = classification.classification === 'UPDATE' ? ' (updated — superseded previous version)' : '';

  // Insert temporal observation (valid_from = application-generated timestamp)
  const obsId = nanoid();
  stmts.insertObservationTemporal.run(
    obsId, entityId, content,
    prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at,
    now,  // valid_from — application-generated timestamp
  );

  // Insert into FTS5 index for full-text search fallback
  stmts.insertFtsObservation.run(content, obsId);

  // Attempt embedding via Ollama (SRCH-01 inline embedding)
  const embedding = await embedText(content);

  if (embedding !== null) {
    const vec = new Float32Array(embedding);
    stmts.insertVecEmbedding.run(obsId, 'observation', vec);
  } else {
    // Ollama unavailable — flag for later re-embedding (SRCH-04)
    stmts.flagObservationNeedsEmbedding.run(obsId);
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
  const embeddingVec = embedding !== null ? new Float32Array(embedding) : null;
  await discoverRelationships(db, entityId, content, embeddingVec, stmts);

  // If this is a new entity, create back-links from existing observations
  if (!existingEntity) {
    createBackLinks(db, entityId, entity_name, stmts);
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: `Stored entity "${entity_name}" (${entityId}) with observation${action}.`,
      },
    ],
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
  const conditions: string[] = [];
  const filterParams: unknown[] = [];

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

  // Temporal filter: as_of returns observations valid at that point in time.
  // Without as_of, exclude retired observations (valid_until IS NULL = currently active).
  if (as_of !== undefined) {
    conditions.push('o.valid_from IS NOT NULL AND o.valid_from <= ?');
    filterParams.push(as_of);
    conditions.push('(o.valid_until IS NULL OR o.valid_until > ?)');
    filterParams.push(as_of);
  } else {
    // Always exclude retired observations from default recall
    conditions.push('(o.valid_until IS NULL)');
  }

  // Try semantic search first
  const queryEmbedding = await embedText(query);

  if (queryEmbedding !== null) {
    const queryVec = new Float32Array(queryEmbedding);

    // Temporal conditions force the dynamic WHERE branch (always has at least one condition now)
    const whereClause = `AND ${conditions.join(' AND ')}`;
    const rows = db.prepare(`
      WITH knn AS (
        SELECT item_id, distance
        FROM vec_embeddings
        WHERE embedding MATCH ?
          AND k = ?
          AND item_type = 'observation'
      )
      SELECT o.id AS observation_id, o.content, o.confidence,
             e.name AS entity_name, e.type AS entity_type,
             knn.distance AS relevance_score
      FROM knn
      JOIN observations o ON o.id = knn.item_id
      JOIN entities e ON e.id = o.entity_id
      WHERE 1=1 ${whereClause}
      ORDER BY knn.distance
      LIMIT ?
    `).all(queryVec, limit * 3, ...filterParams, limit) as RecallRow[];

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          results: rows.map(r => ({
            entity_name: r.entity_name,
            entity_type: r.entity_type,
            observation: r.content,
            confidence: r.confidence,
            relevance_score: r.relevance_score,
          })),
          metadata: {
            method: 'semantic' as const,
            count: rows.length,
            query,
          },
        }),
      }],
    };
  }

  // FTS5 fallback — Ollama unavailable for query embedding
  const ftsQuery = '"' + query.replace(/"/g, '""') + '"';

  // Temporal conditions force the dynamic WHERE branch (always has at least one condition now)
  const whereClause = conditions.map(c => `AND ${c}`).join('\n        ');
  const rows = db.prepare(`
    SELECT o.id AS observation_id, o.content, o.confidence,
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

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        results: rows.map(r => ({
          entity_name: r.entity_name,
          entity_type: r.entity_type,
          observation: r.content,
          confidence: r.confidence,
          relevance_score: r.relevance_score,
        })),
        metadata: {
          method: 'fts' as const,
          count: rows.length,
          query,
        },
      }),
    }],
  };
}

export function queryEntities(
  db: Database.Database,
  params: { entity_name?: string; entity_type?: string; relation_type?: string; project?: string },
  stmts: MycoStatements,
): RecallResult {
  const { entity_name, entity_type, relation_type, project } = params;

  const conditions: string[] = [];
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

  // For each entity, fetch its observations using the pre-compiled statement
  const results = entities.map(ent => ({
    entity_name: ent.name,
    entity_type: ent.type,
    summary: ent.summary,
    confidence: ent.confidence,
    observation_count: ent.observation_count,
    relationship_count: ent.relationship_count,
    observations: (stmts.selectObservationsByEntityId.all(ent.id) as QueryObservationRow[]).map(obs => ({
      content: obs.content,
      confidence: obs.confidence,
      created_at: obs.created_at,
    })),
  }));

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

/**
 * Merge sourceEntityId into targetEntityId via soft-delete.
 *
 * Moves all observations and relationships from source to target, then sets
 * merged_into on the source entity. The source entity row is NOT deleted —
 * this makes merges reversible and preserves graph history.
 *
 * Wrapped in a transaction for atomicity.
 */
export function mergeEntities(
  db: Database.Database,
  stmts: MycoStatements,
  sourceEntityId: string,
  targetEntityId: string,
): { observations_moved: number; relationships_moved: number } {
  return db.transaction(() => {
    // Count before moving
    const obsRows = stmts.selectAllObservationIdsByEntityId.all(sourceEntityId) as Array<{ id: string }>;
    const relRows = stmts.selectRelationshipsByEntityIdBoth.all(sourceEntityId, sourceEntityId) as Array<{ id: string }>;

    // Move observations from source to target
    stmts.updateObservationEntityId.run(targetEntityId, sourceEntityId);

    // Move relationships
    stmts.updateRelationshipFromId.run(targetEntityId, sourceEntityId);
    stmts.updateRelationshipToId.run(targetEntityId, sourceEntityId);

    // Soft-delete source entity (set merged_into, do NOT delete)
    stmts.setEntityMergedInto.run(targetEntityId, sourceEntityId);

    invalidateEntityCache();

    return {
      observations_moved: obsRows.length,
      relationships_moved: relRows.length,
    };
  })();
}

interface CandidateObservationRow {
  id: string;
  content: string;
  confidence: number;
  created_at: string;
  entity_name: string;
  entity_id: string;
}

/**
 * Two-phase tool for finding and correcting stale observations.
 *
 * Phase 1 (confirm_id undefined): search for top-3 matching active observations,
 * return as candidates with instructions.
 *
 * Phase 2 (confirm_id provided): atomically retire old observation (set valid_until)
 * and insert a replacement with valid_from, then attempt embedding.
 */
export async function updateKnowledge(
  db: Database.Database,
  params: { query: string; new_value: string; entity_name?: string; confirm_id?: string },
  stmts: MycoStatements,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { query, new_value, entity_name, confirm_id } = params;
  const now = new Date().toISOString();

  // ── Phase 2: Confirm + Replace ───────────────────────────────────────────
  if (confirm_id !== undefined) {
    const obs = stmts.selectObservationById.get(confirm_id) as { id: string; entity_id: string } | undefined;

    if (!obs) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Observation not found', code: 'NOT_FOUND' }) }],
      };
    }

    const newObsId = nanoid();
    const entityId = obs.entity_id;

    // Atomic transaction: retire old, insert new, index FTS
    db.transaction(() => {
      // Retire old observation by setting valid_until
      retireObservation(stmts, confirm_id, now);

      // Insert replacement with valid_from
      stmts.insertObservationTemporal.run(
        newObsId, entityId, new_value,
        SESSION_ID, 'unknown', 'agent_session', 1.0, now, now,
      );

      // Insert FTS entry for the new observation
      stmts.insertFtsObservation.run(new_value, newObsId);
    })();

    // Attempt embedding after transaction (embedText is async, cannot run inside transaction)
    const embedding = await embedText(new_value);
    if (embedding !== null) {
      const vec = new Float32Array(embedding);
      stmts.insertVecEmbedding.run(newObsId, 'observation', vec);
    } else {
      stmts.flagObservationNeedsEmbedding.run(newObsId);
    }

    // Fetch entity name for response
    const entityRow = db.prepare('SELECT name FROM entities WHERE id = ?').get(entityId) as { name: string } | undefined;

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          action: 'updated',
          retired_id: confirm_id,
          new_observation_id: newObsId,
          entity_name: entityRow?.name ?? entityId,
          new_content: new_value,
        }),
      }],
    };
  }

  // ── Phase 1: Search ──────────────────────────────────────────────────────
  const CANDIDATE_LIMIT = 3;

  // Build entity_name filter
  const entityCondition = entity_name ? 'AND e.name = ?' : '';
  const entityParams: unknown[] = entity_name ? [entity_name] : [];

  let candidates: CandidateObservationRow[] = [];

  // Try semantic search first
  const queryEmbedding = await embedText(query);

  if (queryEmbedding !== null) {
    const queryVec = new Float32Array(queryEmbedding);
    candidates = db.prepare(`
      WITH knn AS (
        SELECT item_id, distance
        FROM vec_embeddings
        WHERE embedding MATCH ?
          AND k = ?
          AND item_type = 'observation'
      )
      SELECT o.id, o.content, o.confidence, o.created_at,
             e.name AS entity_name, e.id AS entity_id
      FROM knn
      JOIN observations o ON o.id = knn.item_id
      JOIN entities e ON e.id = o.entity_id
      WHERE o.valid_until IS NULL
        ${entityCondition}
      ORDER BY knn.distance
      LIMIT ?
    `).all(queryVec, CANDIDATE_LIMIT * 3, ...entityParams, CANDIDATE_LIMIT) as CandidateObservationRow[];
  } else {
    // FTS5 fallback
    const ftsQuery = '"' + query.replace(/"/g, '""') + '"';
    candidates = db.prepare(`
      SELECT o.id, o.content, o.confidence, o.created_at,
             e.name AS entity_name, e.id AS entity_id
      FROM fts_observations fts
      JOIN observations o ON o.id = fts.observation_id
      JOIN entities e ON e.id = o.entity_id
      WHERE fts_observations MATCH ?
        AND o.valid_until IS NULL
        ${entityCondition}
      ORDER BY fts.rank
      LIMIT ?
    `).all(ftsQuery, ...entityParams, CANDIDATE_LIMIT) as CandidateObservationRow[];
  }

  if (candidates.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          action: 'no_matches',
          message: 'No matching active observations found. Try a different query or entity_name.',
        }),
      }],
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        action: 'confirm',
        candidates: candidates.map(c => ({
          id: c.id,
          entity_name: c.entity_name,
          content: c.content,
          confidence: c.confidence,
          created_at: c.created_at,
        })),
        instructions: 'Call update_knowledge again with confirm_id set to the observation ID you want to replace, and new_value set to the replacement text.',
      }),
    }],
  };
}

/**
 * Store a workflow rule as a first-class `workflow_rule` entity.
 * Rules are decay-exempt, always confidence=1.0, and surfaced at every session start.
 *
 * This is a thin wrapper over `rememberEntity()` with fixed type/confidence,
 * followed by a direct SQL update to mark the entity decay_exempt.
 */
export async function rememberRule(
  db: Database.Database,
  params: { instruction: string; project?: string; triggers?: string[]; agent_id?: string },
  stmts: MycoStatements,
): Promise<RememberResult> {
  const { instruction, project, triggers, agent_id } = params;

  // Auto-generate a stable, collision-resistant entity name from the instruction text
  const hash = createHash('sha256').update(instruction).digest('hex').slice(0, 8);
  const entity_name = `rule:${hash}`;

  // If triggers provided, append them to the observation content
  const content = triggers && triggers.length > 0
    ? `${instruction}\n[triggers: ${triggers.join(', ')}]`
    : instruction;

  const result = await rememberEntity(db, {
    content,
    entity_name,
    entity_type: 'workflow_rule',
    confidence: 1.0,
    source_type: 'agent_session',
    agent_id,
    project,
  }, stmts);

  // Set decay_exempt after rememberEntity — rememberEntity does not expose decay_exempt parameter
  db.prepare('UPDATE entities SET decay_exempt = 1 WHERE name = ? AND type = ?').run(entity_name, 'workflow_rule');

  return result;
}

export function registerTools(server: McpServer, db: Database.Database, stmts: MycoStatements): void {
  server.registerTool(
    'remember',
    {
      description: 'Store a piece of knowledge in Myco. Creates an entity with an observation, and optionally relationships to other entities.',
      inputSchema: {
        content: z.string().describe('The observation or fact to remember'),
        entity_name: z.string().describe('Name of the entity this knowledge is about'),
        entity_type: z
          .string()
          .default('concept')
          .describe('Entity type (e.g. "person", "project", "concept", "technology")'),
        agent_id: z.string().optional().describe('Calling agent identifier'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .default(1.0)
          .describe('Confidence score 0.0-1.0'),
        relations: z
          .array(
            z.object({
              target_name: z.string().describe('Name of the related entity'),
              target_type: z
                .string()
                .default('concept')
                .describe('Type of the related entity'),
              relation_type: z
                .string()
                .describe('Relationship type (e.g. "depends_on", "is_part_of", "uses")'),
            }),
          )
          .optional()
          .describe('Optional relationships to create'),
        project: z.string().optional().describe('Project namespace to store entity under (omit for global)'),
      },
    },
    async ({ content, entity_name, entity_type, agent_id, confidence, relations, project }) => {
      try {
        return await rememberEntity(db, {
          content,
          entity_name,
          entity_type,
          agent_id,
          confidence,
          relations,
          project,
        }, stmts);
      } catch (err) {
        console.error('[remember] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR',
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'recall',
    {
      description: 'Retrieve relevant knowledge from Myco using natural language',
      inputSchema: {
        query: z.string().describe('Natural language query'),
        limit: z.number().default(10).describe('Max results to return'),
        entity_type: z.string().optional().describe('Filter by entity type (e.g. "technology", "person")'),
        min_confidence: z.number().min(0).max(1).optional().describe('Minimum confidence score 0.0-1.0'),
        project: z.string().optional().describe('Filter by project namespace'),
        as_of: z.string().optional().describe('ISO 8601 timestamp — return observations valid at this point in time'),
      },
    },
    async ({ query, limit, entity_type, min_confidence, project, as_of }) => {
      try {
        return await recallKnowledge(db, { query, limit, entity_type, min_confidence, project, as_of }, stmts);
      } catch (err) {
        console.error('[recall] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR',
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'query',
    {
      description: 'Query the knowledge graph by entity name, type, or relationship',
      inputSchema: {
        entity_name: z.string().optional().describe('Exact entity name'),
        entity_type: z.string().optional().describe('Filter by entity type'),
        relation_type: z.string().optional().describe('Filter by relationship type'),
        project: z.string().optional().describe('Filter by project namespace'),
      },
    },
    async ({ entity_name, entity_type, relation_type, project }) => {
      try {
        return queryEntities(db, { entity_name, entity_type, relation_type, project }, stmts);
      } catch (err) {
        console.error('[query] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR',
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'log_episode',
    {
      description: 'Log an episode event for later consolidation. Episodes are raw session events, not directly queryable by agents.',
      inputSchema: {
        event_type: z.string().describe('Type of event (e.g. "task_complete", "decision", "discovery", "error")'),
        payload: z.record(z.string(), z.unknown()).describe('Event payload — any structured data relevant to the event'),
        agent_id: z.string().optional().describe('Calling agent identifier'),
      },
    },
    async ({ event_type, payload, agent_id }) => {
      try {
        return await logEpisode(db, { event_type, payload, agent_id }, stmts);
      } catch (err) {
        console.error('[log_episode] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR',
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'consolidate',
    {
      description: 'Manually trigger the consolidation pipeline. Processes unconsolidated episodes, extracts facts via LLM, and routes them to auto-approve or approval queue.',
      inputSchema: {},
    },
    async () => {
      try {
        console.error('[consolidation] manual trigger via MCP tool');
        const summary = await runConsolidation(db, stmts);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(summary),
          }],
        };
      } catch (err) {
        console.error('[consolidate] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR',
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'list_pending_approvals',
    {
      description: 'List items pending human review in the approval queue. Shows reason, confidence, evidence, and proposed changes.',
      inputSchema: {
        limit: z.number().default(20).describe('Maximum number of items to return'),
      },
    },
    async ({ limit }) => {
      try {
        const rows = stmts.selectPendingApprovals.all(limit) as Array<{
          id: string;
          item_type: string;
          item_id: string;
          status: string;
          reason: string | null;
          metadata: string | null;
          created_at: string;
        }>;

        const items = rows.map(row => ({
          id: row.id,
          item_type: row.item_type,
          reason: row.reason,
          created_at: row.created_at,
          ...(row.metadata ? { details: JSON.parse(row.metadata) } : {}),
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ items, count: items.length }),
          }],
        };
      } catch (err) {
        console.error('[list_pending_approvals] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR',
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'resolve_approval',
    {
      description: 'Approve, reject, or edit a queued approval item. Approved items are written to the knowledge graph. Edited items have their content replaced before approval.',
      inputSchema: {
        id: z.string().describe('Approval queue item ID'),
        action: z.enum(['approve', 'reject', 'edit']).describe('Resolution action'),
        edited_content: z.string().optional().describe('Replacement observation content (required when action is "edit")'),
      },
    },
    async ({ id, action, edited_content }) => {
      try {
        // Fetch the pending item
        const item = stmts.selectApprovalById.get(id) as { id: string; item_type: string; metadata: string | null; status: string } | undefined;

        if (!item) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Approval item ${id} not found` }) }],
          };
        }

        if (item.status !== 'pending') {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Item ${id} already resolved (${item.status})` }) }],
          };
        }

        if (action === 'edit' && !edited_content) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'edited_content is required for edit action' }) }],
          };
        }

        const now = new Date().toISOString();

        if (action === 'reject') {
          stmts.updateApprovalStatus.run('rejected', now, id);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ status: 'rejected', id }) }],
          };
        }

        // approve or edit — write to knowledge graph
        if (!item.metadata) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Item has no metadata — cannot determine what to approve' }) }],
          };
        }

        const meta = JSON.parse(item.metadata) as {
          fact: {
            entity_name: string;
            entity_type: string;
            observation: string;
            confidence: number;
            evidence_quote: string;
            related_entities: Array<{ name: string; type: string; relation_type: string }>;
          };
          merge_candidate_ids?: string[];
        };

        const observation = action === 'edit' ? edited_content! : meta.fact.observation;

        // Handle merge_candidate items: reassign observations from secondary entity to primary
        // (action is 'approve' or 'edit' at this point — 'reject' returned early above)
        if (item.item_type === 'proposed_fact' && meta.merge_candidate_ids && meta.merge_candidate_ids.length > 0) {
          // The fact's entity is the primary; merge candidates are secondaries
          const primaryEntity = stmts.selectEntityByNameType.get(meta.fact.entity_name, meta.fact.entity_type) as { id: string } | undefined;

          if (primaryEntity) {
            for (const secondaryId of meta.merge_candidate_ids) {
              // Reassign observations
              stmts.updateObservationEntityId.run(primaryEntity.id, secondaryId);
              // Reassign relationships
              stmts.updateRelationshipFromId.run(primaryEntity.id, secondaryId);
              stmts.updateRelationshipToId.run(primaryEntity.id, secondaryId);
              // Delete secondary entity
              stmts.deleteEntityById.run(secondaryId);
            }
          }
        }

        // Write the fact to the knowledge graph
        await rememberEntity(db, {
          content: observation,
          entity_name: meta.fact.entity_name,
          entity_type: meta.fact.entity_type,
          confidence: meta.fact.confidence,
          source_type: 'consolidation',
          relations: meta.fact.related_entities.map(r => ({
            target_name: r.name,
            target_type: r.type,
            relation_type: r.relation_type,
          })),
        }, stmts);

        stmts.updateApprovalStatus.run('approved', now, id);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ status: 'approved', id, action, entity: meta.fact.entity_name }),
          }],
        };
      } catch (err) {
        console.error('[resolve_approval] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'An unexpected error occurred',
              code: 'INTERNAL_ERROR',
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'forget',
    {
      description: 'Remove an entity, observation, or relationship from the knowledge graph. Deleting an entity cascade-deletes all its observations and relationships.',
      inputSchema: {
        entity_name: z.string().optional().describe('Name of the entity to forget (deletes entity + all observations + relationships)'),
        entity_type: z.string().default('concept').optional().describe('Entity type (used with entity_name to find exact entity)'),
        observation_id: z.string().optional().describe('ID of a specific observation to remove'),
        relationship_id: z.string().optional().describe('ID of a specific relationship to remove'),
      },
    },
    async ({ entity_name, entity_type, observation_id, relationship_id }) => {
      try {
        return forgetEntity(db, { entity_name, entity_type, observation_id, relationship_id }, stmts);
      } catch (err) {
        console.error('[forget] tool error:', err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' }) }],
        };
      }
    },
  );

  server.registerTool(
    'init_project',
    {
      description: 'Scan a project directory to discover conventions, patterns, and preferences. Returns proposed entities for the agent to present to the user for approval. After approval, call remember() for each accepted entity to commit them to the knowledge graph.',
      inputSchema: {
        path: z.string().optional().describe('Absolute path to the project directory. Defaults to the current working directory if omitted.'),
      },
    },
    async ({ path: projectPath }) => {
      try {
        const targetPath = projectPath || process.cwd();
        console.error('[init_project] scanning:', targetPath);

        const result = await scanProject(targetPath);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              project_name: result.project_name,
              project_path: result.project_path,
              files_scanned: result.files_scanned,
              scan_duration_ms: result.scan_duration_ms,
              proposed_entities: result.proposed_entities.map(e => ({
                entity_name: e.entity_name,
                entity_type: e.entity_type,
                observation: e.observation,
                confidence: e.confidence,
                category: e.category,
              })),
              instructions: 'Present these proposed entities to the user. For each entity the user approves, call the remember() tool with: entity_name, entity_type, content=observation, confidence, project=project_name. After all approved entities are stored, the project knowledge will be available in future sessions.',
            }),
          }],
        };
      } catch (err) {
        console.error('[init_project] tool error:', err);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Failed to scan project',
              code: 'SCAN_ERROR',
              message: err instanceof Error ? err.message : String(err),
            }),
          }],
        };
      }
    },
  );

  server.registerTool(
    'remember_rule',
    {
      description: 'Store a workflow rule — an actionable instruction that will be surfaced at the start of every session. Rules are never similarity-ranked out.',
      inputSchema: {
        instruction: z.string().describe('The rule or instruction to remember (e.g. "always run tests before pushing")'),
        project: z.string().optional().describe('Project to scope this rule to (omit for global rule)'),
        triggers: z.array(z.string()).optional().describe('Optional trigger contexts when this rule applies (e.g. ["git commit", "git push"])'),
      },
    },
    async ({ instruction, project, triggers }) => {
      try {
        return await rememberRule(db, { instruction, project, triggers }, stmts);
      } catch (err) {
        console.error('[remember_rule] tool error:', err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' }) }],
        };
      }
    },
  );

  server.registerTool(
    'update_knowledge',
    {
      description: 'Find and correct stale or incorrect knowledge. Call without confirm_id to search for candidates, then call again with confirm_id to replace the selected observation.',
      inputSchema: {
        query: z.string().describe('Natural language description of the knowledge to find and update'),
        new_value: z.string().describe('The corrected/updated observation text'),
        entity_name: z.string().optional().describe('Narrow search to observations of this entity'),
        confirm_id: z.string().optional().describe('Observation ID to replace (from a previous search call)'),
      },
    },
    async ({ query, new_value, entity_name, confirm_id }) => {
      try {
        return await updateKnowledge(db, { query, new_value, entity_name, confirm_id }, stmts);
      } catch (err) {
        console.error('[update_knowledge] tool error:', err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' }) }],
        };
      }
    },
  );
}
