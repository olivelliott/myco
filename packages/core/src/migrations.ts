import type Database from 'better-sqlite3';

interface Migration {
  version: string;
  up: (db: Database.Database) => void;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const info = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return info.some(row => row.name === column);
}

const MIGRATIONS: Migration[] = [
  {
    version: '001_baseline',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS entities (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          type        TEXT NOT NULL,
          summary     TEXT,
          metadata    TEXT NOT NULL DEFAULT '{}',
          session_id  TEXT NOT NULL,
          agent_id    TEXT NOT NULL DEFAULT 'unknown',
          source_type TEXT NOT NULL DEFAULT 'agent_session',
          confidence  REAL NOT NULL DEFAULT 1.0,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS observations (
          id          TEXT PRIMARY KEY,
          entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          content     TEXT NOT NULL,
          metadata    TEXT NOT NULL DEFAULT '{}',
          session_id  TEXT NOT NULL,
          agent_id    TEXT NOT NULL DEFAULT 'unknown',
          source_type TEXT NOT NULL DEFAULT 'agent_session',
          confidence  REAL NOT NULL DEFAULT 1.0,
          created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS relationships (
          id           TEXT PRIMARY KEY,
          from_id      TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          to_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          type         TEXT NOT NULL,
          metadata     TEXT NOT NULL DEFAULT '{}',
          session_id   TEXT NOT NULL,
          agent_id     TEXT NOT NULL DEFAULT 'unknown',
          source_type  TEXT NOT NULL DEFAULT 'agent_session',
          confidence   REAL NOT NULL DEFAULT 1.0,
          created_at   TEXT NOT NULL,
          UNIQUE(from_id, to_id, type)
        );

        CREATE TABLE IF NOT EXISTS episodes (
          id          TEXT PRIMARY KEY,
          session_id  TEXT NOT NULL,
          agent_id    TEXT NOT NULL DEFAULT 'unknown',
          event_type  TEXT NOT NULL,
          payload     TEXT NOT NULL DEFAULT '{}',
          created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS approval_queue (
          id           TEXT PRIMARY KEY,
          item_type    TEXT NOT NULL,
          item_id      TEXT NOT NULL,
          status       TEXT NOT NULL DEFAULT 'pending',
          reason       TEXT,
          created_at   TEXT NOT NULL,
          resolved_at  TEXT
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
          item_id     TEXT NOT NULL,
          item_type   TEXT NOT NULL,
          embedding   float[768]
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_observations USING fts5(
          content,
          observation_id UNINDEXED,
          tokenize = 'porter unicode61'
        );

        CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
        CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
        CREATE INDEX IF NOT EXISTS idx_observations_entity_id ON observations(entity_id);
        CREATE INDEX IF NOT EXISTS idx_relationships_from_id ON relationships(from_id);
        CREATE INDEX IF NOT EXISTS idx_relationships_to_id ON relationships(to_id);
        CREATE INDEX IF NOT EXISTS idx_episodes_session_id ON episodes(session_id);
        CREATE INDEX IF NOT EXISTS idx_episodes_agent_id ON episodes(agent_id);
        CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(status);
      `);
    },
  },
  {
    version: '002_observations_needs_embedding',
    up: (db) => {
      if (!columnExists(db, 'observations', 'needs_embedding')) {
        db.exec(`ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_needs_embedding ON observations(needs_embedding) WHERE needs_embedding = 1`);
    },
  },
  {
    version: '003_episodes_consolidated_at',
    up: (db) => {
      if (!columnExists(db, 'episodes', 'consolidated_at')) {
        db.exec(`ALTER TABLE episodes ADD COLUMN consolidated_at TEXT`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_unconsolidated ON episodes(consolidated_at) WHERE consolidated_at IS NULL`);
    },
  },
  {
    version: '004_approval_queue_metadata',
    up: (db) => {
      if (!columnExists(db, 'approval_queue', 'metadata')) {
        db.exec(`ALTER TABLE approval_queue ADD COLUMN metadata TEXT`);
      }
    },
  },
  {
    version: '005_entities_project',
    up: (db) => {
      if (!columnExists(db, 'entities', 'project')) {
        db.exec(`ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)`);
    },
  },
  {
    version: '006_observations_temporal',
    up: (db) => {
      if (!columnExists(db, 'observations', 'valid_from')) {
        db.exec(`ALTER TABLE observations ADD COLUMN valid_from  TEXT`);
      }
      if (!columnExists(db, 'observations', 'valid_until')) {
        db.exec(`ALTER TABLE observations ADD COLUMN valid_until TEXT`);
      }
    },
  },
  {
    version: '007_observations_decay',
    up: (db) => {
      if (!columnExists(db, 'observations', 'last_accessed_at')) {
        db.exec(`ALTER TABLE observations ADD COLUMN last_accessed_at    TEXT`);
      }
      if (!columnExists(db, 'observations', 'decay_exempt')) {
        db.exec(`ALTER TABLE observations ADD COLUMN decay_exempt        INTEGER NOT NULL DEFAULT 0`);
      }
      if (!columnExists(db, 'observations', 'strength')) {
        db.exec(`ALTER TABLE observations ADD COLUMN strength            REAL    NOT NULL DEFAULT 1.0`);
      }
      if (!columnExists(db, 'observations', 'reinforcement_count')) {
        db.exec(`ALTER TABLE observations ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 0`);
      }
    },
  },
  {
    version: '008_entities_merged_into',
    up: (db) => {
      if (!columnExists(db, 'entities', 'merged_into')) {
        db.exec(`ALTER TABLE entities ADD COLUMN merged_into TEXT REFERENCES entities(id)`);
      }
    },
  },
  {
    version: '009_relationships_strength',
    up: (db) => {
      if (!columnExists(db, 'relationships', 'strength')) {
        db.exec(`ALTER TABLE relationships ADD COLUMN strength            REAL    NOT NULL DEFAULT 1.0`);
      }
      if (!columnExists(db, 'relationships', 'reinforcement_count')) {
        db.exec(`ALTER TABLE relationships ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 0`);
      }
    },
  },
  {
    version: '010_consolidation_lock',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS consolidation_lock (
          id         TEXT PRIMARY KEY DEFAULT 'singleton',
          locked_at  TEXT NOT NULL,
          locked_by  TEXT NOT NULL DEFAULT 'unknown'
        )
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  // Ensure the migrations tracking table exists before querying it
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    )
  `);

  const checkApplied = db.prepare(
    `SELECT 1 FROM schema_migrations WHERE version = ?`
  );
  const recordMigration = db.prepare(
    `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`
  );

  for (const migration of MIGRATIONS) {
    if (checkApplied.get(migration.version)) continue;

    // Run migration + record it atomically — per-migration transaction for isolation
    db.transaction(() => {
      migration.up(db);
      recordMigration.run(migration.version, new Date().toISOString());
    })();
  }
}
