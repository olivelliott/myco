#!/usr/bin/env node
// Myco — SessionStart hook
// Injects relevant knowledge from the Myco database into every Claude Code session.
// Resolves cwd to a registered project, queries workflow rules + project facts +
// user preferences with priority-ordered token budgeting, tracks novelty via
// content hash, and degrades gracefully for all error paths.
//
// Design principles:
// - Read-only DB access — never hold a write lock
// - FTS5 queries only — no Ollama calls (must complete under 500ms)
// - All error paths exit 0 silently — never block session start
// - Exports core functions when loaded as a module (for testing)

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// DB path resolution — mirrors packages/core/src/db.ts getDefaultDbPath()
// ---------------------------------------------------------------------------

function getDbPath() {
  if (process.env.MYCO_DB_PATH) return process.env.MYCO_DB_PATH;
  const xdgData = process.env.XDG_DATA_HOME ||
    path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, 'myco', 'myco.db');
}

// ---------------------------------------------------------------------------
// MCP server detection — checks if myco is configured as an MCP server
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Project resolution — walks up the path to find the registered project
// ---------------------------------------------------------------------------

/**
 * Resolve a directory path to a project name via the project_paths table.
 * Uses walk-up resolution: matches the most specific registered path.
 * @param {import('better-sqlite3').Database} db
 * @param {string} cwd
 * @returns {string|null} projectName or null if no match
 */
