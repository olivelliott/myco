import type Database from 'better-sqlite3';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  rememberEntity,
  recallKnowledge,
  queryEntities,
  forgetEntity,
} from '@myco/core';
import type { MycoStatements } from '@myco/core';
import { apiKeyAuth } from '../middleware/auth.js';

// ─────────────────────────────────────────
// Shared response schemas
// ─────────────────────────────────────────

const ErrorSchema = z
  .object({
    error: z.object({
      message: z.string(),
      code: z.string(),
      status: z.number(),
    }),
  })
  .openapi('Error');

// ─────────────────────────────────────────
// /api/memory/remember
// ─────────────────────────────────────────

const RememberBodySchema = z
  .object({
    content: z.string().min(1).openapi({ example: 'Prefers TypeScript over JavaScript' }),
    entity_name: z.string().min(1).openapi({ example: 'Alice' }),
    entity_type: z.string().optional().openapi({ example: 'person' }),
    agent_id: z.string().optional().openapi({ example: 'agent-123' }),
    confidence: z.number().min(0).max(1).optional().openapi({ example: 0.9 }),
    source_type: z.string().optional().openapi({ example: 'agent_session' }),
    relations: z
      .array(
        z.object({
          target_name: z.string(),
          target_type: z.string().optional(),
          relation_type: z.string(),
        }),
      )
      .optional()
      .openapi({ example: [{ target_name: 'TypeScript', relation_type: 'prefers' }] }),
    project: z.string().optional().openapi({ example: 'myco-v5' }),
  })
  .openapi('RememberBody');

const RememberResponseSchema = z
  .object({
    status: z.string(),
    entity_name: z.string(),
    action: z.string(),
    message: z.string(),
  })
  .openapi('RememberResponse');

const rememberRoute = createRoute({
  method: 'post',
  path: '/api/memory/remember',
  tags: ['memory'],
  summary: 'Store a memory observation for an entity',
  request: {
    body: {
      content: { 'application/json': { schema: RememberBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: RememberResponseSchema } },
      description: 'Memory stored successfully',
    },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Invalid input' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
  },
});

// ─────────────────────────────────────────
// /api/memory/recall
// ─────────────────────────────────────────

const RecallBodySchema = z
  .object({
    query: z.string().min(1).openapi({ example: 'What does Alice prefer?' }),
    limit: z.number().int().min(1).max(100).optional().default(10).openapi({ example: 10 }),
    entity_type: z.string().optional().openapi({ example: 'person' }),
    min_confidence: z.number().min(0).max(1).optional().openapi({ example: 0.7 }),
    project: z.string().optional().openapi({ example: 'myco-v5' }),
    as_of: z
      .string()
      .optional()
      .openapi({ example: '2026-01-01T00:00:00Z', description: 'ISO 8601 timestamp for point-in-time recall' }),
  })
  .openapi('RecallBody');

const RecallResultItemSchema = z.object({
  entity_name: z.string(),
  entity_type: z.string(),
  observation: z.string(),
  confidence: z.number(),
  effective_confidence: z.number(),
  relevance_score: z.number(),
});

const RecallResponseSchema = z
  .object({
    results: z.array(RecallResultItemSchema),
    metadata: z.object({
      method: z.enum(['semantic', 'fts']),
      count: z.number(),
      query: z.string(),
    }),
  })
  .openapi('RecallResponse');

const recallRoute = createRoute({
  method: 'post',
  path: '/api/memory/recall',
  tags: ['memory'],
  summary: 'Search memory using semantic or full-text search',
  request: {
    body: {
      content: { 'application/json': { schema: RecallBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: RecallResponseSchema } },
      description: 'Recall results',
    },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Invalid input' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
  },
});

// ─────────────────────────────────────────
// /api/memory/forget
// ─────────────────────────────────────────

const ForgetBodySchema = z
  .object({
    entity_name: z.string().optional().openapi({ example: 'Alice' }),
    entity_type: z.string().optional().openapi({ example: 'person' }),
    observation_id: z.string().optional().openapi({ example: 'obs_abc123' }),
    relationship_id: z.string().optional().openapi({ example: 'rel_xyz456' }),
  })
  .openapi('ForgetBody');

