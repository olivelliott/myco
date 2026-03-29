import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import {
  rememberEntity,
  recallKnowledge,
  queryEntities,
  forgetEntity,
  logEpisode,
  reEmbedPending,
} from '@myco/core';
import type {
  RememberParams,
  RememberResult,
  RecallResult,
  ForgetResult,
  LogEpisodeResult,
} from '@myco/core';
import { runConsolidation } from './consolidator.js';

export type { RememberParams, RememberResult, RecallResult, ForgetResult, LogEpisodeResult };
export { reEmbedPending };

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
        as_of: z.string().datetime({ offset: true }).optional()
          .describe('ISO 8601 timestamp — returns observations valid at this point in time. Omit for current.'),
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
        as_of: z.string().datetime({ offset: true }).optional()
          .describe('ISO 8601 timestamp — returns observations valid at this point in time. Omit for current.'),
        history: z.boolean().default(false)
          .describe('If true, returns all observation versions including superseded ones'),
      },
    },
    async ({ entity_name, entity_type, relation_type, project, as_of, history }) => {
      try {
        return queryEntities(db, { entity_name, entity_type, relation_type, project, as_of, history }, stmts);
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

        // Handle merge_candidate items: soft-delete secondary entities, re-point relationships to primary
        // (action is 'approve' or 'edit' at this point — 'reject' returned early above)
        const mergeCandidates = meta.merge_candidate_ids ?? [];
        if (item.item_type === 'proposed_fact' && mergeCandidates.length > 0) {
          // The fact's entity is the primary; merge candidates are secondaries
          const primaryEntity = stmts.selectEntityByNameType.get(meta.fact.entity_name, meta.fact.entity_type) as { id: string } | undefined;

          if (primaryEntity) {
            db.transaction(() => {
              for (const secondaryId of mergeCandidates) {
                // Re-point relationships to primary entity (graph navigation needs this)
                stmts.updateRelationshipFromId.run(primaryEntity.id, secondaryId);
                stmts.updateRelationshipToId.run(primaryEntity.id, secondaryId);
                // Soft-delete: mark as merged, DO NOT reassign observations, DO NOT delete entity
                // Observations stay on secondaryId — they remain queryable for history
                db.prepare(`UPDATE entities SET merged_into = ? WHERE id = ?`)
                  .run(primaryEntity.id, secondaryId);
              }
            })();
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
