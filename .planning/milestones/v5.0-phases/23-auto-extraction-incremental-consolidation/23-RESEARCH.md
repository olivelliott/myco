# Phase 23: Auto-Extraction + Incremental Consolidation - Research

**Researched:** 2026-03-27
**Domain:** Async LLM extraction, SQLite advisory locking, consolidation pipeline refactor
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- LLM: Ollama with existing model via Vercel AI SDK (`generateObject` for structured output)
- Extraction prompt: Structured output schema defining entities (name, type), observations (content), and relationships (from, to, type)
- Fire-and-forget: `setImmediate(() => extract(...))` — non-blocking, runs after MCP tool response returns
- Extracts: Entity names, types, observations, and relationships from episode content
- Trigger: Every `log_episode` triggers extraction → extracted items go to approval queue (no confidence threshold)
- Lock: `consolidation_lock` table row with `locked_at` timestamp + 5-minute expiry — atomic check-and-lock via SQL
- Micro-consolidation: Extract entities/relationships → route ALL to approval queue with `source_type: 'auto_extracted'`. No inference or contradiction detection
- Nightly-only operations: Relationship inference across episodes, contradiction detection, stale entity cleanup — deeper analysis that micro skips
- All auto-extracted entities unconditionally route to approval queue — no auto-approve threshold (STATE.md)
- Consolidation lock must be fully specified before implementation (STATE.md blocker)
- Vercel AI SDK with @ai-sdk/ollama provider for LLM calls (CLAUDE.md)
- node-cron for nightly scheduling (CLAUDE.md) — note: codebase actually uses `croner` (see State of the Art)

### Claude's Discretion
- Extraction prompt wording and schema structure
- Error handling for Ollama unavailability (graceful degradation)
- Lock table migration details
- Consolidation log format and storage
- Test mocking strategy for LLM calls

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXTRACT-01 | System passively extracts entities and relationships from conversation context via LLM | `extractFacts()` in consolidator.ts already does LLM extraction — needs to be called from `logEpisode` with a new simplified schema |
| EXTRACT-02 | Extraction runs asynchronously (fire-and-forget) and never blocks the MCP tool response | `setImmediate()` after `stmts.insertEpisode.run()` in `logEpisode` — response returns before callback fires |
| EXTRACT-03 | All auto-extracted items route through approval queue before becoming permanent knowledge | Insert to `approval_queue` with `source_type: 'auto_extracted'` and `reason: 'auto_extracted'` — no `rememberEntity` call |
| CONSOL-01 | Episodes consolidated on-the-fly after `log_episode`, not just at nightly 2am cycle | Micro-consolidation called from fire-and-forget callback in `logEpisode` |
| CONSOL-02 | Consolidation lock prevents race conditions between incremental and nightly | New `consolidation_lock` table with atomic SQL check-and-insert pattern |
| CONSOL-03 | Nightly cycle performs deeper analysis (relationship inference, contradiction detection) beyond incremental | `runConsolidation()` retains contradiction detection + merge candidate detection; new `runMicroConsolidation()` skips both |
</phase_requirements>

---

## Summary

Phase 23 adds two capabilities on top of an already-working consolidation pipeline: (1) fire-and-forget LLM extraction triggered on every `log_episode` call, and (2) a locking mechanism that prevents concurrent consolidation runs from racing against each other.

The codebase already has `extractFacts()` in `consolidator.ts` that calls Ollama via Vercel AI SDK with structured output. The micro-consolidation is a stripped-down version of this: extract from the single new episode, insert all results directly to the approval queue with `source_type: 'auto_extracted'`, no contradiction detection, no merge candidate checks, no auto-approve. The existing `runConsolidation()` remains intact for the nightly run and retains its deeper analysis.

The `consolidation_lock` table must be added via a new migration (010). The lock row is a singleton: try to INSERT it; if the row already exists and `locked_at` is within the 5-minute window, the new caller backs off. After the caller finishes, it DELETEs the lock row. Lock expiry recovery handles crashes.

