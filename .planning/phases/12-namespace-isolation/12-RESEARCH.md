# Phase 12: Namespace Isolation - Research

**Researched:** 2026-03-26
**Domain:** SQLite schema migration, prepared statement extension, MCP tool param wiring
**Confidence:** HIGH

## Summary

Phase 12 is the final phase of v3.0. It adds a `project TEXT DEFAULT NULL` column to the `entities` table and wires project-scoped filtering through the entire stack: MCP tools (`remember`, `recall`, `query`), prepared statements in `@myco/core`, and API routes (entities, graph, dashboard). The schema change is a single `ALTER TABLE` migration using the established try/catch idempotent pattern already present in `schema.ts`. Virtual tables (`vec_embeddings`, `fts_observations`) cannot receive the column — they are filtered at query time by joining back to `entities`.

The `recall` tool already accepts a `project` param from Phase 11 but returns a warning instead of filtering. This phase removes the warning and adds the actual `WHERE e.project = ?` clause to the dynamic-WHERE paths in `recallKnowledge`. The `remember` tool and `query` tool get the new `project` param added fresh. API routes get an optional `project` query param that produces project-filtered variants of the existing prepared statements (dynamic WHERE, same STMT-02 exception pattern).

A key design decision from the discussion: **NULL project means global** — entities stored without a project are visible to all queries regardless of whether a project filter is active. A query with `project='myco'` returns only `project = 'myco'` entities; a query with no project returns everything. This preserves backward compatibility (NS-04) without a data migration.

**Primary recommendation:** Follow the established migration and dynamic-WHERE patterns exactly. This phase is surgically narrow — every integration point is already mapped, and the patterns are proven from Phases 10 and 11.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema Migration Strategy**
- Add `project TEXT DEFAULT NULL` column to entities table via `ALTER TABLE` with try/catch (idempotent, same pattern as existing migrations in schema.ts)
- Only entities table gets the project column — observations, relationships, and episodes inherit project scope via entity foreign keys
- Virtual tables (vec_embeddings, fts_observations) CANNOT be altered (SQLite limitation) — filter at query time by joining back to entities
- Existing entities get NULL project = globally visible to all queries

