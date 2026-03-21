# Phase 3: Consolidation + Approval - Research

**Researched:** 2026-03-20
**Domain:** LLM-powered episode consolidation pipeline, contradiction detection, entity deduplication, approval queue management, cron scheduling
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Consolidation Pipeline**
- Use Ollama via Vercel AI SDK (`ai` + `@ai-sdk/ollama` provider) for LLM fact extraction — keeps everything local, consistent with embeddings approach
- Structured JSON output via `generateObject()` — each extracted fact gets: entity name, observation content, confidence, evidence_quote, related_entities
- Process 10 episodes per LLM call in batches — balances context quality with throughput. Process all unconsolidated episodes in sequential batches
- Add `consolidated_at` column to episodes table (NULL = unconsolidated, ISO timestamp = processed) — preserves audit trail

**Contradiction Detection & Entity Merging**
- Detect contradictions via semantic similarity search against existing observations for the same entity — if new fact has high similarity but opposing content, flag as contradiction. Use vector distance threshold (< 0.3 = potential conflict)
- Identify entity merge candidates via name similarity (Levenshtein distance <= 2 OR same name different case) plus vector similarity of entity observations. Surface as merge candidate in approval queue
- Auto-approve: confidence >= 0.85, no contradictions, no merge candidates. Queue: confidence < 0.85, contradictions, merge candidates, cross-session entity merges
- Approval queue items include `reason` field with tagged values: `low_confidence`, `contradiction`, `merge_candidate`, `cross_session`. Include source episode IDs and evidence quotes in metadata

**Scheduling & Approval CLI**
- Use `croner` package (more actively maintained than node-cron) running in-process with the MCP server. Cron expression: `0 2 * * *` in America/New_York timezone
- Manual consolidation via new MCP tool `consolidate` — agents can trigger it, user can invoke via CLI. Returns consolidation summary (episodes processed, facts extracted, auto-approved, queued)
- Approval management via MCP tools: `list_pending_approvals` (shows queue with reason, evidence, confidence) and `resolve_approval` (action: approve/reject/edit, with optional edited content)
- Approved items: create/merge into knowledge graph with `source_type: 'consolidation'`. Rejected items: status set to `rejected`, retained for audit. Edited items: user's content replaces proposed, then approves

### Claude's Discretion
- Consolidation prompt template wording and structure
- Levenshtein distance implementation (inline vs library)
- Consolidation log format and storage
- Error handling for LLM failures during consolidation
- Batch retry strategy for failed episode batches

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CNSLD-01 | Nightly deep sleep cycle runs at 2am EST via cron, reading episode logs and extracting facts into the knowledge graph | `croner` v10.0.1 with `timezone: "America/New_York"` option; wired into `index.ts` server startup alongside existing `reEmbedPending` |
| CNSLD-02 | LLM-assisted extraction requires direct evidence quotes for every extracted fact | Vercel AI SDK `generateObject()` with Zod schema including `evidence_quote: z.string()` field; model forced to cite raw episode text |
| CNSLD-03 | Contradiction detection identifies when new facts conflict with existing knowledge | KNN search via existing `vec_embeddings` + `vec_distance_cosine`; threshold < 0.3; filtered to same entity |
| CNSLD-04 | Entity deduplication merges equivalent entities discovered across sessions | Inline Levenshtein (threshold <= 2) + case-insensitive name match; merge candidate queued for human approval |
| CNSLD-05 | Manual consolidation trigger available via CLI command | New MCP tool `consolidate` callable via `claude mcp call` or MCP CLI; returns summary JSON |
| APRV-01 | Confidence scoring assigns a score to every extracted fact during consolidation | Zod schema has `confidence: z.number().min(0).max(1)` — LLM assigns per-fact; preserved in knowledge graph |
| APRV-02 | Facts above confidence threshold (0.85+) auto-approve into the knowledge graph | Conditional branch: if `confidence >= 0.85 && !hasContradiction && !hasMergeCandidate` → call `rememberEntity()` directly with `source_type: 'consolidation'` |
| APRV-03 | Low-confidence facts, contradictions, and entity merge candidates queue for human review | Insert into existing `approval_queue` table with `status: 'pending'` and `reason` tag; metadata JSON includes evidence + episode IDs |
| APRV-04 | Human can approve, reject, or edit queued items | `resolve_approval` MCP tool with `action: approve | reject | edit`; edit replaces content then approves |
</phase_requirements>

