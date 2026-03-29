import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { generateSessionId, buildProvenance } from './provenance.js';
import type { MycoStatements } from './statements.js';

const SESSION_ID = generateSessionId();

// Entity name cache with generation counter for invalidation
let entityCache: Map<string, string> | null = null;
let cacheGeneration = 0;
let lastGeneration = -1;

/** Call this after any entity INSERT to invalidate the cache */
export function invalidateEntityCache(): void {
  cacheGeneration++;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getEntityNames(db: Database.Database, stmts: MycoStatements): Map<string, string> {
  if (entityCache && lastGeneration === cacheGeneration) {
    return entityCache;
  }
  const rows = stmts.selectAllEntityNames.all() as Array<{ id: string; name: string }>;
  entityCache = new Map();
  for (const row of rows) {
    if (row.name.length >= 3) {
      entityCache.set(row.name, row.id);
    }
  }
  lastGeneration = cacheGeneration;
  return entityCache;
}

/**
 * Discover relationships by scanning observation text for mentions of existing entities
 * and by semantic similarity if an embedding is provided.
 *
 * - Name-mention: creates 'related_to' relationships (confidence 0.7)
 * - Semantic similarity: creates 'semantically_related' relationships (confidence = 1 - distance)
 * - Caps at 3 new relationships per call
 * - Never blocks the caller — all errors are caught and logged
 */
export async function discoverRelationships(
  db: Database.Database,
  entityId: string,
  observationText: string,
  embedding: Float32Array | null,
  stmts: MycoStatements,
): Promise<void> {
  try {
    const prov = buildProvenance(SESSION_ID, undefined, 'auto_discovery', 0.7);
    const entityNames = getEntityNames(db, stmts);
    let created = 0;
    const MAX_NEW = 3;

    // 1. Name-mention scanning
    for (const [name, targetId] of entityNames) {
      if (created >= MAX_NEW) break;
      if (targetId === entityId) continue; // skip self

      const pattern = new RegExp('\\b' + escapeRegex(name) + '\\b', 'i');
      if (pattern.test(observationText)) {
        // Check if relationship already exists
        const existing = stmts.selectRelationshipExists.get(entityId, targetId, targetId, entityId);

        if (!existing) {
          stmts.insertRelationship.run(
            nanoid(), entityId, targetId, 'related_to',
            prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at,
          );
          created++;
        }
      }
    }

    // 2. Semantic similarity (if embedding available and budget remains)
    if (embedding && created < MAX_NEW) {
      const rows = stmts.knnSearchForRelationships.all(embedding, entityId) as Array<{ entity_id: string; distance: number }>;

      for (const row of rows) {
        if (created >= MAX_NEW) break;

        const existing = stmts.selectRelationshipExists.get(entityId, row.entity_id, row.entity_id, entityId);

        if (!existing) {
          const confidence = Math.round((1.0 - row.distance) * 100) / 100;
          stmts.insertRelationship.run(
            nanoid(), entityId, row.entity_id, 'semantically_related',
            prov.session_id, prov.agent_id, 'auto_discovery', confidence, prov.created_at,
          );
          created++;
        }
      }
    }
  } catch (err) {
    console.error('[relationship-discovery] error:', err instanceof Error ? err.message : err);
  }
}

/**
 * When a new entity is created, scan existing observations for mentions of its name
 * using the FTS5 index. Creates 'related_to' relationships back to mentioning entities.
 */
export function createBackLinks(
  db: Database.Database,
  entityId: string,
  entityName: string,
  stmts: MycoStatements,
): void {
  if (entityName.length < 3) return;

  try {
    const prov = buildProvenance(SESSION_ID, undefined, 'auto_discovery', 0.6);

    // Use FTS5 to find observations mentioning the entity name
    const ftsQuery = '"' + entityName.replace(/"/g, '""') + '"';
    const rows = stmts.ftsSearchEntityMentions.all(ftsQuery) as Array<{ entity_id: string }>;

    for (const row of rows) {
      if (row.entity_id === entityId) continue;

      const existing = stmts.selectRelationshipExists.get(row.entity_id, entityId, entityId, row.entity_id);

      if (!existing) {
        stmts.insertRelationship.run(
          nanoid(), row.entity_id, entityId, 'related_to',
          prov.session_id, prov.agent_id, prov.source_type, prov.confidence, prov.created_at,
        );
      }
    }
  } catch (err) {
    console.error('[relationship-discovery] backlink error:', err instanceof Error ? err.message : err);
  }
}
