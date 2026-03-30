import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { classifyObservation, retireObservation } from '../src/dedup-resolver.js';

// Mock the embed-client module so we control embedding vectors in tests
vi.mock('@myco/core/embed-client', () => ({
  embedText: vi.fn(),
}));

import * as embedClient from '@myco/core/embed-client';

const testDir = join(tmpdir(), 'myco-dedup-test-' + process.pid);

// Helper to create a normalized Float32Array of length 768 (nomic-embed-text dims)
// We use a simple approach: set a single dimension to 1.0, rest to 0
function makeVec(primaryDim: number, secondaryDim?: number, secondaryWeight = 0): Float32Array {
  const arr = new Float32Array(768);
  arr[primaryDim] = 1.0;
  if (secondaryDim !== undefined) {
    arr[primaryDim] = Math.sqrt(1 - secondaryWeight * secondaryWeight);
    arr[secondaryDim] = secondaryWeight;
  }
  return arr;
}

// cosine distance of two unit vectors: 1 - dot_product
// makeVec(0) vs makeVec(0): distance = 0 (same)
// makeVec(0) vs makeVec(0, 1, 0.5): partial overlap, distance ~ 0.134 (UPDATE range)
// makeVec(0) vs makeVec(1): perpendicular, distance = 1.0 (ADD range)