function resolveProject(db, cwd) {
  try {
    const stmt = db.prepare(`
      SELECT project_name, directory_path FROM project_paths
      WHERE (? = directory_path OR ? LIKE directory_path || '/%')
      ORDER BY LENGTH(directory_path) DESC LIMIT 1
    `);
    const row = stmt.get(cwd, cwd);
    return row ? row.project_name : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Knowledge queries — FTS5 and direct SQL, read-only, under 500ms
// ---------------------------------------------------------------------------

/**
 * Query workflow rules for the project and global scope.
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} projectName
 * @returns {Array<{name: string, observations: string}>}
 */
function queryWorkflowRules(db, projectName) {
  try {
    let stmt;
    if (projectName !== null) {
      stmt = db.prepare(`
        SELECT e.name, e.type, GROUP_CONCAT(o.content, '\n') as observations
        FROM entities e
        LEFT JOIN observations o ON o.entity_id = e.id AND o.valid_until IS NULL
        WHERE e.type = 'workflow_rule'
          AND (e.project = ? OR e.project IS NULL)
          AND e.merged_into IS NULL
        GROUP BY e.id
        ORDER BY e.confidence DESC
      `);
      return stmt.all(projectName);
    } else {
      stmt = db.prepare(`
        SELECT e.name, e.type, GROUP_CONCAT(o.content, '\n') as observations
        FROM entities e
        LEFT JOIN observations o ON o.entity_id = e.id AND o.valid_until IS NULL
        WHERE e.type = 'workflow_rule'
          AND e.project IS NULL
          AND e.merged_into IS NULL
        GROUP BY e.id
        ORDER BY e.confidence DESC
      `);
      return stmt.all();
    }
  } catch (e) {
    return [];
  }
}

/**
 * Query project-specific facts (non-rule, non-preference entities with current observations).
 * @param {import('better-sqlite3').Database} db
 * @param {string|null} projectName
 * @returns {Array<{name: string, content: string, confidence: number}>}
 */
function queryProjectFacts(db, projectName) {
  if (projectName === null) return [];
  try {
    const stmt = db.prepare(`
      SELECT e.name, e.type, o.content, o.confidence
      FROM entities e
      JOIN observations o ON o.entity_id = e.id
      WHERE e.project = ?
        AND e.type != 'workflow_rule'
        AND e.type != 'user_preference'
        AND e.merged_into IS NULL
        AND o.valid_until IS NULL
      ORDER BY e.updated_at DESC, o.confidence DESC
      LIMIT 30
    `);
    return stmt.all(projectName);
  } catch (e) {
    return [];
  }
}

/**
 * Query global user preferences, including observation metadata for source attribution.
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{name: string, observations: string, obs_metadata: string|null}>}
 */
function queryUserPreferences(db) {
  try {
    const stmt = db.prepare(`
      SELECT e.name,
             GROUP_CONCAT(o.content, '\n') as observations,
             e.metadata as obs_metadata
      FROM entities e
      LEFT JOIN observations o ON o.entity_id = e.id AND o.valid_until IS NULL
      WHERE e.type = 'user_preference'
        AND e.project IS NULL
        AND e.merged_into IS NULL
      GROUP BY e.id
      ORDER BY e.confidence DESC
    `);
    return stmt.all();
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Token budgeting — 6,000 character hard cap (~1,500 tokens @ ~4 chars/token)
// ---------------------------------------------------------------------------

const CHAR_CAP = 6000;

/**
 * Build the injection string from queried knowledge, respecting the character cap.
 * Priority: rules (keep full) > facts (truncate to fit) > preferences (keep full).
 * @param {Array} rules
 * @param {Array} facts
 * @param {Array} preferences
 * @param {string|null} projectName
 * @returns {string} Content to inject (wrapped in <myco> tags)
 */
function buildInjection(rules, facts, preferences, projectName) {
  // Empty database case
  if (rules.length === 0 && facts.length === 0 && preferences.length === 0) {
    return [
      '<myco>',
      'The Myco MCP server is active but the knowledge base is new.',
      'As you work, use myco remember to store important knowledge: project preferences, architectural decisions, technology choices, patterns discovered.',
      'Use myco log_episode for notable session events.',
      'This builds a persistent knowledge web that accumulates across all sessions and projects.',
      '</myco>',
    ].join('\n');
  }

  // Build each section
  let rulesSection = '';
  if (rules.length > 0) {
    const lines = ['## Workflow Rules'];
    for (const r of rules) {
      const obs = r.observations ? r.observations.trim() : '';
      if (obs) {
        lines.push(`- **${r.name}**: ${obs}`);
      } else {
        lines.push(`- **${r.name}**`);
      }
    }
    rulesSection = lines.join('\n') + '\n';
  }

  let factsSection = '';
  if (facts.length > 0 && projectName !== null) {
    const lines = ['## Project Knowledge'];
    for (const f of facts) {
      lines.push(`- [${f.name}] ${f.content}`);
    }
    factsSection = lines.join('\n') + '\n';
  }

  let prefsSection = '';
  if (preferences.length > 0) {
    const lines = ['## Preferences'];
    for (const p of preferences) {
      const obs = p.observations ? p.observations.trim() : '';
      let attribution = '';
      if (p.obs_metadata) {
        try {
          const meta = JSON.parse(p.obs_metadata);
          if (meta.source_projects && meta.source_projects.length > 0) {
            attribution = ` (from: ${meta.source_projects.join(', ')})`;
          }
        } catch { /* ignore malformed metadata */ }
      }
      if (obs) {
        lines.push(`- **${p.name}**: ${obs}${attribution}`);
      } else {
        lines.push(`- **${p.name}**${attribution}`);
      }
    }
    prefsSection = lines.join('\n') + '\n';
  }

  const moreNote = '\nMore context available -- call `myco recall` for deeper search.';
  const wasTruncated = facts.length >= 30; // hit the LIMIT 30

  // Measure combined length (without <myco> wrapper)
  const combined = [rulesSection, factsSection, prefsSection].filter(Boolean).join('\n');

  if (combined.length <= CHAR_CAP) {
    // Fits within cap
    let inner = combined.trimEnd();
    if (wasTruncated) {
      inner += moreNote;
    }
    // Add no-project note if applicable
    if (projectName === null && (rules.length > 0 || preferences.length > 0)) {
      inner += '\n\nNo project context found for this directory -- run `myco link-project` to register it.';
    }
    return `<myco>\n${inner}\n</myco>`;
  }

  // Over cap — trim facts to fit
  const rulesLen = rulesSection.length;
  const prefsLen = prefsSection.length;
  const overhead = (rulesSection ? rulesSection.length + 1 : 0) +
                   (prefsSection ? prefsSection.length + 1 : 0) +
                   moreNote.length;
  const factsbudget = CHAR_CAP - overhead;

  let trimmedFactsSection = '';
  if (factsSection && factsbudget > 50) {
    // Trim facts lines until they fit
    const factLines = factsSection.split('\n');
    let built = '';
    for (const line of factLines) {
      if ((built + line + '\n').length > factsbudget) break;
      built += line + '\n';
    }
    trimmedFactsSection = built;
  }

  let inner = [rulesSection, trimmedFactsSection, prefsSection]
    .filter(Boolean)
    .join('\n')
    .trimEnd();
  inner += moreNote;

  if (projectName === null) {
    inner += '\n\nNo project context found for this directory -- run `myco link-project` to register it.';
  }

  return `<myco>\n${inner}\n</myco>`;
}

// ---------------------------------------------------------------------------
// Novelty filtering — SHA-256 hash of injection content
// ---------------------------------------------------------------------------

/**
 * Compute a 16-char truncated SHA-256 hex digest of the input string.
 * @param {string} text
 * @returns {string}
 */
function computeContentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Get path to the novelty hash cache file.
 * @returns {string}
 */
function getHashFilePath() {
  const dataHome = process.env.XDG_DATA_HOME ||
    path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'myco', 'last-injection-hash');
}

// ---------------------------------------------------------------------------
// Fallback messages
// ---------------------------------------------------------------------------

function buildFallbackMessage() {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: '<myco>\nMyco knowledge available -- call `myco recall` to access it.\n</myco>',
    },
  });
}