**Primary recommendation:** Implement micro-consolidation as a standalone `runMicroConsolidation(db, stmts, episodeId)` function in `consolidator.ts`. The fire-and-forget call lives in `logEpisode()` in `memory-ops.ts`. The lock table lives in `migrations.ts` as migration 010.

---

## Standard Stack

All dependencies are already installed. No new packages required.

### Core (all already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 4.3.19 | LLM structured output | Locked — do NOT upgrade (CLAUDE.md, ollama-ai-provider incompatibility) |
| `ollama-ai-provider` | 1.2.0 | Ollama adapter for Vercel AI SDK | Already wired to `createOllama()` in consolidator.ts |
| `better-sqlite3` | 12.8.0 | SQLite synchronous API | Lock table DDL and atomic SQL executed synchronously |
| `nanoid` | 5.x | IDs for approval queue items | Already used in `consolidator.ts` |
| `croner` | 10.0.1 | Cron scheduler | Already used in scheduler.ts (note: CLAUDE.md says "node-cron" but code uses croner) |

### No New Dependencies Needed
The phase is entirely implemented by:
- A new migration in `migrations.ts`
- New/modified functions in `consolidator.ts`
- A small change to `logEpisode()` in `memory-ops.ts`
- New/extended type definitions in `types.ts`

---

## Architecture Patterns

### Recommended Project Structure (unchanged)
```
packages/mcp-server/src/
├── consolidator.ts      # Add runMicroConsolidation(), acquireLock(), releaseLock()
├── scheduler.ts         # Wrap runConsolidation() with lock acquisition
├── tools.ts             # No changes needed (logEpisode is in @myco/core)
└── index.ts             # No changes needed

packages/core/src/
├── memory-ops.ts        # Add setImmediate fire-and-forget after insertEpisode
├── migrations.ts        # Add migration 010_consolidation_lock
├── types.ts             # Add 'auto_extracted' to SourceType union
└── statements.ts        # No new statements needed (lock uses inline SQL)
```

### Pattern 1: Fire-and-Forget with setImmediate

**What:** After the synchronous DB write in `logEpisode`, schedule async work via `setImmediate` so the MCP tool response is returned to the caller before extraction begins.

**When to use:** Any time you need post-response side effects that must not block the response latency budget.

**Example:**
```typescript
// In logEpisode() — packages/core/src/memory-ops.ts
export async function logEpisode(
  db: Database.Database,
  params: { event_type: string; payload: object; agent_id?: string },
  stmts: MycoStatements,
): Promise<LogEpisodeResult> {
  const { event_type, payload, agent_id } = params;
  const prov = buildProvenance(SESSION_ID, agent_id, 'agent_session', 1.0);
  const id = nanoid();

  stmts.insertEpisode.run(id, prov.session_id, prov.agent_id, event_type, JSON.stringify(payload), prov.created_at);

  // EXTRACT-02: fire-and-forget — does NOT block response
  // extractAndQueue is injected to avoid circular dep between @myco/core and mcp-server
  if (onEpisodeLogged) {
    setImmediate(() => {
      onEpisodeLogged(id).catch((err: unknown) => {
        console.error('[log_episode] background extraction error:', err instanceof Error ? err.message : err);
      });
    });
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ id, session_id: prov.session_id }) }],
  };
}
```

**Dependency injection note:** `logEpisode` lives in `@myco/core`, but `runMicroConsolidation` lives in `@myco/mcp-server`. To avoid a circular dependency, use a callback registration pattern:

```typescript
// packages/core/src/memory-ops.ts
let onEpisodeLogged: ((episodeId: string) => Promise<void>) | null = null;

export function registerEpisodeCallback(fn: (episodeId: string) => Promise<void>): void {
  onEpisodeLogged = fn;
}
```

Then in `packages/mcp-server/src/index.ts` (or `tools.ts`), register after startup:
```typescript
import { registerEpisodeCallback } from '@myco/core';
import { runMicroConsolidation } from './consolidator.js';

registerEpisodeCallback((episodeId) => runMicroConsolidation(db, stmts, episodeId));
```

This pattern keeps `@myco/core` free of `mcp-server` dependencies.