**Tool Interface Design**
- `remember` tool gets optional `project` string param — if omitted, entity stored with NULL project (global)
- `recall` tool's existing `project` param (Phase 11 no-op with warning) becomes fully functional — `WHERE e.project = ?` when set, no filter when omitted
- `query` tool also gets optional `project` param for consistency across all read tools
- NULL project entities are visible to ALL queries (no project filter = see everything, project filter = see only that project's entities plus global NULL entities)

**API + Dashboard Behavior**
- API routes (entities, graph, dashboard) get optional `project` query param for filtering
- Dashboard default view shows all entities (no project filter) — preserves current behavior
- Consolidation remains global — cross-project knowledge synthesis, not per-project partitioning

### Claude's Discretion
- Index creation strategy for the project column
- Exact SQL for project-aware prepared statements
- Whether to add project display in dashboard entity cards

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NS-01 | Entities table has a project column with DEFAULT NULL | Schema migration in `applySchema()` using established try/catch ALTER TABLE pattern |
| NS-02 | remember tool accepts optional project parameter | Add `project` to `RememberParams` interface, `insertEntity` statement, and `registerTools` Zod schema |
| NS-03 | recall/query tools scope results by project when specified | Extend dynamic-WHERE logic in `recallKnowledge` and `queryEntities` with `e.project = ?` condition; remove warning from recall |
| NS-04 | Existing data remains accessible when no project filter is specified | NULL project = global visibility; no migration of existing rows needed |
</phase_requirements>

---

## Standard Stack

This phase uses only libraries already in the project. No new dependencies.

### Core (already installed)
| Library | Version | Purpose |
|---------|---------|---------|
| better-sqlite3 | 12.8.0 | `ALTER TABLE` migration + all query execution |
| Zod | 4.3.6 | Extending tool input schemas with optional `project` param |
| Hono + @hono/zod-validator | 4.x | API route query param validation |

**No new installation required.**

---

## Architecture Patterns

### Pattern 1: Idempotent ALTER TABLE Migration
**What:** Add column to entities using try/catch — succeeds on fresh DB, silently no-ops on existing DB.
**When to use:** Any additive schema change. Established in `schema.ts` lines 87–120.
**Example:**
```typescript
// Source: packages/core/src/schema.ts (existing pattern)
try {
  db.exec(`ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL`);
} catch {
  // Column already exists — expected on databases created after this migration shipped
}

// Index for project-scoped queries (Claude's discretion: YES — queries will filter on this column)
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)`);
} catch {
  // Index may already exist
}
```

### Pattern 2: Project Column in insertEntity
**What:** `insertEntity` prepared statement must include the `project` column. It currently omits it (intentionally — the column did not exist until this phase).
**Critical:** The current `insertEntity` statement hardcodes 10 positional params. After adding `project`, it becomes 11. Every call site (`rememberEntity` in tools.ts) must pass the new value.

Current statement (statements.ts line 95–98):
```sql
INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?)
```

Updated statement:
```sql
INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at, project)
VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?, ?)
```

Call sites in `rememberEntity` (tools.ts lines 97–101 and 136–140) must pass `project ?? null` as the 11th positional arg.

### Pattern 3: Dynamic WHERE Extension for project Filter
**What:** `recallKnowledge` already builds dynamic WHERE conditions for `entity_type` and `min_confidence`. Adding `project` follows the exact same pattern.
**When to use:** Any read tool that accepts optional filters.
**Example:**
```typescript
// Source: packages/mcp-server/src/tools.ts (established pattern, lines 190–200)
if (project !== undefined) {
  conditions.push('e.project = ?');
  filterParams.push(project);
}
```
This slot into the existing conditions array. The dynamic SQL branches (semantic and FTS) both already use `conditions` — no structural change needed, only adding this condition.

### Pattern 4: RememberParams Interface Extension
**What:** `RememberParams` interface in tools.ts must gain `project?: string`. The `rememberEntity` function destructures params and must forward `project` to `stmts.insertEntity.run(...)`.

### Pattern 5: queryEntities project Filter
**What:** `queryEntities` in tools.ts uses the STMT-02 exception pattern (dynamic WHERE). The `query` tool's Zod schema gets `project: z.string().optional()`. The `queryEntities` function adds:
```typescript
if (project) {
  conditions.push('e.project = ?');
  queryParams.push(project);
}
```

### Pattern 6: API Route Query Param for project
**What:** `entitiesQuerySchema` in `routes/entities.ts` and equivalent schemas in graph/dashboard routes get `project: z.string().optional()`. When present, the route uses a dynamic WHERE instead of the prepared statement.

For `selectEntitiesPaginated`, which is a prepared statement with no WHERE, the project filter requires an inline `db.prepare()` when active — this is the same STMT-02 exception rationale (variable SQL structure).

For `selectGraphNodes` and `selectGraphRelationships`, graph nodes filtered by project need a JOIN or subquery to check `entities.project`.

### Pattern 7: NULL Semantics — Global Visibility
**The rule (locked decision):** `WHERE e.project = ?` is added ONLY when `project` is provided. When project is omitted, no filter is applied — NULL entities and all named-project entities are returned together. There is NO `WHERE e.project IS NULL` for the "no filter" case.

This means:
- `recall({ query: "..." })` → returns all entities regardless of project (NULL or named)
- `recall({ query: "...", project: "myco" })` → returns only `project = 'myco'` entities
- Pre-existing entities with NULL project remain accessible in both cases

### Anti-Patterns to Avoid
- **Do not filter `WHERE project IS NULL OR project = ?`**: The locked decision is `WHERE project = ?` only when project is set. Existing NULL entities are excluded from project-scoped queries (correct — they are global, not per-project).
- **Do not add `project` to virtual tables**: SQLite virtual tables using `vec0` and `fts5` do not support `ALTER TABLE ADD COLUMN`. Filter project at the entities JOIN level, not in the vec/fts query.
- **Do not break the insertEntity call sites in consolidation or resolve_approval**: `rememberEntity` is called from `resolve_approval` handler (tools.ts line 723) without a project param — this is correct; consolidation-approved facts are global (NULL project).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Idempotent column addition | Custom migration system | `ALTER TABLE ... ADD COLUMN` in try/catch (already in schema.ts) |
| Dynamic SQL with optional filters | String interpolation | Parameterized binding via `db.prepare().all(...params)` (STMT-02 exception pattern) |
| Project index | Manual ROWID scanning | `CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)` |

---

## Common Pitfalls

### Pitfall 1: insertEntity Positional Param Count
**What goes wrong:** `insertEntity` statement is updated to include `project` (11th param) but call sites still pass 10 args — SQLite throws `SQLITE_ERROR: not enough params`.
**Why it happens:** There are two call sites in `rememberEntity` (new entity creation on line 97 and relation target creation on line 136). Both must be updated.
**How to avoid:** After updating `insertEntity` in statements.ts, grep for all `.insertEntity.run(` calls and verify each passes 11 args.
**Warning signs:** `SQLite3 error: SQLITE_ERROR: bind or column index out of range` at server startup or first `remember` call.

### Pitfall 2: Forgetting the Warning Removal in recallKnowledge
**What goes wrong:** project filter works but the old Phase 11 warning `'project filter is not yet supported'` is still emitted in metadata, confusing callers.
**Why it happens:** The warning is in `recallKnowledge` lines 183–187. Easy to leave in place while adding the SQL filter.
**How to avoid:** The warning block must be removed entirely (not just conditioned) — the feature is now supported.

### Pitfall 3: MycoStatements Interface Out of Sync
**What goes wrong:** New project-aware prepared statements are added to `prepareStatements()` return object but not declared in `MycoStatements` interface — TypeScript errors cascade into api-server.
**Why it happens:** `MycoStatements` is the typed contract shared across packages. Interface and implementation must stay synchronized.
**How to avoid:** Update `MycoStatements` interface in statements.ts first, then implement in `prepareStatements()`.

### Pitfall 4: NS-01 Requirement Text vs Locked Decision
**What goes wrong:** REQUIREMENTS.md line 37 says `DEFAULT 'default'` but the CONTEXT.md locked decision says `DEFAULT NULL`. These conflict.
**Resolution:** CONTEXT.md is the user's decision — use `DEFAULT NULL`. The planner should note this discrepancy and treat CONTEXT.md as authoritative. The NS-01 requirement is satisfied by adding the column; the default value is an implementation detail decided in context.

### Pitfall 5: Graph Route Project Filter Complexity
**What goes wrong:** `selectGraphNodes` and `selectGraphRelationships` are prepared statements that return ALL entities/relationships. Adding a project filter means the prepared statements cannot be used when project is set.
**Why it happens:** Prepared statements are fixed SQL — a WHERE clause cannot be conditionally appended.
**How to avoid:** When `project` is provided, use inline `db.prepare()` with WHERE clause (STMT-02 exception). When no project, use the existing prepared statements as-is.

### Pitfall 6: `selectEntitiesPaginated` and OFFSET semantics with project filter
**What goes wrong:** The paginated entities endpoint uses `LIMIT ? OFFSET ?`. When a project filter is added via inline prepare, the OFFSET still works correctly for the filtered set — but the total count response (if any) needs to also be filtered.
**How to avoid:** The current entities route (`entities.ts`) does not return a total count — it returns a raw array. No additional work needed for count accuracy.

---

## Code Examples

### Schema migration (schema.ts addition)
```typescript
// After existing migration blocks (line ~120)
// Migration: add project column for namespace isolation (Phase 12)
try {
  db.exec(`ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL`);
} catch {
  // Column already exists
}

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)`);
} catch {
  // Index may already exist
}
```

