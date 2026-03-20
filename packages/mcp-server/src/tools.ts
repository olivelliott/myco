import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { generateSessionId, buildProvenance } from '@ai-workbots/core';
import { nanoid } from 'nanoid';

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

/**
 * Core write logic extracted for direct testability.
 * The MCP tool handler is a thin wrapper around this function.
 */
export function rememberEntity(db: Database.Database, params: RememberParams): RememberResult {
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
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: 'Recall not yet implemented — semantic search coming in Phase 2.',
        },
      ],
    }),
  );

  server.tool(
    'query',
    'Query the knowledge graph by entity name, type, or relationship',
    {
      entity_name: z.string().optional().describe('Exact entity name'),
      entity_type: z.string().optional().describe('Filter by entity type'),
      relation_type: z.string().optional().describe('Filter by relationship type'),
    },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: 'Query not yet implemented — structured queries coming in Phase 2.',
        },
      ],
    }),
  );
}
