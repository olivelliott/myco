#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDatabase } from '@ai-workbots/core';
import { registerTools } from './tools.js';

const db = openDatabase();

const server = new McpServer({
  name: 'ai-workbots-brain',
  version: '0.1.0',
});

registerTools(server, db);

const transport = new StdioServerTransport();
await server.connect(transport);

// CRITICAL: After connect(), stdout is owned by the MCP transport.
// All diagnostic output MUST use console.error (writes to stderr).
console.error('ai-workbots-brain MCP server started');
