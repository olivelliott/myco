import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openDatabase } from '../src/index.js';
import { generateSessionId, buildProvenance } from '../src/index.js';

// Helper: create a temp dir, return its path, register for cleanup
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myco-test-'));
}

describe('openDatabase()', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a file at the specified path', () => {
    openDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('returns a database with WAL journal_mode', () => {
    const db = openDatabase(dbPath);
    const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
    expect(result[0].journal_mode).toBe('wal');
    db.close();
  });

  it('has foreign_keys pragma ON', () => {
    const db = openDatabase(dbPath);
    const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(result[0].foreign_keys).toBe(1);
    db.close();
  });

  it('creates all 6 schema tables', () => {
    const db = openDatabase(dbPath);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('entities');
    expect(tableNames).toContain('observations');
    expect(tableNames).toContain('relationships');
    expect(tableNames).toContain('episodes');
    expect(tableNames).toContain('approval_queue');
    db.close();
  });

  it('creates vec_embeddings virtual table', () => {
    const db = openDatabase(dbPath);
    const vtables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' OR type='shadow' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = vtables.map((t) => t.name);
    // vec0 tables show up with the base name
    expect(names.some((n) => n.includes('vec_embeddings'))).toBe(true);
    db.close();
  });

  it('entities table has required columns including provenance', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(entities)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('type');
    expect(colNames).toContain('summary');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('source_type');
    expect(colNames).toContain('confidence');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
    db.close();
  });

  it('observations table has required columns including provenance', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(observations)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('entity_id');
    expect(colNames).toContain('content');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('source_type');
    expect(colNames).toContain('confidence');
    expect(colNames).toContain('created_at');
    db.close();
  });

  it('relationships table has required columns including provenance', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(relationships)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('from_id');
    expect(colNames).toContain('to_id');
    expect(colNames).toContain('type');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('source_type');
    expect(colNames).toContain('confidence');
    expect(colNames).toContain('created_at');
    db.close();
  });

  it('relationships table has UNIQUE constraint on (from_id, to_id, type)', () => {
    const db = openDatabase(dbPath);
    const indexes = db
      .prepare(`PRAGMA index_list(relationships)`)
      .all() as Array<{ name: string; unique: number }>;
    const uniqueIndexes = indexes.filter((i) => i.unique === 1);
    // There should be at least one unique index covering (from_id, to_id, type)
    expect(uniqueIndexes.length).toBeGreaterThan(0);
    // Verify it covers the right columns by checking one of them
    let found = false;
    for (const idx of uniqueIndexes) {
      const idxCols = db
        .prepare(`PRAGMA index_info(${idx.name})`)
        .all() as Array<{ name: string }>;
      const names = idxCols.map((c) => c.name);
      if (names.includes('from_id') && names.includes('to_id') && names.includes('type')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    db.close();
  });

  it('episodes table has required columns', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(episodes)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('event_type');
    expect(colNames).toContain('payload');
    expect(colNames).toContain('created_at');
    db.close();
  });

  it('approval_queue table has required columns', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(approval_queue)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('item_type');
    expect(colNames).toContain('item_id');
    expect(colNames).toContain('status');
    expect(colNames).toContain('reason');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('resolved_at');
    db.close();
  });

  it('vec_embeddings virtual table accepts float[768] vectors', () => {
    const db = openDatabase(dbPath);
    // Insert a row with a 768-dim vector to confirm the table is functional
    const embedding = new Float32Array(768).fill(0.1);
    expect(() => {
      db.prepare(
        `INSERT INTO vec_embeddings(item_id, item_type, embedding) VALUES (?, ?, ?)`
      ).run('test-id', 'entity', embedding);
    }).not.toThrow();
    db.close();
  });

  it('uses MYCO_DB_PATH env var when set', () => {
    const envPath = path.join(tempDir, 'env-override.db');
    const originalEnv = process.env.MYCO_DB_PATH;
    process.env.MYCO_DB_PATH = envPath;
    try {
      openDatabase(); // no explicit path — should use env var
      expect(fs.existsSync(envPath)).toBe(true);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.MYCO_DB_PATH;
      } else {
        process.env.MYCO_DB_PATH = originalEnv;
      }
    }
  });

  it('default path contains myco.db when no env vars set', () => {
    // Verify the default DB path resolution uses 'myco/myco.db'
    const originalMyco = process.env.MYCO_DB_PATH;
    const originalXdg = process.env.XDG_DATA_HOME;
    delete process.env.MYCO_DB_PATH;
    // Point XDG_DATA_HOME to tempDir to avoid creating real home dir files
    process.env.XDG_DATA_HOME = tempDir;
    try {
      const db = openDatabase();
      const dbFilePath = db.name;
      db.close();
      expect(dbFilePath).toContain('myco');
      expect(dbFilePath).toContain('myco.db');
    } finally {
      if (originalMyco === undefined) { delete process.env.MYCO_DB_PATH; } else { process.env.MYCO_DB_PATH = originalMyco; }
      if (originalXdg === undefined) { delete process.env.XDG_DATA_HOME; } else { process.env.XDG_DATA_HOME = originalXdg; }
    }
  });

  it('calling openDatabase() twice on same path does not error', () => {
    const db1 = openDatabase(dbPath);
    db1.close();
    expect(() => {
      const db2 = openDatabase(dbPath);
      db2.close();
    }).not.toThrow();
  });

  it('schema_migrations table exists after openDatabase', () => {
    const db = openDatabase(dbPath);
    const result = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`)
      .get() as { name: string } | undefined;
    expect(result).toBeDefined();
    expect(result?.name).toBe('schema_migrations');
    db.close();
  });

  it('schema_migrations table has 9 applied migrations', () => {
    const db = openDatabase(dbPath);
    const result = db
      .prepare(`SELECT COUNT(*) as cnt FROM schema_migrations`)
      .get() as { cnt: number };
    expect(result.cnt).toBe(9);
    db.close();
  });

  it('observations table has v5.0 temporal columns (valid_from, valid_until)', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(observations)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('valid_from');
    expect(colNames).toContain('valid_until');
    db.close();
  });

  it('observations table has v5.0 decay columns', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(observations)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('last_accessed_at');
    expect(colNames).toContain('decay_exempt');
    expect(colNames).toContain('strength');
    expect(colNames).toContain('reinforcement_count');
    db.close();
  });

  it('entities table has merged_into column', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(entities)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('merged_into');
    db.close();
  });

  it('relationships table has strength columns', () => {
    const db = openDatabase(dbPath);
    const cols = db
      .prepare(`PRAGMA table_info(relationships)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('strength');
    expect(colNames).toContain('reinforcement_count');
    db.close();
  });
});

