import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMigrations } from './migrations.js';

function getDefaultDbPath(): string {
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, 'myco', 'myco.db');
}

export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.MYCO_DB_PATH ?? getDefaultDbPath();

  // Auto-create directory (D-03)
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);

  // 1. Load sqlite-vec extension FIRST (before any vec0 usage)
  sqliteVec.load(db);

  // 2. Set connection PRAGMAs (outside any transaction)
  db.pragma('journal_mode = WAL');   // persistent after first run (CORE-02)
  db.pragma('foreign_keys = ON');    // connection-lifetime only
  db.pragma('busy_timeout = 5000');  // connection-lifetime only
  db.pragma('synchronous = NORMAL'); // safe with WAL, better perf

  // 3. Run schema migrations
  runMigrations(db);

  return db;
}
