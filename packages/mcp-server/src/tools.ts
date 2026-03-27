import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { generateSessionId, buildProvenance } from '@myco/core';
import type { SourceType } from '@myco/core';
import type { MycoStatements } from '@myco/core';
import { nanoid } from 'nanoid';
import { embedText, embedBatch } from './embed-client.js';
import { classifyObservation, retireObservation } from './dedup.js';
import { runConsolidation } from './consolidator.js';
import { discoverRelationships, createBackLinks, invalidateEntityCache } from './relationship-discovery.js';

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
  },
  stmts: MycoStatements,
): Promise<RecallResult> {
  const { query, limit, entity_type, min_confidence, project } = params;

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

  // Try semantic search first
  const queryEmbedding = await embedText(query);

  if (queryEmbedding !== null) {
    const queryVec = new Float32Array(queryEmbedding);

    let rows: RecallRow[];

    if (conditions.length === 0) {
      // No filters — use prepared statement (fast path)
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

  let rows: RecallRow[];

  if (conditions.length === 0) {
    // No filters — use prepared statement (fast path)
    rows = stmts.ftsSearchObservations.all(ftsQuery, limit) as RecallRow[];
  } else {
    // Filters present — dynamic WHERE (STMT-02 exception)
    const whereClause = conditions.map(c => `AND ${c}`).join('\n        ');
    rows = db.prepare(`
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
  }

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
      },
    },
    async ({ query, limit, entity_type, min_confidence, project }) => {
      try {
        return await recallKnowledge(db, { query, limit, entity_type, min_confidence, project }, stmts);
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
}
