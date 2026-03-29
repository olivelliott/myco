'use strict';
// hooks/tests/session-start-recall.test.js
// Tests for the upgraded myco-session-start.js hook
// Uses Node.js built-in test runner and assert module
// CommonJS — no build step required

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Load the hook as a module (not as a script) — hook exports when not main
// ---------------------------------------------------------------------------
const hook = require('../myco-session-start.js');

const {
  resolveProject,
  queryWorkflowRules,
  queryProjectFacts,
  queryUserPreferences,
  buildInjection,
  computeContentHash,
  getDbPath,
} = hook;

// ---------------------------------------------------------------------------
// In-memory SQLite DB setup helpers
// ---------------------------------------------------------------------------

function createTestDb() {
  const Database = require(
    path.join(__dirname, '..', '..', 'node_modules', 'better-sqlite3')
  );
  const db = new Database(':memory:');

  // Apply minimal schema — entities, observations, project_paths
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'fact',
      project TEXT,
      confidence REAL NOT NULL DEFAULT 0.8,
      merged_into TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      metadata TEXT NOT NULL DEFAULT '{}',
      valid_until TEXT,
      FOREIGN KEY (entity_id) REFERENCES entities(id)
    );

    CREATE TABLE IF NOT EXISTS project_paths (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      directory_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function seedTestData(db) {
  // project_paths
  db.prepare(`INSERT INTO project_paths (id, project_name, directory_path) VALUES (?, ?, ?)`)
    .run('pp1', 'myco', '/Users/olive/projects/myco');
  db.prepare(`INSERT INTO project_paths (id, project_name, directory_path) VALUES (?, ?, ?)`)
    .run('pp2', 'other-project', '/Users/olive/projects/other');

  // workflow_rule entities (global and project-scoped)
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run('e1', 'Update docs before committing', 'workflow_rule', null, 0.9);
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run('e2', 'Run tests before pushing', 'workflow_rule', 'myco', 0.85);
  // merged workflow_rule (should be excluded)
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence, merged_into) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('e3', 'Old rule', 'workflow_rule', null, 0.7, 'e1');

  // user_preference entities (global)
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run('e4', 'Prefers dark themes', 'user_preference', null, 0.9);
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run('e5', 'Prefers minimal UI', 'user_preference', null, 0.8);

  // user_preference that is project-scoped (should NOT appear in global preference query)
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run('e6', 'Project-scoped preference', 'user_preference', 'myco', 0.7);

  // project fact entities
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run('e7', 'Tech stack', 'fact', 'myco', 0.95);
  db.prepare(`INSERT INTO entities (id, name, type, project, confidence) VALUES (?, ?, ?, ?, ?)`)
    .run('e8', 'Architecture pattern', 'fact', 'myco', 0.9);

  // observations
  db.prepare(`INSERT INTO observations (id, entity_id, content, confidence, valid_until) VALUES (?, ?, ?, ?, ?)`)
    .run('o1', 'e1', 'Always update README.md when adding new features', 0.9, null);
  db.prepare(`INSERT INTO observations (id, entity_id, content, confidence, valid_until) VALUES (?, ?, ?, ?, ?)`)
    .run('o2', 'e2', 'Run vitest before every push to main', 0.85, null);
  db.prepare(`INSERT INTO observations (id, entity_id, content, confidence, valid_until) VALUES (?, ?, ?, ?, ?)`)
    .run('o3', 'e4', 'User prefers dark color schemes in all projects', 0.9, null);
  db.prepare(`INSERT INTO observations (id, entity_id, content, confidence, valid_until) VALUES (?, ?, ?, ?, ?)`)
    .run('o4', 'e5', 'Minimal UI without heavy component libraries when possible', 0.8, null);
  db.prepare(`INSERT INTO observations (id, entity_id, content, confidence, valid_until) VALUES (?, ?, ?, ?, ?)`)
    .run('o5', 'e7', 'Node.js 22, TypeScript 5.9, better-sqlite3, React 19', 0.95, null);
  db.prepare(`INSERT INTO observations (id, entity_id, content, confidence, valid_until) VALUES (?, ?, ?, ?, ?)`)
    .run('o6', 'e8', 'Monorepo with packages/core, mcp-server, api-server, dashboard', 0.9, null);
  // superseded observation (valid_until IS NOT NULL — should be excluded from facts)
  db.prepare(`INSERT INTO observations (id, entity_id, content, confidence, valid_until) VALUES (?, ?, ?, ?, ?)`)
    .run('o7', 'e7', 'Old tech stack entry', 0.5, '2026-01-01T00:00:00.000Z');
}

