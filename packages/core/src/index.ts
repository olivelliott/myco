export { openDatabase } from './db.js';
export { runMigrations } from './migrations.js';
export { generateSessionId, buildProvenance } from './provenance.js';
export { loadConfig, getConfig } from './config.js';
export type { MycoConfig } from './config.js';
export { prepareStatements } from './statements.js';
export type { MycoStatements } from './statements.js';
export { computeEffectiveConfidence, DECAY_EXEMPT_TYPES } from './decay.js';
export type {
  SourceType,
  Entity,
  Observation,
  Relationship,
  Episode,
  ApprovalQueueItem,
  ProvenanceRecord,
  ExtractedFact,
  ConsolidationSummary,
} from './types.js';
export { embedText, embedBatch } from './embed-client.js';
export { classifyObservation, retireObservation, NEAR_DUP_DISTANCE_THRESHOLD } from './dedup.js';
export type { ClassificationResult } from './dedup.js';
export { discoverRelationships, createBackLinks, invalidateEntityCache } from './relationship-discovery.js';
export { rememberEntity, recallKnowledge, queryEntities, forgetEntity, logEpisode, reEmbedPending } from './memory-ops.js';
export type { RememberParams, RememberResult, RecallResult, ForgetResult, LogEpisodeResult } from './memory-ops.js';