### Pattern 2: SQLite Consolidation Lock

**What:** A singleton row in `consolidation_lock` acts as a mutex. Acquiring the lock = attempting an INSERT; if the row exists and is not expired, the INSERT fails and the caller backs off.

**When to use:** Any time you need to prevent two async processes from running the same expensive pipeline simultaneously. SQLite's synchronous API makes this simple — no `await` needed for the lock check-and-set.

**Lock table DDL:**
```sql
CREATE TABLE IF NOT EXISTS consolidation_lock (
  id         TEXT PRIMARY KEY DEFAULT 'singleton',
  locked_at  TEXT NOT NULL,
  locked_by  TEXT NOT NULL DEFAULT 'unknown'
);
```

**Atomic acquire pattern (SQLite INSERT OR IGNORE + expiry check):**
```typescript
const LOCK_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function acquireLock(db: Database.Database, lockedBy: 'micro' | 'nightly'): boolean {
  const now = new Date().toISOString();
  const expiryThreshold = new Date(Date.now() - LOCK_EXPIRY_MS).toISOString();

  // Remove stale lock (crash recovery) — synchronous, atomic with the insert below
  db.prepare(`DELETE FROM consolidation_lock WHERE locked_at < ?`).run(expiryThreshold);

  // Try to claim the lock — fails silently if row exists (not expired)
  const result = db.prepare(
    `INSERT OR IGNORE INTO consolidation_lock (id, locked_at, locked_by) VALUES ('singleton', ?, ?)`
  ).run(now, lockedBy);

  return result.changes === 1; // 1 = acquired, 0 = already held
}

export function releaseLock(db: Database.Database): void {
  db.prepare(`DELETE FROM consolidation_lock WHERE id = 'singleton'`).run();
}
```

**Why this works:** `better-sqlite3` is synchronous. The DELETE + INSERT OR IGNORE sequence runs in the same synchronous call chain on a single SQLite connection. There is no race window between two Node.js event loop iterations because the MCP server is single-process and better-sqlite3 blocks the event loop for each statement.

**CRITICAL:** The nightly `runConsolidation()` in `scheduler.ts` must also wrap with `acquireLock/releaseLock`. The micro-consolidation path and the nightly cron both call through the same lock.

### Pattern 3: Micro-Consolidation (Simplified Pipeline)

**What:** A new `runMicroConsolidation(db, stmts, episodeId)` function that:
1. Acquires the consolidation lock (backs off if held)
2. Fetches the single episode by ID
3. Calls `extractFacts()` on it
4. Inserts all extracted entities/relationships to `approval_queue` with `source_type: 'auto_extracted'` — no `rememberEntity`, no contradiction check, no merge detection
5. Marks episode as consolidated
6. Releases the lock

**What it does NOT do (nightly-only operations):**
- `detectContradiction()` — expensive KNN search, skipped for speed
- `findMergeCandidates()` — Levenshtein scan over all entities, skipped for speed
- Relationship inference across multiple episodes — nightly only
- Stale entity cleanup — nightly only

**Approval queue item format for auto-extracted items:**
```typescript
stmts.insertApprovalQueueItem.run(
  nanoid(),           // id
  'proposed_fact',    // item_type (matches existing resolve_approval logic)
  nanoid(),           // item_id
  'pending',          // status
  'auto_extracted',   // reason — new reason tag
  JSON.stringify({
    fact: {
      entity_name: fact.entity_name,
      entity_type: fact.entity_type,
      observation: fact.observation,
      confidence: fact.confidence,
      evidence_quote: fact.evidence_quote,
      related_entities: fact.related_entities,
    },
    source_episode_ids: [episodeId],
    source_type: 'auto_extracted',  // visible in approval queue metadata
  }),
  new Date().toISOString(),         // created_at
);
```

**Note on `source_type` field:** The `SourceType` union in `types.ts` currently does not include `'auto_extracted'`. This union must be extended to `'agent_session' | 'consolidation' | 'human_edit' | 'gsd_hook' | 'auto_discovery' | 'auto_extracted'`.

