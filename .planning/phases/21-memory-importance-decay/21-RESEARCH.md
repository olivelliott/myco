# Phase 21: Memory Importance Decay - Research

**Researched:** 2026-03-27
**Domain:** Cognitive memory decay modelling, pure-function scoring, lazy-write patterns in SQLite/TypeScript
**Confidence:** HIGH

## Summary

Phase 21 adds time-aware ranking to recall results. The core idea is that two observations with identical base confidence should rank differently if one was accessed recently and another has not been touched in 30+ days. This is achieved through a **pure, zero-DB-read function** (`computeEffectiveConfidence`) that accepts `last_accessed_at`, `reinforcement_count`, `decay_exempt`, and base `confidence` as inputs, applies exponential decay, and returns a float — all without any database access.

The schema columns this phase depends on (`last_accessed_at`, `decay_exempt`, `reinforcement_count`, `strength`) were added by **migration 007_observations_decay**, which already exists in `packages/core/src/migrations.ts`. The `Observation` interface in `packages/core/src/types.ts` already declares all four fields. **No new migrations are needed.**

The integration work lands in two places: (1) `recallKnowledge` in `packages/mcp-server/src/tools.ts` — apply decay scoring to each row before returning results, and issue a lazy batch UPDATE of `last_accessed_at` after the read completes; (2) `queryEntities` — same effective_confidence field added to observation rows in the output. Both decay-exempt detection (join to entity type) and the lazy-write path for `last_accessed_at` require careful attention to avoid regressions on the STMT-02 prepared-statement contract and the entity-type JOIN already present on recall queries.

**Primary recommendation:** Implement `computeEffectiveConfidence` as a pure exported function in `packages/core/src/decay.ts`, integrate it in tools.ts result assembly, and issue a single batch UPDATE of `last_accessed_at` as a synchronous call after recall rows are assembled — not during the vector query.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Exponential decay: `base * e^(-lambda * daysSinceAccess)` with lambda=0.03 (~50% at 23 days)
- Reinforcement boost: `reinforcement_count * 0.1` added to effective confidence before decay cap
- Minimum effective confidence floor: 0.1 — never fully forgotten, always retrievable
- Decay-exempt entity types: preference, constraint, decision, architecture — return base confidence unchanged
- `last_accessed_at` updated on every recall that returns the observation — lazy write after read completes
- Decay modulates similarity: `final_score = similarity * effective_confidence`
- Include `effective_confidence` alongside base `confidence` in recall/query results
- `computeEffectiveConfidence` is a pure function at read time — no write-back to DB
- No write overhead in the hot path — the function computes, doesn't store
- better-sqlite3 synchronous API
- `last_accessed_at` column already exists from Phase 18 migrations

### Claude's Discretion
- Internal function structure and module placement
- SQL for updating last_accessed_at efficiently (batch update after recall)
- Test fixtures and edge case coverage
- Performance optimization for the lazy write path

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DECAY-01 | Observation importance score decays over time based on age and reinforcement frequency | `computeEffectiveConfidence` pure function with exponential decay formula + reinforcement boost |
| DECAY-02 | Decay is computed lazily at read time (not stored, no write-path overhead) | Pure function in `decay.ts`; no DB writes during scoring; lazy `last_accessed_at` UPDATE happens after read |
| DECAY-03 | Recall results factor in importance decay when ranking | Apply `final_score = similarity * effective_confidence` in result assembly; re-sort by final_score before returning |
</phase_requirements>

## Standard Stack

All work in this phase is pure TypeScript + existing better-sqlite3. No new packages are required.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | SQLite synchronous API for lazy write | Already in use; synchronous batch UPDATE fits the post-recall lazy-write pattern cleanly |
| TypeScript | 5.9 | Language | All computation logic stays fully typed |

### Supporting
No new libraries needed. The `decay.ts` module is pure arithmetic.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure TS function | SQL computed column (generated) | Generated columns can't take entity type as input without a JOIN; pure function is simpler and testable in isolation |
| Batch UPDATE after recall | Per-row UPDATE trigger | SQLite triggers fire synchronously and add write overhead in the hot path — violates the no-write-overhead constraint |

## Architecture Patterns

### Recommended Project Structure
```
packages/core/src/
├── decay.ts             # NEW — computeEffectiveConfidence pure function
├── types.ts             # Existing — Observation interface already has all needed fields
├── statements.ts        # Existing — add updateLastAccessedBatch prepared statement
└── migrations.ts        # Existing — migration 007 already added the columns

packages/mcp-server/src/
└── tools.ts             # Existing — integrate decay in recallKnowledge + queryEntities

packages/mcp-server/tests/
└── decay.test.ts        # NEW — pure function unit tests
```

