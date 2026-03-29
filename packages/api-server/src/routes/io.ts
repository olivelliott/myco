import type Database from 'better-sqlite3';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { exportGraph, importGraph, normalizeMem0, normalizeAnthropicJSONL } from '@myco/core';
import type { MycoStatements, GraphExport } from '@myco/core';
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
  .openapi('IOError');

// ─────────────────────────────────────────
// GET /api/export
// ─────────────────────────────────────────

const ExportMetadataSchema = z.object({
  version: z.string(),
  exported_at: z.string(),
  entity_count: z.number(),
  observation_count: z.number(),
  relationship_count: z.number(),
});

const ExportResponseSchema = z
  .object({
    metadata: ExportMetadataSchema,
    entities: z.array(z.record(z.string(), z.unknown())),
    observations: z.array(z.record(z.string(), z.unknown())),
    relationships: z.array(z.record(z.string(), z.unknown())),
  })
  .openapi('ExportResponse');

const exportRoute = createRoute({
  method: 'get',
  path: '/api/export',
  tags: ['io'],
  summary: 'Export the entire knowledge graph as JSON',
  description:
    'Returns all entities, observations (including retired), and relationships. Suitable for backup and migration.',
  responses: {
    200: {
      content: { 'application/json': { schema: ExportResponseSchema } },
      description: 'Complete graph export',
    },
  },
});

// ─────────────────────────────────────────
// POST /api/import
// ─────────────────────────────────────────

const ImportBodySchema = z
  .object({
    data: z.union([z.record(z.string(), z.unknown()), z.string()])
      .openapi({ description: 'The import data — object for native/mem0, string for anthropic JSONL' }),
    format: z
      .enum(['native', 'mem0', 'anthropic'])
      .default('native')
      .openapi({ description: 'Format of the import data: native (Myco export), mem0, anthropic JSONL' }),
  })
  .openapi('ImportBody');

const ImportResponseSchema = z
  .object({
    entities_added: z.number(),
    entities_skipped: z.number(),
    observations_added: z.number(),
    observations_skipped: z.number(),
    relationships_added: z.number(),
    relationships_skipped: z.number(),
  })
  .openapi('ImportResponse');

const importRoute = createRoute({
  method: 'post',
  path: '/api/import',
  tags: ['io'],
  summary: 'Import knowledge into the graph',
  description:
    'Imports data in native Myco format, Mem0 export format, or Anthropic MCP reference server JSONL. Deduplicates automatically via the dedup pipeline.',
  request: {
    body: {
      content: { 'application/json': { schema: ImportBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ImportResponseSchema } },
      description: 'Import result with counts of added and skipped items',
    },
    400: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Invalid input' },
    401: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Unauthorized' },
  },
});

// ─────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────

/**
 * Register export and import routes directly on the OpenAPIHono instance
 * so they appear in the OpenAPI spec.
 */
export function registerIORoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: OpenAPIHono<any>,
  db: Database.Database,
  stmts: MycoStatements,
): void {
  // GET /api/export — no auth required (read-only)
  app.openapi(exportRoute, (c) => {
    const result = exportGraph(db);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json(result, 200) as any;
  });

  // POST /api/import — auth required (write operation)
  app.use('/api/import', apiKeyAuth());

  app.openapi(importRoute, async (c) => {
    const body = c.req.valid('json');
    const { data, format } = body;

    let payload: GraphExport;

    try {
      if (format === 'anthropic') {
        // Anthropic JSONL: data must be a string
        if (typeof data !== 'string') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return c.json(
            { error: { message: 'For anthropic format, data must be a JSONL string', code: 'INVALID_INPUT', status: 400 } },
            400,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ) as any;
        }
        payload = normalizeAnthropicJSONL(data);
      } else if (format === 'mem0') {
        // Mem0: data is the Mem0 export object
        payload = normalizeMem0(data as { results: Array<{ id: string; memory: string; user_id?: string; metadata?: Record<string, unknown>; created_at?: string }> });
      } else {
        // Native: data is a GraphExport object
        payload = data as GraphExport;
      }

      const result = await importGraph(db, payload, stmts);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return c.json(result, 200) as any;
    } catch (err) {
      console.error('[api/import] error:', err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return c.json(
        { error: { message: 'Import failed', code: 'IMPORT_ERROR', status: 400 } },
        400,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
    }
  });
}