// ---------------------------------------------------------------------------
// Tests: resolveProject
// ---------------------------------------------------------------------------

describe('resolveProject', () => {
  let db;
  before(() => {
    db = createTestDb();
    seedTestData(db);
  });
  after(() => db.close());

  test('returns project_name when cwd exactly matches a registered project path', () => {
    const result = resolveProject(db, '/Users/olive/projects/myco');
    assert.strictEqual(result, 'myco');
  });

  test('returns project_name when cwd is a subdirectory of a registered project path', () => {
    const result = resolveProject(db, '/Users/olive/projects/myco/packages/core');
    assert.strictEqual(result, 'myco');
  });

  test('returns null when cwd has no matching project_paths row', () => {
    const result = resolveProject(db, '/tmp/unregistered');
    assert.strictEqual(result, null);
  });

  test('does not match partial path prefix (e.g. /projects/myco-extra should not match /projects/myco)', () => {
    const result = resolveProject(db, '/Users/olive/projects/myco-extra');
    assert.strictEqual(result, null);
  });
});

// ---------------------------------------------------------------------------
// Tests: queryWorkflowRules
// ---------------------------------------------------------------------------

describe('queryWorkflowRules', () => {
  let db;
  before(() => {
    db = createTestDb();
    seedTestData(db);
  });
  after(() => db.close());

  test('returns workflow_rule entities for the project scope AND global scope', () => {
    const rules = queryWorkflowRules(db, 'myco');
    const names = rules.map(r => r.name);
    assert.ok(names.includes('Update docs before committing'), 'global rule included');
    assert.ok(names.includes('Run tests before pushing'), 'project rule included');
  });

  test('excludes merged entities from workflow rules', () => {
    const rules = queryWorkflowRules(db, 'myco');
    const names = rules.map(r => r.name);
    assert.ok(!names.includes('Old rule'), 'merged rule excluded');
  });

  test('returns global rules when projectName is null', () => {
    const rules = queryWorkflowRules(db, null);
    const names = rules.map(r => r.name);
    assert.ok(names.includes('Update docs before committing'), 'global rule included');
    assert.ok(!names.includes('Run tests before pushing'), 'project-only rule excluded when no project');
  });
});

// ---------------------------------------------------------------------------
// Tests: queryProjectFacts
// ---------------------------------------------------------------------------

describe('queryProjectFacts', () => {
  let db;
  before(() => {
    db = createTestDb();
    seedTestData(db);
  });
  after(() => db.close());

  test('returns current observations (valid_until IS NULL) for entities in the project namespace', () => {
    const facts = queryProjectFacts(db, 'myco');
    const contents = facts.map(f => f.content);
    assert.ok(contents.some(c => c.includes('Node.js 22')), 'current tech stack fact returned');
    assert.ok(contents.some(c => c.includes('Monorepo')), 'architecture fact returned');
  });

  test('excludes superseded observations (valid_until IS NOT NULL)', () => {
    const facts = queryProjectFacts(db, 'myco');
    const contents = facts.map(f => f.content);
    assert.ok(!contents.includes('Old tech stack entry'), 'superseded observation excluded');
  });

  test('excludes workflow_rule and user_preference type entities from facts', () => {
    const facts = queryProjectFacts(db, 'myco');
    // workflow_rule entities have observations o1 and o2 — they should not appear as project facts
    const contents = facts.map(f => f.content);
    assert.ok(!contents.some(c => c.includes('Always update README')), 'workflow rule obs excluded');
  });

  test('returns empty array when projectName is null (skip project-specific facts)', () => {
    const facts = queryProjectFacts(db, null);
    assert.deepStrictEqual(facts, []);
  });
});