### Pattern 4: Deduplication of Rapid Calls

**Success criterion 3:** Calling `log_episode` 10 times in rapid succession must result in exactly ONE consolidation run, not 10.

The lock handles this correctly because:
1. First call acquires the lock, runs micro-consolidation, releases the lock
2. Calls 2-10 arrive during or after call 1; they call `acquireLock` and get `changes === 0` — they back off and do not consolidate
3. The episodes logged by calls 2-10 have `consolidated_at = NULL` and will be picked up by the next nightly run

This means micro-consolidation is NOT guaranteed to process every episode immediately — only the first one per lock window. This is intentional and matches the success criteria.

### Anti-Patterns to Avoid

- **Calling `runMicroConsolidation` synchronously inside `logEpisode`:** Blocks the MCP response for the full LLM round-trip (~1-5 seconds). Use `setImmediate`.
- **Calling `rememberEntity` from micro-consolidation:** All auto-extracted items must go to the approval queue. No auto-approve path for `source_type: 'auto_extracted'`.
- **Using a global boolean flag for the lock:** Race-safe only with DB-level locking. A JavaScript variable is not durable across crashes and has no expiry logic.
- **Importing `runMicroConsolidation` into `@myco/core`:** Creates a circular workspace dependency. Use the callback registration pattern.
- **Modifying `runConsolidation` to skip nightly-only operations:** Instead, create a separate `runMicroConsolidation` function. Keep `runConsolidation` intact.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parsing of free-form LLM text | `generateText` + `Output.object()` from `ai` package | Already working in `extractFacts()` — identical pattern for micro extraction |
| Atomic mutex without transactions | Application-level flag, `setTimeout` debounce | SQLite INSERT OR IGNORE + expiry | Single-process Node.js + synchronous better-sqlite3 makes this trivially correct |
| Deferred async execution | `setTimeout(0)`, `process.nextTick()` | `setImmediate()` | setImmediate fires after I/O callbacks but before setTimeout — correct semantics for post-response work |
| Approval queue inserts | Custom approval routing logic | `stmts.insertApprovalQueueItem` | Prepared statement already exists and tested |

---

## Common Pitfalls

### Pitfall 1: `source_type: 'auto_extracted'` TypeScript Error
**What goes wrong:** `SourceType` union in `types.ts` doesn't include `'auto_extracted'`. TypeScript compile error when inserting approval queue items with the new source type.
**Why it happens:** The union was defined before this phase.
**How to avoid:** Add `'auto_extracted'` to `SourceType` in `packages/core/src/types.ts` first — before writing any consolidation code.
**Warning signs:** `Type '"auto_extracted"' is not assignable to type 'SourceType'` at compile time.

### Pitfall 2: Circular Dependency @myco/core → @myco/mcp-server
**What goes wrong:** If `logEpisode` in `@myco/core` imports `runMicroConsolidation` from `@myco/mcp-server`, the workspace dependency graph becomes circular and TypeScript/Node.js module resolution breaks.
**Why it happens:** `@myco/core` is the foundational package; `@myco/mcp-server` depends on `@myco/core`, not the other way.
**How to avoid:** Use the `registerEpisodeCallback` pattern — `@myco/core` exports a registration function; `@myco/mcp-server` calls it at startup with the actual micro-consolidation function.
**Warning signs:** `Cannot find module '@myco/mcp-server'` in core tests; circular import warnings.

### Pitfall 3: Lock Not Released on Extraction Error
**What goes wrong:** If `extractFacts()` throws, `runMicroConsolidation` exits without calling `releaseLock()`. The lock row persists until the 5-minute expiry window, blocking all subsequent micro-consolidation.
**Why it happens:** Async errors in the fire-and-forget callback are uncaught if not wrapped in try/finally.
**How to avoid:** Always wrap the lock acquisition and release in try/finally:
```typescript
const acquired = acquireLock(db, 'micro');
if (!acquired) return;
try {
  // ... extraction work
} finally {
  releaseLock(db);
}
```
**Warning signs:** After a test that throws during extraction, subsequent `acquireLock` calls return false until the row expires.