### Pattern 1: Pure Decay Function
**What:** `computeEffectiveConfidence` lives in `packages/core/src/decay.ts`. It is exported and tested independently. It takes only scalars — no DB handle.
**When to use:** Called on each observation row during result assembly in `tools.ts`.
**Example:**
```typescript
// packages/core/src/decay.ts

const LAMBDA = 0.03;           // ~50% decay at 23 days
const REINFORCEMENT_WEIGHT = 0.1;
const FLOOR = 0.1;

export function computeEffectiveConfidence(params: {
  confidence: number;          // base confidence score
  decayExempt: boolean;        // true = return base score unchanged
  lastAccessedAt: string | null; // ISO 8601 or null (never accessed)
  reinforcementCount: number;
  now?: Date;                  // injectable for testing
}): number {
  const { confidence, decayExempt, lastAccessedAt, reinforcementCount, now = new Date() } = params;

  if (decayExempt) return confidence;

  const lastAccess = lastAccessedAt ? new Date(lastAccessedAt) : null;
  const daysSinceAccess = lastAccess
    ? (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24)
    : 30; // default: treat never-accessed as 30 days old

  const boost = reinforcementCount * REINFORCEMENT_WEIGHT;
  const decayed = confidence * Math.exp(-LAMBDA * daysSinceAccess);
  const effective = Math.min(confidence, decayed + boost);

  return Math.max(FLOOR, effective);
}
```

### Pattern 2: Recall Integration — Decay Scoring + Lazy Write
**What:** After `knnSearchObservations` returns rows, apply decay scoring, re-sort by `final_score`, then issue a single batch UPDATE of `last_accessed_at` for returned observation IDs.
**When to use:** At the end of `recallKnowledge` before building the response JSON.

The key complication: the KNN and FTS queries in `tools.ts` do not currently SELECT `last_accessed_at`, `decay_exempt`, or `reinforcement_count` from the observations table, nor `entity_type` for decay-exempt detection. The queries need to be extended to return those fields.

**Two approaches for fetching decay fields:**

Option A — Extend the SELECT in KNN/FTS queries to include the decay columns. Requires modifying the prepared statements in `statements.ts` (which changes `knnSearchObservations` and `ftsSearchObservations`). These statements are pre-compiled on startup — they accept changes without issue.

Option B — Execute a secondary SELECT on the returned observation IDs to fetch decay columns. Adds a second DB roundtrip.

**Use Option A** — same query, more columns. No extra roundtrip. Prepared statements already have entity JOIN in place for `entity_type`.

```typescript
// Updated knnSearchObservations (in statements.ts):
knnSearchObservations: db.prepare(`
  WITH knn AS (
    SELECT item_id, distance
    FROM vec_embeddings
    WHERE embedding MATCH ?
      AND k = ?
      AND item_type = 'observation'
  )
  SELECT
    o.id           AS observation_id,
    o.content,
    o.confidence,
    o.last_accessed_at,
    o.decay_exempt,
    o.reinforcement_count,
    e.name         AS entity_name,
    e.type         AS entity_type,
    knn.distance   AS relevance_score
  FROM knn
  JOIN observations o ON o.id = knn.item_id AND o.valid_until IS NULL
  JOIN entities e ON e.id = o.entity_id
  ORDER BY knn.distance
`),
```

The decay-exempt types (preference, constraint, decision, architecture) are on the **entity** — already JOINed. Check `e.type` directly in `computeEffectiveConfidence` call site.

### Pattern 3: Lazy Write for last_accessed_at
**What:** After result rows are assembled, issue a single `UPDATE observations SET last_accessed_at = ? WHERE id IN (...)` for the IDs that were returned.
**When to use:** At the very end of `recallKnowledge`, after result JSON is constructed. Must not block or error out the tool response if it fails.

```typescript
// In recallKnowledge, after rows are assembled:
if (rows.length > 0) {
  const now = new Date().toISOString();
  const placeholders = rows.map(() => '?').join(', ');
  const ids = rows.map(r => r.observation_id);
  // Synchronous — better-sqlite3, no await needed
  db.prepare(
    `UPDATE observations SET last_accessed_at = ? WHERE id IN (${placeholders})`
  ).run(now, ...ids);
}
```

Note: This is an inline `db.prepare()` call (not pre-compiled). This is acceptable as a STMT-02 exception because the number of placeholders varies with the result set. Document this as an explicit exception in the code comment.