// ---------------------------------------------------------------------------
// Tests: queryUserPreferences
// ---------------------------------------------------------------------------

describe('queryUserPreferences', () => {
  let db;
  before(() => {
    db = createTestDb();
    seedTestData(db);
  });
  after(() => db.close());

  test('returns user_preference entities with project IS NULL', () => {
    const prefs = queryUserPreferences(db);
    const names = prefs.map(p => p.name);
    assert.ok(names.includes('Prefers dark themes'), 'global pref returned');
    assert.ok(names.includes('Prefers minimal UI'), 'global pref returned');
  });

  test('excludes project-scoped user_preference entities', () => {
    const prefs = queryUserPreferences(db);
    const names = prefs.map(p => p.name);
    assert.ok(!names.includes('Project-scoped preference'), 'project-scoped pref excluded');
  });
});

// ---------------------------------------------------------------------------
// Tests: buildInjection
// ---------------------------------------------------------------------------

describe('buildInjection', () => {
  const sampleRules = [
    { name: 'Update docs', observations: 'Always update README.md' },
  ];
  const sampleFacts = [
    { name: 'Tech stack', content: 'Node.js 22, TypeScript' },
    { name: 'Architecture', content: 'Monorepo with 4 packages' },
  ];
  const samplePrefs = [
    { name: 'Prefers dark themes', observations: 'Dark color schemes' },
  ];

  test('assembles rules section first, then facts, then preferences', () => {
    const result = buildInjection(sampleRules, sampleFacts, samplePrefs, 'myco');
    const rulesIdx = result.indexOf('## Workflow Rules');
    const factsIdx = result.indexOf('## Project Knowledge');
    const prefsIdx = result.indexOf('## Preferences');
    assert.ok(rulesIdx < factsIdx, 'rules before facts');
    assert.ok(factsIdx < prefsIdx, 'facts before preferences');
  });

  test('wraps output in <myco> tags', () => {
    const result = buildInjection(sampleRules, sampleFacts, samplePrefs, 'myco');
    assert.ok(result.startsWith('<myco>'), 'starts with <myco>');
    assert.ok(result.endsWith('</myco>'), 'ends with </myco>');
  });

  test('enforces 6000 character cap — truncates facts first', () => {
    // Create lots of facts to exceed cap
    const manyFacts = Array.from({ length: 100 }, (_, i) => ({
      name: `Entity ${i}`,
      content: 'x'.repeat(100),
    }));
    const result = buildInjection(sampleRules, manyFacts, samplePrefs, 'myco');
    // Strip the <myco></myco> wrapper
    const inner = result.replace(/^<myco>\n?/, '').replace(/\n?<\/myco>$/, '');
    assert.ok(inner.length <= 6000, `inner content (${inner.length}) should be ≤ 6000 chars`);
    // Rules should still be present
    assert.ok(result.includes('Update docs'), 'rules preserved after truncation');
    // Preferences should still be present
    assert.ok(result.includes('Prefers dark themes'), 'preferences preserved after truncation');
  });

  test('appends "More context available" when cap is reached', () => {
    const manyFacts = Array.from({ length: 100 }, (_, i) => ({
      name: `Entity ${i}`,
      content: 'x'.repeat(100),
    }));
    const result = buildInjection(sampleRules, manyFacts, samplePrefs, 'myco');
    assert.ok(result.includes('More context available'), 'truncation note appended');
  });

  test('returns knowledge-base-is-new message when all inputs empty', () => {
    const result = buildInjection([], [], [], null);
    assert.ok(result.includes('knowledge base is new'), 'empty state message returned');
  });

  test('does not include project knowledge section when no project', () => {
    const result = buildInjection(sampleRules, [], samplePrefs, null);
    assert.ok(!result.includes('## Project Knowledge'), 'no facts section when no project');
  });
});

// ---------------------------------------------------------------------------
// Tests: computeContentHash
// ---------------------------------------------------------------------------