describe('classifyObservation', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `test-${Date.now()}.db`));
    stmts = prepareStatements(db);
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns ADD when entity has no existing observations', async () => {
    const entityId = 'ent-empty';
    const now = new Date().toISOString();
    stmts.insertEntity.run(entityId, 'EmptyEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);

    vi.mocked(embedClient.embedText).mockResolvedValue(Array.from(makeVec(0)));

    const result = await classifyObservation(db, stmts, entityId, 'Some new fact');
    expect(result.classification).toBe('ADD');
    expect(result.reason).toBeTruthy();
  });

  it('returns NOOP for a near-duplicate observation (cosine distance < 0.08)', async () => {
    const entityId = 'ent-noop';
    const now = new Date().toISOString();
    const obsId = 'obs-existing-noop';

    stmts.insertEntity.run(entityId, 'NoopEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservationTemporal.run(obsId, entityId, 'TypeScript version is 5.8', 'ses', 'ag', 'agent_session', 1.0, now, now);

    // Seed a near-identical embedding in vec_embeddings (distance ~0.00005)
    const existingVec = makeVec(0);
    stmts.insertVecEmbedding.run(obsId, 'observation', existingVec);

    // New content embedding is nearly identical (dim 0 dominant, tiny dim 1)
    const nearDuplicateVec = new Float32Array(768);
    nearDuplicateVec[0] = 0.9999;
    nearDuplicateVec[1] = 0.01;
    // Normalize
    const mag = Math.sqrt(nearDuplicateVec[0] ** 2 + nearDuplicateVec[1] ** 2);
    nearDuplicateVec[0] /= mag;
    nearDuplicateVec[1] /= mag;

    vi.mocked(embedClient.embedText).mockResolvedValue(Array.from(nearDuplicateVec));

    const result = await classifyObservation(db, stmts, entityId, 'TypeScript version is 5.8');
    expect(result.classification).toBe('NOOP');
    expect(result.reason).toContain('distance');
  });

  it('returns UPDATE for an observation that conflicts with existing (cosine distance 0.08..0.35)', async () => {
    const entityId = 'ent-update';
    const now = new Date().toISOString();
    const obsId = 'obs-existing-update';

    stmts.insertEntity.run(entityId, 'UpdateEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservationTemporal.run(obsId, entityId, 'TypeScript version is 5.8', 'ses', 'ag', 'agent_session', 1.0, now, now);

    // Existing embedding: purely dimension 0
    const existingVec = makeVec(0);
    stmts.insertVecEmbedding.run(obsId, 'observation', existingVec);

    // New embedding: dimension 0 dominant but shifted toward dim 1
    // This gives cosine distance in UPDATE range (~0.13)
    const updateVec = makeVec(0, 1, 0.5);
    vi.mocked(embedClient.embedText).mockResolvedValue(Array.from(updateVec));

    const result = await classifyObservation(db, stmts, entityId, 'TypeScript version is 5.9');
    expect(result.classification).toBe('UPDATE');
    expect(result.superseded_observation_id).toBe(obsId);
    expect(result.reason).toContain('distance');
  });

  it('returns ADD for an observation about a completely different topic (cosine distance >= 0.35)', async () => {
    const entityId = 'ent-add-diff';
    const now = new Date().toISOString();
    const obsId = 'obs-existing-different';

    stmts.insertEntity.run(entityId, 'DifferentEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservationTemporal.run(obsId, entityId, 'TypeScript is a language', 'ses', 'ag', 'agent_session', 1.0, now, now);

    // Existing embedding: dimension 0
    stmts.insertVecEmbedding.run(obsId, 'observation', makeVec(0));

    // New embedding: completely different dimension — perpendicular (distance = 1.0)
    vi.mocked(embedClient.embedText).mockResolvedValue(Array.from(makeVec(1)));

    const result = await classifyObservation(db, stmts, entityId, 'Coffee is delicious');
    expect(result.classification).toBe('ADD');
    expect(result.reason).toContain('distance');
  });

  it('falls back to exact string match NOOP when embedText returns null', async () => {
    const entityId = 'ent-fallback-noop';
    const now = new Date().toISOString();
    const obsId = 'obs-existing-fallback';
    const content = 'Exact same content for fallback test';

    stmts.insertEntity.run(entityId, 'FallbackEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservationTemporal.run(obsId, entityId, content, 'ses', 'ag', 'agent_session', 1.0, now, now);

    // Ollama is down
    vi.mocked(embedClient.embedText).mockResolvedValue(null);

    const result = await classifyObservation(db, stmts, entityId, content);
    expect(result.classification).toBe('NOOP');
    expect(result.reason).toContain('exact');
  });

  it('falls back to ADD when embedText returns null and no exact match exists', async () => {
    const entityId = 'ent-fallback-add';
    const now = new Date().toISOString();

    stmts.insertEntity.run(entityId, 'FallbackAddEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservationTemporal.run('obs-other', entityId, 'Different content', 'ses', 'ag', 'agent_session', 1.0, now, now);

    // Ollama is down
    vi.mocked(embedClient.embedText).mockResolvedValue(null);

    const result = await classifyObservation(db, stmts, entityId, 'New content not matching anything');
    expect(result.classification).toBe('ADD');
  });
});

describe('retireObservation', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `test-retire-${Date.now()}.db`));
    stmts = prepareStatements(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('sets valid_until on the target observation without deleting it', () => {
    const now = new Date().toISOString();
    const entityId = 'ent-retire-test';
    const obsId = 'obs-retire-test';

    stmts.insertEntity.run(entityId, 'RetireTestEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservationTemporal.run(obsId, entityId, 'Fact to retire', 'ses', 'ag', 'agent_session', 1.0, now, now);

    const retiredAt = new Date().toISOString();
    retireObservation(stmts, obsId, retiredAt);

    // Row still exists (no deletion)
    const row = db.prepare('SELECT id, content, valid_until FROM observations WHERE id = ?').get(obsId) as {
      id: string; content: string; valid_until: string;
    };
    expect(row).toBeDefined();
    expect(row.content).toBe('Fact to retire');
    expect(row.valid_until).toBe(retiredAt);
  });

  it('does not affect other observations when retiring one', () => {
    const now = new Date().toISOString();
    const entityId = 'ent-retire-isolated';

    stmts.insertEntity.run(entityId, 'IsolatedEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservationTemporal.run('obs-to-retire', entityId, 'Old fact', 'ses', 'ag', 'agent_session', 1.0, now, now);
    stmts.insertObservationTemporal.run('obs-to-keep', entityId, 'Current fact', 'ses', 'ag', 'agent_session', 1.0, now, now);

    retireObservation(stmts, 'obs-to-retire', new Date().toISOString());

    const kept = db.prepare('SELECT valid_until FROM observations WHERE id = ?').get('obs-to-keep') as { valid_until: string | null };
    expect(kept.valid_until).toBeNull();
  });
});
