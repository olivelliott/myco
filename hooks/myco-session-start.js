#!/usr/bin/env node
// Myco Brain — SessionStart hook
// Injects context nudging Claude to recall relevant knowledge at session start.
// Checks if the brain MCP server is configured before injecting anything.

const fs = require('fs');
const os = require('os');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();

    // Check if brain/myco MCP server is configured (global or project settings)
    const hasBrainServer = checkMcpServer();
    if (!hasBrainServer) {
      process.exit(0); // Brain not configured — skip silently
    }

    // Check if brain.db exists and has data
    const dbPath = getDbPath();
    const dbExists = dbPath && fs.existsSync(dbPath);
    const dbSize = dbExists ? fs.statSync(dbPath).size : 0;
    const hasData = dbSize > 20000; // ~20KB means it has real data, not just schema

    // Build context injection
    const projectName = path.basename(cwd);
    let context = '';

    if (hasData) {
      context = [
        '<myco-brain>',
        'The Myco brain MCP server is active with stored knowledge.',
        `Consider using the brain recall tool to check for relevant prior knowledge about "${projectName}" or the current task.`,
        'When you learn something significant during this session (decisions, patterns, preferences, architecture insights), use brain remember to store it for future sessions.',
        'Use brain log_episode for notable session events (task completions, discoveries, errors).',
        '</myco-brain>',
      ].join('\n');
    } else {
      context = [
        '<myco-brain>',
        'The Myco brain MCP server is active but the knowledge base is new.',
        'As you work, use brain remember to store important knowledge: project preferences, architectural decisions, technology choices, patterns discovered.',
        'Use brain log_episode for notable session events.',
        'This builds a persistent knowledge web that accumulates across all sessions and projects.',
        '</myco-brain>',
      ].join('\n');
    }

    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    };

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch (err) {
    // Silent failure — never block session start
    process.exit(0);
  }
});

function getDbPath() {
  if (process.env.MYCO_DB_PATH) return process.env.MYCO_DB_PATH;
  if (process.env.BRAIN_DB_PATH) return process.env.BRAIN_DB_PATH;
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'myco', 'brain.db');
}

function checkMcpServer() {
  try {
    // Check .claude.json (where `claude mcp add` stores servers)
    const claudeJson = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeJson)) {
      const data = JSON.parse(fs.readFileSync(claudeJson, 'utf8'));
      if (data.mcpServers && (data.mcpServers.brain || data.mcpServers.myco)) {
        return true;
      }
    }

    // Check global settings.json
    const globalSettings = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(globalSettings)) {
      const settings = JSON.parse(fs.readFileSync(globalSettings, 'utf8'));
      if (settings.mcpServers && (settings.mcpServers.brain || settings.mcpServers.myco)) {
        return true;
      }
    }

    // Check project .mcp.json
    const mcpJson = path.join(process.cwd(), '.mcp.json');
    if (fs.existsSync(mcpJson)) {
      const mcp = JSON.parse(fs.readFileSync(mcpJson, 'utf8'));
      const servers = mcp.mcpServers || mcp.servers || {};
      if (servers.brain || servers.myco) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