### Pattern 4: Result Sorting After Decay
**What:** After computing `effective_confidence` for each row, compute `final_score = relevance_score * effective_confidence` and re-sort the array before returning.
**When to use:** Only for semantic search results. FTS rank is unitless — decay still applies to score but the combined value has no normalized meaning. Apply decay for FTS too for consistency.

```typescript
const scoredRows = rows.map(r => ({
  ...r,
  effective_confidence: computeEffectiveConfidence({
    confidence: r.confidence,
    decayExempt: DECAY_EXEMPT_TYPES.has(r.entity_type),
    lastAccessedAt: r.last_accessed_at ?? null,
    reinforcementCount: r.reinforcement_count,
  }),
}));

// final_score = similarity * effective_confidence
// Lower distance = more relevant for KNN; invert to get a score
// For KNN: relevance_score is distance (lower = better), so:
const ranked = scoredRows
  .map(r => ({ ...r, final_score: (1 - r.relevance_score) * r.effective_confidence }))
  .sort((a, b) => b.final_score - a.final_score);
```

### Pattern 5: Decay-Exempt Type Set
**What:** A small constant set of entity type strings that trigger the decay-exempt branch.
**Canonical set (from CONTEXT.md decisions):** `preference`, `constraint`, `decision`, `architecture`.

```typescript
// packages/core/src/decay.ts
export const DECAY_EXEMPT_TYPES = new Set(['preference', 'constraint', 'decision', 'architecture']);
```

Export it from `@myco/core` so both tools.ts and tests can reference the same constant without hardcoding strings.

### Anti-Patterns to Avoid
- **Storing effective_confidence in the DB:** DECAY-02 requires lazy computation at read time. Never persist effective_confidence — it would go stale immediately.
- **Per-row UPDATE during query loop:** Each UPDATE inside a `.map()` adds synchronous write overhead to the hot path. One batch UPDATE after the loop is the correct pattern.
- **Blocking tool response on last_accessed_at write failure:** The lazy write is best-effort. A failure to update `last_accessed_at` (e.g., DB constraint) must not propagate as a tool error.
- **Null-guarding lastAccessedAt as "never decay":** The correct default for a never-accessed observation is to treat it as 30 days old, not as 0 days. An observation that was stored but never recalled is probably stale.
- **Modifying `knnSearchForContradiction` or `knnSearchForRelationships`:** These are internal search helpers for write operations — they do not assemble recall results. Do NOT add decay to them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential decay formula | Custom sigmoid / polynomial | `Math.exp(-lambda * days)` | Exponential decay is the standard model for memory decay (Ebbinghaus forgetting curve); direct JavaScript implementation is one line |
| Batch UPDATE with variable IN clause | Prepared statement with fixed placeholders | Inline `db.prepare()` with dynamic placeholders (STMT-02 exception) | better-sqlite3 does not support array binding; placeholder count must match array length |

**Key insight:** There is no library for memory decay scoring — the math is trivial enough that a 10-line pure function is the right abstraction. The complexity is in the integration (reading the right columns, applying exemptions, issuing the lazy write correctly).

## Common Pitfalls

### Pitfall 1: RecallRow Interface Mismatch
**What goes wrong:** `knnSearchObservations` and `ftsSearchObservations` are modified to return new columns, but the `RecallRow` interface in `tools.ts` is not updated. TypeScript will compile but access returns `undefined` at runtime.
**Why it happens:** `RecallRow` is defined as a local interface in `tools.ts` with only the original columns. The new columns come from the database but TypeScript types the returned object as `RecallRow`.
**How to avoid:** Update the `RecallRow` interface to add `last_accessed_at: string | null`, `decay_exempt: number`, `reinforcement_count: number` when the prepared statement is extended.
**Warning signs:** `r.last_accessed_at` is always `undefined` in test output.

### Pitfall 2: Dynamic Recall Path Misses Decay Columns
**What goes wrong:** The fast path (`useDefaultTemporalOnly === true`) uses the updated prepared statement, but the dynamic WHERE path (when filters like `entity_type`, `min_confidence`, etc. are set) uses an inline `db.prepare()` that is copied from the old query without the new columns.
**Why it happens:** `recallKnowledge` has two distinct query branches. The dynamic path is built separately and easy to forget.
**How to avoid:** Search for both query branches in `recallKnowledge` and update both to SELECT the same decay columns.
**Warning signs:** Decay works in unfiltered recall but not when `entity_type` filter is applied.

