#!/usr/bin/env node
// Myco Brain — PostToolUse hook
// After significant tool uses (edits, writes, bash commands), nudges Claude
// to consider storing discoveries in the brain.
//
// Smart filtering:
// - Only fires after Edit/Write/Bash/Agent (not reads, globs, greps)
// - Debounce: max 1 nudge per 15 tool uses to avoid spam
// - Skips trivial operations (git status, ls, small edits)
// - Skips if brain MCP server is not configured
// - Never blocks — silent exit on all errors

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEBOUNCE_CALLS = 15; // Nudge at most every 15 tool uses
const MIN_CONTENT_LENGTH = 100; // Skip tiny edits/outputs

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id;
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};
    const toolResponse = data.tool_response || {};

    if (!sessionId) process.exit(0);

    // Check if brain MCP server is configured
    if (!checkMcpServer()) process.exit(0);

    // Debounce — track call count per session
    const countFile = path.join(os.tmpdir(), `myco-nudge-${sessionId}.json`);
    let state = { count: 0, lastNudge: 0 };
    try {
      if (fs.existsSync(countFile)) {
        state = JSON.parse(fs.readFileSync(countFile, 'utf8'));
      }
    } catch { /* fresh state */ }

    state.count++;

    // Should we nudge this time?
    const callsSinceLastNudge = state.count - state.lastNudge;
    if (callsSinceLastNudge < DEBOUNCE_CALLS) {
      fs.writeFileSync(countFile, JSON.stringify(state));
      process.exit(0);
    }

    // Check if this tool use is "significant" enough to nudge
    if (!isSignificant(toolName, toolInput, toolResponse)) {
      fs.writeFileSync(countFile, JSON.stringify(state));
      process.exit(0);
    }

    // Fire the nudge
    state.lastNudge = state.count;
    fs.writeFileSync(countFile, JSON.stringify(state));

    const context = [
      '<myco-brain-nudge>',
      'You\'ve been making progress. If you\'ve discovered something worth preserving across sessions — a pattern, decision, preference, architecture insight, or lesson learned — consider using brain remember to store it.',
      'Skip this if nothing notable has happened recently.',
      '</myco-brain-nudge>',
    ].join('\n');

    const output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: context,
      },
    };

    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  } catch {
    process.exit(0);
  }
});

function isSignificant(toolName, toolInput, toolResponse) {
  const name = toolName.toLowerCase();

  // Skip reads, searches, task management
  if (['read', 'glob', 'grep', 'toolsearch', 'taskcreate', 'taskupdate', 'taskget', 'tasklist'].includes(name)) {
    return false;
  }

  // Bash: skip trivial commands
  if (name === 'bash') {
    const cmd = (toolInput.command || '').toLowerCase();
    const trivial = ['git status', 'git log', 'git diff', 'ls', 'pwd', 'cat', 'head', 'tail', 'echo', 'which', 'npm test', 'npm run build'];
    if (trivial.some(t => cmd.startsWith(t))) return false;
    // Check output size — short outputs are probably trivial
    const responseText = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);
    if (responseText.length < MIN_CONTENT_LENGTH) return false;
    return true;
  }

  // Edit/Write: significant if content is substantial
  if (name === 'edit' || name === 'write' || name === 'multiedit') {
    const content = toolInput.new_string || toolInput.content || '';
    return content.length >= MIN_CONTENT_LENGTH;
  }

  // Agent: always significant (subagent completed work)
  if (name === 'agent') return true;

  // MCP tools: skip brain tools themselves (avoid recursive nudging)
  if (name.startsWith('mcp__brain__') || name.startsWith('mcp__myco__')) return false;

  // Default: not significant enough
  return false;
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
    return false;
  } catch {
    return false;
  }
}