const ForgetResponseSchema = z
  .object({
    status: z.string(),
    type: z.string().optional(),
    entity_name: z.string().optional(),
    observation_id: z.string().optional(),
    relationship_id: z.string().optional(),
    observations_removed: z.number().optional(),
    relationships_removed: z.number().optional(),
    error: z.string().optional(),
    code: z.string().optional(),
  })
  .openapi('ForgetResponse');

const forgetRoute = createRoute({
  method: 'post',
  path: '/api/memory/forget',
  tags: ['memory'],
  summary: 'Remove an entity, observation, or relationship from memory',
  request: {
    body: {
      content: { 'application/json': { schema: ForgetBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ForgetResponseSchema } },
      description: 'Forget result',
    },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Invalid input' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
  },
});

// ─────────────────────────────────────────
// /api/memory/query
// ─────────────────────────────────────────

const QueryBodySchema = z
  .object({
    entity_name: z.string().optional().openapi({ example: 'Alice' }),
    entity_type: z.string().optional().openapi({ example: 'person' }),
    relation_type: z.string().optional().openapi({ example: 'prefers' }),
    project: z.string().optional().openapi({ example: 'myco-v5' }),
    as_of: z
      .string()
      .optional()
      .openapi({ example: '2026-01-01T00:00:00Z', description: 'ISO 8601 timestamp for point-in-time query' }),
    history: z
      .boolean()
      .optional()
      .openapi({ example: false, description: 'Include retired (historical) observations' }),
  })
  .openapi('QueryBody');

const QueryEntityResultSchema = z.object({
  entity_name: z.string(),
  entity_type: z.string(),
  summary: z.string().nullable().optional(),
  confidence: z.number(),
  observation_count: z.number(),
  relationship_count: z.number(),
  observations: z.array(z.record(z.string(), z.unknown())),
});

const QueryResponseSchema = z
  .object({
    results: z.array(QueryEntityResultSchema),
    metadata: z.object({ count: z.number() }),
  })
  .openapi('QueryResponse');

const queryRoute = createRoute({
  method: 'post',
  path: '/api/memory/query',
  tags: ['memory'],
  summary: 'Query entities and their observations by name, type, or relationship',
  request: {
    body: {
      content: { 'application/json': { schema: QueryBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: QueryResponseSchema } },
      description: 'Query results',
    },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Invalid input' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
  },
});

// ─────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────

/**
 * Register all memory write routes directly on the OpenAPIHono instance.
 * Routes are registered on the same app that exposes app.doc() so OpenAPI spec
 * includes them without the pitfall of sub-app route isolation.
 */
export function registerMemoryRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: OpenAPIHono<any>,
  db: Database.Database,
  stmts: MycoStatements,
): void {
  // Apply auth middleware to all /api/memory/* routes
  app.use('/api/memory/*', apiKeyAuth());

  // POST /api/memory/remember
  app.openapi(rememberRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await rememberEntity(db, body, stmts);
    const text = result.content[0]?.text ?? '';
    const response = {
      status: 'ok',
      entity_name: body.entity_name,
      action: (result as { action?: string }).action ?? 'ADD',
      message: text,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json(response, 200) as any;
  });

  // POST /api/memory/recall
  app.openapi(recallRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await recallKnowledge(
      db,
      {
        query: body.query,
        limit: body.limit ?? 10,
        entity_type: body.entity_type,
        min_confidence: body.min_confidence,
        project: body.project,
        as_of: body.as_of,
      },
      stmts,
    );
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as {
      results: z.infer<typeof RecallResultItemSchema>[];
      metadata: { method: 'semantic' | 'fts'; count: number; query: string };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json(parsed, 200) as any;
  });

  // POST /api/memory/forget
  app.openapi(forgetRoute, (c) => {
    const body = c.req.valid('json');
    const result = forgetEntity(db, body, stmts);
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as z.infer<typeof ForgetResponseSchema>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json(parsed, 200) as any;
  });

  // POST /api/memory/query
  app.openapi(queryRoute, (c) => {
    const body = c.req.valid('json');
    const result = queryEntities(db, body, stmts);
    const parsed = JSON.parse(result.content[0]?.text ?? '{}') as z.infer<typeof QueryResponseSchema>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json(parsed, 200) as any;
  });
}