### Pitfall 3: KNN Relevance Score Inversion
**What goes wrong:** KNN distance is `0.0` (perfect match) to `2.0` (opposite). Multiplying `relevance_score * effective_confidence` directly amplifies low confidence on near-perfect matches — the opposite of intent.
**Why it happens:** `relevance_score` is distance (lower = better), not similarity (higher = better).
**How to avoid:** Convert distance to similarity before multiplying: `final_score = (1 - relevance_score) * effective_confidence`. Cap at 0 if distance > 1 (theoretical max for cosine is 2.0 but practical max for similar content is ~0.5).
**Warning signs:** Highly relevant observations (low distance) get penalized instead of boosted.

### Pitfall 4: FTS Rank Is Negative
**What goes wrong:** SQLite FTS5 `rank` values are negative (BM25 scores where more negative = better match). Multiplying by `effective_confidence` preserves the negative value and makes sorting logic inverted.
**Why it happens:** FTS5 rank convention: `-1.0` is a good match, `-0.001` is a weak match.
**How to avoid:** Negate FTS rank before multiplying: `final_score = (-r.relevance_score) * effective_confidence`. Then sort descending by `final_score`.
**Warning signs:** FTS results return worst matches first after decay is applied.

### Pitfall 5: last_accessed_at Lazy Write Breaks on Empty Result Set
**What goes wrong:** If `rows.length === 0`, constructing `IN ()` with zero placeholders produces invalid SQL in SQLite (`WHERE id IN ()` is a syntax error).
**Why it happens:** The lazy write loop doesn't guard against an empty array.
**How to avoid:** Guard with `if (rows.length > 0)` before constructing and running the batch UPDATE.
**Warning signs:** Tool errors on queries that return zero results.

### Pitfall 6: Modifying Prepared Statements Breaks Tests
**What goes wrong:** `knnSearchObservations` and `ftsSearchObservations` are used in existing tests (`recall-filters.test.ts`, `temporal-query.test.ts`). Adding columns to the SELECT changes the shape of returned rows and may break test assertions on `Object.keys(row)` or exact JSON snapshots.
**Why it happens:** Tests written against the old row shape.
**How to avoid:** Review existing test assertions on recall result shapes before changing prepared statements. Update assertions to include new fields or use `expect.objectContaining()`.

## Code Examples

### computeEffectiveConfidence — Full Implementation
```typescript
// packages/core/src/decay.ts
// Source: derived from Ebbinghaus forgetting curve (exponential decay model)

export const DECAY_EXEMPT_TYPES = new Set([
  'preference',
  'constraint',
  'decision',
  'architecture',
]);

const LAMBDA = 0.03;               // half-life ~23 days
const REINFORCEMENT_WEIGHT = 0.1;  // +0.1 effective confidence per reinforcement
const FLOOR = 0.1;                 // minimum — never fully forgotten
const DEFAULT_DAYS_NOT_ACCESSED = 30;

export function computeEffectiveConfidence(params: {
  confidence: number;
  decayExempt: boolean;
  lastAccessedAt: string | null;
  reinforcementCount: number;
  now?: Date;
}): number {
  const { confidence, decayExempt, lastAccessedAt, reinforcementCount, now = new Date() } = params;

  if (decayExempt) return confidence;

  const lastAccess = lastAccessedAt ? new Date(lastAccessedAt) : null;
  const daysSinceAccess = lastAccess !== null
    ? (now.getTime() - lastAccess.getTime()) / (1000 * 60 * 60 * 24)
    : DEFAULT_DAYS_NOT_ACCESSED;

  const boost = reinforcementCount * REINFORCEMENT_WEIGHT;
  const decayed = confidence * Math.exp(-LAMBDA * daysSinceAccess);
  // Boost adds to decayed value but cannot exceed base confidence
  const effective = Math.min(confidence, decayed + boost);

  return Math.max(FLOOR, effective);
}
```

### Integrating Decay in recallKnowledge Result Assembly
```typescript
// After rows are fetched, before building the JSON response:
import { computeEffectiveConfidence, DECAY_EXEMPT_TYPES } from '@myco/core';

// Apply decay and compute final_score
const now = new Date();
const scoredRows = rows.map(r => {
  const effective_confidence = computeEffectiveConfidence({
    confidence: r.confidence,
    decayExempt: DECAY_EXEMPT_TYPES.has(r.entity_type),
    lastAccessedAt: r.last_accessed_at ?? null,
    reinforcementCount: r.reinforcement_count,
    now,
  });
  // KNN: distance 0=perfect, negate to get similarity; FTS: rank is negative BM25
  const similarity = method === 'semantic'
    ? Math.max(0, 1 - r.relevance_score)
    : -r.relevance_score;
  return { ...r, effective_confidence, final_score: similarity * effective_confidence };
});

// Re-sort by final_score descending
scoredRows.sort((a, b) => b.final_score - a.final_score);

// Lazy write last_accessed_at for returned IDs (best-effort, never throws)
if (scoredRows.length > 0) {
  const accessedAt = now.toISOString();
  const placeholders = scoredRows.map(() => '?').join(', ');
  const ids = scoredRows.map(r => r.observation_id);
  try {
    db.prepare(
      // STMT-02 exception: placeholder count varies with result set size
      `UPDATE observations SET last_accessed_at = ? WHERE id IN (${placeholders})`
    ).run(accessedAt, ...ids);
  } catch {
    // Best-effort — do not surface as tool error
  }
}
```