### Pitfall 4: Migration Number Collision
**What goes wrong:** Migration `010_consolidation_lock` conflicts with an already-applied migration if a future migration was added between research and implementation.
**Why it happens:** Current last migration is `009_relationships_strength`. The next sequential number is `010`.
**How to avoid:** The next migration number is `010` — verify no new migration was added between phases before creating `010_consolidation_lock`.
**Warning signs:** `UNIQUE constraint failed: schema_migrations.version` on startup.

### Pitfall 5: `source_type` in Approval Queue Metadata Is Not Filtering the Queue
**What goes wrong:** The success criterion requires auto-extracted items appear with `source_type: 'auto_extracted'` in the approval queue. But `source_type` is metadata payload, not a column in `approval_queue`.
**Why it happens:** The `approval_queue` table has `reason` (TEXT), not `source_type`. The `source_type` goes inside the `metadata` JSON blob.
**How to avoid:** Use `reason: 'auto_extracted'` (the indexed column) AND include `source_type: 'auto_extracted'` inside the metadata JSON. Dashboard filtering can use the `reason` column. The success criterion is met if `source_type` appears in the approval queue metadata — which it does if included in the JSON payload.

### Pitfall 6: `consolidated_at` Not Set on Episodes Processed by Micro-Consolidation
**What goes wrong:** Episodes processed by `runMicroConsolidation` are not marked as consolidated. The nightly run re-processes them, creating duplicate approval queue items.
**Why it happens:** Forgetting to call `markBatchConsolidated` (or equivalent) at the end of micro-consolidation.
**How to avoid:** After inserting all extracted facts to the approval queue, always update `episodes SET consolidated_at = ? WHERE id = ?` for the processed episode ID.

### Pitfall 7: setImmediate Callback Has Stale db/stmts References
**What goes wrong:** In theory, `db` or `stmts` could be closed before the `setImmediate` callback fires.
**Why it happens:** This is not a real risk for this codebase — `db` is a module-level singleton that lives for the duration of the server process. But in tests, if `db.close()` is called in `afterEach` before the setImmediate fires, the callback will throw.
**How to avoid:** In tests, either flush the setImmediate queue with `await new Promise(resolve => setImmediate(resolve))` before assertions, or mock the callback to a no-op.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing extractFacts() — Reusable for Micro-Consolidation
```typescript
// Source: packages/mcp-server/src/consolidator.ts
// Already works with Vercel AI SDK generateText + Output.object()
// The same function can be called from runMicroConsolidation with a single episode
export async function extractFacts(episodeTexts: string[]): Promise<ExtractedFact[]> { ... }
```

### Existing insertApprovalQueueItem Pattern
```typescript
// Source: packages/mcp-server/src/consolidator.ts (line 269-278)
stmts.insertApprovalQueueItem.run(
  nanoid(),          // id
  'proposed_fact',   // item_type
  nanoid(),          // item_id
  'pending',         // status
  reason,            // reason — use 'auto_extracted' for Phase 23
  metadata,          // JSON string with fact payload
  new Date().toISOString(), // created_at
);
```

### Existing markBatchConsolidated Pattern
```typescript
// Source: packages/mcp-server/src/consolidator.ts (line 307-313)
// For single-episode micro-consolidation, simplify to:
db.prepare(`UPDATE episodes SET consolidated_at = ? WHERE id = ?`).run(
  new Date().toISOString(),
  episodeId
);
```

