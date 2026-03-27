# Pitfalls Research

**Domain:** Feature parity and differentiation — temporal versioning, auto-entity extraction, incremental consolidation, codebase ingestion, import/export, memory decay, relationship strength scoring, REST API — added to an existing SQLite + MCP memory server
**Project:** Myco v5.0 Feature Parity & Differentiation
**Researched:** 2026-03-27
**Confidence:** HIGH (most pitfalls derived from known constraints of the existing system + verified against current sources)
**Scope:** Adding these features to the existing better-sqlite3 + sqlite-vec + Ollama + Hono system. Existing system has WAL mode, prepared statement caching, 98 tests, and the `project` namespace column.

---

## Critical Pitfalls

Mistakes that cause data corruption, silent failures, or require rewrites of newly-added features.

---

### Pitfall 1: Temporal Versioning — SQLite Has No Stable Transaction Time

**What goes wrong:**
Temporal fact versioning requires recording when a fact became valid. The naive approach is `valid_from = CURRENT_TIMESTAMP` in SQL. In SQLite, `CURRENT_TIMESTAMP` and `strftime('now')` are stable only within a single statement, not across a transaction. Two INSERTs in one transaction can record different timestamps if statements execute across a second boundary. The nightly consolidation runs many mutations in a single transaction — all "fact versions created during consolidation" would appear at subtly different timestamps.

**Why it happens:**
SQLite has no "transaction start time" concept like PostgreSQL's `NOW()` (which is stable for the full transaction). Developers copy patterns from Postgres temporal tables and assume timestamp semantics are equivalent.

**How to avoid:**
- Record `valid_from` in application code before opening the transaction: `const now = new Date().toISOString()`. Pass this as a bound parameter to all statements in that batch.
- Never use `DEFAULT CURRENT_TIMESTAMP` for temporal versioning. Reserve `DEFAULT` timestamps for system-managed `created_at` columns where millisecond consistency is irrelevant.
- For `valid_to`, set to `NULL` (representing "currently valid") on insert. On superseding a fact, issue a single UPDATE to set `valid_to = now` before the INSERT of the replacement.
- Add a composite index: `(entity_id, valid_from, valid_to)` so "what was true at time X" queries (`WHERE valid_from <= X AND (valid_to IS NULL OR valid_to > X)`) hit the index instead of scanning.

**Warning signs:**
- Two facts for the same observation differ by less than 1ms in `valid_from` after a consolidation run — likely clock drift in DEFAULT values.
- "What was true at time X?" queries return empty results for a known historical period — the `valid_to` on the superseded row was not set when the replacement was inserted.

**Phase to address:** Temporal Fact Versioning phase. Schema design must be locked before any other feature writes observations, or the migration to add `valid_from`/`valid_to` will need to backfill NULL values for all existing rows.

---

### Pitfall 2: Auto-Entity Extraction — LLM Hallucination Creates Ghost Entities

**What goes wrong:**
The existing consolidator already uses LLM structured output to extract `ExtractedFact` objects from episodes. Auto-extraction (passive capture from conversations) applies the same pattern to a wider, less-curated input stream. LLMs reliably hallucinate entities that are grammatically plausible but not actually present in the text — especially proper nouns, technical terms, and version numbers. These ghost entities enter the graph with full confidence if not gated.

The existing schema has no `source: 'auto_extracted'` marker on entities, making it impossible to retroactively filter or audit auto-extracted facts separately from explicitly-remembered ones.

**Why it happens:**
- Auto-extraction removes the human signal ("I explicitly asked to remember this") that filters the consolidation input.
- The `evidence_quote` field in `ExtractedFactSchema` is supposed to ground the extraction, but LLMs frequently generate plausible-sounding quotes that are paraphrases, not verbatim text. If the quote is verified post-hoc, many extractions fail.
- At batch consolidation scale (10 episodes per run), a 5% hallucination rate produces 1-2 ghost entities per nightly run. Over a month, the graph fills with noise.

**How to avoid:**
- Add `source_type: 'auto_extracted'` as a valid `SourceType` and tag all auto-extracted entities/observations with it.
- Auto-extracted facts should default to `confidence < 0.7` and always route through the approval queue — never auto-approve.
- Verify `evidence_quote` is a substring of the source episode text (or within Levenshtein distance 20). Reject extractions where the quote cannot be found.
- Keep auto-extraction opt-in per agent session with a `passive_capture: boolean` flag so power users can disable it.