function buildNewDbMessage() {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: [
        '<myco>',
        'The Myco MCP server is active but the knowledge base is new.',
        'As you work, use myco remember to store important knowledge: project preferences, architectural decisions, technology choices, patterns discovered.',
        'Use myco log_episode for notable session events.',
        'This builds a persistent knowledge web that accumulates across all sessions and projects.',
        '</myco>',
      ].join('\n'),
    },
  });
}

// ---------------------------------------------------------------------------
// Main entry point — only runs when executed as a script
// ---------------------------------------------------------------------------

if (require.main === module) {
  let input = '';
  const stdinTimeout = setTimeout(() => process.exit(0), 10000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    clearTimeout(stdinTimeout);
    try {
      const data = JSON.parse(input);
      const cwd = data.cwd || process.cwd();

      // Check if myco MCP server is configured (global or project settings)
      const hasMcpServer = checkMcpServer();
      if (!hasMcpServer) {
        process.exit(0); // Myco not configured — skip silently
      }

      // Check if myco.db exists
      const dbPath = getDbPath();
      if (!dbPath || !fs.existsSync(dbPath)) {
        process.stdout.write(buildNewDbMessage());
        process.exit(0);
      }

      // 500ms hard deadline for all DB operations
      const deadline = Date.now() + 500;

      // Resolve better-sqlite3 from project's node_modules
      // Hook lives at hooks/ — project root is 1 level up
      let Database;
      try {
        Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
      } catch (requireErr) {
        process.stdout.write(buildFallbackMessage());
        process.exit(0);
      }

      // Open DB in read-only mode — never hold a write lock
      let db;
      try {
        db = new Database(dbPath, { readonly: true });
      } catch (dbErr) {
        process.stdout.write(buildFallbackMessage());
        process.exit(0);
      }

      try {
        // Check timeout before starting queries
        if (Date.now() > deadline) {
          process.stdout.write(buildFallbackMessage());
          process.exit(0);
        }

        // Resolve project from cwd
        const projectName = resolveProject(db, cwd);

        if (Date.now() > deadline) {
          process.stdout.write(buildFallbackMessage());
          process.exit(0);
        }

        // Query knowledge in priority order
        const rules = queryWorkflowRules(db, projectName);

        if (Date.now() > deadline) {
          process.stdout.write(buildFallbackMessage());
          process.exit(0);
        }

        const facts = queryProjectFacts(db, projectName);

        if (Date.now() > deadline) {
          process.stdout.write(buildFallbackMessage());
          process.exit(0);
        }

        const preferences = queryUserPreferences(db);

        // Build injection
        const injection = buildInjection(rules, facts, preferences, projectName);

        // Novelty filtering — check if content changed since last session
        const hashInput = injection + ':' + (projectName || '') + ':' + cwd;
        const currentHash = computeContentHash(hashInput);
        const hashFile = getHashFilePath();

        let storedHash = null;
        try {
          storedHash = fs.readFileSync(hashFile, 'utf8').trim();
        } catch (e) {
          // File missing — first injection or hash cleared
        }

        let finalContext;
        if (storedHash === currentHash) {
          // No changes since last session
          finalContext = '<myco>\nNo changes since last session -- call `myco recall` if you need specific knowledge.\n</myco>';
        } else {
          // New content — inject and update hash
          finalContext = injection;
          // Write new hash (this is the ONE write the hook does — to a file, not the DB)
          try {
            fs.mkdirSync(path.dirname(hashFile), { recursive: true });
            fs.writeFileSync(hashFile, currentHash, 'utf8');
          } catch (writeErr) {
            // Hash write failure is non-fatal — inject anyway
          }
        }

        // Add no-project note if no project found and we have content
        if (projectName === null &&
            !finalContext.includes('knowledge base is new') &&
            !finalContext.includes('No changes since last session') &&
            !finalContext.includes('No project context found')) {
          // Already handled in buildInjection
        }

        const output = {
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: finalContext,
          },
        };

        process.stdout.write(JSON.stringify(output));
        process.exit(0);
      } catch (queryErr) {
        process.stdout.write(buildFallbackMessage());
        process.exit(0);
      } finally {
        try { db.close(); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      // Silent failure — never block session start
      process.exit(0);
    }
  });
}

// ---------------------------------------------------------------------------
// Module exports — for testing (when loaded as a module, not run as a script)
// ---------------------------------------------------------------------------

if (require.main !== module) {
  module.exports = {
    resolveProject,
    queryWorkflowRules,
    queryProjectFacts,
    queryUserPreferences,
    buildInjection,
    computeContentHash,
    getDbPath,
  };
}