## Summary

Phase 3 is a consolidation pipeline layer that sits between the raw episode log (Phase 2) and the knowledge graph (Phase 1). At its core it calls an Ollama LLM to extract structured facts from batches of unconsolidated episodes, then routes each fact to either auto-approval or a human review queue based on confidence, contradiction detection, and entity deduplication results.

The existing codebase provides strong foundations: the `approval_queue` table is already in the schema, `rememberEntity()` already accepts `source_type: 'consolidation'`, the `vec_embeddings` KNN search is proven and working, and the `registerTools()` pattern makes adding the three new MCP tools (`consolidate`, `list_pending_approvals`, `resolve_approval`) straightforward.

The critical architectural decision is the Vercel AI SDK version. The user decision says "use `generateObject()`" but the AI SDK has moved to v6 where `generateObject` is replaced by `generateText` with `Output.object()`. The `ollama-ai-provider` package (v1.2.0) is the correct community provider — `@ai-sdk/ollama` does not exist in the npm registry.

**Primary recommendation:** Add `ai@^6.0.0` + `ollama-ai-provider@^1.2.0` + `croner@^10.0.0` to `packages/mcp-server/package.json`; create `packages/mcp-server/src/consolidator.ts` as the extraction module and `packages/mcp-server/src/scheduler.ts` for cron wiring.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 6.0.134 | LLM inference — structured fact extraction | Official Vercel SDK; provides `generateText` with `Output.object()` for typed Zod schema extraction; `generateObject` is deprecated in v6 |
| `ollama-ai-provider` | 1.2.0 | Ollama model provider for Vercel AI SDK | Community standard; `@ai-sdk/ollama` does NOT exist in npm registry; `ollama-ai-provider` is the correct Vercel AI SDK integration package |
| `croner` | 10.0.1 | In-process cron scheduler | TypeScript-native, DST-aware (`timezone: "America/New_York"`), error recovery via `catch` option, actively maintained (last publish Feb 2026) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.3.6 (already installed) | Schema for extracted fact shape | Already a project dependency; define `ExtractedFactSchema` in consolidator |
| `nanoid` | 5.x (already installed) | IDs for new approval queue items and observations | Already a project dependency |
| `better-sqlite3` | 12.8.0 (already installed) | Synchronous DB access in consolidation | Consolidation runs outside the MCP tool hot path; sync is fine |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ollama-ai-provider` | `ai-sdk-ollama` | Both are community providers. `ollama-ai-provider` is listed first in official AI SDK docs and has a well-maintained GitHub. Either works — use `ollama-ai-provider`. |
| `generateText` + `Output.object()` | `generateObject` (v4/v5 API) | `generateObject` still exists in older AI SDK versions but is removed in v6 (latest). Since we install the latest `ai` package, use `generateText` with `Output.object()`. |
| Inline Levenshtein | `fastest-levenshtein` npm package | The inline 2D-array implementation is ~15 lines and has no dependencies. For single-user use with entity names (< 200 chars), the O(mn) overhead is negligible. Inline is the right call per Claude's discretion. |

### Installation
```bash
npm install ai ollama-ai-provider croner --workspace=packages/mcp-server
```

### Version Verification
Versions confirmed against npm registry (2026-03-20):
- `ai`: 6.0.134 (latest tag)
- `ollama-ai-provider`: 1.2.0
- `croner`: 10.0.1 (latest tag, last published 2026-02-21)

## Architecture Patterns

### Recommended Project Structure
```
packages/mcp-server/src/
├── index.ts              # (existing) wire croner schedule here at startup
├── tools.ts              # (existing) add consolidate/list_pending/resolve_approval tools
├── embed-client.ts       # (existing) reuse embedText()
├── consolidator.ts       # NEW: runConsolidation(), extractFacts(), detectContradiction(), findMergeCandidates()
└── scheduler.ts          # NEW: scheduleDailyConsolidation() wired into index.ts
```

The consolidation logic belongs in `consolidator.ts` separate from `tools.ts` to allow direct unit testing (same pattern as `rememberEntity` being testable without the MCP SDK).

### Pattern 1: Structured Fact Extraction (Vercel AI SDK v6)

**What:** Use `generateText` with `Output.object()` to force Ollama to return a typed array of facts.
**When to use:** Every batch of 10 episodes sent to the LLM.

```typescript
// Source: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
import { generateText, Output } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';