**Warning signs:**
- The approval queue fills 10x faster after enabling auto-extraction — expected, but if queue items are consistently rejected at >50%, the extraction prompt needs tightening.
- Entities appear with no relationships and no reinforcing observations — classic ghost entity signature.
- Entity names contain version numbers or partial sentences: `"React 18.2.0 with concurrent"` — the LLM failed to isolate entity boundaries.

**Phase to address:** Auto-Entity Extraction phase. The approval queue must already be stable and batch-operable (from the Approvals UI polish in v4.0) before auto-extraction is enabled, or the queue will be unusable under the new load.

---

### Pitfall 3: Incremental Consolidation — Duplicate Processing and Consistency Drift

**What goes wrong:**
The existing nightly consolidation marks episodes with `consolidated_at` to track what has been processed. Incremental consolidation (triggered on each `remember` call or at a lower frequency) processes the same episodes multiple times if the `consolidated_at` marker is not checked correctly. Worse: two consolidation runs can concurrently process overlapping episode windows — one nightly, one triggered incrementally — and both create entities, producing duplicates that bypass the dedup logic.

The deeper problem: incremental consolidation creates entities from small context windows (1-3 episodes), while nightly consolidation sees the full session and can make better inferences. The two passes produce semantically inconsistent entity sets — the same real-world concept appears under two slightly different names.

**Why it happens:**
- The `runConsolidation` function in `consolidator.ts` currently selects `WHERE consolidated_at IS NULL` and marks them at end of run. If a second run starts before the first finishes (possible if nightly fires while incremental is running), both select the same unconsolidated episodes.
- Better-sqlite3 is synchronous and single-writer. Two calls to `runConsolidation` from different async pathways (cron vs. MCP tool call) will serialize — but both will see the same unprocessed episodes before either marks them.

**How to avoid:**
- Implement a consolidation lock: a `consolidation_lock` table with a single row `{ locked_at, locked_by }`. Any consolidation attempt that finds an unexpired lock (e.g., `locked_at > now - 5 minutes`) skips itself. Release the lock in a `finally` block.
- For incremental consolidation, process only the single most-recent unconsolidated episode (not all unconsolidated). This makes the operation cheap and idempotent.
- Incremental consolidation should write to a `pending_approval` state only — never directly to the graph. The nightly run merges pending items into the graph with full dedup logic and wider context.
- Add `consolidation_source: 'incremental' | 'nightly'` metadata to entities created during consolidation. This makes the provenance auditable.

**Warning signs:**
- Entity count grows faster than the number of unique concepts discussed — dedup is not catching incremental-vs-nightly duplicates.
- Two entities have nearly identical names and observations but different `session_id` values — created in separate consolidation passes.
- The approval queue receives the same proposed fact multiple times — the same episode was consolidated twice.

**Phase to address:** Incremental Consolidation phase. Must build the lock mechanism first, before any incremental triggers. Do not enable incremental until the nightly pipeline has been running stably for at least one week of testing.

---

### Pitfall 4: Auto-Dedup / Conflict Resolution — Wrong Merges Are Harder to Undo Than Missed Merges

**What goes wrong:**
Entity merging is destructive: relationships from entity A are re-pointed to entity B, entity A is deleted (cascade deletes its observations), and the reverse is impossible without full audit trails. The existing `isMergeCandidate` function (Levenshtein ≤ 2 on lowercased names) will incorrectly merge `"React"` and `"Recat"`, `"git"` and `"bit"`, or `"TypeScript"` and `"JavaScript"` (distance = 4, safe) — but also `"Vite"` and `"Vim"` (distance = 2, WRONG merge).

At high volume (codebase ingestion or auto-extraction adding 50+ entities per session), false-positive merges compound. A single wrong merge can destroy the observations of a legitimate entity.

**Why it happens:**
- Levenshtein on raw names is too aggressive for short technical terms. `"Go"` and `"Io"` have distance 1. `"npm"` and `"npx"` have distance 1.
- The dedup logic does not consider entity type. `"React"` (framework) and `"React"` (agent name from a conversation) are the same string but different concepts — merging them corrupts both.
- Developers underestimate how many short technical names exist in a typical developer knowledge graph.

