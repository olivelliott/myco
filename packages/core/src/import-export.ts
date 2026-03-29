import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { Entity, Observation, Relationship } from './types.js';
import type { MycoStatements } from './statements.js';
import { classifyObservation, retireObservation } from './dedup.js';
import { embedText } from './embed-client.js';

export interface GraphExport {
  metadata: {
    version: string;
    exported_at: string;
    entity_count: number;
    observation_count: number;
    relationship_count: number;
  };
  entities: Entity[];
  observations: Observation[];
  relationships: Relationship[];
}

export interface ImportResult {
  entities_added: number;
  entities_skipped: number;
  observations_added: number;
  observations_skipped: number;
  relationships_added: number;
  relationships_skipped: number;
}

/**
 * Export the entire knowledge graph as a JSON snapshot.
 * Includes all non-merged entities, all observations (including retired),
 * and all relationships.
 */
export function exportGraph(db: Database.Database): GraphExport {
  const entities = db.prepare<[], Entity>(
    `SELECT * FROM entities WHERE merged_into IS NULL ORDER BY created_at`
  ).all();

  const observations = db.prepare<[], Observation>(
    `SELECT * FROM observations ORDER BY created_at`
  ).all();

  const relationships = db.prepare<[], Relationship>(
    `SELECT * FROM relationships ORDER BY created_at`
  ).all();

  return {
    metadata: {
      version: '1.0',
      exported_at: new Date().toISOString(),
      entity_count: entities.length,
      observation_count: observations.length,
      relationship_count: relationships.length,
    },
    entities,
    observations,
    relationships,
  };
}

/**
 * Import a knowledge graph snapshot, routing all observations through the
 * dedup pipeline for idempotent re-import.
 *
 * Processing order: entities first, then observations, then relationships.
 * This ensures entity_id references are valid before observations are inserted.
 */
export async function importGraph(
  db: Database.Database,
  payload: GraphExport,
  stmts: MycoStatements,
): Promise<ImportResult> {
  const result: ImportResult = {
    entities_added: 0,
    entities_skipped: 0,
    observations_added: 0,
    observations_skipped: 0,
    relationships_added: 0,
    relationships_skipped: 0,
  };

  // Map original entity IDs to new/existing IDs for observations + relationships
  const entityIdMap = new Map<string, string>();

  // ── Step 1: Import entities ──────────────────────────────────────────────
  for (const entity of payload.entities) {
    const existing = stmts.selectEntityByNameType.get(entity.name, entity.type) as { id: string } | undefined;

    if (existing) {
      // Entity already exists — map original ID to existing ID
      entityIdMap.set(entity.id, existing.id);
      result.entities_skipped++;
    } else {
      // Insert new entity preserving original ID and timestamps
      stmts.insertEntity.run(
        entity.id,
        entity.name,
        entity.type,
        entity.session_id,
        entity.agent_id,
        entity.source_type,
        entity.confidence,
        entity.created_at,
        entity.updated_at,
        entity.project ?? null,
      );
      entityIdMap.set(entity.id, entity.id);
      result.entities_added++;
    }
  }

  // ── Step 2: Import observations ──────────────────────────────────────────
  for (const obs of payload.observations) {
    const entityId = entityIdMap.get(obs.entity_id);

    if (entityId === undefined) {
      // Entity not found in map — skip observation (orphaned)
      result.observations_skipped++;
      continue;
    }

    // Get embedding for dedup classification
    const embedding = await embedText(obs.content);
    const vec = embedding !== null ? new Float32Array(embedding) : null;

    const classification = classifyObservation(db, entityId, obs.content, vec, stmts);

    if (classification.action === 'NOOP') {
      result.observations_skipped++;
      continue;
    }

    const obsId = nanoid();
    const now = new Date().toISOString();

    // Preserve original valid_from — critical for temporal history on as_of queries
    const validFrom = obs.valid_from ?? obs.created_at;

    if (classification.action === 'UPDATE') {
      // Retire old and insert new with original timestamps
      db.transaction(() => {
        retireObservation(db, classification.retireId, now);
        stmts.insertObservation.run(
          obsId, entityId, obs.content,
          obs.session_id, obs.agent_id, obs.source_type, obs.confidence,
          obs.created_at, validFrom,
        );
        stmts.insertFtsObservation.run(obs.content, obsId);
      })();
    } else {
      // ADD — insert new observation preserving original timestamps
      stmts.insertObservation.run(
        obsId, entityId, obs.content,
        obs.session_id, obs.agent_id, obs.source_type, obs.confidence,
        obs.created_at, validFrom,
      );
      stmts.insertFtsObservation.run(obs.content, obsId);
    }

    // Insert vector embedding if available; flag for later if not
    if (vec !== null) {
      stmts.insertVecEmbedding.run(obsId, 'observation', vec);
    } else {
      stmts.flagObservationNeedsEmbedding.run(obsId);
    }

    result.observations_added++;
  }

  // ── Step 3: Import relationships ─────────────────────────────────────────
  for (const rel of payload.relationships) {
    const fromId = entityIdMap.get(rel.from_id);
    const toId = entityIdMap.get(rel.to_id);

    if (fromId === undefined || toId === undefined) {
      // One or both entities missing — skip
      result.relationships_skipped++;
      continue;
    }

    // Check if relationship already exists (any direction for undirected semantics)
    const exists = stmts.selectRelationshipExists.get(fromId, toId, toId, fromId) as { 1: number } | undefined;

    if (exists) {
      result.relationships_skipped++;
      continue;
    }

    stmts.insertRelationship.run(
      rel.id, fromId, toId, rel.type,
      rel.session_id, rel.agent_id, rel.source_type, rel.confidence, rel.created_at,
    );
    result.relationships_added++;
  }

  return result;
}