### Lock Acquire — Atomic DELETE + INSERT OR IGNORE
```typescript
// Proven SQLite pattern — synchronous, no TOCTOU race with better-sqlite3
const expiryThreshold = new Date(Date.now() - LOCK_EXPIRY_MS).toISOString();
db.prepare(`DELETE FROM consolidation_lock WHERE locked_at < ?`).run(expiryThreshold);
const result = db.prepare(
  `INSERT OR IGNORE INTO consolidation_lock (id, locked_at, locked_by) VALUES ('singleton', ?, ?)`
).run(new Date().toISOString(), lockedBy);
const acquired = result.changes === 1;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron | croner | Before Phase 18 | CLAUDE.md says "node-cron" but scheduler.ts already uses `croner@10.0.1`. Do NOT add node-cron. |
| `source_type` has 5 values | Must add `'auto_extracted'` | Phase 23 | Update `SourceType` union before writing consolidation code |
| `runConsolidation` auto-approves high-confidence facts | Phase 23: ALL auto-extracted items go to queue — no auto-approve | Phase 23 | Micro-consolidation has no auto-approve path. Nightly runConsolidation retains auto-approve for its own extracted facts |

**Deprecated/outdated:**
- None for this phase.

---

## Open Questions

1. **Should `runConsolidation` (nightly) also acquire the lock?**
   - What we know: The success criterion 5 says "when both incremental trigger and nightly cron attempt simultaneously, one waits for lock and runs after." This implies the nightly path also uses the lock.
   - What's unclear: CONTEXT.md does not explicitly say the nightly path wraps with the lock, but the success criterion implies it.
   - Recommendation: Yes — wrap `runConsolidation()` in `scheduler.ts` with `acquireLock('nightly')` / `releaseLock()`. This satisfies criterion 5 without ambiguity.

2. **Should micro-consolidation re-try if the lock is held?**
   - What we know: Success criterion 3 says "10 rapid log_episode calls result in exactly one consolidation run." Retry logic would produce more than one run.
   - What's unclear: Should the 9 backed-off episodes eventually be processed micro-style, or only by the nightly run?
   - Recommendation: No retry. Back off silently. The 9 episodes will be picked up by the nightly cron. This satisfies criterion 3 exactly.

3. **What extraction prompt schema to use for micro-consolidation?**
   - What we know: The existing `ExtractedFactSchema` in `consolidator.ts` is designed for multi-episode batch extraction with evidence quotes and confidence scores. The CONTEXT.md decision says micro-consolidation uses a "structured output schema defining entities (name, type), observations (content), and relationships (from, to, type)."
   - What's unclear: Whether to reuse `ExtractedFactSchema` or define a simpler micro schema.
   - Recommendation: Reuse `ExtractedFactSchema` and the existing `extractFacts()` function. It already produces the right shape and is battle-tested. The planner can decide whether to define a dedicated lighter schema.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Ollama service | LLM extraction | System-dependent | — | Graceful degrade: `extractFacts` returns `[]` on error |
| better-sqlite3 | Lock table | Already installed | 12.8.0 | — |
| ai (Vercel AI SDK) | generateText | Already installed | 4.3.19 | — |
| croner | Nightly scheduler | Already installed | 10.0.1 | — |

**No missing dependencies.** All required packages are already installed. Ollama being unavailable is a graceful degradation scenario (extraction returns `[]`), not a blocker.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `packages/mcp-server/src/consolidator.ts` — existing `extractFacts()`, `runConsolidation()`, `insertApprovalQueueItem` patterns
- Direct codebase inspection: `packages/core/src/memory-ops.ts` — existing `logEpisode()` implementation
- Direct codebase inspection: `packages/core/src/migrations.ts` — migration 009 is latest; next is 010
- Direct codebase inspection: `packages/core/src/types.ts` — `SourceType` union missing `'auto_extracted'`
- Direct codebase inspection: `packages/mcp-server/src/scheduler.ts` — uses `croner`, not `node-cron`
- Direct codebase inspection: `packages/core/src/statements.ts` — `insertApprovalQueueItem` prepared statement signature

### Secondary (MEDIUM confidence)
- Node.js docs: `setImmediate` fires after I/O callbacks, before `setTimeout(fn, 0)` — correct semantics for post-response work
- SQLite docs: `INSERT OR IGNORE` on a PRIMARY KEY constraint is atomic within a single connection — no TOCTOU race

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed and in use, versions confirmed from package.json
- Architecture: HIGH — fire-and-forget + SQLite lock patterns are well-established in the existing codebase style
- Pitfalls: HIGH — identified from direct code inspection (circular deps, lock release, migration numbering)

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable domain — no fast-moving dependencies)