**How to avoid:**
- All merge candidates must be routed to the approval queue, never auto-merged. The confidence threshold for auto-approval (`≥ 0.85`) should never apply to merges.
- Require entity type agreement before even considering a merge: never merge entities of different types.
- Augment Levenshtein with embedding cosine similarity: only propose a merge if both `levenshtein(a, b) <= 2` AND `cosineSimilarity(embedA, embedB) > 0.92`. The embedding requirement eliminates `"Go"` / `"Io"` false positives.
- Store a `merged_into` column on soft-deleted entities (rather than hard-deleting) for the first three months after deploying dedup. This enables undo.

**Warning signs:**
- An entity with many observations disappears from the graph after a consolidation run — it was merged into another entity and the source entity was deleted.
- The observation count on an entity spikes unexpectedly — orphaned observations from a merged source were re-attached.
- A relationship loops from an entity back to itself (`from_id = to_id`) — created when two sides of a relationship were merged into the same entity.

**Phase to address:** Auto-Dedup / Conflict Resolution phase. The approval queue UI must support a "proposed merge" item type that shows both entities side-by-side with their observations before the user confirms.

---

### Pitfall 5: Schema Migrations — The `ALTER TABLE` Accumulation Problem

**What goes wrong:**
The existing `schema.ts` already shows this pattern: each v3.0 migration is a `try/catch ALTER TABLE` block appended at the bottom of `applySchema()`. By the time v5.0 adds temporal versioning columns (`valid_from`, `valid_to`, `superseded_by`), relationship strength columns (`strength`, `reinforcement_count`, `last_reinforced_at`), and decay columns (`importance_score`, `last_accessed_at`, `half_life_days`), the migration block will be 200+ lines of `try/catch ALTER TABLE` executed on every server startup. On a database with 100k+ rows, these idempotent migrations scan `sqlite_master` for each attempt — a measurable startup delay.

The deeper issue: `ALTER TABLE` in SQLite cannot change a column's type, add a NOT NULL constraint to an existing column, or add a column with a non-constant default. When temporal versioning needs `valid_from TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`, this is a non-constant default — the column must be added as nullable and backfilled.

**Why it happens:**
- The startup-migration pattern is pragmatic for small schemas. It becomes a liability when there are 15+ column additions across 5 tables.
- Developers forget that SQLite's `ALTER TABLE ADD COLUMN` only supports literal constant defaults, not expressions.

**How to avoid:**
- Introduce a `schema_migrations` table (migration ID, applied_at) before v5.0 begins. Migrate each existing `try/catch ALTER TABLE` into numbered migration entries. On startup, check which migrations have run; execute only new ones.
- For any column with a non-trivial default (temporal timestamps, computed scores), add it as `TEXT DEFAULT NULL`, backfill existing rows immediately after `ALTER TABLE`, then set a NOT NULL check via application-level validation rather than schema constraint.
- Group v5.0 schema changes into three migrations: (1) temporal columns, (2) decay/importance columns, (3) relationship strength columns. Run in order, idempotently.

**Warning signs:**
- `applySchema()` takes more than 200ms on startup against a populated database — too many migration attempts.
- A migration adds a NOT NULL column without a backfill step — all existing rows get NULL values that violate the intended constraint.
- Two migrations add the same column name to the same table — the second silently fails without error (swallowed by `try/catch`), masking the mistake.

**Phase to address:** First v5.0 phase (any phase that touches the schema). The migration framework must be in place before any feature adds columns — or the `try/catch` pattern will grow to unmanageable size.

---

### Pitfall 6: REST API — Adding HTTP Server Breaks the MCP Stdio Assumption

**What goes wrong:**
The MCP server communicates via stdio. Claude Code starts the process, writes JSON-RPC to stdin, and reads responses from stdout. Any output to stdout that is not MCP protocol JSON breaks the connection. The existing system already has a Hono REST API in a separate `packages/api-server` process — this is the correct architecture. The pitfall is when developers try to combine MCP and HTTP into one process (e.g., "add a REST endpoint to the MCP server package") because it seems simpler.