### Updated insertEntity statement
```typescript
insertEntity: db.prepare(
  `INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at, project)
   VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?, ?)`
),
```

### Updated rememberEntity call site (both occurrences)
```typescript
stmts.insertEntity.run(
  entityId, entity_name, entity_type,
  prov.session_id, prov.agent_id, prov.source_type, prov.confidence,
  prov.created_at, prov.created_at,
  project ?? null,   // <-- new 11th arg
);
```

### recall project filter (remove warning, add condition)
```typescript
// Remove the entire warning block for project (lines 184-187 in tools.ts)
// Add to conditions array:
if (project !== undefined) {
  conditions.push('e.project = ?');
  filterParams.push(project);
}
```

### query tool — add project param to Zod schema
```typescript
// In registerTools(), query tool inputSchema:
project: z.string().optional().describe('Filter by project namespace'),
```

### API entities route — project query param
```typescript
const entitiesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  project: z.string().optional(),
});

// In route handler, when project is provided:
if (project) {
  const entities = db.prepare(
    `SELECT id, name, type, confidence, created_at
     FROM entities WHERE project = ?
     ORDER BY updated_at DESC LIMIT ? OFFSET ?`
  ).all(project, limit, offset);
  return c.json(entities);
}
// else: use existing stmts.selectEntitiesPaginated
```

