import { loadConfig } from '@myco/core';
const config = loadConfig();
import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { getDb, getStatements } from './db.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { approvalsRoutes } from './routes/approvals.js';
import { entitiesRoutes } from './routes/entities.js';
import { episodesRoutes } from './routes/episodes.js';
import { graphRoutes } from './routes/graph.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerIORoutes } from './routes/io.js';

const db = getDb();
const stmts = getStatements();

const app = new OpenAPIHono();

// CORS for local development origins — include Authorization for Bearer token auth
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:4173'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Global error handler — catches unhandled throws from all routes
app.onError((err, c) => {
  console.error('[api-server] unhandled error:', err);
  return c.json(
    {
      error: {
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
        status: 500,
      },
    },
    500,
  );
});

// Mount read-only route groups (standard Hono sub-apps)
app.route('/api/dashboard', dashboardRoutes(db, stmts));
app.route('/api/approvals', approvalsRoutes(db, stmts));
app.route('/api/entities', entitiesRoutes(db, stmts));
app.route('/api/episodes', episodesRoutes(db, stmts));
app.route('/api/graph', graphRoutes(db, stmts));

// Register memory write routes directly on OpenAPIHono instance so they appear in OpenAPI spec
registerMemoryRoutes(app, db, stmts);

// Register import/export routes on same OpenAPIHono instance
registerIORoutes(app, db, stmts);

// OpenAPI spec and Swagger UI
app.doc('/api/spec', {
  openapi: '3.0.0',
  info: { title: 'Myco Memory API', version: '1.0.0', description: 'REST API for Myco memory operations' },
});
app.get('/api/docs', swaggerUI({ url: '/api/spec' }));

const server = serve({ fetch: app.fetch, port: config.apiPort });

console.log(`API server running on http://localhost:${config.apiPort}`);

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  server.close();
  process.exit(0);
});

export default app;
