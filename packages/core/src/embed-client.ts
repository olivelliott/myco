import { Ollama } from 'ollama';

const EMBED_MODEL = 'nomic-embed-text';
const SINGLE_TIMEOUT_MS = 2000;
const BATCH_TIMEOUT_MS = 10000;
const HEALTH_COOLDOWN_MS = 30_000;
const MAX_BATCH_SIZE = 50;

let client: Ollama | null = null;
let lastFailureMs = 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({
      host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    });
  }
  return client;
}

function isHealthy(): boolean {
  if (Date.now() - lastFailureMs < HEALTH_COOLDOWN_MS) {
    console.error('[embed] Ollama cooldown active, skipping');
    return false;
  }
  return true;
}

function markUnhealthy(): void {
  lastFailureMs = Date.now();
  console.error('[embed] Ollama unreachable, cooldown 30s');
}

/** Reset health state and client singleton — for testing only. */
export function resetEmbedClient(): void {
  lastFailureMs = 0;
  client = null;
}

/**
 * Generate an embedding vector for the given text using Ollama.
 * Returns null if Ollama is unavailable, in cooldown, or unresponsive.
 * Caller handles graceful degradation.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!isHealthy()) return null;
  try {
    const ollama = getClient();
    const response = await withTimeout(
      ollama.embed({ model: EMBED_MODEL, input: text }),
      SINGLE_TIMEOUT_MS
    );
    return response.embeddings[0] ?? null;
  } catch {
    markUnhealthy();
    return null;
  }
}

/**
 * Generate embedding vectors for multiple texts in a single Ollama API call.
 * Falls back to sequential embedding if the batch call fails.
 * Returns null for any text that could not be embedded.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  if (!isHealthy()) return texts.map(() => null);

  const batch = texts.slice(0, MAX_BATCH_SIZE);
  try {
    const ollama = getClient();
    const response = await withTimeout(
      ollama.embed({ model: EMBED_MODEL, input: batch }),
      BATCH_TIMEOUT_MS
    );
    return response.embeddings as (number[] | null)[];
  } catch {
    console.error(`[embed] Batch failed, falling back to sequential (${batch.length} texts)`);
    const results: (number[] | null)[] = [];
    for (const text of batch) {
      results.push(await embedText(text));
    }
    return results;
  }
}
