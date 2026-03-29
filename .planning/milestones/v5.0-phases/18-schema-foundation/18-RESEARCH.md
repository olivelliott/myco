# Phase 18: Schema Foundation - Research

**Researched:** 2026-03-27
**Domain:** SQLite schema migration framework (better-sqlite3, TypeScript)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — infrastructure phase. All implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key research findings to incorporate:
- Replace existing try/catch ALTER TABLE pattern with a `schema_migrations` table
- Add temporal columns (valid_from, valid_until) to observations
- Add importance/strength columns to observations and relationships
- Add merged_into column to entities for soft-delete merges
- Add last_accessed_at to observations for decay tracking
- All migrations must be idempotent and safe on existing databases

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | System uses a versioned schema migration framework instead of try/catch ALTER TABLE pattern | Migration table design, numbered migration files, idempotency via `applied_at` tracking |
| INFRA-02 | Existing databases upgrade cleanly on startup with no data loss | ALTER TABLE with safe defaults, `IF NOT EXISTS` guard on migrations table, single-direction migrations only |
</phase_requirements>

## Summary

Phase 18 replaces the current ad-hoc `try/catch ALTER TABLE` pattern in `packages/core/src/schema.ts` with a proper versioned migration framework backed by a `schema_migrations` table. The migration runner executes each numbered migration exactly once, checks `schema_migrations` before applying, and inserts a row with an `applied_at` timestamp on success. All migrations are append-only — never modified after shipping.

The phase also adds seven new columns required by downstream v5.0 phases (temporal versioning, decay, merges): `valid_from`, `valid_until`, `last_accessed_at`, `decay_exempt`, `strength`, `reinforcement_count` on `observations`; `merged_into` on `entities`; `strength` and `reinforcement_count` on `relationships`. Every new column must have a safe `DEFAULT` so existing rows are valid immediately after the `ALTER TABLE` without a data migration.

TypeScript interfaces in `packages/core/src/types.ts` must be updated to reflect all new columns. Prepared statements in `statements.ts` that INSERT into affected tables need updating only where the new columns are NOT NULL without a default — which is not the case here, so INSERT statements that omit new nullable/defaulted columns remain valid SQL.

**Primary recommendation:** Implement the migration framework as a single `runMigrations(db)` function in a new `packages/core/src/migrations.ts` file. Replace the `applySchema()` call in `openDatabase()` with `runMigrations(db)`. Keep existing `CREATE TABLE IF NOT EXISTS` DDL as Migration 001 (baseline) and promote each existing try/catch block to numbered migrations 002–006. Add new v5.0 column migrations as 007–010.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | SQLite driver | Already in use — synchronous API ideal for startup migration runner |
| TypeScript | ~5.9.0 | Language | Already in use — typed migration records prevent schema drift |

No new dependencies are needed for this phase. The migration framework is ~60 lines of TypeScript using only better-sqlite3 and the existing project runtime.

### No New Dependencies
This phase is entirely in-codebase. Adding an ORM (Drizzle, Knex, Prisma) would be disproportionate overhead for a single-file migration runner. The project CLAUDE.md explicitly prefers raw SQL via better-sqlite3 over ORMs.

## Architecture Patterns

### Recommended Project Structure

```
packages/core/src/
├── migrations.ts        # NEW — migration runner + ordered migration list
├── schema.ts            # MODIFIED — split into baseline DDL + individual migrations
├── db.ts                # MODIFIED — call runMigrations() instead of applySchema()
├── types.ts             # MODIFIED — add new column fields to interfaces
└── statements.ts        # MODIFIED — update INSERT statements that mention column lists
```

### Pattern 1: schema_migrations Table

**What:** A table that tracks which migrations have been applied, identified by a string version key.
**When to use:** Always — the table is created in the first migration and guards every subsequent one.

