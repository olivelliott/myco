import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { generateSessionId, buildProvenance } from '@ai-workbots/core';
import { nanoid } from 'nanoid';
import { embedText } from './embed-client.js';

// The session ID is created once per server process lifetime.
const SESSION_ID = generateSessionId();

export interface RememberParams {
  content: string;
  entity_name: string;
  entity_type?: string;
  agent_id?: string;
  confidence?: number;
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
export async function rememberEntity(db: Database.Database, params: RememberParams): Promise<RememberResult> {
  const {
    content,
    entity_name,
    entity_type = 'concept',
    agent_id,
    confidence = 1.0,
    relations,
  } = params;

  const prov = buildProvenance(SESSION_ID, agent_id, 'agent_session', confidence);

  // Upsert entity: find existing by name+type or create new
  const existingEntity = db
    .prepare('SELECT id FROM entities WHERE name = ? AND type = ?')
    .get(entity_name, entity_type) as { id: string } | undefined;

  const entityId = existingEntity?.id ?? nanoid();

  if (!existingEntity) {
    db.prepare(`
      INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
      VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?)
    `).run(
      entityId, entity_name, entity_type,
      prov.session_id, prov.agent_id, prov.source_type, prov.confidence,
      prov.created_at, prov.created_at,
    );
  }

  // Always add the observation
  const obsId = nanoid();
  db.prepare(`
    INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at)
    VALUES (?, ?, ?, '{}', ?, ?, ?, ?, ?)
  `).run(
    obsId, entityId, content,
    prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at,
  );

  // Insert into FTS5 index for full-text search fallback
  db.prepare(`
    INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)
  `).run(content, obsId);

  // Attempt embedding via Ollama (SRCH-01 inline embedding)
  const embedding = await embedText(content);

  if (embedding !== null) {
    const vec = new Float32Array(embedding);
    db.prepare(`
      INSERT INTO vec_embeddings (item_id, item_type, embedding) VALUES (?, ?, ?)
    `).run(obsId, 'observation', vec);
  } else {
    // Ollama unavailable — flag for later re-embedding (SRCH-04)
    db.prepare(`
      UPDATE observations SET needs_embedding = 1 WHERE id = ?
    `).run(obsId);
  }

  // Handle optional relations
  if (relations && relations.length > 0) {
    for (const rel of relations) {
      const targetType = rel.target_type ?? 'concept';

      const existingTarget = db
        .prepare('SELECT id FROM entities WHERE name = ? AND type = ?')
        .get(rel.target_name, targetType) as { id: string } | undefined;

      const targetId = existingTarget?.id ?? nanoid();

      if (!existingTarget) {
        db.prepare(`
          INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
          VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?)
        `).run(
          targetId, rel.target_name, targetType,
          prov.session_id, prov.agent_id, prov.source_type, prov.confidence,
          prov.created_at, prov.created_at,
        );
      }

      const relId = nanoid();
      db.prepare(`
        INSERT OR IGNORE INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
        VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)
      `).run(
        relId, entityId, targetId, rel.relation_type,
        prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at,
      );
    }
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
): Promise<RecallResult> {
  const { query, limit } = params;

  // Try semantic search first
  const queryEmbedding = await embedText(query);

  if (queryEmbedding !== null) {
    // Semantic KNN search via sqlite-vec
    const queryVec = new Float32Array(queryEmbedding);
    const rows = db.prepare(`
      WITH knn AS (
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
      ORDER BY knn.distance
    `).all(queryVec, limit) as RecallRow[];

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
  const rows = db.prepare(`
    SELECT
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
    LIMIT ?
  `).all(ftsQuery, limit) as RecallRow[];

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

  const entities = db.prepare(`
    SELECT
      e.id, e.name, e.type, e.summary, e.confidence,
      (SELECT COUNT(*) FROM observations o WHERE o.entity_id = e.id) AS observation_count,
      (SELECT COUNT(*) FROM relationships r WHERE r.from_id = e.id OR r.to_id = e.id) AS relationship_count
    FROM entities e
    ${where}
    LIMIT 50
  `).all(...queryParams) as QueryEntityRow[];

  // For each entity, fetch its observations
  const getObservations = db.prepare(`
    SELECT id, content, confidence, created_at
    FROM observations WHERE entity_id = ? ORDER BY created_at DESC LIMIT 20
  `);

  const results = entities.map(ent => ({
    entity_name: ent.name,
    entity_type: ent.type,
    summary: ent.summary,
    confidence: ent.confidence,
    observation_count: ent.observation_count,
    relationship_count: ent.relationship_count,
    observations: (getObservations.all(ent.id) as QueryObservationRow[]).map(obs => ({
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
): Promise<LogEpisodeResult> {
  const { event_type, payload, agent_id } = params;
  const prov = buildProvenance(SESSION_ID, agent_id, 'agent_session', 1.0);
  const id = nanoid();

  db.prepare(`
    INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, prov.session_id, prov.agent_id, event_type, JSON.stringify(payload), prov.created_at);

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ id, session_id: prov.session_id }) }],
  };
}

const RE_EMBED_BATCH_SIZE = 50;

export async function reEmbedPending(db: Database.Database): Promise<number> {
  const rows = db.prepare(`
    SELECT o.id, o.content
    FROM observations o
    WHERE o.needs_embedding = 1
    LIMIT ?
  `).all(RE_EMBED_BATCH_SIZE) as Array<{ id: string; content: string }>;

  let embedded = 0;
  for (const row of rows) {
    const embedding = await embedText(row.content);
    if (embedding === null) {
      // Ollama went down mid-sweep — stop early
      break;
    }
    const vec = new Float32Array(embedding);
    db.prepare(`
      INSERT INTO vec_embeddings (item_id, item_type, embedding) VALUES (?, ?, ?)
    `).run(row.id, 'observation', vec);
    db.prepare(`
      UPDATE observations SET needs_embedding = 0 WHERE id = ?
    `).run(row.id);
    embedded++;
  }
  return embedded;
}

export function registerTools(server: McpServer, db: Database.Database): void {
  server.tool(
    'remember',
    'Store a piece of knowledge in the brain. Creates an entity with an observation, and optionally relationships to other entities.',
    {
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
    async ({ content, entity_name, entity_type, agent_id, confidence, relations }) => {
      return rememberEntity(db, {
        content,
        entity_name,
        entity_type,
        agent_id,
        confidence,
        relations,
      });
    },
  );

  server.tool(
    'recall',
    'Retrieve relevant knowledge from the brain using natural language',
    {
      query: z.string().describe('Natural language query'),
      limit: z.number().default(10).describe('Max results to return'),
    },
    async ({ query, limit }) => {
      return recallKnowledge(db, { query, limit });
    },
  );

  server.tool(
    'query',
    'Query the knowledge graph by entity name, type, or relationship',
    {
      entity_name: z.string().optional().describe('Exact entity name'),
      entity_type: z.string().optional().describe('Filter by entity type'),
      relation_type: z.string().optional().describe('Filter by relationship type'),
    },
    async ({ entity_name, entity_type, relation_type }) => {
      return queryEntities(db, { entity_name, entity_type, relation_type });
    },
  );

  server.tool(
    'log_episode',
    'Log an episode event for later consolidation. Episodes are raw session events, not directly queryable by agents.',
    {
      event_type: z.string().describe('Type of event (e.g. "task_complete", "decision", "discovery", "error")'),
      payload: z.record(z.string(), z.unknown()).describe('Event payload — any structured data relevant to the event'),
      agent_id: z.string().optional().describe('Calling agent identifier'),
    },
    async ({ event_type, payload, agent_id }) => {
      return logEpisode(db, { event_type, payload, agent_id });
    },
  );
}
