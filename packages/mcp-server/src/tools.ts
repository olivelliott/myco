import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { generateSessionId, buildProvenance } from '@myco/core';
import type { SourceType } from '@myco/core';
import type { MycoStatements } from '@myco/core';
import { nanoid } from 'nanoid';
import { embedText, embedBatch } from './embed-client.js';
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
    );
    invalidateEntityCache();
  }

  // Always add the observation
  const obsId = nanoid();
  stmts.insertObservation.run(
    obsId, entityId, content,
    prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at,
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
        text: `Stored entity "${entity_name}" (${entityId}) with observation.`,
      },
    ],
  };
}

export async function recallKnowledge(
  db: Database.Database,
  params: { query: string; limit: number },
  stmts: MycoStatements,
): Promise<RecallResult> {
  const { query, limit } = params;

  // Try semantic search first
  const queryEmbedding = await embedText(query);

  if (queryEmbedding !== null) {
    // Semantic KNN search via sqlite-vec
    const queryVec = new Float32Array(queryEmbedding);
    const rows = stmts.knnSearchObservations.all(queryVec, limit) as RecallRow[];

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
  const rows = stmts.ftsSearchObservations.all(ftsQuery, limit) as RecallRow[];

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
  params: { entity_name?: string; entity_type?: string; relation_type?: string },
  stmts: MycoStatements,
): RecallResult {
  const { entity_name, entity_type, relation_type } = params;

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
      },
    },
    async ({ content, entity_name, entity_type, agent_id, confidence, relations }) => {
      return rememberEntity(db, {
        content,
        entity_name,
        entity_type,
        agent_id,
        confidence,
        relations,
      }, stmts);
    },
  );

  server.registerTool(
    'recall',
    {
      description: 'Retrieve relevant knowledge from Myco using natural language',
      inputSchema: {
        query: z.string().describe('Natural language query'),
        limit: z.number().default(10).describe('Max results to return'),
      },
    },
    async ({ query, limit }) => {
      return recallKnowledge(db, { query, limit }, stmts);
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
      },
    },
    async ({ entity_name, entity_type, relation_type }) => {
      return queryEntities(db, { entity_name, entity_type, relation_type }, stmts);
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
      return logEpisode(db, { event_type, payload, agent_id }, stmts);
    },
  );

  server.registerTool(
    'consolidate',
    {
      description: 'Manually trigger the consolidation pipeline. Processes unconsolidated episodes, extracts facts via LLM, and routes them to auto-approve or approval queue.',
      inputSchema: {},
    },
    async () => {
      console.error('[consolidation] manual trigger via MCP tool');
      const summary = await runConsolidation(db, stmts);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(summary),
        }],
      };
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
    },
  );
}
