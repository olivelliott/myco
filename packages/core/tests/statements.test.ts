import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase } from '../src/db.js';
import { prepareStatements } from '../src/statements.js';
import type { MycoStatements } from '../src/statements.js';
import type Database from 'better-sqlite3';

const testDir = join(tmpdir(), 'myco-core-stmt-test-' + process.pid);

describe('prepareStatements', () => {
  let db: Database.Database;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns an object with all expected statement keys', () => {
    const stmts = prepareStatements(db);

    // Entity statements
    expect(stmts).toHaveProperty('selectEntityByNameType');
    expect(stmts).toHaveProperty('insertEntity');
    expect(stmts).toHaveProperty('selectAllEntityNames');
    expect(stmts).toHaveProperty('deleteEntityById');
    expect(stmts).toHaveProperty('updateEntityTimestampConfidence');

    // Observation statements
    expect(stmts).toHaveProperty('insertObservation');
    expect(stmts).toHaveProperty('insertObservationWithEmbeddingFlag');
    expect(stmts).toHaveProperty('flagObservationNeedsEmbedding');
    expect(stmts).toHaveProperty('clearObservationEmbeddingFlag');
    expect(stmts).toHaveProperty('selectPendingEmbeddings');
    expect(stmts).toHaveProperty('selectObservationsByEntityId');
    expect(stmts).toHaveProperty('updateObservationEntityId');

    // Relationship statements
    expect(stmts).toHaveProperty('insertRelationship');
    expect(stmts).toHaveProperty('selectRelationshipExists');
    expect(stmts).toHaveProperty('updateRelationshipFromId');
    expect(stmts).toHaveProperty('updateRelationshipToId');

    // Embedding/vector statements
    expect(stmts).toHaveProperty('insertVecEmbedding');
    expect(stmts).toHaveProperty('knnSearchObservations');
    expect(stmts).toHaveProperty('knnSearchForContradiction');
    expect(stmts).toHaveProperty('knnSearchForRelationships');

    // FTS statements
    expect(stmts).toHaveProperty('insertFtsObservation');
    expect(stmts).toHaveProperty('ftsSearchObservations');
    expect(stmts).toHaveProperty('ftsSearchEntityMentions');

    // Episode statements
    expect(stmts).toHaveProperty('insertEpisode');
    expect(stmts).toHaveProperty('selectUnconsolidatedEpisodes');

    // Approval queue statements
    expect(stmts).toHaveProperty('selectPendingApprovals');
    expect(stmts).toHaveProperty('selectApprovalById');
    expect(stmts).toHaveProperty('updateApprovalStatus');
    expect(stmts).toHaveProperty('insertApprovalQueueItem');
  });

  it('each returned statement has .run, .get, or .all methods (valid better-sqlite3 Statement)', () => {
    const stmts: MycoStatements = prepareStatements(db);

    const keys = Object.keys(stmts) as Array<keyof MycoStatements>;
    for (const key of keys) {
      const stmt = stmts[key];
      // Every better-sqlite3 Statement has at least .run, .get, and .all
      expect(typeof stmt.run, `${key}.run should be a function`).toBe('function');
      expect(typeof stmt.get, `${key}.get should be a function`).toBe('function');
      expect(typeof stmt.all, `${key}.all should be a function`).toBe('function');
    }
  });

  it('statements work on a fresh database (no crash)', () => {
    const stmts = prepareStatements(db);
    // selectEntityByNameType on empty DB returns undefined (not a crash)
    const result = stmts.selectEntityByNameType.get('nonexistent', 'concept');
    expect(result).toBeUndefined();
  });

  it('selectEntityByNameType.get("nonexistent","concept") returns undefined', () => {
    const stmts = prepareStatements(db);
    const result = stmts.selectEntityByNameType.get('nonexistent', 'concept');
    expect(result).toBeUndefined();
  });

  it('insert + select entity round-trip works through prepared statements', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const id = 'test-entity-id-001';

    // Insert entity
    stmts.insertEntity.run(id, 'TypeScript', 'technology', 'test-session', 'test-agent', 'agent_session', 0.9, now, now, null);

    // Select it back
    const row = stmts.selectEntityByNameType.get('TypeScript', 'technology') as { id: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.id).toBe(id);
  });

  it('insert + select observation round-trip works through prepared statements', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const entityId = 'test-entity-id-002';
    const obsId = 'test-obs-id-001';

    // Insert entity first (FK constraint)
    stmts.insertEntity.run(entityId, 'Rust', 'technology', 'test-session', 'test-agent', 'agent_session', 1.0, now, now, null);

    // Insert observation
    stmts.insertObservation.run(obsId, entityId, 'Rust is memory safe', 'test-session', 'test-agent', 'agent_session', 1.0, now);

    // Select observations by entity
    const rows = stmts.selectObservationsByEntityId.all(entityId) as Array<{ id: string; content: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(obsId);
    expect(rows[0].content).toBe('Rust is memory safe');
  });

  it('insert + select episode round-trip works through prepared statements', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const id = 'test-ep-001';

    stmts.insertEpisode.run(id, 'test-session', 'test-agent', 'test_event', '{"key":"value"}', now);

    const rows = stmts.selectUnconsolidatedEpisodes.all(10) as Array<{ id: string; event_type: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].event_type).toBe('test_event');
  });

  it('insert + select approval queue round-trip works through prepared statements', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const id = 'test-approval-001';

    stmts.insertApprovalQueueItem.run(id, 'proposed_fact', 'item-001', 'pending', 'low_confidence', '{}', now);

    const rows = stmts.selectPendingApprovals.all(10) as Array<{ id: string; status: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].status).toBe('pending');

    const row = stmts.selectApprovalById.get(id) as { id: string; status: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.status).toBe('pending');
  });

  it('flagObservationNeedsEmbedding and clearObservationEmbeddingFlag work', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const entityId = 'test-entity-flag';
    const obsId = 'test-obs-flag';

    stmts.insertEntity.run(entityId, 'FlagTest', 'concept', 'test-session', 'test-agent', 'agent_session', 1.0, now, now, null);
    stmts.insertObservation.run(obsId, entityId, 'Test content', 'test-session', 'test-agent', 'agent_session', 1.0, now);

    // Flag for re-embedding
    stmts.flagObservationNeedsEmbedding.run(obsId);
    const pending = stmts.selectPendingEmbeddings.all(10) as Array<{ id: string }>;
    expect(pending.some(r => r.id === obsId)).toBe(true);

    // Clear flag
    stmts.clearObservationEmbeddingFlag.run(obsId);
    const afterClear = stmts.selectPendingEmbeddings.all(10) as Array<{ id: string }>;
    expect(afterClear.some(r => r.id === obsId)).toBe(false);
  });

  it('updateApprovalStatus changes pending to approved', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const id = 'test-approval-update';

    stmts.insertApprovalQueueItem.run(id, 'proposed_fact', 'item-002', 'pending', 'low_confidence', '{}', now);

    const resolvedAt = new Date().toISOString();
    stmts.updateApprovalStatus.run('approved', resolvedAt, id);

    const row = stmts.selectApprovalById.get(id) as { status: string } | undefined;
    expect(row?.status).toBe('approved');
  });

  it('insertRelationship and selectRelationshipExists work', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();

    stmts.insertEntity.run('ent-a', 'EntityA', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertEntity.run('ent-b', 'EntityB', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertRelationship.run('rel-1', 'ent-a', 'ent-b', 'related_to', 'ses', 'ag', 'agent_session', 0.9, now);

    const exists = stmts.selectRelationshipExists.get('ent-a', 'ent-b', 'ent-b', 'ent-a');
    expect(exists).toBeDefined();
  });

  it('FTS insertFtsObservation and ftsSearchEntityMentions work', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();
    const entityId = 'ent-fts-1';
    const obsId = 'obs-fts-1';

    stmts.insertEntity.run(entityId, 'FtsEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertObservation.run(obsId, entityId, 'FtsEntity is useful', 'ses', 'ag', 'agent_session', 1.0, now);
    stmts.insertFtsObservation.run('FtsEntity is useful', obsId);

    const rows = stmts.ftsSearchEntityMentions.all('"FtsEntity"') as Array<{ entity_id: string }>;
    expect(rows.some(r => r.entity_id === entityId)).toBe(true);
  });

  it('selectAllEntityNames returns id and name for each entity', () => {
    const stmts = prepareStatements(db);
    const now = new Date().toISOString();

    stmts.insertEntity.run('e1', 'Alpha', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertEntity.run('e2', 'Beta', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);

    const rows = stmts.selectAllEntityNames.all() as Array<{ id: string; name: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const names = rows.map(r => r.name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });
});
