import type Database from 'better-sqlite3';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * Ordered list of incremental database migrations.
 * Each migration runs exactly once, tracked in the schema_migrations table.
 */
export const migrations: Migration[] = [
  {
    id: 9,
    name: 'create_project_paths',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_paths (
          id             TEXT PRIMARY KEY,
          project_name   TEXT NOT NULL,
          directory_path TEXT NOT NULL UNIQUE,
          created_at     TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_project_paths_directory ON project_paths(directory_path)`);
    },
  },
];

/**
 * Run all pending migrations against the database.
 * Ensures schema_migrations tracking table exists, then executes any
 * migrations whose id is not yet recorded.
 *
 * Safe to call on every startup — already-applied migrations are skipped.
 */
export function runMigrations(db: Database.Database): void {
  // Ensure the migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    const existing = db
      .prepare(`SELECT id FROM schema_migrations WHERE id = ?`)
      .get(migration.id);

    if (!existing) {
      migration.up(db);
      db.prepare(`INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)`)
        .run(migration.id, migration.name, new Date().toISOString());
    }
  }
}
