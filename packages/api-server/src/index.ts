import { loadConfig } from '@myco/core';
const config = loadConfig();
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb, getStatements } from './db.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { approvalsRoutes } from './routes/approvals.js';
import { entitiesRoutes } from './routes/entities.js';
import { episodesRoutes } from './routes/episodes.js';
import { graphRoutes } from './routes/graph.js';

const db = getDb();
const stmts = getStatements();

const app = new Hono();

// CORS for local development origins
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:4173'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type'],
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

// Mount route groups
app.route('/api/dashboard', dashboardRoutes(db, stmts));
app.route('/api/approvals', approvalsRoutes(db, stmts));
app.route('/api/entities', entitiesRoutes(db, stmts));
app.route('/api/episodes', episodesRoutes(db, stmts));
app.route('/api/graph', graphRoutes(db, stmts));

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
