import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '../src/migrations.js';
import { applySchema } from '../src/schema.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myco-migrations-test-'));
}

function openRawDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('runMigrations()', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates schema_migrations table with 11 rows on fresh DB', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    const count = db.prepare('SELECT COUNT(*) as cnt FROM schema_migrations').get() as { cnt: number };
    expect(count.cnt).toBe(11);
    db.close();
  });

  it('creates all 6 core tables on fresh DB', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map(t => t.name);
    expect(names).toContain('entities');
    expect(names).toContain('observations');
    expect(names).toContain('relationships');
    expect(names).toContain('episodes');
    expect(names).toContain('approval_queue');
    expect(names).toContain('schema_migrations');
    db.close();
  });

  it('creates vec_embeddings virtual table on fresh DB', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    const vtables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' OR type='shadow' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = vtables.map(t => t.name);
    expect(names.some(n => n.includes('vec_embeddings'))).toBe(true);
    db.close();
  });

  it('is idempotent — calling runMigrations twice does not throw', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });

  it('still has 11 rows after calling runMigrations twice', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    runMigrations(db);
    const count = db.prepare('SELECT COUNT(*) as cnt FROM schema_migrations').get() as { cnt: number };
    expect(count.cnt).toBe(11);
    db.close();
  });

  it('observations table has v5.0 temporal columns after runMigrations', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('valid_from');
    expect(colNames).toContain('valid_until');
    db.close();
  });

  it('observations table has v5.0 decay columns after runMigrations', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(observations)').all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('last_accessed_at');
    expect(colNames).toContain('decay_exempt');
    expect(colNames).toContain('strength');
    expect(colNames).toContain('reinforcement_count');
    db.close();
  });

  it('entities table has merged_into column after runMigrations', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(entities)').all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('merged_into');
    db.close();
  });

  it('relationships table has strength and reinforcement_count after runMigrations', () => {
    const db = openRawDb(dbPath);
    applySchema(db);
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(relationships)').all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('strength');
    expect(colNames).toContain('reinforcement_count');
    db.close();
  });

  it('skips already-applied migrations on v4.0-style existing DB (columnExists guard)', () => {
    // Simulate a v4.0 database: apply the baseline DDL + manually add the v3.x columns
    const db = openRawDb(dbPath);

    // Create baseline tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, summary TEXT,
        metadata TEXT NOT NULL DEFAULT '{}', session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'unknown', source_type TEXT NOT NULL DEFAULT 'agent_session',
        confidence REAL NOT NULL DEFAULT 1.0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        content TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'unknown', source_type TEXT NOT NULL DEFAULT 'agent_session',
        confidence REAL NOT NULL DEFAULT 1.0, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY, from_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE, type TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}', session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'unknown', source_type TEXT NOT NULL DEFAULT 'agent_session',
        confidence REAL NOT NULL DEFAULT 1.0, created_at TEXT NOT NULL,
        UNIQUE(from_id, to_id, type)
      );
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'unknown', event_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approval_queue (
        id TEXT PRIMARY KEY, item_type TEXT NOT NULL, item_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', reason TEXT,
        created_at TEXT NOT NULL, resolved_at TEXT
      );
    `);

    // Simulate v3.x migrations already applied (the columns already exist)
    db.exec(`ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE episodes ADD COLUMN consolidated_at TEXT`);
    db.exec(`ALTER TABLE approval_queue ADD COLUMN metadata TEXT`);
    db.exec(`ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL`);

    // Now run migrations — should not throw even though those columns already exist
    expect(() => runMigrations(db)).not.toThrow();

    // Should have 11 rows recorded
    const count = db.prepare('SELECT COUNT(*) as cnt FROM schema_migrations').get() as { cnt: number };
    expect(count.cnt).toBe(11);

    db.close();
  });
});
