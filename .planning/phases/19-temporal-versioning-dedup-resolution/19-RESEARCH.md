# Phase 19: Temporal Versioning + Dedup Resolution - Research

**Researched:** 2026-03-27
**Domain:** SQLite temporal queries, dedup classification pipeline, entity merge (better-sqlite3, sqlite-vec, Zod)
**Confidence:** HIGH — all findings drawn from direct codebase inspection and established patterns

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dedup Classification Strategy**
- NOOP detection uses exact text match on `content` field — fast, deterministic, no false positives
- Near-duplicate detection (DEDUP-04) uses embedding cosine similarity > 0.92 threshold
- Dedup classification (ADD/UPDATE/NOOP) runs synchronously inside `remember` before commit — must classify before writing
- When multiple existing observations match, most recent (highest `valid_from`) wins as the comparison target

**Temporal Query Interface**
- Add optional `as_of` parameter to existing `recall` and `query` MCP tools — no new tools
- Timestamp format: ISO 8601 string (e.g., "2026-03-27T12:00:00Z"), validated via Zod
- When `as_of` is omitted, defaults to current time (returns latest versions only) — backward compatible
- Version history is NOT shown in recall results. A separate `history` filter on the query tool exposes version chains for a given entity/observation

**Entity Merge Behavior**
- Merge candidates detected during consolidation only — not in the remember hot path
- All merge proposals route through approval queue (per STATE.md blocker: Levenshtein ≤ 2 AND cosine > 0.92)
- After merge, source entity's relationships are re-pointed to the target entity (UPDATE foreign keys)
- Merges are reversible — `merged_into` is a soft-delete, source entity and its observations remain queryable

**Prior Decisions (Locked)**
- All `valid_from` values generated in application code, not SQLite CURRENT_TIMESTAMP (STATE.md blocker)
- Per-migration db.transaction() pattern from Phase 18 applies to all new DB operations
- better-sqlite3 synchronous API — no async patterns

### Claude's Discretion
- Internal implementation of the classification pipeline (function structure, helper decomposition)
- SQL query optimization for temporal filtering
- Test structure and coverage approach
- Error handling for edge cases (e.g., entity with no observations, merge of already-merged entity)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEMP-01 | Observations track `valid_from` and `valid_until` timestamps for fact versioning | Schema columns already exist (migration 006); INSERT statements need to populate `valid_from`; UPDATE needed for soft-retiring via `valid_until` |
| TEMP-02 | User can query "what was true at time X" via recall/query tools with a timestamp parameter | `as_of` param added to `recallKnowledge` and `queryEntities`; WHERE clause: `valid_from <= as_of AND (valid_until IS NULL OR valid_until > as_of)` |
| TEMP-03 | Superseded observations are soft-retired (valid_until set) rather than deleted | UPDATE statement sets `valid_until` on old observation before INSERT of new one; wrapped in db.transaction() |
| DEDUP-01 | When a new memory conflicts with an existing observation, system classifies it as ADD/UPDATE/NOOP | `classifyObservation()` function runs synchronously before the INSERT in `rememberEntity` |
| DEDUP-02 | UPDATE actions retire the old observation (temporal) and insert the new version | Atomic db.transaction(): UPDATE old row's `valid_until`, INSERT new row with `valid_from` |
| DEDUP-03 | Entity merges use soft-delete (`merged_into` column) so merges are reversible | `merged_into` column already exists (migration 008); merge approval path in `resolve_approval` needs update to SET merged_into instead of DELETE |
| DEDUP-04 | Near-duplicate observations are detected and deduplicated at write time | Reuse `knnSearchForContradiction` for cosine similarity check inside `classifyObservation`; threshold 0.92 (1 - 0.08 distance) |
</phase_requirements>

---

## Summary

Phase 19 implements two interlocked systems on top of schema columns that Phase 18 already added: temporal versioning for observations and a dedup/classification pipeline inside the `remember` hot path.

The schema is **already fully in place**. Migration 006 added `valid_from`/`valid_until` to observations. Migration 008 added `merged_into` to entities. Phase 19 is entirely about wiring application logic and SQL queries to those columns — no new DDL migrations are required.