const ollamaProvider = createOllama({
  baseURL: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
});

const ExtractedFactSchema = z.object({
  entity_name: z.string().describe('Name of the entity the fact is about'),
  entity_type: z.string().default('concept').describe('Entity type, e.g. person, project, concept'),
  observation: z.string().describe('The extracted fact as a declarative statement'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0.0-1.0'),
  evidence_quote: z.string().describe('Verbatim text from the episode that supports this fact'),
  related_entities: z.array(z.object({
    name: z.string(),
    type: z.string().default('concept'),
    relation_type: z.string(),
  })).default([]),
});

const ConsolidationOutputSchema = z.object({
  facts: z.array(ExtractedFactSchema),
});

export async function extractFacts(episodeTexts: string[]): Promise<z.infer<typeof ConsolidationOutputSchema>> {
  const { output } = await generateText({
    model: ollamaProvider('llama3.2'),
    output: Output.object({ schema: ConsolidationOutputSchema }),
    prompt: buildConsolidationPrompt(episodeTexts),
  });
  return output;
}
```

### Pattern 2: Contradiction Detection via KNN + Entity Filter

**What:** For each extracted fact, run a KNN search in `vec_embeddings` filtered to the same entity's existing observations. Distance < 0.3 means potential semantic overlap — flag for human review.
**When to use:** For every extracted fact before deciding auto-approve vs. queue.

```typescript
// Source: Existing Phase 2 KNN pattern in tools.ts (recallKnowledge)
// Extended with entity-scoped filter
export function detectContradiction(
  db: Database.Database,
  entityId: string,
  factEmbedding: Float32Array,
  threshold = 0.3,
): boolean {
  const rows = db.prepare(`
    WITH knn AS (
      SELECT item_id, distance
      FROM vec_embeddings
      WHERE embedding MATCH ?
        AND k = 5
        AND item_type = 'observation'
    )
    SELECT o.id, knn.distance
    FROM knn
    JOIN observations o ON o.id = knn.item_id
    WHERE o.entity_id = ?
    ORDER BY knn.distance
    LIMIT 1
  `).all(factEmbedding, entityId) as Array<{ id: string; distance: number }>;

  return rows.some(r => r.distance < threshold);
}
```

Note: The user decision says "high similarity but opposing content". Since we cannot detect semantic opposition from distance alone (high similarity can mean redundancy, not contradiction), the correct approach is: flag all observations with cosine distance < 0.3 to existing observations for the same entity. The LLM prompt should already have surfaced genuine contradictions — the vector check catches cases where a new statement is very close to an existing one and needs human review.

### Pattern 3: Croner Schedule Wiring

**What:** Register the nightly cron at server startup alongside `reEmbedPending`.
**When to use:** In `index.ts`, after `registerTools(server, db)`.

```typescript
// Source: croner docs https://croner.56k.guru/usage/configuration/
import { Cron } from 'croner';
import { runConsolidation } from './consolidator.js';

export function scheduleDailyConsolidation(db: Database.Database): Cron {
  return new Cron('0 2 * * *', { timezone: 'America/New_York', catch: true }, async () => {
    console.error('[consolidation] nightly run starting');
    const summary = await runConsolidation(db);
    console.error(`[consolidation] done: ${JSON.stringify(summary)}`);
  });
}
```

### Pattern 4: Approval Queue Resolution

**What:** `resolve_approval` MCP tool handles approve/reject/edit actions atomically.
**When to use:** Called by human via `claude mcp call` or any MCP client.

```typescript
// approve path: read pending item metadata, call rememberEntity() with source_type 'consolidation'
// reject path: UPDATE approval_queue SET status = 'rejected', resolved_at = NOW() WHERE id = ?
// edit path: replace observation content in metadata, then execute approve path
```

The `approval_queue` table's `item_id` column should reference a "pending fact" record. Since facts don't exist in the DB until approved, the pattern is to store the complete proposed fact as JSON in a separate column (or in the existing `reason` column extended). See Pitfall 2 below.

### Pattern 5: `consolidated_at` Migration

Same idempotent `try/catch ALTER TABLE` pattern from Phase 2's `needs_embedding` migration:

```typescript
// In applySchema() or as a standalone migration in consolidator.ts startup
try {
  db.exec(`ALTER TABLE episodes ADD COLUMN consolidated_at TEXT`);
} catch {
  // Already exists — safe to ignore
}
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_consolidated_at ON episodes(consolidated_at) WHERE consolidated_at IS NULL`);
} catch {}
```

### Anti-Patterns to Avoid
- **Storing proposed facts only as item_id references:** The `approval_queue.item_id` column implies a join target. For pending consolidation facts, there is no persisted row yet. Store the full proposed fact payload as JSON in a dedicated `metadata` column or use `item_type = 'proposed_fact'` with the JSON blob in a new column.
- **Running consolidation synchronously inside MCP tool handler:** LLM inference can take 10-60 seconds per batch. Fire-and-forget with progress tracking, same as `reEmbedPending`.
- **Calling `generateObject()` from older AI SDK imports:** In AI SDK v6, `generateObject` is removed. Import `Output` from `ai` and use `generateText` with `Output.object()`.
- **Blocking server startup on croner setup:** `scheduleDailyConsolidation` just registers a schedule; it doesn't run immediately. Safe to call synchronously.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output validation | Custom JSON parsing + retry loop | `generateText` + `Output.object({ schema })` | AI SDK handles retry, schema coercion, and malformed JSON recovery |
| Cron scheduling with DST | Manual date math or `setInterval` drift | `croner` with `timezone` option | DST transitions cause 1am/3am bugs; croner handles this correctly |
| Provider abstraction over Ollama | Direct fetch to Ollama `/api/generate` | `ollama-ai-provider` + AI SDK | Provider handles keep-alive, streaming, retry, and format differences across Ollama model families |

**Key insight:** Structured LLM output is brittle — models can produce partial JSON, extra whitespace, markdown code fences. The AI SDK's `Output` abstraction handles all of this transparently, including re-prompting on validation failure.

## Common Pitfalls

### Pitfall 1: `generateObject` is Gone in AI SDK v6
**What goes wrong:** Code imports `generateObject` from `ai@6.x` and gets a runtime error: `generateObject is not a function`.
**Why it happens:** The user decision was written referencing an older API surface. AI SDK v6 replaced `generateObject` with `generateText` + `Output.object()`.
**How to avoid:** Use `generateText` with `output: Output.object({ schema: YourZodSchema })` — the returned `output` is typed and validated.
**Warning signs:** TypeScript import errors on `generateObject` when using `ai@6.x`.

### Pitfall 2: Approval Queue Missing Fact Payload
**What goes wrong:** `approval_queue` stores `item_id` but there's no `items` table for pending facts — approving a queue item has nothing to write to the graph.
**Why it happens:** The schema assumes `item_id` references an existing record, but consolidation facts don't exist in the graph until approved.
**How to avoid:** The `approval_queue` table needs a `metadata TEXT` column to store the full proposed fact as JSON (entity name, type, observation, confidence, evidence_quote, related_entities, source_episode_ids). Add this column via the same idempotent `ALTER TABLE` migration pattern.
**Warning signs:** `resolve_approval` handler can't find what to write when approving.

### Pitfall 3: Vector Distance Threshold Semantics
**What goes wrong:** Treating cosine distance < 0.3 as "contradiction" when it actually means "similar topic" — flagging all related observations as contradictions.
**Why it happens:** Cosine distance measures semantic proximity, not semantic opposition. Two observations about the same entity can be similar (< 0.3) and mutually reinforcing.
**How to avoid:** The vector check's purpose is "is this new fact about a topic already covered?" — queue for human review when the answer is yes. The LLM extraction step should have already marked genuinely contradictory facts as lower confidence. The human review catches the edge cases.
**Warning signs:** Approval queue is flooded with non-contradictory items after the first consolidation run.

### Pitfall 4: LLM Timeout During Batch Processing
**What goes wrong:** Ollama inference on 10 episodes takes >30s and the consolidation run appears hung.
**Why it happens:** No timeout is set on `generateText` calls to Ollama, and local inference on large batches is slow.
**How to avoid:** Pass `AbortSignal.timeout(60_000)` via `generateText`'s `abortSignal` option. On timeout, skip the batch and log it. The episodes remain `consolidated_at = NULL` for the next run.
**Warning signs:** Consolidation run doesn't return for >5 minutes; Ollama memory pressure.

### Pitfall 5: stdout Contamination from Consolidation Logs
**What goes wrong:** `console.log()` calls in consolidation code corrupt the MCP stdio transport.
**Why it happens:** Established pattern from Phase 1/2: after `server.connect()`, stdout belongs to the MCP transport.
**How to avoid:** All consolidation logging uses `console.error()` to write to stderr.
**Warning signs:** Claude Code reports malformed MCP responses during consolidation runs.

### Pitfall 6: Module Not Registered for `ollama-ai-provider`
**What goes wrong:** `createOllama` fails because the package is in `mcp-server` but not in `core`.
**Why it happens:** The monorepo has workspaces — `ai` and `ollama-ai-provider` must be in `packages/mcp-server/package.json`, not root.
**How to avoid:** `npm install ai ollama-ai-provider croner --workspace=packages/mcp-server`.

## Code Examples

### Batch Loop Over Unconsolidated Episodes
```typescript
// Source: established better-sqlite3 sync pattern (packages/mcp-server/src/tools.ts)
export async function runConsolidation(db: Database.Database): Promise<ConsolidationSummary> {
  const BATCH_SIZE = 10;
  let totalProcessed = 0;
  let totalExtracted = 0;
  let totalAutoApproved = 0;
  let totalQueued = 0;

  while (true) {
    const batch = db.prepare(`
      SELECT id, session_id, agent_id, event_type, payload, created_at
      FROM episodes
      WHERE consolidated_at IS NULL
      ORDER BY created_at
      LIMIT ?
    `).all(BATCH_SIZE) as Episode[];

    if (batch.length === 0) break;

    const facts = await extractFacts(batch.map(ep => JSON.stringify(ep)));

    for (const fact of facts.facts) {
      // ... route to auto-approve or queue
    }

    // Mark batch as consolidated regardless of individual fact routing
    const ids = batch.map(ep => ep.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE episodes SET consolidated_at = ? WHERE id IN (${placeholders})
    `).run(new Date().toISOString(), ...ids);

    totalProcessed += batch.length;
    if (batch.length < BATCH_SIZE) break; // last batch
  }

  return { totalProcessed, totalExtracted, totalAutoApproved, totalQueued };
}
```

### Inline Levenshtein Distance (14 lines)
```typescript
// Source: standard DP algorithm, no dependency needed
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function isMergeCandidate(nameA: string, nameB: string): boolean {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  return a === b || levenshtein(a, b) <= 2;
}
```

### `list_pending_approvals` MCP Tool
```typescript
// Source: registerTools() pattern in packages/mcp-server/src/tools.ts
server.tool(
  'list_pending_approvals',
  'List items pending human review in the approval queue',
  {
    limit: z.number().default(20).describe('Max items to return'),
  },
  async ({ limit }) => {
    const rows = db.prepare(`
      SELECT id, item_type, item_id, reason, metadata, created_at
      FROM approval_queue
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT ?
    `).all(limit) as ApprovalQueueItem[];
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ items: rows, count: rows.length }) }],
    };
  },
);
```

### `resolve_approval` MCP Tool Signature
```typescript
server.tool(
  'resolve_approval',
  'Approve, reject, or edit a queued item. Approved items are written to the knowledge graph.',
  {
    id: z.string().describe('Approval queue item ID'),
    action: z.enum(['approve', 'reject', 'edit']).describe('Resolution action'),
    edited_content: z.string().optional().describe('Replacement observation content (required for edit action)'),
  },
  async ({ id, action, edited_content }) => {
    // ... resolve logic
  },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject()` from `ai` | `generateText` + `Output.object()` | AI SDK v5/v6 | Must use `Output` API with `generateText`; `generateObject` import will fail in v6 |
| `@ai-sdk/ollama` (official) | `ollama-ai-provider` (community) | The `@ai-sdk/ollama` package name does NOT exist | Install `ollama-ai-provider`, not `@ai-sdk/ollama` |
| `node-cron` | `croner` | Active maintenance diverged | `croner` is the preferred choice per CLAUDE.md; use `new Cron(expr, { timezone, catch }, fn)` |

**Deprecated/outdated:**
- `generateObject` import from `ai@6.x`: Removed. Use `generateText` + `Output.object({ schema })`.
- `sqlite-vss`: Deprecated in 2024, replaced by `sqlite-vec` (already used in this project).

## Open Questions

1. **Approval queue `metadata` column**
   - What we know: The current `approval_queue` schema has no column for storing the proposed fact payload (entity, observation, confidence, evidence_quote).
   - What's unclear: The planner must decide whether to (a) add a `metadata TEXT` column via `ALTER TABLE` migration, or (b) use a separate `pending_facts` table. Option (a) is simpler and consistent with Phase 2's `needs_embedding` migration pattern.
   - Recommendation: Add `metadata TEXT` column via idempotent `try/catch ALTER TABLE`. Store the proposed fact as JSON there.

2. **LLM model choice for consolidation**
   - What we know: The `ollama-ai-provider` works with any Ollama model; `nomic-embed-text` is for embeddings only (not generation).
   - What's unclear: The user hasn't specified which Ollama generation model to use. Common choices: `llama3.2`, `mistral`, `phi3`. The research cannot recommend one without knowing what the user has pulled.
   - Recommendation: Default to `llama3.2` with a configurable `BRAIN_CONSOLIDATION_MODEL` env var (same pattern as `OLLAMA_HOST` in `embed-client.ts`). Include a comment: "requires a generation model — not nomic-embed-text".

3. **Cross-session entity merge handling**
   - What we know: The decision says cross-session merges always go to the queue (reason: `cross_session`). The `isMergeCandidate()` function can detect name-similar entities.
   - What's unclear: What "merge" means in terms of the DB write — is it literally merging two entity records (reassigning all observations to one entity ID), or adding a merge relationship?
   - Recommendation: For Phase 3, queue the merge candidate with both entity IDs in metadata. The `resolve_approval` handler for `merge_candidate` items should reassign all observations from the secondary entity to the primary, then delete the secondary entity. The planner should include this as an explicit task.

## Sources

### Primary (HIGH confidence)
- npm registry: `ai@6.0.134` — verified current latest tag 2026-03-20
- npm registry: `ollama-ai-provider@1.2.0` — verified exists, `@ai-sdk/ollama` confirmed 404
- npm registry: `croner@10.0.1` — verified current latest tag, published 2026-02-21
- https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data — `generateText` + `Output.object()` is current API; `generateObject` not documented in v6
- https://ai-sdk.dev/providers/community-providers/ollama — `ollama-ai-provider` confirmed as official community provider listing
- Existing codebase: `packages/core/src/schema.ts` — `approval_queue` table confirmed exists with current columns
- Existing codebase: `packages/mcp-server/src/tools.ts` — `recallKnowledge()` KNN pattern confirmed as working reference
- Existing codebase: `packages/core/src/types.ts` — `SourceType` union includes `'consolidation'` already

### Secondary (MEDIUM confidence)
- https://croner.56k.guru/usage/configuration/ — `timezone` option confirmed (format: `"America/New_York"`), `catch` option confirmed, `.stop()` method confirmed
- pkgpulse.com/blog/node-cron-vs-croner-2026 — croner ~600K weekly downloads, actively maintained

### Tertiary (LOW confidence)
- WebSearch: "generateObject deprecated" — multiple sources confirm removal in v6 but docs confirm it authoritatively

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry verified all versions 2026-03-20
- Architecture: HIGH — based on existing working patterns in the codebase
- Pitfalls: HIGH — Pitfall 1 (generateObject removal) and Pitfall 2 (missing metadata column) verified against live docs/schema; others based on direct code reading

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (Vercel AI SDK moves fast; re-verify `Output.object()` API if >30 days elapsed)
