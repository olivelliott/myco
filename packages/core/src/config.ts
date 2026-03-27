import * as dotenv from 'dotenv';

export interface MycoConfig {
  dbPath: string | null;
  ollamaHost: string;
  ollamaModel: string;
  consolidationModel: string;
  apiPort: number;
  logLevel: string;
}

let _config: MycoConfig | null = null;

/**
 * Load configuration from .env (if present) and process.env.
 * Must be called once at process entry, before any other imports read env vars.
 * Logs each resolved key=value to stderr.
 * Returns the config object and stores it for subsequent getConfig() calls.
 */
export function loadConfig(): MycoConfig {
  // Load .env file from cwd into process.env (existing env vars take precedence)
  dotenv.config();

  const config: MycoConfig = {
    dbPath: process.env.MYCO_DB_PATH ?? null,
    ollamaHost: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',
    consolidationModel: process.env.MYCO_CONSOLIDATION_MODEL ?? 'llama3.2',
    apiPort: parseInt(process.env.MYCO_API_PORT ?? '3001', 10),
    logLevel: process.env.MYCO_LOG_LEVEL ?? 'info',
  };

  // Log resolved config to stderr so users can verify what's active
  console.error(`[config] dbPath = ${config.dbPath ?? '(default)'}`);
  console.error(`[config] ollamaHost = ${config.ollamaHost}`);
  console.error(`[config] ollamaModel = ${config.ollamaModel}`);
  console.error(`[config] consolidationModel = ${config.consolidationModel}`);
  console.error(`[config] apiPort = ${config.apiPort}`);
  console.error(`[config] logLevel = ${config.logLevel}`);

  _config = config;
  return config;
}

/**
 * Returns the stored config object.
 * Throws if loadConfig() was not called first.
 */
export function getConfig(): MycoConfig {
  if (_config === null) {
    throw new Error('[myco] getConfig() called before loadConfig(). Call loadConfig() at process entry.');
  }
  return _config;
}
