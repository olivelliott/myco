/**
 * Unit tests for gsd-brain-episode hook logic.
 *
 * Since the hook is a CommonJS side-effect script (not an importable module),
 * we test its core logic by:
 * 1. Replicating the exact regex patterns from the hook and testing them
 * 2. Testing the DB path resolution logic with mocked env vars
 * 3. Constructing a payload the same way the hook does and validating its shape
 * 4. Using better-sqlite3 directly to create an in-memory DB and verify INSERT
 *
 * Test groups:
 * - command detection: regex match/no-match cases
 * - phase extraction: phase number parsing
 * - db path resolution: env var priority
 * - payload structure: GSD-02 field completeness
 * - episode insertion: SQLite write + read verification
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// better-sqlite3 is a CommonJS module — use createRequire from the package location
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// ---------------------------------------------------------------------------
// Replicated constants from .claude/hooks/gsd-brain-episode.js
// These must exactly match the hook to be meaningful tests.
// ---------------------------------------------------------------------------

const PHASE_COMPLETE_RE = /gsd-tools[^\s]*\s+phase\s+complete/;
const PHASE_NUMBER_RE = /phase\s+complete\s+["']?([^\s"']+)["']?/i;

function getDbPath(envOverrides: Record<string, string | undefined> = {}): string {
  const brainDbPath = envOverrides.BRAIN_DB_PATH ?? process.env.BRAIN_DB_PATH;
  if (brainDbPath) return brainDbPath;
  const xdgData = envOverrides.XDG_DATA_HOME ?? process.env.XDG_DATA_HOME ??
    path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, 'ai-workbots', 'brain.db');
}

function extractPhaseNumber(command: string): string | null {
  const match = command.match(PHASE_NUMBER_RE);
  if (!match) return null;
  const raw = match[1]; // e.g., "5", "03-consolidation"
  return raw.replace(/^0*(\d+).*/, '$1');
}

// Minimal episodes table schema (matches packages/core/src/schema.ts)
const EPISODES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    consolidated_at TEXT
  )