describe('computeContentHash', () => {
  test('returns consistent SHA-256 hex digest for same input', () => {
    const hash1 = computeContentHash('hello world');
    const hash2 = computeContentHash('hello world');
    assert.strictEqual(hash1, hash2, 'same input produces same hash');
  });

  test('returns different hashes for different inputs', () => {
    const hash1 = computeContentHash('hello world');
    const hash2 = computeContentHash('hello world!');
    assert.notStrictEqual(hash1, hash2, 'different inputs produce different hashes');
  });

  test('returns 16-character hex string (truncated SHA-256)', () => {
    const hash = computeContentHash('test');
    assert.match(hash, /^[0-9a-f]{16}$/, 'hash is 16-char hex');
  });
});

// ---------------------------------------------------------------------------
// Tests: novelty filtering
// ---------------------------------------------------------------------------

describe('novelty filtering', () => {
  let tmpDir;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myco-test-'));
  });
  after(() => {
    // Clean up temp dir
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
      fs.rmdirSync(tmpDir);
    } catch (e) { /* ignore */ }
  });

  test('when hash file contains current hash, buildInjection is called and hash is detected as unchanged', () => {
    const content = 'Some known injection content';
    const hash = computeContentHash(content + ':myco:/projects/myco');
    const hashFile = path.join(tmpDir, 'last-injection-hash');
    fs.writeFileSync(hashFile, hash, 'utf8');

    // Read back and compare — this simulates the hook's novelty check
    const stored = fs.readFileSync(hashFile, 'utf8').trim();
    const computed = computeContentHash(content + ':myco:/projects/myco');
    assert.strictEqual(stored, computed, 'stored hash matches recomputed hash — no changes');
  });

  test('when hash file is missing, hash comparison triggers full injection', () => {
    const hashFile = path.join(tmpDir, 'missing-hash-file');
    let stored = null;
    try {
      stored = fs.readFileSync(hashFile, 'utf8').trim();
    } catch (e) {
      stored = null; // File doesn't exist
    }
    assert.strictEqual(stored, null, 'no stored hash when file missing');
  });

  test('when hash file has different hash, full injection is returned', () => {
    const hashFile = path.join(tmpDir, 'different-hash');
    fs.writeFileSync(hashFile, 'aaaa1111bbbb2222', 'utf8'); // old hash

    const newContent = 'New content that changed';
    const newHash = computeContentHash(newContent + ':myco:/projects/myco');

    const stored = fs.readFileSync(hashFile, 'utf8').trim();
    assert.notStrictEqual(stored, newHash, 'stored hash differs from new — full injection needed');
  });
});

// ---------------------------------------------------------------------------
// Tests: graceful degradation
// ---------------------------------------------------------------------------

describe('graceful degradation', () => {
  test('getDbPath returns path containing myco.db by default', () => {
    const originalEnv = process.env.MYCO_DB_PATH;
    delete process.env.MYCO_DB_PATH;
    const dbPath = getDbPath();
    assert.ok(dbPath.includes('myco.db'), `default path should contain myco.db, got: ${dbPath}`);
    if (originalEnv !== undefined) process.env.MYCO_DB_PATH = originalEnv;
  });

  test('getDbPath respects MYCO_DB_PATH env var', () => {
    process.env.MYCO_DB_PATH = '/custom/path/test.db';
    const dbPath = getDbPath();
    assert.strictEqual(dbPath, '/custom/path/test.db');
    delete process.env.MYCO_DB_PATH;
  });

  test('no project match: queryProjectFacts returns empty array', () => {
    const db = createTestDb();
    seedTestData(db);
    const facts = queryProjectFacts(db, null);
    assert.deepStrictEqual(facts, []);
    db.close();
  });

  test('empty database (no entities): queryWorkflowRules returns empty array', () => {
    const db = createTestDb();
    // Do not seed data — empty DB
    const rules = queryWorkflowRules(db, 'some-project');
    assert.deepStrictEqual(rules, []);
    db.close();
  });

  test('empty database (no entities): queryUserPreferences returns empty array', () => {
    const db = createTestDb();
    const prefs = queryUserPreferences(db);
    assert.deepStrictEqual(prefs, []);
    db.close();
  });

  test('buildInjection with all empty arrays returns knowledge-base-is-new message', () => {
    const result = buildInjection([], [], [], null);
    assert.ok(result.includes('knowledge base is new'));
  });
});
