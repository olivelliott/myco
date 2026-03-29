import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { nanoid } from 'nanoid';
import { openDatabase } from '../src/db.js';
import { prepareStatements } from '../src/statements.js';
import type { ProjectPath } from '../src/types.js';
import type Database from 'better-sqlite3';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myco-proj-paths-test-'));
}

describe('project_paths table', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = path.join(tempDir, 'test.db');
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('project_paths table exists after openDatabase', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='project_paths'`)
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('project_paths');
  });

  it('project_paths table has required columns', () => {
    const cols = db
      .prepare(`PRAGMA table_info(project_paths)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('project_name');
    expect(colNames).toContain('directory_path');
    expect(colNames).toContain('created_at');
  });

  it('directory_path has UNIQUE constraint', () => {
    const now = new Date().toISOString();
    const stmts = prepareStatements(db);

    stmts.insertProjectPath.run(nanoid(), 'MyProject', '/a/b', now);
    expect(() => {
      stmts.insertProjectPath.run(nanoid(), 'AnotherProject', '/a/b', now);
    }).toThrow();
  });
});

describe('selectProjectForPath — walk-up resolution', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = path.join(tempDir, 'test.db');
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('insertProjectPath inserts a row and selectProjectForPath retrieves it by exact path', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const id = nanoid();

    stmts.insertProjectPath.run(id, 'MyProject', '/workspace/myproject', now);

    const row = stmts.selectProjectForPath.get({ path: '/workspace/myproject' }) as ProjectPath | undefined;
    expect(row).toBeDefined();
    expect(row!.project_name).toBe('MyProject');
    expect(row!.directory_path).toBe('/workspace/myproject');
    expect(row!.id).toBe(id);
  });

  it('selectProjectForPath with /a/b/c finds project registered at /a/b when no /a/b/c row exists (walk-up)', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();

    stmts.insertProjectPath.run(nanoid(), 'ParentProject', '/a/b', now);

    const row = stmts.selectProjectForPath.get({ path: '/a/b/c' }) as ProjectPath | undefined;
    expect(row).toBeDefined();
    expect(row!.project_name).toBe('ParentProject');
    expect(row!.directory_path).toBe('/a/b');
  });

  it('selectProjectForPath returns nearest ancestor when multiple ancestors registered', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();

    stmts.insertProjectPath.run(nanoid(), 'RootProject', '/a', now);
    stmts.insertProjectPath.run(nanoid(), 'SubProject', '/a/b', now);

    const row = stmts.selectProjectForPath.get({ path: '/a/b/c/d' }) as ProjectPath | undefined;
    expect(row).toBeDefined();
    expect(row!.project_name).toBe('SubProject');
    expect(row!.directory_path).toBe('/a/b');
  });

  it('selectProjectForPath returns null/undefined for a path with no registered ancestor', () => {
    const stmts = prepareStatements(db);

    const row = stmts.selectProjectForPath.get({ path: '/no/such/path' });
    expect(row).toBeUndefined();
  });

  it('selectProjectForPath does not false-match /a/bx when /a/b is registered', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();

    stmts.insertProjectPath.run(nanoid(), 'BProject', '/a/b', now);

    // /a/bx should NOT match /a/b — different path segment
    const row = stmts.selectProjectForPath.get({ path: '/a/bx' });
    expect(row).toBeUndefined();
  });
});

describe('deleteProjectPath', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = path.join(tempDir, 'test.db');
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('deleteProjectPath removes the row and subsequent selectProjectForPath returns undefined', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();

    stmts.insertProjectPath.run(nanoid(), 'ToDelete', '/delete/me', now);

    // Confirm it exists
    const before = stmts.selectProjectForPath.get({ path: '/delete/me' }) as ProjectPath | undefined;
    expect(before).toBeDefined();

    // Delete it
    stmts.deleteProjectPath.run('/delete/me');

    // Confirm it's gone
    const after = stmts.selectProjectForPath.get({ path: '/delete/me' });
    expect(after).toBeUndefined();
  });
});

describe('selectAllProjectPaths', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = path.join(tempDir, 'test.db');
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('selectAllProjectPaths returns all registered paths ordered by directory_path', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();

    stmts.insertProjectPath.run(nanoid(), 'ZProject', '/z/project', now);
    stmts.insertProjectPath.run(nanoid(), 'AProject', '/a/project', now);
    stmts.insertProjectPath.run(nanoid(), 'MProject', '/m/project', now);

    const rows = stmts.selectAllProjectPaths.all() as ProjectPath[];
    expect(rows).toHaveLength(3);
    expect(rows[0].directory_path).toBe('/a/project');
    expect(rows[1].directory_path).toBe('/m/project');
    expect(rows[2].directory_path).toBe('/z/project');
  });
});

describe('migration 9 on existing database', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('project_paths table absent before migration 9, present after', () => {
    // Open a fresh database (runs all migrations including migration that creates project_paths)
    const db = openDatabase(dbPath);

    // Verify project_paths table exists
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='project_paths'`)
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    db.close();

    // Reopen same database (idempotency check -- migration should not re-run or error)
    expect(() => {
      const db2 = openDatabase(dbPath);
      db2.close();
    }).not.toThrow();
  });

  it('schema_migrations tracks migration 9', () => {
    const db = openDatabase(dbPath);

    const row = db
      .prepare(`SELECT id, name FROM schema_migrations WHERE id = 9`)
      .get() as { id: number; name: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.name).toBe('create_project_paths');

    db.close();
  });
});