```typescript
// Migration table DDL — created once, never altered
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL
  )
`);
```

The `version` column holds a sortable string like `'001_baseline'`. The PRIMARY KEY uniqueness constraint is the idempotency guard — a second attempt to INSERT the same version throws, so the caller checks `SELECT 1 FROM schema_migrations WHERE version = ?` before running the migration SQL.

### Pattern 2: Numbered Migration Array

**What:** An ordered array of `{ version, up }` objects. The runner iterates in order and skips applied versions.
**When to use:** All migrations are defined here — no file-system scanning, no dynamic imports.

```typescript
// Source: codebase convention — synchronous better-sqlite3 pattern
interface Migration {
  version: string;  // e.g. '001_baseline'
  up: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: '001_baseline',
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS entities (...)`);
      // ... all other CREATE TABLE IF NOT EXISTS statements
    },
  },
  {
    version: '002_observations_needs_embedding',
    up: (db) => {
      db.exec(`ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_needs_embedding ON observations(needs_embedding) WHERE needs_embedding = 1`);
    },
  },
  // ... additional migrations
];
```

### Pattern 3: Migration Runner Function

**What:** Wraps the migration loop in a single SQLite transaction per migration (not one giant transaction).
**When to use:** Always — per-migration transactions mean a partial failure only rolls back that migration, not all prior work.

```typescript
export function runMigrations(db: Database.Database): void {
  // Ensure the migrations table exists before we query it
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    )
  `);

  for (const migration of MIGRATIONS) {
    const already = db.prepare(
      `SELECT 1 FROM schema_migrations WHERE version = ?`
    ).get(migration.version);

    if (already) continue;

    // Run migration + record it atomically
    db.transaction(() => {
      migration.up(db);
      db.prepare(
        `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`
      ).run(migration.version, new Date().toISOString());
    })();
  }
}
```

### Pattern 4: New Column Migrations

**What:** Each new v5.0 column is a separate numbered migration. Safe defaults ensure no NULL violations on existing rows.
**When to use:** Any column addition to an existing table.

```typescript
// Observations — temporal versioning columns
{
  version: '007_observations_temporal',
  up: (db) => {
    db.exec(`ALTER TABLE observations ADD COLUMN valid_from  TEXT`);
    db.exec(`ALTER TABLE observations ADD COLUMN valid_until TEXT`);
  },
},
// Observations — decay columns
{
  version: '008_observations_decay',
  up: (db) => {
    db.exec(`ALTER TABLE observations ADD COLUMN last_accessed_at    TEXT`);
    db.exec(`ALTER TABLE observations ADD COLUMN decay_exempt        INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE observations ADD COLUMN strength            REAL    NOT NULL DEFAULT 1.0`);
    db.exec(`ALTER TABLE observations ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 0`);
  },
},
// Entities — soft-delete merge column
{
  version: '009_entities_merged_into',
  up: (db) => {
    db.exec(`ALTER TABLE entities ADD COLUMN merged_into TEXT REFERENCES entities(id)`);
  },
},
// Relationships — strength columns
{
  version: '010_relationships_strength',
  up: (db) => {
    db.exec(`ALTER TABLE relationships ADD COLUMN strength            REAL    NOT NULL DEFAULT 1.0`);
    db.exec(`ALTER TABLE relationships ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 0`);
  },
},
```

### Pattern 5: TypeScript Interface Updates

**What:** All new columns added to the TypeScript interfaces in `types.ts`. Optional fields (nullable columns) use `?` or `| null`.
**When to use:** Every migration that adds a column must have a corresponding interface change.

```typescript
// Observation — new v5.0 fields
export interface Observation {
  // ... existing fields ...
  valid_from?: string | null;
  valid_until?: string | null;
  last_accessed_at?: string | null;
  decay_exempt: number;          // 0 or 1
  strength: number;              // default 1.0
  reinforcement_count: number;   // default 0
}

// Entity — new v5.0 field
export interface Entity {
  // ... existing fields ...
  merged_into?: string | null;
}

