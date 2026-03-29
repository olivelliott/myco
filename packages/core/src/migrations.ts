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
  {
    id: 5,
    name: 'add_temporal_columns',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE observations ADD COLUMN valid_from TEXT DEFAULT NULL`);
      } catch {
        // Column already exists
      }
      try {
        db.exec(`ALTER TABLE observations ADD COLUMN valid_until TEXT DEFAULT NULL`);
      } catch {
        // Column already exists
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_valid_from ON observations(valid_from)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_valid_until ON observations(valid_until) WHERE valid_until IS NOT NULL`);
    },
  },
  {
    id: 6,
    name: 'add_decay_columns',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE observations ADD COLUMN last_accessed_at TEXT DEFAULT NULL`);
      } catch {
        // Column already exists
      }
      try {
        db.exec(`ALTER TABLE observations ADD COLUMN decay_exempt INTEGER NOT NULL DEFAULT 0`);
      } catch {
        // Column already exists
      }
      try {
        db.exec(`ALTER TABLE observations ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 1`);
      } catch {
        // Column already exists
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_last_accessed ON observations(last_accessed_at)`);
    },
  },
  {
    id: 7,
    name: 'add_relationship_strength',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE relationships ADD COLUMN strength REAL NOT NULL DEFAULT 1.0`);
      } catch {
        // Column already exists
      }
      try {
        db.exec(`ALTER TABLE relationships ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 1`);
      } catch {
        // Column already exists
      }
    },
  },
  {
    id: 8,
    name: 'add_entity_merged_into',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE entities ADD COLUMN merged_into TEXT DEFAULT NULL`);
      } catch {
        // Column already exists
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_merged_into ON entities(merged_into) WHERE merged_into IS NOT NULL`);
    },
  },
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
  {
    id: 10,
    name: 'add_entity_decay_exempt',
    up: (db) => {
      try {
        db.exec(`ALTER TABLE entities ADD COLUMN decay_exempt INTEGER NOT NULL DEFAULT 0`);
      } catch {
        // Column already exists
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_decay_exempt ON entities(decay_exempt) WHERE decay_exempt = 1`);
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
