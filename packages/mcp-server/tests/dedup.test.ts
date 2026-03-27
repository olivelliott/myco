import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { classifyObservation, retireObservation, NEAR_DUP_DISTANCE_THRESHOLD } from '../src/dedup.js';

const testDir = join(tmpdir(), 'myco-dedup-test-' + process.pid);

/** Build a normalized 768-dim float32 embedding that is directionally controlled */
function makeEmbedding(value: number): Float32Array {
  const arr = new Float32Array(768);
  arr.fill(0);
  arr[0] = value;
  // Normalize to unit vector
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  return arr.map(v => v / norm) as Float32Array;
}

/** Helper: insert an observation with an optional embedding */
function insertObs(
  db: Database.Database,
  stmts: MycoStatements,
  entityId: string,
  obsId: string,
  content: string,
  validFrom: string,
  validUntil: string | null = null,
  embedding: Float32Array | null = null,
): void {
  db.prepare(
    `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, valid_from, valid_until)
     VALUES (?, ?, ?, '{}', 'sess', 'agent', 'agent_session', 1.0, ?, ?, ?)`
  ).run(obsId, entityId, content, validFrom, validFrom, validUntil);

  if (embedding !== null) {
    stmts.insertVecEmbedding.run(obsId, 'observation', embedding);
  }
}

/** Helper: insert an entity */
function insertEntity(db: Database.Database, id: string, name: string): void {
  db.prepare(
    `INSERT INTO entities (id, name, type, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
     VALUES (?, ?, 'concept', '{}', 'sess', 'agent', 'agent_session', 1.0, ?, ?)`
  ).run(id, name, new Date().toISOString(), new Date().toISOString());
}

describe('dedup classification', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, 'test.db'));
    stmts = prepareStatements(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('exports NEAR_DUP_DISTANCE_THRESHOLD = 0.08', () => {
    expect(NEAR_DUP_DISTANCE_THRESHOLD).toBe(0.08);
  });

  it('returns ADD when entity has no existing observations', () => {
    insertEntity(db, 'e1', 'TestEntity');
    const result = classifyObservation(db, 'e1', 'A brand new observation', null, stmts);
    expect(result.action).toBe('ADD');
  });

  it('returns NOOP with existingId on exact content match', () => {
    insertEntity(db, 'e1', 'TestEntity');
    insertObs(db, stmts, 'e1', 'obs1', 'TypeScript is great', '2026-01-01T00:00:00Z');

    const result = classifyObservation(db, 'e1', 'TypeScript is great', null, stmts);
    expect(result.action).toBe('NOOP');
    if (result.action === 'NOOP') {
      expect(result.existingId).toBe('obs1');
    }
  });

  it('does NOT match NOOP for retired observations (valid_until IS NOT NULL)', () => {
    insertEntity(db, 'e1', 'TestEntity');
    insertObs(db, stmts, 'e1', 'obs1', 'TypeScript is great', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');

    const result = classifyObservation(db, 'e1', 'TypeScript is great', null, stmts);
    // Retired observation should not trigger NOOP — should ADD new version
    expect(result.action).toBe('ADD');
  });

  it('returns UPDATE with retireId when embedding distance < 0.08', () => {
    insertEntity(db, 'e1', 'TestEntity');
    // Use very similar embeddings (near-duplicates)
    const existingEmb = makeEmbedding(1.0);
    insertObs(db, stmts, 'e1', 'obs1', 'TypeScript is awesome', '2026-01-01T00:00:00Z', null, existingEmb);

    // Slightly different embedding (very close, distance < 0.08)
    const newEmb = makeEmbedding(1.0); // identical direction = distance 0

    const result = classifyObservation(db, 'e1', 'TypeScript is fantastic', newEmb, stmts);
    expect(result.action).toBe('UPDATE');
    if (result.action === 'UPDATE') {
      expect(result.retireId).toBe('obs1');
    }
  });

  it('returns ADD when embedding distance >= 0.08 (no near-dup)', () => {
    insertEntity(db, 'e1', 'TestEntity');
    // Use very different embeddings
    const existingEmb = makeEmbedding(1.0);
    insertObs(db, stmts, 'e1', 'obs1', 'TypeScript is awesome', '2026-01-01T00:00:00Z', null, existingEmb);

    // Orthogonal embedding (distance = 1.0, very different)
    const differentEmb = new Float32Array(768);
    differentEmb[1] = 1.0; // orthogonal to makeEmbedding(1.0) which has arr[0]=1.0

    const result = classifyObservation(db, 'e1', 'Python is great', differentEmb, stmts);
    expect(result.action).toBe('ADD');
  });

  it('picks most recent (highest valid_from) near-dup as retireId', () => {
    insertEntity(db, 'e1', 'TestEntity');
    const emb = makeEmbedding(1.0);
    // Two near-dup observations with different valid_from timestamps
    insertObs(db, stmts, 'e1', 'obs-old', 'TypeScript is awesome', '2026-01-01T00:00:00Z', null, emb);
    insertObs(db, stmts, 'e1', 'obs-new', 'TypeScript is amazing', '2026-02-01T00:00:00Z', null, emb);

    const newEmb = makeEmbedding(1.0); // same direction = distance 0

    const result = classifyObservation(db, 'e1', 'TypeScript is incredible', newEmb, stmts);
    expect(result.action).toBe('UPDATE');
    if (result.action === 'UPDATE') {
      // Should pick the most recent one
      expect(result.retireId).toBe('obs-new');
    }
  });

  it('does NOT match UPDATE for retired observations', () => {
    insertEntity(db, 'e1', 'TestEntity');
    const emb = makeEmbedding(1.0);
    // Retired near-dup observation
    insertObs(db, stmts, 'e1', 'obs1', 'TypeScript is awesome', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', emb);

    const newEmb = makeEmbedding(1.0);
    const result = classifyObservation(db, 'e1', 'TypeScript is fantastic', newEmb, stmts);
    // Retired — should not UPDATE, should ADD
    expect(result.action).toBe('ADD');
  });
});

describe('retireObservation', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, 'test2.db'));
    stmts = prepareStatements(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('sets valid_until on the target observation', () => {
    insertEntity(db, 'e1', 'TestEntity');
    insertObs(db, stmts, 'e1', 'obs1', 'Some content', '2026-01-01T00:00:00Z');

    const now = '2026-03-27T12:00:00Z';
    retireObservation(db, 'obs1', now);

    const row = db.prepare('SELECT valid_until FROM observations WHERE id = ?').get('obs1') as {
      valid_until: string | null;
    };
    expect(row.valid_until).toBe(now);
  });

  it('does not affect other observations', () => {
    insertEntity(db, 'e1', 'TestEntity');
    insertObs(db, stmts, 'e1', 'obs1', 'Content A', '2026-01-01T00:00:00Z');
    insertObs(db, stmts, 'e1', 'obs2', 'Content B', '2026-01-02T00:00:00Z');

    retireObservation(db, 'obs1', '2026-03-27T12:00:00Z');

    const row2 = db.prepare('SELECT valid_until FROM observations WHERE id = ?').get('obs2') as {
      valid_until: string | null;
    };
    expect(row2.valid_until).toBeNull();
  });
});