The second pitfall: when the REST API and MCP server both write to the SQLite database, better-sqlite3's single-writer lock means the REST server's writes block the MCP server's synchronous operations, and vice versa. In WAL mode, reads can proceed concurrently with writes, but two writers on the same connection serialize. If the REST server handles a slow bulk import while an agent issues a `remember` call, the `remember` will wait for the lock — and MCP tool calls time out.

**Why it happens:**
- The MCP server is already a Node.js process — it looks trivial to add `app.listen(3001)` to it.
- WAL mode is often described as "concurrent reads and writes" which is misleading: it means reads and writes can proceed simultaneously (reads don't block writes), but writes still require an exclusive lock.

**How to avoid:**
- Keep MCP server and REST API as separate processes (the existing architecture). The `api-server` package already exists — do not merge it with `mcp-server`.
- For operations that could be slow (bulk import, codebase ingestion, full graph export), run them exclusively in the REST API process, not the MCP server.
- Set `db.pragma('busy_timeout = 5000')` in both processes so a locked write waits up to 5 seconds rather than failing immediately.
- For the REST API's bulk import endpoint, wrap the entire import in a single transaction to minimize lock hold time. A 1000-entity import in one transaction holds the lock for ~50ms total vs. ~50ms per row in autocommit mode.

**Warning signs:**
- `console.log()` or `process.stdout.write()` calls added to the MCP server package — any non-JSON output to stdout will corrupt the MCP transport stream.
- An agent's `remember` call returns a "database is locked" error — the REST API holds the write lock for a long operation.
- The MCP server's memory usage climbs during a REST API bulk import — the WAL file is growing because the checkpoint cannot run while a write transaction is open.

**Phase to address:** REST API / Import-Export phase. The import endpoint is the highest-risk point for write contention — it must use single-transaction bulk writes and be tested against a concurrent MCP session.

---

### Pitfall 7: Codebase Ingestion — Scope Explosion and Graph Pollution

**What goes wrong:**
The `codify` tool is intended to turn project structure and conventions into graph knowledge. The temptation is to ingest everything: every file path, every function signature, every import statement. A typical TypeScript project with 200 files produces 2,000+ entities if files, modules, functions, and classes are all ingested. This overwhelms the graph explorer UI (which starts to struggle at ~1,500 nodes), pollutes semantic search results with implementation details, and makes consolidation runs much more expensive.

The second problem: stale codebase facts. After ingestion, the developer renames a function. The graph still contains the old function entity. There is no re-ingestion mechanism, so stale entities accumulate. At the next consolidation, the LLM may infer contradictory facts: "function X calls Y" (from episode memory) while the graph says "function X was renamed to Z."

**Why it happens:**
- AST traversal naturally produces a node per symbol. Developers don't filter aggressively enough because "more data = better recall" feels true.
- Re-ingestion is not designed from the start because initial ingestion seems like a one-time operation.

**How to avoid:**
- Limit ingestion to three abstraction levels: project, package/module, and public API surface (exported symbols only). Skip private functions, local variables, and internal implementation details.
- Tag all ingested entities with `source_type: 'codebase'` and `project: '<project-name>'`. This enables project-scoped filtering and bulk deletion when re-ingesting.
- Re-ingestion must delete all `source_type: 'codebase'` entities for the target project before inserting fresh ones — a clean-slate update, not an additive one.
- Implement a file-level hash cache: skip re-ingesting files whose content hash has not changed since last ingestion.

**Warning signs:**
- The graph explorer shows >1,000 nodes after a single `codify` run on a medium-sized project.
- `recall` results for a concept return function signatures and internal variable names alongside higher-level architectural facts — ingestion granularity is too fine.
- The `project` filter on `recall` returns results from a project the agent is no longer working on — stale codebase entities were not cleaned up.

**Phase to address:** Codebase Ingestion phase. Scope constraints (abstraction level, clean-slate re-ingestion, file hashing) must be in the design spec before any ingestion code is written. They cannot be retrofitted easily once entities are in production graphs.

---

### Pitfall 8: Memory Importance Decay — Decaying the Wrong Things

**What goes wrong:**
A naive decay implementation runs a nightly job that applies `importance_score *= decay_factor` to all observations. This will eventually decay architectural decisions, user preferences, and project constraints that have not been "reinforced" recently — exactly the facts that should be most durable. In a single-user knowledge graph, "unreinforced" does not mean "unimportant." A fact about how a project's test runner is configured was set once and never needs to be revisited — but it is critical context.

The secondary problem: decay scores stored as REAL values in SQLite accumulate floating-point drift over thousands of decay cycles. After 365 daily decays with a factor of 0.99, `1.0 * 0.99^365 ≈ 0.025`. At that point, the recall system may exclude still-important facts because they fall below a display threshold.

**Why it happens:**
- Ebbinghaus forgetting curve models were designed for individual human memory of arbitrary facts, not for curated, structured knowledge graphs.
- Developers apply uniform decay because it is simple to implement. Context-aware decay (exempt certain entity types, exempt high-confidence facts above 0.95) requires more schema work.

**How to avoid:**
- Decay should be opt-in per entity type. Entities of type `preference`, `constraint`, `decision`, and `architecture` should have `decay_exempt: true` by default.
- Apply decay only to `source_type: 'auto_extracted'` observations in the first version. Explicitly-remembered facts (`source_type: 'agent_session'`) should not decay.
- Do not decay below a floor of `importance_score = 0.1`. Facts at the floor are "dormant" not "deleted." A reinforcing event (recall, reference, related entity added) resets the score to 1.0.
- Store `last_accessed_at` on entities and observations (updated on every `recall` that returns the item). Use this to compute "days since last access" as the decay input rather than an absolute clock.

**Warning signs:**
- A `recall` for a well-known project convention returns no results — the entity's importance has decayed below the recall filter threshold.
- `importance_score` columns contain values like `2.77e-17` — unchecked exponential decay has driven scores to floating-point underflow.
- The graph explorer shows fewer and fewer nodes over time without any explicit deletions — decayed entities are being excluded from the default filtered view.

**Phase to address:** Memory Importance Decay phase. Implement decay on `auto_extracted` entities only first. Expand to other source types only after validating that the floor and exemption logic are working correctly.

---

### Pitfall 9: Relationship Strength Scoring — Write Amplification on Every Recall

**What goes wrong:**
Relationship strength increases when a relationship is reinforced (a `recall` that traverses the relationship, or a `remember` that re-asserts it). If `strength` and `last_reinforced_at` are updated in the database on every such event, every `recall` becomes a write operation. The existing `recall` tool in `tools.ts` is currently a read-only operation (no writes after embedding lookup). Converting it to a read-write operation means:

1. The `recall` tool must acquire a write lock on the database.
2. If multiple agent sessions call `recall` concurrently (parallel agents), writes serialize and slow down all queries.
3. The prepared statement cache (`statements.ts`) has a prepared `UPDATE` statement that runs on every `recall` — this multiplies by the number of relationship hops returned.

**Why it happens:**
- Reinforcement scoring feels like it should happen in real-time. Batch updating after the fact seems wrong.
- Developers underestimate how frequently `recall` is called in an active agent session (often every few messages).

**How to avoid:**
- Do not update relationship strength synchronously on `recall`. Instead, write to a `reinforcement_events` table (entity_id, relationship_id, event_type, created_at) with a simple INSERT — much cheaper than an UPDATE with a read-modify-write cycle.
- Run a `processReinforcementEvents` step in the nightly consolidation that aggregates the events table and updates `strength` and `reinforcement_count` in bulk.
- For the initial implementation, update strength only on `remember` calls (when a relationship is explicitly re-asserted), not on `recall`. This is a simpler trigger that does not affect query performance.

**Warning signs:**
- `recall` latency increases from ~5ms to ~50ms after enabling relationship strength tracking — the write amplification is measurable.
- The `reinforcement_events` table grows without bound — the batch processor is not running or not clearing processed events.
- The WAL file size grows steadily during an active agent session — strength updates from `recall` are accumulating in the WAL faster than checkpoints clear them.

**Phase to address:** Relationship Strength Scoring phase. Defer the real-time reinforcement approach entirely. The nightly-batch approach is simpler, doesn't affect hot-path performance, and can be validated against the same consolidation pipeline already in use.

---

### Pitfall 10: Import / Export — Destructive Import Without Dry-Run

**What goes wrong:**
Import from an external format (Mem0 JSON, Anthropic reference server JSONL) adds entities and observations to the existing graph. Without a conflict resolution strategy, an import can:
- Create duplicate entities that bypass the dedup logic (different IDs, same name)
- Overwrite existing observations with lower-quality imported versions
- Destroy the `project` namespace isolation by importing entities without a `project` tag

The most dangerous scenario is a re-import: the user exports their graph, modifies it externally, and imports it back. If the import does not check for existing IDs, every entity appears twice.

**Why it happens:**
- Import APIs often default to "INSERT or IGNORE" which silently drops conflicts, or "INSERT or REPLACE" which silently destroys existing data.
- Users expect import to be idempotent without understanding the deduplication cost.

**How to avoid:**
- Implement import as a two-phase operation: (1) dry-run that returns a preview of what would be added, updated, or skipped; (2) execute that performs the actual writes. Never skip the dry-run in the UI.
- On import, check for existing entities by ID first. If an entity with the same ID exists, compare `updated_at` and keep the newer one.
- Import must assign a `project` tag to all imported entities (defaulting to the import filename or a user-specified project name) to prevent namespace pollution.
- Provide a `--merge` flag (update existing) and a `--skip-existing` flag (additive only) — never silently choose one behavior.

**Warning signs:**
- Entity count doubles after a re-import — duplicate detection is not checking by ID.
- A `recall` returns observations in two languages or two writing styles for the same entity — two versions coexist after a partial import.
- The `project` filter on `recall` returns imported entities that should be scoped to a different project.

**Phase to address:** Import/Export phase. Export must come first (to validate the schema is correct and complete) before import is attempted. Test with a full export-clear-import cycle before releasing.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `try/catch ALTER TABLE` for all migrations | Zero migration framework overhead | Startup runs all migrations on every boot; breaks on non-constant defaults; masks failed migrations | Never for v5.0 — introduce a migrations table before adding more columns |
| Levenshtein-only entity dedup | Simple to implement, no embedding overhead | False positive merges on short technical names (`Go`, `npm`, `git`) | Never in production — always pair with embedding similarity |
| Auto-approving auto-extracted entities at confidence ≥ 0.85 | Fewer items in approval queue | Ghost entities enter the graph permanently without human review | Never — auto-extracted facts should always require human approval |
| Updating relationship strength synchronously on `recall` | Real-time strength accuracy | Converts read-only `recall` into a write operation; degrades query performance at scale | Never — batch-update in nightly consolidation instead |
| Ingesting all symbols from codebase AST | Comprehensive graph coverage | Graph pollution; 1000+ low-value entities per project; slow semantic search | Never — limit to public API surface and project-level facts |
| Uniform decay applied to all entity types | Simple implementation | Decays architectural constraints and preferences that should never fade | Acceptable only for `auto_extracted` entities in v5.0 |

---

## Integration Gotchas

Common mistakes when connecting the new v5.0 features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Temporal versioning + existing observations | Adding `valid_from`/`valid_to` columns without backfilling existing rows | `ALTER TABLE observations ADD COLUMN valid_from TEXT` followed immediately by `UPDATE observations SET valid_from = created_at WHERE valid_from IS NULL` |
| Auto-extraction + approval queue | Flooding the queue with hundreds of low-confidence items, making it unusable | Set extraction batch size to max 5 entities per episode; require `confidence >= 0.6` to even enter the queue |
| Incremental consolidation + nightly cron | Nightly and incremental runs racing on the same unconsolidated episodes | Add an exclusive consolidation lock row checked atomically before any consolidation run starts |
| Memory decay + recall filters | Decayed entities vanishing from `recall` results with no warning | Set a decay floor (e.g., 0.1) below which entities are "dormant" not deleted; add `include_dormant` filter parameter to `recall` |
| Codebase ingestion + project namespaces | Ingested entities not tagged with a `project` value, polluting the global namespace | `codify` tool must require a `project` argument; never ingest without project scoping |
| REST API bulk import + MCP `remember` | Write lock contention: import holds the lock, `remember` times out | Import must use a single transaction; set `busy_timeout = 5000` on both database connections |
| Relationship strength + sqlite-vec embeddings | Embedding vectors not updated when an entity is merged or its name changes | On entity merge, re-embed the surviving entity's observations; add a `needs_embedding = 1` trigger on any merge event |

---

## Performance Traps

Patterns that work at small scale but fail as the graph grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Computing `importance_score` decay in a row-by-row UPDATE loop | Consolidation takes minutes instead of seconds | Use `UPDATE observations SET importance_score = importance_score * ? WHERE source_type = 'auto_extracted' AND decay_exempt = 0` — a single statement | At ~10,000 observations |
| Querying temporal history without a compound index on `(entity_id, valid_from, valid_to)` | "What was true at time X" queries take >1 second | Add the compound index at migration time | At ~5,000 versioned facts |
| Re-embedding all observations after an entity merge | Embedding queue grows unbounded during bulk operations | Only re-embed observations whose `content` changed; mark with `needs_embedding = 1` and process asynchronously | At ~1,000 merged entities |
| Storing full AST dump in entity `metadata` JSON | Graph export file is 50MB+ for a medium project | Store only summary facts (module name, exports list, doc comment) in the graph; keep AST data in a separate file if needed | At first medium-sized project ingestion |
| Running `discoverRelationships()` after every `remember` call with incremental consolidation enabled | Relationship discovery is O(entities²) for name matching; becomes slow | Batch relationship discovery; run only during consolidation, not on every `remember` | At ~500 entities |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Temporal versioning:** The `valid_from` column exists — but verify that `recall` actually filters by temporal range when a `as_of` parameter is passed, and that all existing observations were backfilled with `valid_from = created_at`.
- [ ] **Auto-entity extraction:** The extraction runs and produces entities — but verify that (a) all auto-extracted items route to the approval queue, (b) `evidence_quote` verification is active, and (c) the `source_type: 'auto_extracted'` tag appears on every created entity.
- [ ] **Incremental consolidation:** The trigger fires on `remember` — but verify the consolidation lock prevents double-processing and that the nightly run still processes incremental-staged items.
- [ ] **Codebase ingestion:** The `codify` tool creates entities — but verify that (a) re-running `codify` for the same project deletes stale entities before inserting fresh ones, (b) all ingested entities carry `source_type: 'codebase'` and the correct `project` tag.
- [ ] **Memory decay:** Decay runs nightly — but verify that (a) `decay_exempt` entities are never updated, (b) the floor of 0.1 is enforced, and (c) `last_accessed_at` is updated on every `recall` that returns the entity.
- [ ] **Import/Export:** Export produces a valid JSON file — but verify that re-importing the same file is idempotent (no duplicate entities created on second import).
- [ ] **Relationship strength scoring:** Strength values appear in the graph — but verify they are not being updated synchronously on `recall`, and that the nightly batch processor clears the `reinforcement_events` table after processing.
- [ ] **REST API import:** The import endpoint accepts JSON — but verify it uses a single transaction, sets `busy_timeout`, and returns a meaningful dry-run preview before executing.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Ghost entities from auto-extraction | LOW | `DELETE FROM entities WHERE source_type = 'auto_extracted' AND confidence < 0.5` — targeted cleanup without touching explicitly-remembered facts |
| Wrong entity merge | MEDIUM | If `merged_into` soft-delete column was implemented: restore the soft-deleted entity and re-point its relationships. If hard-deleted: restore from the nightly SQLite backup (implement backup before enabling auto-dedup). |
| Schema migration applied incorrectly | MEDIUM | SQLite allows copying to a new database with correct schema. Use `.dump` to export data, apply fresh schema, reimport. The migration table prevents re-applying. |
| Stale codebase entities after project rename | LOW | `DELETE FROM entities WHERE source_type = 'codebase' AND project = '<old-name>'` then re-run `codify` with the new project name. |
| Importance decay floor not enforced — values near zero | LOW | `UPDATE observations SET importance_score = 0.1 WHERE importance_score < 0.1` — a one-time correction, then fix the decay query. |
| Import created duplicate entities | MEDIUM | Identify duplicates: `SELECT name, COUNT(*) FROM entities GROUP BY name HAVING COUNT(*) > 1`. For each pair, merge manually via the approval queue's merge flow. |
| Write lock contention from REST import | LOW | The `busy_timeout` will eventually resolve it. If the import is stuck: restart the REST API server. The import transaction rolls back cleanly; retry with a smaller batch. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SQLite has no stable transaction time | Temporal Versioning phase | Test: two facts inserted in the same transaction have identical `valid_from` values |
| LLM hallucination creates ghost entities | Auto-Entity Extraction phase | Test: extraction with a deliberately sparse episode produces ≤ 2 entities; `evidence_quote` verification rejects 100% of quotes not found in source text |
| Duplicate processing in incremental consolidation | Incremental Consolidation phase | Test: run `runConsolidation` twice concurrently; verify only one execution proceeds; no duplicate entities created |
| Wrong entity merges | Auto-Dedup phase | Test: merge candidates include `"Go"` and `"Io"` — verify they are NOT proposed as a merge (embedding similarity check rejects them) |
| Schema migration accumulation | First phase touching the schema | Test: `applySchema()` completes in <50ms on a database with 50k rows; run migrations twice, verify second run is a no-op |
| REST API breaks MCP stdio | REST API phase | Test: start MCP server and REST API simultaneously; verify MCP stdout contains only valid JSON-RPC; verify `remember` succeeds during an active REST import |
| Codebase ingestion scope explosion | Codebase Ingestion phase | Test: `codify` on the Myco repo itself produces <200 entities; re-running `codify` produces the same count (idempotent) |
| Decaying important architectural facts | Memory Decay phase | Test: an entity with `source_type: 'agent_session'` and `decay_exempt: true` has unchanged `importance_score` after 30 simulated decay cycles |
| Write amplification on `recall` | Relationship Strength phase | Test: measure `recall` latency before and after enabling relationship strength; latency increase must be <5ms |
| Destructive import without dry-run | Import/Export phase | Test: import a file twice; entity count is identical after both imports (idempotent) |

---

## Sources

- [SQLite Write-Ahead Logging — SQLite official documentation](https://www.sqlite.org/wal.html)
- [SQLite concurrent writes and "database is locked" errors — Ten Thousand Meters](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)
- [Improving concurrency — better-sqlite3 docs](https://wchargin.com/better-sqlite3/performance.html)
- [SQLite and Temporal Tables: Managing Historical Data — SQLite Forum](https://www.sqliteforum.com/p/sqlite-and-temporal-tables)
- [Simple declarative schema migration for SQLite — David Rothlis](https://david.rothlis.net/declarative-schema-migration-for-sqlite/)
- [Knowledge Graphs, Large Language Models, and Hallucinations: An NLP Perspective — arXiv 2411.14258](https://arxiv.org/abs/2411.14258)
- [Knowledge Graph Extraction and Challenges — Neo4j Developer Blog](https://neo4j.com/blog/developer/knowledge-graph-extraction-challenges/)
- [iText2KG: Incremental Knowledge Graphs Construction Using LLMs — arXiv 2409.03284](https://arxiv.org/html/2409.03284v1)
- [LLMs and Semi-Automated KG Enrichment: Tackling Entity Disambiguation — Inbound Found](https://inboundfound.com/llms-and-knowledge-graphs-tackling-entity-disambiguation/)
- [From LLMs to Knowledge Graphs: Building Production-Ready Graph Systems in 2025 — Medium](https://medium.com/@claudiubranzan/from-llms-to-knowledge-graphs-building-production-ready-graph-systems-in-2025-2b4aff1ec99a)
- [Building a Graph-Based Code Analysis Engine — rustic-ai/codeprism](https://rustic-ai.github.io/codeprism/blog/graph-based-code-analysis-engine/)
- [Serving MCP and REST from the same TypeScript process — DEV Community](https://dev.to/schrepa/serving-mcp-and-rest-from-the-same-typescript-process-1n41)
- [GitHub — gannonh/memento-mcp: knowledge graph with decay and reinforcement](https://github.com/gannonh/memento-mcp)
- Existing Myco codebase: `packages/core/src/schema.ts`, `packages/mcp-server/src/consolidator.ts`, `packages/mcp-server/src/tools.ts`

---
*Pitfalls research for: Myco v5.0 — adding temporal versioning, auto-extraction, incremental consolidation, codebase ingestion, import/export, memory decay, relationship scoring, and REST API to an existing SQLite + MCP memory server*
*Researched: 2026-03-27*
