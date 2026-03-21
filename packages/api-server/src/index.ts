import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { approvalsRoutes } from './routes/approvals.js';
import { entitiesRoutes } from './routes/entities.js';
import { episodesRoutes } from './routes/episodes.js';
import { graphRoutes } from './routes/graph.js';

const db = getDb();

const app = new Hono();

// CORS for local development origins
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:4173'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type'],
}));

// Mount route groups
app.route('/api/dashboard', dashboardRoutes(db));
app.route('/api/approvals', approvalsRoutes(db));
app.route('/api/entities', entitiesRoutes(db));
app.route('/api/episodes', episodesRoutes(db));
app.route('/api/graph', graphRoutes(db));

const server = serve({ fetch: app.fetch, port: 3001 });

console.log('API server running on http://localhost:3001');

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
