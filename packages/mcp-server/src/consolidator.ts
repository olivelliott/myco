import { generateText, Output } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';
import type { ZodType } from 'zod';
import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { ConsolidationSummary, ExtractedFact, Episode } from '@myco/core';
import type { MycoStatements } from '@myco/core';
import { rememberEntity, embedText } from '@myco/core';

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const CONFIDENCE_THRESHOLD = 0.85;
const CONTRADICTION_DISTANCE_THRESHOLD = 0.3;
const LLM_TIMEOUT_MS = 60_000;
function getConsolidationModel(): string {
  return process.env.MYCO_CONSOLIDATION_MODEL ?? 'llama3.2';
}

// ─── Ollama provider ──────────────────────────────────────────────────────────

const ollamaProvider = createOllama({
  baseURL: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
});

// ─── Zod schemas for LLM structured output ───────────────────────────────────

const ExtractedFactSchema = z.object({
  entity_name: z.string().describe('Name of the entity the fact is about'),
  entity_type: z.string().default('concept').describe('Entity type, e.g. person, project, concept'),
  observation: z.string().describe('The extracted fact as a declarative statement'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0.0 to 1.0'),
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

// ─── Levenshtein distance ─────────────────────────────────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 * Used for entity merge candidate detection.
 */
export function levenshtein(a: string, b: string): number {
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

// ─── Entity merge detection ───────────────────────────────────────────────────

/**
 * Returns true if nameA and nameB are likely the same entity:
 * case-insensitive exact match OR Levenshtein distance <= 2.
 */
export function isMergeCandidate(nameA: string, nameB: string): boolean {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  return a === b || levenshtein(a, b) <= 2;
}

/**
 * Finds existing entities in the DB that are likely the same as entityName.
 * Returns all entities where isMergeCandidate(entityName, existing.name) is true,
 * excluding exact-name matches (which are upserts, not merges).
 */
export function findMergeCandidates(
  db: Database.Database,
  entityName: string,
  stmts: MycoStatements,
): Array<{ id: string; name: string }> {
  const allEntities = stmts.selectAllEntityNames.all() as Array<{ id: string; name: string }>;
  return allEntities.filter(e =>
    e.name !== entityName && isMergeCandidate(entityName, e.name)
  );
}

// ─── Contradiction detection ──────────────────────────────────────────────────

/**
 * Checks whether a proposed fact contradicts existing observations for the given entity.
 * Uses KNN cosine similarity: if any existing observation is within `threshold` distance,
 * it's considered a possible contradiction (semantically very close = potentially conflicting).
 *
 * Returns false if Ollama is unavailable (graceful degradation: don't block consolidation).
 */
export async function detectContradiction(
  db: Database.Database,
  entityId: string,
  factText: string,
  stmts: MycoStatements,
  threshold = CONTRADICTION_DISTANCE_THRESHOLD,
): Promise<boolean> {
  const embedding = await embedText(factText);
  if (embedding === null) return false; // Ollama unavailable — don't block

  const vec = new Float32Array(embedding);
  const rows = stmts.knnSearchForContradiction.all(vec, entityId) as Array<{ distance: number }>;

  return rows.some(r => r.distance < threshold);
}

// ─── LLM fact extraction ──────────────────────────────────────────────────────

/**
 * Calls the Ollama LLM to extract structured facts from raw episode texts.
 * Uses Vercel AI SDK v6 generateText + Output.object() pattern for structured output.
 * Returns an empty array on timeout or LLM error (caller increments error counter).
 */
export async function extractFacts(episodeTexts: string[]): Promise<ExtractedFact[]> {
  const episodeBlock = episodeTexts.join('\n---\n');
  const prompt = `You are a knowledge extraction system. Given these session episode logs, extract factual knowledge as structured data.

For each fact you extract:
- entity_name: The subject entity
- entity_type: Category (person, project, concept, technology, decision, etc.)
- observation: A clear declarative statement of the fact
- confidence: 0.0-1.0 reflecting certainty (1.0 = explicitly stated, 0.5 = implied, < 0.3 = speculative)
- evidence_quote: Copy the EXACT text from the episodes that supports this fact (must be verbatim)
- related_entities: Other entities mentioned in relation to this fact

Episodes:
${episodeBlock}

Extract all meaningful facts. Be precise with evidence quotes — they must be verbatim from the input.`;

  try {
    // Cast schema to satisfy ai@4 + Zod v4 type compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputSpec = Output.object({ schema: ConsolidationOutputSchema as unknown as ZodType<{ facts: ExtractedFact[] }, any, any> });
    const result = await generateText({
      model: ollamaProvider(getConsolidationModel()),
      prompt,
      experimental_output: outputSpec,
      abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    const output = result.experimental_output as { facts: ExtractedFact[] } | undefined;
    return output?.facts ?? [];
  } catch (err) {
    console.error('[consolidation] extractFacts error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Consolidation lock ───────────────────────────────────────────────────────

const LOCK_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Attempts to acquire the singleton consolidation lock.
 * Removes stale locks (held longer than LOCK_EXPIRY_MS) before attempting.
 * Returns true if the lock was acquired, false if already held.
 */
export function acquireLock(db: Database.Database, lockedBy: 'micro' | 'nightly'): boolean {
  const now = new Date().toISOString();
  const expiryThreshold = new Date(Date.now() - LOCK_EXPIRY_MS).toISOString();

  // Remove stale lock (crash recovery)
  db.prepare(`DELETE FROM consolidation_lock WHERE locked_at < ?`).run(expiryThreshold);

  // Try to claim — fails silently if row exists (not expired)
  const result = db.prepare(
    `INSERT OR IGNORE INTO consolidation_lock (id, locked_at, locked_by) VALUES ('singleton', ?, ?)`
  ).run(now, lockedBy);

  return result.changes === 1;
}

/**
 * Releases the singleton consolidation lock.
 */
export function releaseLock(db: Database.Database): void {
  db.prepare(`DELETE FROM consolidation_lock WHERE id = 'singleton'`).run();
}

// ─── Micro-consolidation pipeline ────────────────────────────────────────────

/**
 * Processes a single episode through the fact extraction pipeline.
 * All extracted facts are unconditionally routed to the approval queue
 * with reason 'auto_extracted' — no auto-approve threshold applies here.
 *
 * Acquires and releases the consolidation lock via try/finally.
 * Backs off silently if the lock is already held.
 *
 * CRITICAL: Does NOT call rememberEntity, detectContradiction, or
 * findMergeCandidates — those are nightly-only operations (CONSOL-03).
 */
export async function runMicroConsolidation(
  db: Database.Database,
  stmts: MycoStatements,
  episodeId: string,
): Promise<void> {
  const acquired = acquireLock(db, 'micro');
  if (!acquired) {
    console.error('[micro-consolidation] lock held — backing off');
    return;
  }

  try {
    // Fetch the single episode
    const episode = db.prepare(`SELECT * FROM episodes WHERE id = ?`).get(episodeId) as Episode | undefined;
    if (!episode) {
      console.error(`[micro-consolidation] episode ${episodeId} not found`);
      return;
    }

    // Extract facts via LLM (reuses existing extractFacts)
    const episodeText = JSON.stringify({
      id: episode.id,
      event_type: episode.event_type,
      payload: episode.payload,
      created_at: episode.created_at,
    });

    const facts = await extractFacts([episodeText]);

    // Route ALL extracted facts to approval queue — no auto-approve (per locked decision)
    const now = new Date().toISOString();
    for (const fact of facts) {
      const metadata = JSON.stringify({
        fact: {
          entity_name: fact.entity_name,
          entity_type: fact.entity_type,
          observation: fact.observation,
          confidence: fact.confidence,
          evidence_quote: fact.evidence_quote,
          related_entities: fact.related_entities,
        },
        source_episode_ids: [episodeId],
        source_type: 'auto_extracted',
      });

      stmts.insertApprovalQueueItem.run(
        nanoid(),
        'proposed_fact',
        nanoid(),
        'pending',
        'auto_extracted',     // reason column — for filtering
        metadata,
        now,
      );
    }

    // Mark episode as consolidated
    db.prepare(`UPDATE episodes SET consolidated_at = ? WHERE id = ?`).run(now, episodeId);

    console.error(`[micro-consolidation] processed episode ${episodeId}: ${facts.length} facts queued`);
  } catch (err) {
    console.error('[micro-consolidation] error:', err instanceof Error ? err.message : err);
  } finally {
    releaseLock(db);
  }
}

// ─── Main consolidation loop ──────────────────────────────────────────────────

/**
 * Runs the full consolidation pipeline over unconsolidated episodes.
 *
 * For each batch of BATCH_SIZE episodes:
 * 1. Extract facts via LLM
 * 2. For each fact: detect contradictions, find merge candidates
 * 3. Auto-approve high-confidence facts (>= 0.85) with no issues
 * 4. Queue everything else with a reason tag and metadata payload
 * 5. Mark episodes as consolidated
 *
 * All logging goes to stderr — stdout is reserved for MCP transport.
 */
export async function runConsolidation(
  db: Database.Database,
  stmts: MycoStatements,
): Promise<ConsolidationSummary> {
  const summary: ConsolidationSummary = {
    totalProcessed: 0,
    totalExtracted: 0,
    totalAutoApproved: 0,
    totalQueued: 0,
    errors: 0,
  };

  while (true) {
    // Fetch next batch of unconsolidated episodes
    const batch = stmts.selectUnconsolidatedEpisodes.all(BATCH_SIZE) as Episode[];

    if (batch.length === 0) break;

    const episodeTexts = batch.map(ep =>
      JSON.stringify({
        id: ep.id,
        event_type: ep.event_type,
        payload: ep.payload,
        created_at: ep.created_at,
      })
    );

    let facts: ExtractedFact[] = [];
    try {
      facts = await extractFacts(episodeTexts);
    } catch (err) {
      console.error('[consolidation] batch extraction failed:', err instanceof Error ? err.message : err);
      summary.errors++;
      // Mark batch consolidated anyway to avoid infinite reprocessing
      markBatchConsolidated(db, batch);
      summary.totalProcessed += batch.length;
      if (batch.length < BATCH_SIZE) break;
      continue;
    }

    summary.totalExtracted += facts.length;

    for (const fact of facts) {
      // Look up existing entity by name + type
      const existingEntity = stmts.selectEntityByNameType.get(fact.entity_name, fact.entity_type) as { id: string } | undefined;

      // Check for potential entity merges
      const mergeCandidates = findMergeCandidates(db, fact.entity_name, stmts);
      const hasMergeCandidates = mergeCandidates.length > 0;

      // Check for contradiction (only if entity exists)
      let hasContradiction = false;
      if (existingEntity) {
        hasContradiction = await detectContradiction(db, existingEntity.id, fact.observation, stmts);
      }

      // Route decision: auto-approve or queue
      const shouldAutoApprove =
        fact.confidence >= CONFIDENCE_THRESHOLD &&
        !hasContradiction &&
        !hasMergeCandidates;

      if (shouldAutoApprove) {
        // Auto-approve: write directly into knowledge graph with consolidation provenance
        try {
          await rememberEntity(db, {
            content: fact.observation,
            entity_name: fact.entity_name,
            entity_type: fact.entity_type,
            confidence: fact.confidence,
            source_type: 'consolidation',
            relations: fact.related_entities.map((r: { name: string; type: string; relation_type: string }) => ({
              target_name: r.name,
              target_type: r.type,
              relation_type: r.relation_type,
            })),
          }, stmts);
          summary.totalAutoApproved++;
        } catch (err) {
          console.error('[consolidation] rememberEntity failed:', err instanceof Error ? err.message : err);
          summary.errors++;
          // Fall through: fact not stored, don't queue (data integrity concern)
        }
      } else {
        // Queue for human review
        const reason = determineQueueReason(fact.confidence, hasContradiction, hasMergeCandidates);
        const metadata = JSON.stringify({
          fact,
          source_episode_ids: batch.map(e => e.id),
          ...(hasMergeCandidates ? { merge_candidate_ids: mergeCandidates.map(c => c.id) } : {}),
        });

        stmts.insertApprovalQueueItem.run(
          nanoid(),
          'proposed_fact',
          nanoid(),
          'pending',
          reason,
          metadata,
          new Date().toISOString(),
        );
        summary.totalQueued++;
      }
    }

    // Mark all episodes in batch as consolidated
    markBatchConsolidated(db, batch);
    summary.totalProcessed += batch.length;

    // If last batch (smaller than BATCH_SIZE), stop
    if (batch.length < BATCH_SIZE) break;
  }

  console.error('[consolidation] summary:', JSON.stringify(summary));
  return summary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function determineQueueReason(
  confidence: number,
  hasContradiction: boolean,
  hasMergeCandidates: boolean,
): string {
  if (hasContradiction) return 'contradiction';
  if (hasMergeCandidates) return 'merge_candidate';
  if (confidence < CONFIDENCE_THRESHOLD) return 'low_confidence';
  return 'cross_session';
}

function markBatchConsolidated(db: Database.Database, batch: Episode[]): void {
  const now = new Date().toISOString();
  const placeholders = batch.map(() => '?').join(', ');
  // Dynamic IN() — cannot be pre-prepared (STMT-02 exception: variable-length parameter list)
  db.prepare(`
    UPDATE episodes SET consolidated_at = ? WHERE id IN (${placeholders})
  `).run(now, ...batch.map(e => e.id));
}
