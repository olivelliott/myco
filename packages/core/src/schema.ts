import type Database from 'better-sqlite3';

export function applySchema(db: Database.Database): void {
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

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_observations_entity_id ON observations(entity_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_from_id ON relationships(from_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_to_id ON relationships(to_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_session_id ON episodes(session_id);
    CREATE INDEX IF NOT EXISTS idx_episodes_agent_id ON episodes(agent_id);
    CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(status);
  `);

  // Migration: add needs_embedding column to observations (safe to run on startup)
  try {
    db.exec(`ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists — expected on databases created after this migration shipped
  }

  // Index for efficient re-embedding queue queries
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_needs_embedding ON observations(needs_embedding) WHERE needs_embedding = 1`);
  } catch {
    // Index may already exist
  }

  // Migration: add consolidated_at column to episodes (NULL = unconsolidated)
  try {
    db.exec(`ALTER TABLE episodes ADD COLUMN consolidated_at TEXT`);
  } catch {
    // Column already exists
  }

  // Index for efficient unconsolidated episode queries
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_unconsolidated ON episodes(consolidated_at) WHERE consolidated_at IS NULL`);
  } catch {
    // Index may already exist
  }

  // Migration: add metadata column to approval_queue for storing proposed fact payloads as JSON
  try {
    db.exec(`ALTER TABLE approval_queue ADD COLUMN metadata TEXT`);
  } catch {
    // Column already exists
  }

  // Migration: add project column for namespace isolation (Phase 12)
  try {
    db.exec(`ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL`);
  } catch {
    // Column already exists
  }

  // Index for project-scoped queries
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)`);
  } catch {
    // Index may already exist
  }
}
