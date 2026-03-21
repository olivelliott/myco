#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDatabase } from '@ai-workbots/core';
import { registerTools, reEmbedPending } from './tools.js';
import { scheduleDailyConsolidation } from './scheduler.js';

const db = openDatabase();

// Startup re-embed sweep: backfill embeddings for observations flagged during Ollama outage
// Runs async — does not block server startup
reEmbedPending(db).then(count => {
  if (count > 0) {
    console.error(`Re-embedded ${count} pending observations at startup`);
  }
}).catch(() => {
  // Ollama unavailable at startup — will retry next startup
});

const server = new McpServer({
  name: 'ai-workbots-brain',
  version: '0.1.0',
});

registerTools(server, db);

// Schedule nightly consolidation at 2am EST — does not block startup
const consolidationCron = scheduleDailyConsolidation(db);
console.error('[scheduler] nightly consolidation scheduled (2am America/New_York)');

const transport = new StdioServerTransport();
await server.connect(transport);

// CRITICAL: After connect(), stdout is owned by the MCP transport.
// All diagnostic output MUST use console.error (writes to stderr).
console.error('ai-workbots-brain MCP server started');