### Updated RecallRow Interface
```typescript
// packages/mcp-server/src/tools.ts — update RecallRow interface
interface RecallRow {
  observation_id: string;
  content: string;
  confidence: number;
  last_accessed_at: string | null;   // NEW
  decay_exempt: number;              // NEW (0 or 1 from SQLite INTEGER)
  reinforcement_count: number;       // NEW
  entity_name: string;
  entity_type: string;
  relevance_score: number;
}
```

### Exporting from @myco/core
```typescript
// packages/core/src/index.ts — add exports
export { computeEffectiveConfidence, DECAY_EXEMPT_TYPES } from './decay.js';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All recall results ranked purely by similarity | Similarity modulated by effective_confidence (time + reinforcement aware) | Phase 21 | Stale unreinforced memories rank lower; recently-accessed memories rank higher |
| last_accessed_at always NULL | Updated lazily after every recall that returns the observation | Phase 21 | Provides input signal for future recalls |

## Open Questions

1. **queryEntities decay integration scope**
   - What we know: CONTEXT.md says "include effective_confidence in recall/query results"
   - What's unclear: `queryEntities` is keyword/type filtered, not similarity ranked — there is no `relevance_score` to multiply. Should `effective_confidence` be included as an informational field only (no ranking change), or should observations be sorted by `effective_confidence` within each entity?
   - Recommendation: Include `effective_confidence` as an informational field in the `observations` array of `queryEntities` output, but do not re-rank by it. queryEntities is a lookup tool, not a ranked recall. This satisfies "include effective_confidence in results" without misusing it.

2. **`last_accessed_at` update in queryEntities**
   - What we know: CONTEXT.md says "updated on every recall that returns the observation". `queryEntities` also returns observations.
   - What's unclear: CONTEXT.md explicitly names "recall/query results" in the integration point.
   - Recommendation: Apply the same lazy-write UPDATE in `queryEntities` as in `recallKnowledge`. Both tools return observations to the agent.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies introduced — phase is pure TypeScript computation + existing SQLite/better-sqlite3 stack already confirmed available).

## Sources

### Primary (HIGH confidence)
- `/Users/olive/gsd-workspaces/myco-v5/myco/packages/core/src/migrations.ts` — migration 007_observations_decay confirms `last_accessed_at`, `decay_exempt`, `strength`, `reinforcement_count` columns already exist with correct defaults
- `/Users/olive/gsd-workspaces/myco-v5/myco/packages/core/src/types.ts` — `Observation` interface confirms all four decay fields are already typed
- `/Users/olive/gsd-workspaces/myco-v5/myco/packages/mcp-server/src/tools.ts` — full `recallKnowledge` and `queryEntities` implementation reviewed; integration points identified
- `/Users/olive/gsd-workspaces/myco-v5/myco/packages/core/src/statements.ts` — `knnSearchObservations` and `ftsSearchObservations` prepared statements reviewed; column additions mapped
- `/Users/olive/gsd-workspaces/myco-v5/myco/.planning/phases/21-memory-importance-decay/21-CONTEXT.md` — locked algorithm parameters

### Secondary (MEDIUM confidence)
- Ebbinghaus forgetting curve: exponential decay `R = e^(-t/S)` is the canonical cognitive model for memory decay; `lambda=0.03` (half-life ~23 days) is a reasonable approximation for agent session knowledge
- SQLite FTS5 rank convention: negative BM25 scores confirmed in SQLite FTS5 documentation (fts5.html#the_rank_function)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing codebase fully read
- Architecture: HIGH — integration points directly identified from source code
- Pitfalls: HIGH — derived from reading the actual prepared statements, RecallRow interface, and two-path query branching in recallKnowledge
- Algorithm correctness: HIGH — pure arithmetic, testable in isolation with injectable `now` parameter

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable domain — no external dependencies)