describe('generateSessionId()', () => {
  it('returns a string of approximately 21 characters', () => {
    const id = generateSessionId();
    expect(typeof id).toBe('string');
    // nanoid default is 21 chars
    expect(id.length).toBe(21);
  });

  it('returns unique IDs on each call', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).not.toBe(id2);
  });
});

describe('buildProvenance()', () => {
  it('returns object with all provenance fields', () => {
    const sessionId = generateSessionId();
    const prov = buildProvenance(sessionId, 'test-agent', 'agent_session', 0.9);
    expect(prov.session_id).toBe(sessionId);
    expect(prov.agent_id).toBe('test-agent');
    expect(prov.source_type).toBe('agent_session');
    expect(prov.confidence).toBe(0.9);
    expect(typeof prov.created_at).toBe('string');
    // Should be ISO 8601
    expect(() => new Date(prov.created_at)).not.toThrow();
  });

  it('defaults agent_id to "unknown" when omitted', () => {
    const prov = buildProvenance(generateSessionId());
    expect(prov.agent_id).toBe('unknown');
  });

  it('defaults source_type to "agent_session" when omitted', () => {
    const prov = buildProvenance(generateSessionId());
    expect(prov.source_type).toBe('agent_session');
  });

  it('defaults confidence to 1.0 when omitted', () => {
    const prov = buildProvenance(generateSessionId());
    expect(prov.confidence).toBe(1.0);
  });

  it('returns a created_at timestamp as ISO 8601 string', () => {
    const prov = buildProvenance(generateSessionId());
    const date = new Date(prov.created_at);
    expect(date.getTime()).not.toBeNaN();
  });
});
