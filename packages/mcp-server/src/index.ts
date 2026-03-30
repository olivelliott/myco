#!/usr/bin/env node
import { loadConfig } from '@myco/core';
loadConfig();
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDatabase, prepareStatements, registerEpisodeCallback, registerPostRememberCallback } from '@myco/core';
import { registerTools, reEmbedPending, promotePreference } from './tools.js';
import { scheduleDailyConsolidation } from './scheduler.js';
import { runMicroConsolidation } from './consolidator.js';

const db = openDatabase();
const stmts = prepareStatements(db);

// Startup re-embed sweep: backfill embeddings for observations flagged during Ollama outage
// Runs async — does not block server startup
reEmbedPending(db, stmts).then(count => {
  if (count > 0) {
    console.error(`Re-embedded ${count} pending observations at startup`);
  }
}).catch(() => {
  // Ollama unavailable at startup — will retry next startup
});

const server = new McpServer({
  name: 'myco',
  version: '0.1.0',
});

registerTools(server, db, stmts);

// EXTRACT-02 + CONSOL-01: Wire micro-consolidation to fire on every log_episode
registerEpisodeCallback((episodeId) => runMicroConsolidation(db, stmts, episodeId));
console.error('[micro-consolidation] episode callback registered');

// Wire preference promotion to fire after every remember call
registerPostRememberCallback((db, stmts, entityName, project) => {
  promotePreference(db, stmts, entityName, project);
});
console.error('[preferences] post-remember callback registered');

// Schedule nightly consolidation at 2am EST — does not block startup
const consolidationCron = scheduleDailyConsolidation(db, stmts);
console.error('[scheduler] nightly consolidation scheduled (2am America/New_York)');

const transport = new StdioServerTransport();
await server.connect(transport);

// CRITICAL: After connect(), stdout is owned by the MCP transport.
// All diagnostic output MUST use console.error (writes to stderr).
console.error('myco MCP server started');
