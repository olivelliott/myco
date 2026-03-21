#!/usr/bin/env node
// gsd-brain-episode.js
// PostToolUse hook — fires after every Bash tool use.
// Detects `gsd-tools phase complete` commands and writes a structured episode
// to brain.db using direct better-sqlite3 INSERT (same SQL as logEpisode()).
//
// Design principles:
// - Fire-and-forget: every failure path exits 0 silently
// - No stdout output (prevents Claude Code "hook error" on unexpected output)
// - No sqlite-vec extension needed (episodes table has no vector column)
// - CommonJS (no build step, no ESM compatibility issues)

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// DB path resolution — mirrors packages/core/src/db.ts getDefaultDbPath()
// ---------------------------------------------------------------------------

function getDbPath() {
  const envPath = process.env.BRAIN_DB_PATH;
  if (envPath) return envPath;
  const xdgData = process.env.XDG_DATA_HOME ||
    path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, 'ai-workbots', 'brain.db');
}

// ---------------------------------------------------------------------------
// Command detection — matches gsd-tools.*phase.*complete regardless of path
// ---------------------------------------------------------------------------

const PHASE_COMPLETE_RE = /gsd-tools[^\s]*\s+phase\s+complete/;
const PHASE_NUMBER_RE = /phase\s+complete\s+["']?([^\s"']+)["']?/i;

// ---------------------------------------------------------------------------
// Phase directory discovery
// ---------------------------------------------------------------------------

function findPhaseDir(cwd, phaseNumber) {
  try {
    const phasesDir = path.join(cwd, '.planning', 'phases');
    const entries = fs.readdirSync(phasesDir);
    // Zero-pad to 2 digits for matching (e.g., "5" -> "05", "03" stays "03")
    const padded = String(phaseNumber).padStart(2, '0');
    const match = entries.find(e => e.startsWith(padded + '-') || e.startsWith(phaseNumber + '-'));
    if (match) return path.join(phasesDir, match);
  } catch (e) {
    // Phases dir unreadable — not fatal
  }
  return null;
}

// ---------------------------------------------------------------------------
// Phase name extraction — derives the name portion from the directory name
// ---------------------------------------------------------------------------

function extractPhaseName(phaseDir, phaseNumber) {
  if (!phaseDir) return `phase-${phaseNumber}`;
  const dirname = path.basename(phaseDir);
  // Format: "05-gsd-integration" -> "gsd-integration"
  const parts = dirname.split('-');
  if (parts.length > 1) {
    return parts.slice(1).join('-');
  }
  return dirname;
}

// ---------------------------------------------------------------------------
// Requirements extraction from ROADMAP.md
// ---------------------------------------------------------------------------

function extractRequirements(cwd, phaseNumber) {
  try {
    const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
    const roadmap = fs.readFileSync(roadmapPath, 'utf-8');

    // Find the phase section — match by phase number (with or without leading zero)
    const padded = String(phaseNumber).padStart(2, '0');
    const sectionRe = new RegExp(
      `##+ Phase ${padded}[:\\s][\\s\\S]*?(?=##+ Phase|$)`,
      'i'
    );
    const phaseSection = roadmap.match(sectionRe);
    if (!phaseSection) return [];

    // Extract **Requirements:** [GSD-01, GSD-02, GSD-03]
    const reqMatch = phaseSection[0].match(/\*\*Requirements:\*\*\s*\[?([^\]\n]+)/i);
    if (!reqMatch) return [];

    return reqMatch[1]
      .split(/[,\s]+/)
      .map(r => r.trim())
      .filter(r => r.length > 0 && /^[A-Z]/.test(r));
  } catch (e) {
    // ROADMAP.md unreadable — return empty array, not fatal
    return [];
  }
}

// ---------------------------------------------------------------------------
// Outcome summary extraction from SUMMARY.md files in the phase directory
// ---------------------------------------------------------------------------

