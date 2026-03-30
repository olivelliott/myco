import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { MycoStatements } from '@myco/core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  rememberEntity,
  recallKnowledge,
  queryEntities,
  forgetEntity,
  logEpisode,
  reEmbedPending,
  exportGraph,
  importGraph,
  normalizeMem0,
  normalizeAnthropicJSONL,
} from '@myco/core';
import type {
  RememberParams,
  RememberResult,
  RecallResult,
  ForgetResult,
  LogEpisodeResult,
  GraphExport,
} from '@myco/core';
import { runConsolidation } from './consolidator.js';
import { scanProject } from './onboarding-scanner.js';
import {
  embedText,
  generateSessionId,
  buildProvenance,
  discoverRelationships,
  createBackLinks,
  invalidateEntityCache,
} from '@myco/core';
import { classifyObservation, retireObservation } from './dedup-resolver.js';
import { nanoid } from 'nanoid';

// The session ID is created once per server process lifetime.
const SESSION_ID = generateSessionId();

export type { RememberParams, RememberResult, RecallResult, ForgetResult, LogEpisodeResult };
export { reEmbedPending };

/**
 * Check if a user_preference entity should be promoted to global scope.
 * Called after rememberEntity() when entity_type is 'user_preference'.
 *
 * Promotion triggers:
 * 1. Same preference name exists under 2+ distinct non-null projects -> merge to global
 * 2. Already-global preference gains a new project -> update source_projects metadata
 */
export function promotePreference(
  db: Database.Database,
  stmts: MycoStatements,
  entityName: string,
  currentProject: string | null,
): { promoted: boolean; globalEntityId?: string; sourceProjects?: string[] } {
  interface PrefRow {
    id: string;
    name: string;
    project: string | null;
    metadata: string;
    obs_ids: string | null;
  }

  const rows = stmts.selectPreferencesByNameAcrossProjects.all(entityName) as PrefRow[];
  if (rows.length === 0) return { promoted: false };

  const allProjects = new Set<string>();
  for (const row of rows) {
    if (row.project !== null) allProjects.add(row.project);
    try {
      const meta = JSON.parse(row.metadata || '{}') as { source_projects?: string[] };
      if (Array.isArray(meta.source_projects)) {
        for (const p of meta.source_projects) allProjects.add(p);
      }
    } catch { /* malformed metadata */ }
  }
  if (currentProject !== null) allProjects.add(currentProject);

  const hasGlobal = rows.some(r => r.project === null);
  if (allProjects.size < 2 && !hasGlobal) return { promoted: false };

  const sourceProjects = Array.from(allProjects).sort();
  let winner = rows.find(r => r.project === null);
  if (!winner) {
    winner = rows.reduce((best, r) => {
      const bestCount = best.obs_ids ? best.obs_ids.split('|').length : 0;
      const rCount = r.obs_ids ? r.obs_ids.split('|').length : 0;
      return rCount > bestCount ? r : best;
    }, rows[0]);
  }

  const losers = rows.filter(r => r.id !== winner!.id);
  const now = new Date().toISOString();
  const metadataJson = JSON.stringify({ source_projects: sourceProjects });

  db.transaction(() => {
    stmts.updateEntityProject.run(null, now, winner!.id);
    stmts.updateEntityMetadata.run(metadataJson, now, winner!.id);

    const allWinnerObs = db.prepare(
      `SELECT id FROM observations WHERE entity_id = ?`
    ).all(winner!.id) as Array<{ id: string }>;
    for (const obs of allWinnerObs) {
      stmts.updateObservationMetadata.run(metadataJson, obs.id);
    }

    for (const loser of losers) {
      stmts.updateObservationEntityId2.run(winner!.id, loser.id);
      stmts.setEntityMergedInto.run(winner!.id, loser.id);
    }
  })();

  return { promoted: true, globalEntityId: winner.id, sourceProjects };
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

  server.registerTool(
    'export_graph',
    {
      description: 'Export the entire knowledge graph as JSON. Returns all entities, observations (including retired), and relationships.',
      inputSchema: {},
    },
    async () => {
      try {
        const result = exportGraph(db);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result),
          }],
        };
      } catch (err) {
        console.error('[export_graph] tool error:', err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' }) }],
        };
      }
    },
  );

  server.registerTool(
    'import_graph',
    {
      description: 'Import knowledge from a JSON file or string. Supports native Myco format, Mem0 format, and Anthropic MCP reference server JSONL format. Deduplicates automatically.',
      inputSchema: {
        data: z.string().describe('JSON string, JSONL string, or file path containing the import data (paths starting with / or ~ are read from disk)'),
        format: z.enum(['native', 'mem0', 'anthropic']).default('native')
          .describe('Format of the import data: native (Myco export), mem0 (Mem0 export), anthropic (MCP reference server JSONL)'),
      },
    },
    async ({ data, format }) => {
      try {
        // Resolve file path if data starts with / or ~
        let rawData = data;
        if (data.startsWith('/') || data.startsWith('~')) {
          const resolved = data.startsWith('~')
            ? path.join(os.homedir(), data.slice(1))
            : data;
          rawData = fs.readFileSync(resolved, 'utf-8');
        }

        let payload: GraphExport;

        if (format === 'anthropic') {
          // Anthropic JSONL — pass raw string directly (not JSON.parse)
          payload = normalizeAnthropicJSONL(rawData);
        } else if (format === 'mem0') {
          payload = normalizeMem0(JSON.parse(rawData) as { results: Array<{ id: string; memory: string; user_id?: string; metadata?: Record<string, unknown>; created_at?: string }> });
        } else {
          // native format
          payload = JSON.parse(rawData) as GraphExport;
        }

        const result = await importGraph(db, payload, stmts);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result),
          }],
        };
      } catch (err) {
        console.error('[import_graph] tool error:', err);
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

        // Register project path immediately so session-start recall can resolve it
        const existing = stmts.selectProjectForPath.get({ $path: targetPath }) as { project_name: string } | undefined;
        if (!existing) {
          stmts.insertProjectPath.run(nanoid(), result.project_name, targetPath, new Date().toISOString());
        }

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
                relations: e.relations,
              })),
              instructions: 'Present these proposed entities to the user. For each entity the user approves, call the remember() tool with: entity_name, entity_type, content=observation, confidence, project=project_name, relations (if present). After all approved entities are stored, the project knowledge will be available in future sessions.',
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