The two main deliverables are: (1) a `classifyObservation()` helper that runs before every `rememberEntity` write and returns ADD / UPDATE / NOOP, and (2) temporal `as_of` filtering added to `recallKnowledge` and `queryEntities`. Entity merge at approval time needs a single change: replace DELETE with SET `merged_into`.

**Primary recommendation:** Implement in a single module `packages/mcp-server/src/dedup.ts` exporting `classifyObservation()` and `retireObservation()`. Wire into `rememberEntity` before the INSERT block. Add `as_of` to both recall/query tool signatures. Update `resolve_approval` merge path to use soft-delete.

---

## Standard Stack

All technology in this phase is already installed. No new dependencies.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | Synchronous SQLite queries | Project standard; no async needed for dedup classification |
| sqlite-vec | 0.1.7 | Cosine similarity for near-dup detection | Already loaded via `openDatabase()`; `vec_distance_cosine()` available |
| zod | 4.3.6 | ISO 8601 timestamp validation for `as_of` param | Project standard; already used in all tool schemas |
| nanoid | 5.x | New observation IDs | Project standard; already used in `rememberEntity` |

**No new installations required.**

---

## Architecture Patterns

### Temporal Observation Lifecycle

```
remember("TypeScript is fast", entity="TypeScript")
  → classify: existing obs? exact match? near-dup?
      ADD   → INSERT with valid_from=now, valid_until=NULL
      NOOP  → return early, no write
      UPDATE → db.transaction():
                 UPDATE old_obs SET valid_until = now
                 INSERT new_obs with valid_from = now, valid_until = NULL
```

### Classification Pipeline (classifyObservation)

```typescript
// packages/mcp-server/src/dedup.ts

export type ClassificationResult =
  | { action: 'NOOP'; existingId: string }
  | { action: 'UPDATE'; retireId: string }
  | { action: 'ADD' }

export function classifyObservation(
  db: Database.Database,
  entityId: string,
  content: string,
  embedding: Float32Array | null,
  stmts: MycoStatements,
): ClassificationResult
```