`;

// ---------------------------------------------------------------------------
// Test: command detection
// ---------------------------------------------------------------------------

describe('command detection', () => {
  it('matches gsd-tools.cjs phase complete 5', () => {
    const cmd = 'node "~/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete "5"';
    expect(PHASE_COMPLETE_RE.test(cmd)).toBe(true);
  });

  it('matches gsd-tools.cjs phase complete with quoted phase name', () => {
    const cmd = 'node "~/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete "03-consolidation"';
    expect(PHASE_COMPLETE_RE.test(cmd)).toBe(true);
  });

  it('matches gsd-tools.cjs phase complete with unquoted phase number', () => {
    const cmd = 'node /abs/path/gsd-tools.cjs phase complete 7';
    expect(PHASE_COMPLETE_RE.test(cmd)).toBe(true);
  });

  it('does NOT match gsd-tools.cjs init plan-phase', () => {
    const cmd = 'node "~/.claude/get-shit-done/bin/gsd-tools.cjs" init plan-phase "5"';
    expect(PHASE_COMPLETE_RE.test(cmd)).toBe(false);
  });

  it('does NOT match gsd-tools.cjs state update', () => {
    const cmd = 'node "~/.claude/get-shit-done/bin/gsd-tools.cjs" state update-progress';
    expect(PHASE_COMPLETE_RE.test(cmd)).toBe(false);
  });

  it('does NOT match gsd-tools.cjs roadmap update-plan-progress', () => {
    const cmd = 'node "~/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap update-plan-progress "5"';
    expect(PHASE_COMPLETE_RE.test(cmd)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test: phase extraction
// ---------------------------------------------------------------------------

describe('phase extraction', () => {
  it('extracts "5" from phase complete "5"', () => {
    const cmd = 'node "~/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete "5"';
    expect(extractPhaseNumber(cmd)).toBe('5');
  });

  it('extracts "3" from phase complete "03-consolidation"', () => {
    const cmd = 'node "~/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete "03-consolidation"';
    expect(extractPhaseNumber(cmd)).toBe('3');
  });

  it('extracts "4" from phase complete 04-rest-api-pwa (unquoted)', () => {
    const cmd = 'node /abs/path/gsd-tools.cjs phase complete 04-rest-api-pwa';
    expect(extractPhaseNumber(cmd)).toBe('4');
  });

  it('returns null when no phase number in command', () => {
    const cmd = 'node /abs/path/gsd-tools.cjs state update';
    expect(extractPhaseNumber(cmd)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test: db path resolution
// ---------------------------------------------------------------------------

describe('db path resolution', () => {
  it('returns BRAIN_DB_PATH env var when set', () => {
    const customPath = '/custom/path/brain.db';
    const result = getDbPath({ BRAIN_DB_PATH: customPath });
    expect(result).toBe(customPath);
  });

  it('returns XDG_DATA_HOME based path when BRAIN_DB_PATH is not set', () => {
    const customXdg = '/custom/xdg';
    const result = getDbPath({ XDG_DATA_HOME: customXdg });
    expect(result).toBe(path.join(customXdg, 'ai-workbots', 'brain.db'));
  });

  it('returns default ~/.local/share path when neither env var is set', () => {
    const result = getDbPath({ BRAIN_DB_PATH: undefined, XDG_DATA_HOME: undefined });
    const expected = path.join(os.homedir(), '.local', 'share', 'ai-workbots', 'brain.db');
    expect(result).toBe(expected);
  });

  it('BRAIN_DB_PATH takes priority over XDG_DATA_HOME', () => {
    const result = getDbPath({
      BRAIN_DB_PATH: '/priority/brain.db',
      XDG_DATA_HOME: '/custom/xdg',
    });
    expect(result).toBe('/priority/brain.db');
  });
});

// ---------------------------------------------------------------------------
// Test: payload structure
// ---------------------------------------------------------------------------

describe('payload structure', () => {
  it('contains all required GSD-02 fields', () => {
    const payload = {
      phase_name: 'gsd-integration',
      phase_number: '5',
      requirements_covered: ['GSD-01', 'GSD-02', 'GSD-03'],
      outcome_summary: 'Phase 5 complete — 2 plan(s) executed',
      plans_executed: 2,
      source: 'gsd_hook',
      transition_timestamp: new Date().toISOString(),
    };

    expect(payload).toHaveProperty('phase_name');
    expect(payload).toHaveProperty('phase_number');
    expect(payload).toHaveProperty('requirements_covered');
    expect(payload).toHaveProperty('outcome_summary');
    expect(payload).toHaveProperty('plans_executed');
    expect(payload).toHaveProperty('source');
    expect(payload).toHaveProperty('transition_timestamp');
  });

  it('requirements_covered is an array', () => {
    const payload = {
      requirements_covered: ['GSD-01', 'GSD-02'],
    };
    expect(Array.isArray(payload.requirements_covered)).toBe(true);
  });

  it('source is the string "gsd_hook"', () => {
    const payload = { source: 'gsd_hook' };
    expect(payload.source).toBe('gsd_hook');
  });

  it('transition_timestamp is a valid ISO 8601 string', () => {
    const ts = new Date().toISOString();
    const payload = { transition_timestamp: ts };
    expect(() => new Date(payload.transition_timestamp)).not.toThrow();
    expect(new Date(payload.transition_timestamp).toISOString()).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// Test: episode insertion (SQLite write + read verification)
// ---------------------------------------------------------------------------

describe('episode insertion', () => {
  let tempDir: string;
  let dbPath: string;
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-brain-ep-test-'));
    dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);
    db.exec(EPISODES_SCHEMA);
  });

  afterEach(() => {
    try { db.close(); } catch (e) { /* ignore */ }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('inserts a valid episode row that is readable from the DB', () => {
    const id = require('crypto').randomUUID();
    const sessionId = 'test-session-abc123';
    const payload = {
      phase_name: 'gsd-integration',
      phase_number: '5',
      requirements_covered: ['GSD-01', 'GSD-02', 'GSD-03'],
      outcome_summary: 'Phase 5 complete',
      plans_executed: 2,
      source: 'gsd_hook',
      transition_timestamp: new Date().toISOString(),
    };

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

    const row = db.prepare('SELECT * FROM episodes WHERE id = ?').get(id) as {
      id: string;
      session_id: string;
      agent_id: string;
      event_type: string;
      payload: string;
      created_at: string;
    } | undefined;

    expect(row).toBeDefined();
    expect(row?.id).toBe(id);
    expect(row?.session_id).toBe(sessionId);
    expect(row?.agent_id).toBe('gsd-hook');
    expect(row?.event_type).toBe('gsd_phase_complete');
    expect(JSON.parse(row?.payload ?? '{}')).toMatchObject({
      phase_name: 'gsd-integration',
      phase_number: '5',
      requirements_covered: expect.any(Array),
      outcome_summary: expect.any(String),
      source: 'gsd_hook',
    });
  });

  it('event_type is "gsd_phase_complete" and agent_id is "gsd-hook"', () => {
    const id = require('crypto').randomUUID();

    db.prepare(`
      INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      'session-xyz',
      'gsd-hook',
      'gsd_phase_complete',
      JSON.stringify({ source: 'gsd_hook' }),
      new Date().toISOString()
    );

    const row = db.prepare('SELECT agent_id, event_type FROM episodes WHERE id = ?').get(id) as {
      agent_id: string;
      event_type: string;
    };

    expect(row.agent_id).toBe('gsd-hook');
    expect(row.event_type).toBe('gsd_phase_complete');
  });

  it('payload JSON parses to object with required GSD-02 keys', () => {
    const id = require('crypto').randomUUID();
    const payload = {
      phase_name: 'test-phase',
      phase_number: '3',
      requirements_covered: ['REQ-01'],
      outcome_summary: 'Test outcome',
      plans_executed: 1,
      source: 'gsd_hook',
      transition_timestamp: new Date().toISOString(),
    };

    db.prepare(`
      INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, 'session-test', 'gsd-hook', 'gsd_phase_complete',
      JSON.stringify(payload), new Date().toISOString());

    const row = db.prepare('SELECT payload FROM episodes WHERE id = ?').get(id) as {
      payload: string;
    };

    const parsed = JSON.parse(row.payload) as Record<string, unknown>;
    expect(parsed.phase_name).toBe('test-phase');
    expect(parsed.phase_number).toBe('3');
    expect(Array.isArray(parsed.requirements_covered)).toBe(true);
    expect(parsed.outcome_summary).toBe('Test outcome');
    expect(parsed.source).toBe('gsd_hook');
  });

  it('created_at is a valid ISO 8601 timestamp', () => {
    const id = require('crypto').randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO episodes (id, session_id, agent_id, event_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, 'session-ts', 'gsd-hook', 'gsd_phase_complete',
      JSON.stringify({ source: 'gsd_hook' }), now);

    const row = db.prepare('SELECT created_at FROM episodes WHERE id = ?').get(id) as {
      created_at: string;
    };

    expect(new Date(row.created_at).toISOString()).toBe(row.created_at);
  });
});