function extractOutcomeSummary(phaseDir, phaseNumber) {
  if (!phaseDir) {
    return `Phase ${phaseNumber} complete`;
  }

  try {
    const entries = fs.readdirSync(phaseDir);
    const summaryFiles = entries.filter(e => e.endsWith('-SUMMARY.md'));

    if (summaryFiles.length === 0) {
      return `Phase ${phaseNumber} complete`;
    }

    const summaries = [];
    for (const file of summaryFiles) {
      try {
        const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
        // Extract the one-liner after the title (first non-empty line after `# `)
        const lines = content.split('\n');
        // Look for a "## Summary" section or use the title line
        const summaryIdx = lines.findIndex(l => /^##\s+Summary/.test(l));
        if (summaryIdx !== -1) {
          // Get first non-empty line after the heading
          for (let i = summaryIdx + 1; i < Math.min(summaryIdx + 5, lines.length); i++) {
            const line = lines[i].trim();
            if (line.length > 0 && !line.startsWith('#')) {
              summaries.push(line);
              break;
            }
          }
        } else {
          // Fallback: use the document title
          const titleLine = lines.find(l => l.startsWith('# '));
          if (titleLine) {
            summaries.push(titleLine.replace(/^#\s+/, ''));
          }
        }
      } catch (e) {
        // Individual file unreadable — skip
      }
    }

    if (summaries.length === 0) {
      return `Phase ${phaseNumber} complete — ${summaryFiles.length} plan(s) executed`;
    }

    return summaries.join(' | ');
  } catch (e) {
    return `Phase ${phaseNumber} complete`;
  }
}

// ---------------------------------------------------------------------------
// Count plans executed (number of SUMMARY.md files as proxy)
// ---------------------------------------------------------------------------

function countPlansExecuted(phaseDir) {
  if (!phaseDir) return null;
  try {
    const entries = fs.readdirSync(phaseDir);
    return entries.filter(e => e.endsWith('-SUMMARY.md')).length;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stdin reader — canonical GSD hook pattern from gsd-context-monitor.js
// ---------------------------------------------------------------------------

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);

    // Only act on Bash tool use events
    if (data.tool_name !== 'Bash' && data.hook_event_name !== 'PostToolUse') {
      process.exit(0);
    }

    const command = (data.tool_input && data.tool_input.command) || '';

    // Check if this is a phase complete command
    if (!PHASE_COMPLETE_RE.test(command)) {
      process.exit(0);
    }

    // Extract phase number from command string
    const phaseMatch = command.match(PHASE_NUMBER_RE);
    if (!phaseMatch) {
      process.exit(0);
    }

    const phaseRaw = phaseMatch[1]; // e.g., "5", "03-consolidation"
    // Extract just the numeric part from strings like "03-consolidation"
    const phaseNumber = phaseRaw.replace(/^0*(\d+).*/, '$1');

    const cwd = data.cwd || process.cwd();
    const sessionId = data.session_id || 'unknown';

    // Resolve brain.db path
    const dbPath = getDbPath();

    // CRITICAL: Do NOT auto-create brain.db — exit silently if it doesn't exist
    if (!fs.existsSync(dbPath)) {
      process.exit(0);
    }

    // Discover phase directory
    const phaseDir = findPhaseDir(cwd, phaseNumber);

    // Build structured GSD-02 payload
    const payload = {
      phase_name: extractPhaseName(phaseDir, phaseNumber),
      phase_number: phaseNumber,
      requirements_covered: extractRequirements(cwd, phaseNumber),
      outcome_summary: extractOutcomeSummary(phaseDir, phaseNumber),
      plans_executed: countPlansExecuted(phaseDir),
      source: 'gsd_hook',
      transition_timestamp: new Date().toISOString(),
    };

    // Require better-sqlite3 from the project's node_modules
    // Hook lives at .claude/hooks/ — project root is 2 levels up
    const projectRoot = path.resolve(__dirname, '..', '..');
    let Database;
    try {
      Database = require(path.join(projectRoot, 'node_modules', 'better-sqlite3'));
    } catch (requireErr) {
      console.error('[gsd-brain-episode] Could not load better-sqlite3:', requireErr.message);
      process.exit(0);
    }

    // Open DB (no sqlite-vec extension — episodes table has no vector column)
    let db;
    try {
      db = new Database(dbPath);
    } catch (dbErr) {
      console.error('[gsd-brain-episode] Could not open brain.db:', dbErr.message);
      process.exit(0);
    }

    // Insert episode — same SQL as logEpisode() in packages/mcp-server/src/tools.ts
    try {
      const id = require('crypto').randomUUID();
      db.prepare(`
        INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        sessionId,
        'gsd-hook',
        'gsd_phase_complete',
        JSON.stringify(payload),
        new Date().toISOString()
      );
    } catch (insertErr) {
      console.error('[gsd-brain-episode] INSERT failed:', insertErr.message);
    } finally {
      try { db.close(); } catch (e) { /* ignore close errors */ }
    }

    process.exit(0);
  } catch (e) {
    // Top-level catch — never block GSD workflow
    process.exit(0);
  }
});