**Decision tree:**
1. SELECT observations WHERE entity_id = ? AND valid_until IS NULL ORDER BY valid_from DESC — get all current observations
2. If any row has content = input content (exact match) → return NOOP (existingId = that row's id)
3. If embedding is available, run KNN against entity's current observations:
   - Distance < (1 - 0.92) = 0.08 → near-duplicate
   - Pick the most recent matching row (highest valid_from)
   - Return UPDATE (retireId = that row's id)
4. Otherwise → return ADD

**Key constraint from CONTEXT.md:** Most recent observation by `valid_from` wins as comparison target. When multiple near-dup matches exist, pick highest `valid_from`.

### Temporal Filter in SQL

The canonical WHERE clause for point-in-time queries:

```sql
-- Returns observations valid at :as_of
WHERE valid_from <= :as_of
  AND (valid_until IS NULL OR valid_until > :as_of)
```

When `as_of` is omitted, the default behavior (current observations only) is:

```sql
WHERE valid_until IS NULL
```

This is backward-compatible: existing queries that don't pass `as_of` naturally show only live observations.

**IMPORTANT:** The existing `selectObservationsByEntityId` prepared statement (`SELECT ... WHERE entity_id = ?`) does NOT filter on `valid_until`. After Phase 19, any query that should return only current observations must add `AND valid_until IS NULL`. This is a subtle correctness change affecting multiple call sites.

### Retire + Insert (Atomic Transaction)

```typescript
// Inside rememberEntity, when classifyObservation returns UPDATE:
const now = new Date().toISOString();
db.transaction(() => {
  // Retire old observation
  db.prepare(
    `UPDATE observations SET valid_until = ? WHERE id = ?`
  ).run(now, result.retireId);
  // Insert new version
  stmts.insertObservation.run(
    newObsId, entityId, content,
    prov.session_id, prov.agent_id, prov.source_type, prov.confidence, now,
    // valid_from = now, valid_until = NULL (default)
  );
})();
```

Note: `insertObservation` currently does NOT include `valid_from` in its column list. The INSERT statement in `statements.ts` must be updated to include `valid_from`.

### Entity Merge: Soft-Delete Pattern

Current `resolve_approval` merge path (lines 844–858 in tools.ts) does:
```typescript
stmts.deleteEntityById.run(secondaryId);  // HARD DELETE — must change
```

Phase 19 changes this to:
```typescript
db.prepare(
  `UPDATE entities SET merged_into = ? WHERE id = ?`
).run(primaryId, secondaryId);
// Observations stay on secondaryId — do NOT reassign (they remain queryable)
// Relationships still need re-pointing to primaryId (keep existing logic)
```

This makes merges reversible: `SELECT * FROM observations WHERE entity_id = secondaryId` still returns history.

**CRITICAL:** The existing code reassigns observations AND relationships before deleting. With soft-delete, observation reassignment should be removed. Relationship reassignment must stay (so graph queries route correctly to the active entity). This is a behavior change.

### history Filter on query Tool

The `query` tool gets a `history` boolean parameter:
- `history: false` (default) → `WHERE valid_until IS NULL` (current only)
- `history: true` → no valid_until filter, returns all versions ordered by `valid_from DESC`

This gives agents a way to inspect version chains without polluting normal recall results.

### as_of Parameter Routing

In `recallKnowledge`, the KNN and FTS queries join observations. After Phase 19:

```sql
-- KNN path (with as_of):
JOIN observations o ON o.id = knn.item_id
WHERE valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)

-- KNN path (without as_of, default):
JOIN observations o ON o.id = knn.item_id
WHERE valid_until IS NULL
```

The dynamic WHERE clause builder already exists for `entity_type`, `min_confidence`, `project` filters. The `as_of` filter slots into this pattern naturally.

**FTS5 limitation:** FTS5 indexes ALL observations, including retired ones (valid_until IS NOT NULL). The FTS JOIN to `observations` must include the temporal filter — the index itself cannot be filtered, but the JOIN condition can.

### Anti-Patterns to Avoid

- **Populating valid_from via SQLite DEFAULT:** SQLite CURRENT_TIMESTAMP is per-transaction-start, not per-row. All `valid_from` values must be `new Date().toISOString()` generated before the transaction opens. This is a confirmed blocker in STATE.md.
- **Running dedup check outside transaction:** Classification and write must be atomic. A race condition between classify and write could allow two concurrent `remember` calls for the same content to both pass the NOOP check and insert duplicates.
- **Filtering by valid_until IS NULL in vec_embeddings:** `vec_embeddings` stores one row per observation ID. If the observation is retired, its embedding stays in `vec_embeddings`. KNN search may return retired observations. The JOIN to `observations` must add the temporal filter to exclude retired embeddings from results.
- **Removing FTS entry on retire:** Do NOT delete from `fts_observations` when retiring an observation. The FTS entry is needed for `history: true` queries and temporal recall.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO 8601 timestamp validation | Custom regex validation | `z.string().datetime()` (Zod) | Handles timezone offsets, millisecond precision, invalid dates |
| Vector cosine distance | Manual dot product | `vec_distance_cosine()` via sqlite-vec KNN | Already loaded, handles float32 correctly |
| Levenshtein for merge names | Custom implementation | `levenshtein()` already in `consolidator.ts` | Exists, tested, reuse directly |
| Atomic retire+insert | Manual rollback logic | `db.transaction(() => { ... })()` | better-sqlite3 transactions are synchronous and auto-rollback on throw |

---

## Common Pitfalls

### Pitfall 1: valid_from Not Set on New Observations

**What goes wrong:** The current `insertObservation` prepared statement does NOT include `valid_from` in its column list (verified in statements.ts line 126–129). Observations inserted after Phase 19 will have `valid_from = NULL`, breaking temporal queries.

**Why it happens:** The schema column was added (migration 006) but the INSERT statement was not updated.

**How to avoid:** Update `insertObservation` and `insertObservationWithEmbeddingFlag` in `statements.ts` to include `valid_from` as an explicit parameter. Set it to the same value as `created_at` for new observations.

**Warning signs:** Temporal query with `as_of = now` returns zero results despite records existing.

### Pitfall 2: KNN Searches Return Retired Observations

**What goes wrong:** `vec_embeddings` is not joined to `valid_until`. The existing `knnSearchObservations`, `knnSearchForContradiction`, and near-dup detection queries can surface retired observations (those with a non-null `valid_until`).

**Why it happens:** The KNN virtual table has no knowledge of the temporal columns in `observations`.

**How to avoid:** All KNN queries that should return current-only observations must JOIN to `observations` and add `AND o.valid_until IS NULL`. For the `as_of` path, use the full temporal predicate.

**Warning signs:** Recall returns duplicate results with the same semantic content; both old and new version of a fact appear.

### Pitfall 3: selectObservationsByEntityId Returns Retired Observations

**What goes wrong:** `selectObservationsByEntityId` (used in `queryEntities`) has no `valid_until IS NULL` filter. After Phase 19 inserts UPDATE-type observations, this statement returns both the retired and the current version.

**Why it happens:** Statement was written before temporal versioning existed.

**How to avoid:** Either update the prepared statement to add `AND valid_until IS NULL` (for the default "current" view), or add a new statement `selectCurrentObservationsByEntityId`. The `history` filter on the `query` tool determines which statement to use.

**Warning signs:** `query` tool returns an entity with observation_count > expected, and observations list contains near-duplicate entries.

### Pitfall 4: Merge Approval Still Hard-Deletes the Source Entity

**What goes wrong:** `resolve_approval` in `tools.ts` (line 856) calls `stmts.deleteEntityById.run(secondaryId)`. This is a CASCADE delete that also removes all observations and relationships for the merged entity.

**Why it happens:** Entity merge was implemented before soft-delete was designed.

**How to avoid:** Replace `deleteEntityById` with `UPDATE entities SET merged_into = ? WHERE id = ?`. Remove the observation reassignment step (keep relationship reassignment for graph correctness).

**Warning signs:** After approving a merge, `SELECT * FROM entities WHERE merged_into IS NOT NULL` returns zero rows; the source entity is gone entirely.

### Pitfall 5: Classification Race Condition

**What goes wrong:** Two concurrent `remember` calls for the same entity+content both pass the NOOP check before either has written to the DB, resulting in duplicate rows.

**Why it happens:** better-sqlite3 is synchronous but classification reads happen outside the write transaction.

**How to avoid:** Wrap the classify+write sequence in a single `db.transaction()`. Because better-sqlite3 is synchronous with WAL mode, this provides sufficient serialization for single-process use. The MCP server is single-process, so this covers the use case.

**Warning signs:** `SELECT COUNT(*) FROM observations WHERE entity_id = ? AND content = ? AND valid_until IS NULL` returns > 1.

### Pitfall 6: Near-Duplicate Threshold Confusion (distance vs. similarity)

**What goes wrong:** sqlite-vec returns cosine **distance** (lower = more similar). The CONTEXT.md threshold is specified as cosine **similarity** > 0.92. These are not the same: `distance < 0.08` maps to `similarity > 0.92` (for normalized vectors, distance ≈ 1 - similarity).

**Why it happens:** The existing `knnSearchForContradiction` uses `threshold = 0.3` (distance). The near-dup threshold from CONTEXT.md is `0.92` (similarity), which translates to distance `< 0.08`.

**How to avoid:** In `classifyObservation`, use `distance < 0.08` for near-dup detection (NOT `distance < 0.92`). Document the conversion explicitly in code comments.

**Warning signs:** Near-duplicate detection never triggers (if threshold used as-is), or triggers too aggressively (if inverted incorrectly).

---

## Code Examples

### Temporal WHERE Pattern

```typescript
// Source: direct inspection of better-sqlite3 + existing dynamic WHERE pattern in tools.ts

// For as_of filtering (point-in-time):
conditions.push('o.valid_from <= ?');
conditions.push('(o.valid_until IS NULL OR o.valid_until > ?)');
filterParams.push(asOf, asOf);  // two bindings for the same value

// For current-only (default, no as_of):
conditions.push('o.valid_until IS NULL');
```

### classifyObservation Skeleton

```typescript
// packages/mcp-server/src/dedup.ts
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';

const NEAR_DUP_DISTANCE_THRESHOLD = 0.08; // cosine distance = 1 - 0.92 similarity

export type ClassificationResult =
  | { action: 'NOOP'; existingId: string }
  | { action: 'UPDATE'; retireId: string }
  | { action: 'ADD' };

export function classifyObservation(
  db: Database.Database,
  entityId: string,
  content: string,
  embedding: Float32Array | null,
  stmts: MycoStatements,
): ClassificationResult {
  // Fetch all current observations for this entity
  const current = db.prepare(
    `SELECT id, content, valid_from FROM observations
     WHERE entity_id = ? AND valid_until IS NULL
     ORDER BY valid_from DESC`
  ).all(entityId) as Array<{ id: string; content: string; valid_from: string | null }>;

  // Step 1: Exact match → NOOP
  const exact = current.find(r => r.content === content);
  if (exact) return { action: 'NOOP', existingId: exact.id };

  // Step 2: Near-duplicate via embedding → UPDATE
  if (embedding !== null && current.length > 0) {
    // Query vec_embeddings for current observations of this entity
    const nearDup = db.prepare(`
      WITH knn AS (
        SELECT item_id, distance
        FROM vec_embeddings
        WHERE embedding MATCH ?
          AND k = 5
          AND item_type = 'observation'
      )
      SELECT knn.item_id, knn.distance, o.valid_from
      FROM knn
      JOIN observations o ON o.id = knn.item_id
      WHERE o.entity_id = ?
        AND o.valid_until IS NULL
        AND knn.distance < ?
      ORDER BY o.valid_from DESC
      LIMIT 1
    `).get(embedding, entityId, NEAR_DUP_DISTANCE_THRESHOLD) as
      | { item_id: string; distance: number; valid_from: string | null }
      | undefined;

    if (nearDup) return { action: 'UPDATE', retireId: nearDup.item_id };
  }

  return { action: 'ADD' };
}
```

### Retire + Insert Transaction

```typescript
// Inside rememberEntity, after classifyObservation returns UPDATE:
const now = new Date().toISOString(); // generated BEFORE transaction
db.transaction(() => {
  db.prepare(`UPDATE observations SET valid_until = ? WHERE id = ?`)
    .run(now, result.retireId);
  stmts.insertObservation.run(
    newObsId, entityId, content,
    prov.session_id, prov.agent_id, prov.source_type, prov.confidence,
    now, // created_at
    now, // valid_from
  );
})();
```

### Soft-Delete Merge (in resolve_approval)

```typescript
// Replace the existing merge block that calls deleteEntityById:
db.transaction(() => {
  for (const secondaryId of meta.merge_candidate_ids) {
    // Re-point relationships (keep — graph navigation needs this)
    stmts.updateRelationshipFromId.run(primaryEntity.id, secondaryId);
    stmts.updateRelationshipToId.run(primaryEntity.id, secondaryId);
    // Soft-delete: mark merged, DO NOT reassign observations, DO NOT delete entity
    db.prepare(`UPDATE entities SET merged_into = ? WHERE id = ?`)
      .run(primaryEntity.id, secondaryId);
  }
})();
```

### as_of Parameter Zod Schema

```typescript
// In registerTools (tools.ts), add to recall and query inputSchema:
as_of: z.string().datetime({ offset: true }).optional()
  .describe('ISO 8601 timestamp — returns observations valid at this point in time. Omit for current.'),
history: z.boolean().default(false)
  .describe('(query tool only) If true, returns all versions including superseded observations'),
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| All observations are permanent (no versioning) | Observations have valid_from/valid_until; superseded rows kept | Enables time-travel queries; history preserved |
| `remember` always inserts without checking | `classifyObservation` gates every write | NOOP/UPDATE reduce duplicate rows, maintain one "current truth" per fact |
| Entity merges hard-delete secondary entity | `merged_into` soft-delete; secondary stays in DB | Merge is reversible; prior history queryable via secondary entity ID |

---

## Open Questions

1. **Should `insertObservation` in `statements.ts` be replaced or augmented?**
   - What we know: The current statement omits `valid_from`. Adding it changes the function signature (needs one more parameter).
   - What's unclear: Whether any call sites pass parameters positionally (they do — `stmts.insertObservation.run(id, entityId, content, ...)`) — adding `valid_from` breaks every existing call site.
   - Recommendation: Add `valid_from` as the last parameter with a fallback default. Audit all call sites (there are 3: `rememberEntity`, `retireAndInsert` in new dedup module, and `insertObservationWithEmbeddingFlag`). Update all three at once in one task.

2. **Does FTS5 need temporal awareness?**
   - What we know: `fts_observations` indexes all observations regardless of `valid_until`. FTS JOIN to `observations` can filter on `valid_until IS NULL` in the WHERE clause.
   - What's unclear: Whether FTS `MATCH` scoring changes when retired observations are included in the virtual table (they remain indexed).
   - Recommendation: Do NOT delete from `fts_observations` on retire. Add `AND o.valid_until IS NULL` to the FTS JOIN in `recallKnowledge`. Retired observations won't surface in normal recall but remain indexed for `history: true` path.

3. **Classification for the first observation on a new entity**
   - What we know: `classifyObservation` fetches current observations for `entityId`. If the entity is brand-new, there are zero current observations.
   - What's unclear: Nothing — this is straightforward: zero observations means no NOOP or UPDATE match possible → always returns ADD.
   - Recommendation: No special handling needed; the classifier degrades gracefully to ADD when `current` array is empty.

---

## Environment Availability

Step 2.6: SKIPPED — phase is purely code changes within the existing Node.js/SQLite/better-sqlite3/sqlite-vec stack. No new external dependencies.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection: `packages/core/src/migrations.ts` — confirmed migration 006 (`valid_from`, `valid_until`) and 008 (`merged_into`) already applied
- Direct inspection: `packages/core/src/statements.ts` — confirmed `insertObservation` omits `valid_from`; `knnSearchForContradiction` exists with entity_id filter
- Direct inspection: `packages/mcp-server/src/tools.ts` — confirmed `rememberEntity` flow, `resolve_approval` hard-delete pattern, dynamic WHERE clause builder for filters
- Direct inspection: `packages/mcp-server/src/consolidator.ts` — confirmed `levenshtein()`, `isMergeCandidate()`, `findMergeCandidates()`, `detectContradiction()` reusable
- Direct inspection: `packages/core/src/types.ts` — confirmed `Observation.valid_from`, `Observation.valid_until`, `Entity.merged_into` type definitions
- Direct inspection: `packages/core/src/provenance.ts` — confirmed `new Date().toISOString()` pattern for timestamps (not CURRENT_TIMESTAMP)
- Direct inspection: `.planning/phases/19-temporal-versioning-dedup-resolution/19-CONTEXT.md` — locked decisions, integration points

### Secondary (MEDIUM confidence)
- better-sqlite3 docs: synchronous transaction wrapping via `db.transaction(fn)()` — standard pattern, confirmed by existing usage in migrations.ts
- sqlite-vec docs: KNN returns cosine distance (0 = identical, 2 = maximally different for normalized vectors); confirmed by `knnSearchForContradiction` threshold of 0.3

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all libraries already in use
- Architecture patterns: HIGH — derived from direct code inspection of existing patterns
- Pitfalls: HIGH — each pitfall identified from concrete gap between current code and required behavior (e.g., insertObservation missing valid_from is a fact, not a hypothesis)

**Research date:** 2026-03-27
**Valid until:** Until any of the following files change: `packages/core/src/statements.ts`, `packages/mcp-server/src/tools.ts`, `packages/core/src/migrations.ts`