// Relationship — new v5.0 fields
export interface Relationship {
  // ... existing fields ...
  strength: number;
  reinforcement_count: number;
}
```

### Anti-Patterns to Avoid

- **Single giant transaction for all migrations:** If one migration fails partway through, it rolls back all schema work done in the same session. Use per-migration transactions.
- **Modifying an already-shipped migration:** Once a version has been applied and its row recorded in `schema_migrations`, the SQL in that migration must never change. Add a new migration instead.
- **ALTER TABLE with NOT NULL and no DEFAULT on existing tables:** SQLite allows `NOT NULL DEFAULT value` but rejects `NOT NULL` without a default when rows already exist. Every v5.0 column that is NOT NULL must have a DEFAULT.
- **Nullable columns expressed as NOT NULL DEFAULT '':** Empty string is a worse sentinel than NULL. Use `TEXT` (implicitly nullable) with no DEFAULT, letting SQLite store NULL for old rows.
- **Leaving `applySchema()` exported alongside `runMigrations()`:** Once the migration runner is in place, `applySchema()` becomes dead code. Remove the export from `index.ts` to prevent callers from accidentally bypassing migrations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Migration ordering | Custom file-system sorter | Sorted in-code array — no filesystem dependency |
| Idempotency guard | Hash comparison of migration SQL | `schema_migrations` PRIMARY KEY uniqueness — DB enforces it |
| Transaction wrapping | Per-statement try/catch | `db.transaction(() => { ... })()` — better-sqlite3 built-in |
| Schema introspection | `PRAGMA table_info()` parsing | Not needed — migration versions are the source of truth |

**Key insight:** SQLite's `ALTER TABLE ADD COLUMN` is the only DDL operation needed in this phase. SQLite does not support `DROP COLUMN`, `RENAME COLUMN` (before 3.25), or multi-statement ALTER TABLE. All v5.0 additions are additive — no destructive DDL required.

## Common Pitfalls

### Pitfall 1: Double-ALTER on Restart

**What goes wrong:** Server starts twice on the same database. The second start runs `ALTER TABLE observations ADD COLUMN valid_from TEXT` again, throwing "duplicate column name: valid_from".
**Why it happens:** The old try/catch pattern silently swallowed this. The new pattern must check `schema_migrations` BEFORE executing ALTER TABLE.
**How to avoid:** The `runMigrations` runner does `SELECT 1 FROM schema_migrations WHERE version = ?` and skips any migration whose version is already recorded. The table PRIMARY KEY is a second safety net.
**Warning signs:** Server crashes on second startup with `SqliteError: duplicate column name`.

### Pitfall 2: Migration Table Missing on First Query

**What goes wrong:** `runMigrations` queries `schema_migrations` before creating it on a brand-new database. This throws "no such table: schema_migrations".
**Why it happens:** The `CREATE TABLE IF NOT EXISTS schema_migrations` statement must run BEFORE the first `SELECT 1 FROM schema_migrations WHERE version = ?`.
**How to avoid:** First statement in `runMigrations` is always the CREATE TABLE for `schema_migrations`, unconditionally. Only then begin the migration loop.
**Warning signs:** Server fails on fresh database with "no such table: schema_migrations".

### Pitfall 3: SQLite ALTER TABLE Limitations

**What goes wrong:** Attempting `ALTER TABLE observations ADD COLUMN valid_from TEXT NOT NULL` without a DEFAULT fails because existing rows cannot satisfy the NOT NULL constraint.
**Why it happens:** SQLite enforces NOT NULL at ALTER TABLE time for existing rows, unlike some other databases that back-fill nulls.
**How to avoid:** Any NOT NULL column added to an existing table must have a `DEFAULT`. Nullable columns (used for optional temporal data) should be declared without NOT NULL — they default to NULL automatically.
**Warning signs:** `SqliteError: Cannot add a NOT NULL column with no default value`.

### Pitfall 4: Transaction Scope Conflicts

**What goes wrong:** Calling `runMigrations(db)` from inside an already-open transaction. better-sqlite3 does not support nested transactions — it throws `SqliteError: cannot start a transaction within a transaction`.
**Why it happens:** If `openDatabase()` is called inside caller code that wraps it in a transaction.
**How to avoid:** `openDatabase()` must never be called inside a transaction. Document this constraint. The migration runner itself uses its own `db.transaction()` wrappers — these are safe because better-sqlite3's `db.transaction()` uses SAVEPOINTs when a transaction is already open, but best to keep `openDatabase()` at the top level.
**Warning signs:** `SqliteError: cannot start a transaction within a transaction` on startup.

### Pitfall 5: Prepared Statements Compiled Before Migrations Run

**What goes wrong:** `prepareStatements(db)` is called before `runMigrations(db)`. Prepared statements that reference new columns (e.g., `INSERT INTO observations (..., valid_from, ...)`) fail with "table observations has no column named valid_from".
**Why it happens:** SQLite compiles prepared statements against the current schema at prepare time.
**How to avoid:** The call order in `openDatabase()` must be: (1) pragmas, (2) `runMigrations(db)`, (3) `prepareStatements(db)` — never swap (2) and (3). This order already matches the existing pattern where `applySchema()` runs before any caller calls `prepareStatements()`.
**Warning signs:** `SqliteError: table X has no column named Y` at startup.

### Pitfall 6: statements.ts INSERT Omitting Columns That Are Now Required By Feature Logic

**What goes wrong:** `insertObservation` SQL omits `valid_from` because it has a default of NULL — this is correct SQL and runs fine. But downstream Phase 19 code assumes `valid_from` is always set at write time.
**Why it happens:** Migration adds the column with nullable default; existing INSERT statements remain valid; but the column intent is "set at insert time" not "computed later".
**How to avoid:** Phase 18 scope is schema-only. The INSERT statements in `statements.ts` need NOT be updated in this phase — the new columns all have safe defaults. Phase 19 will update the INSERT signatures. Document this handoff explicitly.
**Warning signs:** Not a Phase 18 failure — a Phase 19 concern.

## Code Examples

Verified patterns from official sources and codebase inspection:

### Full Migration Runner (complete implementation)

```typescript
// packages/core/src/migrations.ts
// Source: better-sqlite3 synchronous transaction API (codebase pattern)
import type Database from 'better-sqlite3';

