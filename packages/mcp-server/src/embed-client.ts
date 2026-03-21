import { Ollama } from 'ollama';

const EMBED_MODEL = 'nomic-embed-text';
const HEALTH_TIMEOUT_MS = 2000;

let client: Ollama | null = null;

function getClient(): Ollama {
  if (!client) {
    client = new Ollama({
      host: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
      fetch: (url: RequestInfo | URL, init?: RequestInit) => {
        return globalThis.fetch(url, {
          ...init,
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
      },
    });
  }
  return client;
}

/**
 * Generate an embedding vector for the given text using Ollama.
 * Returns null if Ollama is unavailable or unresponsive within 2s (per user decision).
 * Caller handles graceful degradation.
 */
export async function embedText(text: string): Promise<number[] | null> {
  try {
    const ollama = getClient();
    const response = await ollama.embed({
      model: EMBED_MODEL,
      input: text,
    });
    return response.embeddings[0] ?? null;
  } catch {
    // Ollama unavailable or timed out — caller handles null (SRCH-04 graceful degradation)
    return null;
  }
}