---

## Integration Point Map

Every file that requires changes, in dependency order:

| Order | File | Change |
|-------|------|--------|
| 1 | `packages/core/src/schema.ts` | Add ALTER TABLE + index migration |
| 2 | `packages/core/src/statements.ts` | Update `insertEntity` SQL; add `MycoStatements` entries for new project-aware stmts if any |
| 3 | `packages/core/src/types.ts` | Add `project?: string \| null` to `Entity` interface |
| 4 | `packages/mcp-server/src/tools.ts` | Add project to `RememberParams`, `rememberEntity`, `recallKnowledge` (remove warning, add filter), `queryEntities` (add filter), `registerTools` Zod schemas |
| 5 | `packages/api-server/src/routes/entities.ts` | Add project to query schema; conditional project filter |
| 6 | `packages/api-server/src/routes/graph.ts` | Add project param; conditional filtering on nodes |
| 7 | `packages/api-server/src/routes/dashboard.ts` | Add project param; conditional count filtering |

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/schema changes within the existing SQLite file. No new external dependencies are introduced.

---

## State of the Art

| Old Approach | Current Approach | When Changed |
|--------------|------------------|--------------|
| No namespace support — all entities global | `project TEXT DEFAULT NULL` on entities table | Phase 12 |
| `recall` project param returns warning | `recall` project param returns SQL-filtered results | Phase 12 |

---

## Open Questions

1. **NS-01 default value discrepancy**
   - What we know: REQUIREMENTS.md says `DEFAULT 'default'`, CONTEXT.md says `DEFAULT NULL`
   - What's unclear: Whether the requirement text was a draft or intentional
   - Recommendation: Use `DEFAULT NULL` (CONTEXT.md is the locked decision). The planner should acknowledge the discrepancy and proceed with NULL.

2. **Project display in dashboard entity cards**
   - What we know: Claude's Discretion — user did not specify
   - What's unclear: Whether the dashboard should render a project badge on entity cards
   - Recommendation: Out of scope for v3.0 (REQUIREMENTS.md explicitly excludes dashboard changes). Skip.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `packages/core/src/schema.ts` — existing migration pattern confirmed
- Direct code inspection: `packages/core/src/statements.ts` — `insertEntity` param count confirmed (10 positional args, project not yet present)
- Direct code inspection: `packages/mcp-server/src/tools.ts` — Phase 11 warning confirmed at lines 183–187; `recallKnowledge` dynamic WHERE structure confirmed
- Direct code inspection: `packages/api-server/src/routes/entities.ts`, `graph.ts`, `dashboard.ts` — current prepared statement usage confirmed
- Direct code inspection: `packages/core/src/types.ts` — `Entity` interface missing `project` field confirmed
- `.planning/phases/12-namespace-isolation/12-CONTEXT.md` — locked decisions for all strategy choices
- `.planning/REQUIREMENTS.md` — NS-01 through NS-04 requirement text

### Secondary (MEDIUM confidence)
- SQLite documentation (prior knowledge, HIGH confidence): `ALTER TABLE ... ADD COLUMN` is supported but cannot modify virtual tables (`vec0`, `fts5`) — this is a fundamental SQLite constraint

---

## Metadata

**Confidence breakdown:**
- Schema migration: HIGH — identical pattern used 3 times in schema.ts already
- Tool param wiring: HIGH — Phase 11 built the infrastructure; this phase completes it
- API route changes: HIGH — same STMT-02 exception pattern used in Phase 10
- Pitfalls: HIGH — all identified from direct code inspection, not inference

**Research date:** 2026-03-26
**Valid until:** Stable — no fast-moving dependencies; SQLite ALTER TABLE behavior is unchanged