interface Migration {
  version: string;
  up: (db: Database.Database) => void;
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
        CREATE TABLE IF NOT EXISTS observations ( ... );
        CREATE TABLE IF NOT EXISTS relationships ( ... );
        CREATE TABLE IF NOT EXISTS episodes ( ... );
        CREATE TABLE IF NOT EXISTS approval_queue ( ... );
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0( ... );
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_observations USING fts5( ... );
        CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
        -- ... remaining indexes
      `);
    },
  },
  {
    version: '002_observations_needs_embedding',
    up: (db) => {
      db.exec(`ALTER TABLE observations ADD COLUMN needs_embedding INTEGER NOT NULL DEFAULT 0`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_observations_needs_embedding ON observations(needs_embedding) WHERE needs_embedding = 1`);
    },
  },
  {
    version: '003_episodes_consolidated_at',
    up: (db) => {
      db.exec(`ALTER TABLE episodes ADD COLUMN consolidated_at TEXT`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_unconsolidated ON episodes(consolidated_at) WHERE consolidated_at IS NULL`);
    },
  },
  {
    version: '004_approval_queue_metadata',
    up: (db) => {
      db.exec(`ALTER TABLE approval_queue ADD COLUMN metadata TEXT`);
    },
  },
  {
    version: '005_entities_project',
    up: (db) => {
      db.exec(`ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)`);
    },
  },
  {
    version: '006_observations_temporal',
    up: (db) => {
      db.exec(`ALTER TABLE observations ADD COLUMN valid_from  TEXT`);
      db.exec(`ALTER TABLE observations ADD COLUMN valid_until TEXT`);
    },
  },
  {
    version: '007_observations_decay',
    up: (db) => {
      db.exec(`ALTER TABLE observations ADD COLUMN last_accessed_at    TEXT`);
      db.exec(`ALTER TABLE observations ADD COLUMN decay_exempt        INTEGER NOT NULL DEFAULT 0`);
      db.exec(`ALTER TABLE observations ADD COLUMN strength            REAL    NOT NULL DEFAULT 1.0`);
      db.exec(`ALTER TABLE observations ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 0`);
    },
  },
  {
    version: '008_entities_merged_into',
    up: (db) => {
      db.exec(`ALTER TABLE entities ADD COLUMN merged_into TEXT REFERENCES entities(id)`);
    },
  },
  {
    version: '009_relationships_strength',
    up: (db) => {
      db.exec(`ALTER TABLE relationships ADD COLUMN strength            REAL    NOT NULL DEFAULT 1.0`);
      db.exec(`ALTER TABLE relationships ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 0`);
    },
  },
];

export function runMigrations(db: Database.Database): void {
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

    db.transaction(() => {
      migration.up(db);
      recordMigration.run(migration.version, new Date().toISOString());
    })();
  }
}
```

### db.ts Call Site Update

```typescript
// packages/core/src/db.ts
import { runMigrations } from './migrations.js';  // replaces applySchema import

export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.MYCO_DB_PATH ?? getDefaultDbPath();
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  sqliteVec.load(db);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  runMigrations(db);  // replaces applySchema(db)
  return db;
}
```

### index.ts Export Cleanup

```typescript
// Remove: export { applySchema } from './schema.js';
// Add:    export { runMigrations } from './migrations.js';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| try/catch ALTER TABLE | schema_migrations table | Phase 18 | Idempotent, auditable, ordered |
| applySchema() monolith | MIGRATIONS array + runMigrations() | Phase 18 | Each migration is isolated, rollback-safe |

**Deprecated/outdated after this phase:**
- `applySchema()` function and its export — replaced by `runMigrations()`
- `packages/core/src/schema.ts` — contents migrate to `migrations.ts`; file can be deleted or kept as empty barrel (prefer delete to avoid confusion)

## Open Questions

1. **Should `schema.ts` be deleted or emptied?**
   - What we know: `applySchema` is exported from `index.ts` and consumed by zero callers outside `db.ts` (confirmed by grep: only `db.ts` imports it)
   - What's unclear: Whether any test or external consumer references it
   - Recommendation: Delete `schema.ts`, remove its export from `index.ts`, add `runMigrations` export instead

2. **Migration versioning string vs integer key?**
   - What we know: String keys (`'001_baseline'`) sort correctly as TEXT in SQLite due to zero-padding; they are also human-readable
   - What's unclear: No strong reason to use integers
   - Recommendation: Use zero-padded strings — `'001_baseline'`, `'002_...'` — for readability in `SELECT * FROM schema_migrations` output

3. **Should existing try/catch migrations be promoted on databases that already have those columns?**
   - What we know: On an existing v4.0 database, migrations 002–005 will attempt ALTER TABLE columns that already exist. SQLite throws "duplicate column name" — normally caught by try/catch.
   - What's unclear: How to handle this gracefully in the new framework without reverting to try/catch.
   - Recommendation: Check `PRAGMA table_info(table_name)` before each ALTER TABLE, OR wrap each ALTER TABLE in its own migration step that uses `PRAGMA table_info` to guard the execution. The simpler alternative: use a single try/catch ONLY inside `migration.up()` for ALTER TABLE statements, not for the transaction. This is the minimal-risk approach.
   - Better alternative: Query `PRAGMA table_info` for the target table before the ALTER TABLE. If the column already exists, skip. This avoids try/catch entirely.

```typescript
// Helper to check if column exists before ALTER TABLE
function columnExists(db: Database.Database, table: string, column: string): boolean {
  const info = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return info.some(row => row.name === column);
}
```

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure in-codebase TypeScript changes to packages/core).

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/core/src/schema.ts` — current try/catch pattern, 5 existing migrations confirmed
- Codebase: `packages/core/src/db.ts` — `openDatabase()` call chain confirmed
- Codebase: `packages/core/src/types.ts` — current TypeScript interfaces confirmed
- Codebase: `packages/core/src/statements.ts` — all prepared statements confirmed, no migration-blocking conflicts
- better-sqlite3 docs: `db.transaction()` API, `db.pragma()`, synchronous query patterns

### Secondary (MEDIUM confidence)
- REQUIREMENTS.md: Column names for v5.0 (`valid_from`, `valid_until`, `last_accessed_at`, `decay_exempt`, `strength`, `reinforcement_count`, `merged_into`) cross-referenced with CONTEXT.md decisions
- STATE.md: `computeEffectiveConfidence` is pure at read time — confirms `strength` and `decay_exempt` are stored, not computed

### Tertiary (LOW confidence)
- None — all findings are from codebase inspection and established better-sqlite3 patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all patterns from existing codebase
- Architecture: HIGH — migration runner is a standard pattern, verified against better-sqlite3 synchronous API
- Pitfalls: HIGH — all pitfalls identified from existing schema.ts code and known SQLite ALTER TABLE constraints

**Research date:** 2026-03-27
**Valid until:** 2026-06-27 (stable domain — SQLite migration patterns do not change)
