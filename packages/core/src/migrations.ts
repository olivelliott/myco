import type Database from 'better-sqlite3';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    id: 1,
    name: 'add_needs_embedding',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0`);
      } catch {
        // Column already exists — expected on databases created before this migration framework
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_needs_embedding ON observations(needs_embedding) WHERE needs_embedding = 1`);
    },
  },
  {
    id: 2,
    name: 'add_consolidated_at',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE episodes ADD COLUMN consolidated_at TEXT`);
      } catch {
        // Column already exists — expected on databases created before this migration framework
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_unconsolidated ON episodes(consolidated_at) WHERE consolidated_at IS NULL`);
    },
  },
  {
    id: 3,
    name: 'add_approval_metadata',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE approval_queue ADD COLUMN metadata TEXT`);
      } catch {
        // Column already exists — expected on databases created before this migration framework
      }
    },
  },
  {
    id: 4,
    name: 'add_entity_project',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL`);
      } catch {
        // Column already exists — expected on databases created before this migration framework
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)`);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  // Create the tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    )
  `);

  // Get set of already-applied migration IDs
  const applied = new Set<number>(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map((r) => r.id)
  );

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    const applyMigration = db.transaction(() => {
      migration.up(db);
      insertMigration.run(migration.id, migration.name, new Date().toISOString());
    });

    applyMigration();
    process.stderr.write(`[myco] Applied migration ${migration.id}: ${migration.name}\n`);
  }
}
