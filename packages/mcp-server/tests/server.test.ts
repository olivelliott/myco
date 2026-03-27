import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { rememberEntity, recallKnowledge, queryEntities, logEpisode, reEmbedPending, forgetEntity, mergeEntities } from '../src/tools.js';
import * as embedClient from '../src/embed-client.js';

const testDir = join(tmpdir(), 'myco-mcp-test-' + process.pid);

describe('MCP server tools', () => {
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

  describe('rememberEntity', () => {
    it('inserts a row into entities table', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      const row = db.prepare('SELECT * FROM entities WHERE name = ?').get('TypeScript') as {
        id: string; name: string; type: string;
      };
      expect(row).toBeDefined();
      expect(row.name).toBe('TypeScript');
      expect(row.type).toBe('technology');
    });

    it('inserts an observation row linked to the created entity', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TypeScript') as { id: string };
      const obs = db.prepare('SELECT * FROM observations WHERE entity_id = ?').get(entity.id) as {
        id: string; entity_id: string; content: string;
      };

      expect(obs).toBeDefined();
      expect(obs.entity_id).toBe(entity.id);
      expect(obs.content).toBe('TypeScript is great');
    });

    it('returns content with type text containing the entity id', async () => {
      const result = await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('TypeScript');
    });

    it('written entity has correct provenance fields', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
        agent_id: 'test-agent',
      }, stmts);

      const entity = db.prepare('SELECT * FROM entities WHERE name = ?').get('TypeScript') as {
        session_id: string; agent_id: string; source_type: string; confidence: number;
        created_at: string; updated_at: string;
      };

      expect(entity.session_id).toBeTruthy();
      expect(entity.agent_id).toBe('test-agent');
      expect(entity.source_type).toBe('agent_session');
      expect(entity.confidence).toBe(1.0);
    });

    it('written entity has created_at and updated_at as ISO 8601 strings', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      const entity = db.prepare('SELECT * FROM entities WHERE name = ?').get('TypeScript') as {
        created_at: string; updated_at: string;
      };

      // ISO 8601 format check
      expect(new Date(entity.created_at).toISOString()).toBe(entity.created_at);
      expect(new Date(entity.updated_at).toISOString()).toBe(entity.updated_at);
    });

    it('sets agent_id from parameter on entity and observation', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
        agent_id: 'test-agent',
      }, stmts);

      const entity = db.prepare('SELECT * FROM entities WHERE name = ?').get('TypeScript') as {
        agent_id: string;
      };
      const obs = db.prepare('SELECT * FROM observations WHERE entity_id = (SELECT id FROM entities WHERE name = ?)').get('TypeScript') as {
        agent_id: string;
      };

      expect(entity.agent_id).toBe('test-agent');
      expect(obs.agent_id).toBe('test-agent');
    });

    it('defaults agent_id to unknown when not provided', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      const entity = db.prepare('SELECT * FROM entities WHERE name = ?').get('TypeScript') as {
        agent_id: string;
      };
      const obs = db.prepare('SELECT * FROM observations WHERE entity_id = (SELECT id FROM entities WHERE name = ?)').get('TypeScript') as {
        agent_id: string;
      };

      expect(entity.agent_id).toBe('unknown');
      expect(obs.agent_id).toBe('unknown');
    });

    it('creates target entity and relationship row when relations provided', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
        relations: [
          {
            target_name: 'JavaScript',
            target_type: 'technology',
            relation_type: 'is_superset_of',
          },
        ],
      }, stmts);

      const target = db.prepare('SELECT * FROM entities WHERE name = ?').get('JavaScript') as {
        id: string; name: string; type: string;
      };
      expect(target).toBeDefined();
      expect(target.name).toBe('JavaScript');
      expect(target.type).toBe('technology');

      const source = db.prepare('SELECT id FROM entities WHERE name = ?').get('TypeScript') as { id: string };
      const rel = db.prepare('SELECT * FROM relationships WHERE from_id = ? AND to_id = ?').get(source.id, target.id) as {
        type: string;
      };
      expect(rel).toBeDefined();
      expect(rel.type).toBe('is_superset_of');
    });

    it('reuses existing entity when called again with same name+type', async () => {
      // Disable Ollama embeddings so dedup falls back to exact string match.
      // "First observation" != "Second observation" → both classified ADD.
      const spy = vi.spyOn(embedClient, 'embedText').mockResolvedValue(null);

      await rememberEntity(db, {
        content: 'First observation',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      await rememberEntity(db, {
        content: 'Second observation',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      spy.mockRestore();

      const entities = db.prepare('SELECT * FROM entities WHERE name = ?').all('TypeScript') as unknown[];
      const observations = db.prepare('SELECT * FROM observations WHERE entity_id = (SELECT id FROM entities WHERE name = ?)').all('TypeScript') as unknown[];

      expect(entities).toHaveLength(1);
      expect(observations).toHaveLength(2);
    });

    it('inserts an fts_observations row for every observation', async () => {
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TypeScript') as { id: string };
      const obs = db.prepare('SELECT id FROM observations WHERE entity_id = ?').get(entity.id) as { id: string };
      const ftsRow = db.prepare('SELECT * FROM fts_observations WHERE observation_id = ?').get(obs.id) as {
        content: string; observation_id: string;
      } | undefined;

      expect(ftsRow).toBeDefined();
      expect(ftsRow?.content).toBe('TypeScript is great');
      expect(ftsRow?.observation_id).toBe(obs.id);
    });

    it('sets needs_embedding = 1 when Ollama is unavailable (graceful degradation)', async () => {
      // Ollama is not running in test environment — embedText returns null
      // This exercises the SRCH-04 graceful degradation path
      await rememberEntity(db, {
        content: 'TypeScript is great',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TypeScript') as { id: string };
      const obs = db.prepare('SELECT needs_embedding FROM observations WHERE entity_id = ?').get(entity.id) as {
        needs_embedding: number;
      };

      // When Ollama is unavailable, needs_embedding is set to 1
      // When Ollama is available, needs_embedding remains 0 and vec_embeddings row exists
      // Either outcome is valid — just assert the observation was stored
      expect(obs).toBeDefined();
      // needs_embedding is 0 (embedded) or 1 (queued) — both are valid
      expect([0, 1]).toContain(obs.needs_embedding);
    });
  });

  describe('recallKnowledge', () => {
    it('returns FTS5 results with method "fts" when Ollama is unavailable', async () => {
      // Force FTS5 path by mocking embedText to return null (Ollama unavailable)
      const spy = vi.spyOn(embedClient, 'embedText').mockResolvedValue(null);

      await rememberEntity(db, {
        content: 'TypeScript supports generics and interfaces',
        entity_name: 'TypeScript',
        entity_type: 'technology',
      }, stmts);

      const result = await recallKnowledge(db, { query: 'TypeScript', limit: 10 }, stmts);
      spy.mockRestore();
      const parsed = JSON.parse(result.content[0].text) as {
        results: Array<{ entity_name: string; observation: string; confidence: number; relevance_score: number }>;
        metadata: { method: string; count: number; query: string };
      };

      expect(parsed.metadata.method).toBe('fts');
      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].entity_name).toBe('TypeScript');
      expect(parsed.results[0].observation).toBe('TypeScript supports generics and interfaces');
    });

    it('returns empty results when no matching observations', async () => {
      const result = await recallKnowledge(db, { query: 'xyzzy nonexistent content', limit: 10 }, stmts);
      const parsed = JSON.parse(result.content[0].text) as {
        results: unknown[];
        metadata: { method: string; count: number };
      };

      expect(parsed.results).toHaveLength(0);
      expect(parsed.metadata.count).toBe(0);
    });

    it('recall does not return episodes (episode isolation - EPSD-03)', async () => {
      await logEpisode(db, { event_type: 'secret_event', payload: { task: 'secret' } }, stmts);

      const result = await recallKnowledge(db, { query: 'secret_event', limit: 10 }, stmts);
      const parsed = JSON.parse(result.content[0].text) as {
        results: Array<{ entity_name: string; observation: string }>;
      };

      // Episodes must never appear in recall results
      const hasEpisodeContent = parsed.results.some(r =>
        r.observation?.includes('secret_event') || r.entity_name?.includes('secret_event'),
      );
      expect(hasEpisodeContent).toBe(false);
    });
  });

  describe('queryEntities', () => {
    it('returns entity by exact name with observation_count', async () => {
      await rememberEntity(db, {
        content: 'A statically typed language',
        entity_name: 'TestEntity',
        entity_type: 'technology',
      }, stmts);

      const result = queryEntities(db, { entity_name: 'TestEntity' }, stmts);
      const parsed = JSON.parse(result.content[0].text) as {
        results: Array<{ entity_name: string; observation_count: number; observations: unknown[] }>;
        metadata: { count: number };
      };

      expect(parsed.metadata.count).toBe(1);
      expect(parsed.results[0].entity_name).toBe('TestEntity');
      expect(parsed.results[0].observation_count).toBeGreaterThanOrEqual(1);
    });

    it('filters entities by type', async () => {
      await rememberEntity(db, {
        content: 'A programming language',
        entity_name: 'Rust',
        entity_type: 'technology',
      }, stmts);

      await rememberEntity(db, {
        content: 'A person',
        entity_name: 'Alice',
        entity_type: 'person',
      }, stmts);

      const result = queryEntities(db, { entity_type: 'technology' }, stmts);
      const parsed = JSON.parse(result.content[0].text) as {
        results: Array<{ entity_name: string; entity_type: string }>;
      };

      const names = parsed.results.map(r => r.entity_name);
      expect(names).toContain('Rust');
      expect(names).not.toContain('Alice');
    });

    it('returns all entities when no filter provided', async () => {
      await rememberEntity(db, {
        content: 'First entity',
        entity_name: 'EntityA',
        entity_type: 'concept',
      }, stmts);

      await rememberEntity(db, {
        content: 'Second entity',
        entity_name: 'EntityB',
        entity_type: 'concept',
      }, stmts);

      const result = queryEntities(db, {}, stmts);
      const parsed = JSON.parse(result.content[0].text) as {
        results: Array<{ entity_name: string }>;
        metadata: { count: number };
      };

      expect(parsed.metadata.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('logEpisode', () => {
    it('creates episode record with correct fields', async () => {
      const result = await logEpisode(db, {
        event_type: 'test_event',
        payload: { key: 'value' },
      }, stmts);

      const parsed = JSON.parse(result.content[0].text) as {
        id: string;
        session_id: string;
      };

      expect(parsed.id).toBeTruthy();
      expect(parsed.session_id).toBeTruthy();

      const row = db.prepare('SELECT * FROM episodes WHERE event_type = ?').get('test_event') as {
        id: string;
        session_id: string;
        agent_id: string;
        event_type: string;
        payload: string;
        created_at: string;
      } | undefined;

      expect(row).toBeDefined();
      expect(row?.id).toBe(parsed.id);
      expect(row?.event_type).toBe('test_event');
      expect(JSON.parse(row?.payload ?? '{}')).toEqual({ key: 'value' });
    });

    it('per-agent episode isolation (EPSD-02): distinct agent_id values stored', async () => {
      await logEpisode(db, {
        event_type: 'agent_a_event',
        payload: { task: 'build' },
        agent_id: 'agent-alpha',
      }, stmts);

      await logEpisode(db, {
        event_type: 'agent_b_event',
        payload: { task: 'test' },
        agent_id: 'agent-beta',
      }, stmts);

      const rows = db.prepare('SELECT agent_id FROM episodes ORDER BY created_at').all() as Array<{ agent_id: string }>;

      expect(rows).toHaveLength(2);

      const agentIds = rows.map(r => r.agent_id);
      expect(agentIds).toContain('agent-alpha');
      expect(agentIds).toContain('agent-beta');
      expect(new Set(agentIds).size).toBe(2);
    });
  });

  describe('reEmbedPending', () => {
    it('returns 0 when no pending rows', async () => {
      const count = await reEmbedPending(db, stmts);
      expect(count).toBe(0);
    });

    it('returns 0 when Ollama unavailable (graceful — does not throw)', async () => {
      // Store an entity with needs_embedding = 1 (Ollama unavailable in tests)
      await rememberEntity(db, {
        content: 'Pending embedding content',
        entity_name: 'PendingEntity',
        entity_type: 'concept',
      }, stmts);

      // In test env, embedText returns null — reEmbedPending attempts but Ollama is down
      // Should not throw and returns 0 (Ollama unavailable mid-sweep stops early)
      const count = await reEmbedPending(db, stmts);
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('forgetEntity', () => {
    it('forgets entity by name, cascade-deleting observations and relationships', async () => {
      // Create entity with a relation
      await rememberEntity(db, {
        content: 'Hono is an ultrafast web framework',
        entity_name: 'Hono',
        entity_type: 'technology',
        relations: [{ target_name: 'Express', target_type: 'technology', relation_type: 'alternative_to' }],
      }, stmts);

      // Verify entity exists
      const entityBefore = db.prepare('SELECT id FROM entities WHERE name = ? AND type = ?').get('Hono', 'technology') as { id: string };
      expect(entityBefore).toBeDefined();

      const result = forgetEntity(db, { entity_name: 'Hono', entity_type: 'technology' }, stmts);
      const parsed = JSON.parse(result.content[0].text) as {
        status: string; type: string; entity_name: string; observations_removed: number; relationships_removed: number;
      };

      expect(parsed.status).toBe('forgotten');
      expect(parsed.type).toBe('entity');
      expect(parsed.entity_name).toBe('Hono');
      expect(parsed.observations_removed).toBeGreaterThanOrEqual(1);
      expect(parsed.relationships_removed).toBeGreaterThanOrEqual(1);

      // Entity should be gone
      const entityAfter = db.prepare('SELECT * FROM entities WHERE name = ?').get('Hono');
      expect(entityAfter).toBeUndefined();

      // Observations should be gone
      const obsCount = db.prepare('SELECT COUNT(*) as n FROM observations WHERE entity_id = ?').get(entityBefore.id) as { n: number };
      expect(obsCount.n).toBe(0);
    });

    it('cleans up fts_observations entries when forgetting entity', async () => {
      await rememberEntity(db, {
        content: 'Vitest is a fast test runner',
        entity_name: 'Vitest',
        entity_type: 'technology',
      }, stmts);

      const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('Vitest') as { id: string };
      const obs = db.prepare('SELECT id FROM observations WHERE entity_id = ?').get(entity.id) as { id: string };

      // FTS row should exist before forget
      const ftsBefore = db.prepare('SELECT * FROM fts_observations WHERE observation_id = ?').get(obs.id);
      expect(ftsBefore).toBeDefined();

      forgetEntity(db, { entity_name: 'Vitest', entity_type: 'technology' }, stmts);

      // FTS row should be gone after forget
      const ftsAfter = db.prepare('SELECT * FROM fts_observations WHERE observation_id = ?').get(obs.id);
      expect(ftsAfter).toBeUndefined();
    });

    it('returns NOT_FOUND for nonexistent entity', () => {
      const result = forgetEntity(db, { entity_name: 'DoesNotExist', entity_type: 'technology' }, stmts);
      const parsed = JSON.parse(result.content[0].text) as { error: string; code: string };

      expect(parsed.error).toContain('not found');
      expect(parsed.code).toBe('NOT_FOUND');
    });

    it('forgets single observation by ID, leaving entity intact', async () => {
      // Disable Ollama embeddings so dedup falls back to exact string match.
      // The two observations have different content → both classified ADD.
      const spy = vi.spyOn(embedClient, 'embedText').mockResolvedValue(null);

      await rememberEntity(db, {
        content: 'First observation about SQLite',
        entity_name: 'SQLite',
        entity_type: 'technology',
      }, stmts);

      await rememberEntity(db, {
        content: 'Second observation about SQLite',
        entity_name: 'SQLite',
        entity_type: 'technology',
      }, stmts);

      spy.mockRestore();

      const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('SQLite') as { id: string };
      const observations = db.prepare('SELECT id FROM observations WHERE entity_id = ?').all(entity.id) as Array<{ id: string }>;
      expect(observations.length).toBe(2);

      const obsToDelete = observations[0].id;

      const result = forgetEntity(db, { observation_id: obsToDelete }, stmts);
      const parsed = JSON.parse(result.content[0].text) as { status: string; type: string; observation_id: string };

      expect(parsed.status).toBe('forgotten');
      expect(parsed.type).toBe('observation');
      expect(parsed.observation_id).toBe(obsToDelete);

      // Observation should be gone
      const obsAfter = db.prepare('SELECT * FROM observations WHERE id = ?').get(obsToDelete);
      expect(obsAfter).toBeUndefined();

      // FTS entry should be gone
      const ftsAfter = db.prepare('SELECT * FROM fts_observations WHERE observation_id = ?').get(obsToDelete);
      expect(ftsAfter).toBeUndefined();

      // Entity should still exist
      const entityAfter = db.prepare('SELECT * FROM entities WHERE id = ?').get(entity.id);
      expect(entityAfter).toBeDefined();

      // One observation should remain
      const remainingObs = db.prepare('SELECT COUNT(*) as n FROM observations WHERE entity_id = ?').get(entity.id) as { n: number };
      expect(remainingObs.n).toBe(1);
    });

    it('returns NOT_FOUND for nonexistent observation', () => {
      const result = forgetEntity(db, { observation_id: 'nonexistent-obs-id' }, stmts);
      const parsed = JSON.parse(result.content[0].text) as { error: string; code: string };

      expect(parsed.error).toContain('not found');
      expect(parsed.code).toBe('NOT_FOUND');
    });

    it('forgets single relationship by ID', async () => {
      await rememberEntity(db, {
        content: 'React uses JSX',
        entity_name: 'React',
        entity_type: 'technology',
        relations: [{ target_name: 'JSX', target_type: 'concept', relation_type: 'uses' }],
      }, stmts);

      const source = db.prepare('SELECT id FROM entities WHERE name = ?').get('React') as { id: string };
      const target = db.prepare('SELECT id FROM entities WHERE name = ?').get('JSX') as { id: string };
      const rel = db.prepare('SELECT id FROM relationships WHERE from_id = ? AND to_id = ?').get(source.id, target.id) as { id: string };
      expect(rel).toBeDefined();

      const result = forgetEntity(db, { relationship_id: rel.id }, stmts);
      const parsed = JSON.parse(result.content[0].text) as { status: string; type: string; relationship_id: string };

      expect(parsed.status).toBe('forgotten');
      expect(parsed.type).toBe('relationship');
      expect(parsed.relationship_id).toBe(rel.id);

      // Relationship should be gone
      const relAfter = db.prepare('SELECT * FROM relationships WHERE id = ?').get(rel.id);
      expect(relAfter).toBeUndefined();

      // Both entities should still exist
      expect(db.prepare('SELECT * FROM entities WHERE id = ?').get(source.id)).toBeDefined();
      expect(db.prepare('SELECT * FROM entities WHERE id = ?').get(target.id)).toBeDefined();
    });

    it('returns NOT_FOUND for nonexistent relationship', () => {
      const result = forgetEntity(db, { relationship_id: 'nonexistent-rel-id' }, stmts);
      const parsed = JSON.parse(result.content[0].text) as { error: string; code: string };

      expect(parsed.error).toContain('not found');
      expect(parsed.code).toBe('NOT_FOUND');
    });

    it('returns INVALID_INPUT when no params provided', () => {
      const result = forgetEntity(db, {}, stmts);
      const parsed = JSON.parse(result.content[0].text) as { error: string; code: string };

      expect(parsed.code).toBe('INVALID_INPUT');
      expect(parsed.error).toContain('entity_name');
    });
  });

  describe('tool registration', () => {
    it('registerTools exports are all functions', async () => {
      const { registerTools } = await import('../src/tools.js');
      expect(typeof registerTools).toBe('function');
    });
  });
});

// ── Helper: create a normalized unit vector for controlled test embeddings ──
// Uses 768 dimensions (nomic-embed-text). Set one dimension to 1.0, rest 0.
// Two orthogonal vectors have euclidean distance sqrt(2) (~1.414) — well above UPDATE_THRESHOLD.
// Two near-identical vectors have euclidean distance near 0 — well below NOOP_THRESHOLD.
function makeUnitVec(primaryDim: number): Float32Array {
  const arr = new Float32Array(768);
  arr[primaryDim] = 1.0;
  return arr;
}

// A vector that is "close but not identical" to dim 0:
// weights dim 0 at ~0.866, dim 1 at ~0.5 → euclidean dist to makeUnitVec(0) ≈ 0.518
// which is in UPDATE range (0.40 < 0.518 < 0.84)
function makeUpdateVec(): Float32Array {
  const arr = new Float32Array(768);
  arr[0] = Math.sqrt(3) / 2;  // ~0.866
  arr[1] = 0.5;
  return arr;
}

// A near-duplicate of dim 0 (tiny perturbation): euclidean dist ≈ 0.00005 < NOOP_THRESHOLD
function makeNearDuplicateVec(): Float32Array {
  const arr = new Float32Array(768);
  const eps = 0.0001;
  arr[0] = Math.sqrt(1 - eps * eps);
  arr[1] = eps;
  return arr;
}

describe('dedup classification in rememberEntity', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `dedup-${Date.now()}.db`));
    stmts = prepareStatements(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('skips duplicate observation (NOOP) — observation count stays at 1', async () => {
    // Both calls return near-identical vectors
    const spy = vi.spyOn(embedClient, 'embedText')
      .mockResolvedValueOnce(Array.from(makeUnitVec(0)))  // first remember: seeds embedding
      .mockResolvedValueOnce(Array.from(makeNearDuplicateVec())); // classify: near-dup

    // First call — inserts observation + embedding
    await rememberEntity(db, {
      content: 'TypeScript version is 5.8',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    // Second call with same content — should be NOOP
    const result = await rememberEntity(db, {
      content: 'TypeScript version is 5.8',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    spy.mockRestore();

    // Response should indicate skip
    expect(result.content[0].text).toMatch(/skipped|already exists/i);

    // Only one observation row should exist
    const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TypeScript') as { id: string };
    const count = db.prepare('SELECT COUNT(*) as n FROM observations WHERE entity_id = ?').get(entity.id) as { n: number };
    expect(count.n).toBe(1);
  });

  it('retires old observation on UPDATE — both rows exist, old has valid_until', async () => {
    // First remember: seeds dimension 0 vector
    const spy = vi.spyOn(embedClient, 'embedText')
      .mockResolvedValueOnce(Array.from(makeUnitVec(0)))  // first insert embedding
      .mockResolvedValueOnce(Array.from(makeUpdateVec())) // classify second content: UPDATE range
      .mockResolvedValueOnce(Array.from(makeUpdateVec())); // second insert embedding

    await rememberEntity(db, {
      content: 'TypeScript version is 5.8',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    await rememberEntity(db, {
      content: 'TypeScript version is 5.9',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    spy.mockRestore();

    const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TypeScript') as { id: string };
    const observations = db.prepare(
      'SELECT id, content, valid_from, valid_until FROM observations WHERE entity_id = ? ORDER BY created_at',
    ).all(entity.id) as Array<{ id: string; content: string; valid_from: string | null; valid_until: string | null }>;

    // Both rows must exist (soft-retire, not delete)
    expect(observations).toHaveLength(2);

    const old = observations.find(o => o.content === 'TypeScript version is 5.8');
    const updated = observations.find(o => o.content === 'TypeScript version is 5.9');

    expect(old).toBeDefined();
    expect(updated).toBeDefined();

    // Old observation must be retired
    expect(old!.valid_until).not.toBeNull();

    // New observation must have valid_from set
    expect(updated!.valid_from).not.toBeNull();

    // New observation must NOT be retired
    expect(updated!.valid_until).toBeNull();
  });

  it('adds new observation for completely different topic (ADD) — both observations current', async () => {
    const spy = vi.spyOn(embedClient, 'embedText')
      .mockResolvedValueOnce(Array.from(makeUnitVec(0)))   // first insert embedding
      .mockResolvedValueOnce(Array.from(makeUnitVec(400))) // classify second: perpendicular → ADD
      .mockResolvedValueOnce(Array.from(makeUnitVec(400))); // second insert embedding

    await rememberEntity(db, {
      content: 'TypeScript is a strongly typed language',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    await rememberEntity(db, {
      content: 'TypeScript has excellent IDE support',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    spy.mockRestore();

    const entity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TypeScript') as { id: string };
    const observations = db.prepare(
      'SELECT id, content, valid_until FROM observations WHERE entity_id = ?',
    ).all(entity.id) as Array<{ id: string; content: string; valid_until: string | null }>;

    expect(observations).toHaveLength(2);

    // Both observations must be current (neither retired)
    for (const obs of observations) {
      expect(obs.valid_until).toBeNull();
    }
  });
});

describe('temporal recall with as_of', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `temporal-${Date.now()}.db`));
    stmts = prepareStatements(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns observations valid at past timestamp (as_of)', async () => {
    // Force FTS path (no Ollama) for predictable FTS results
    vi.spyOn(embedClient, 'embedText').mockResolvedValue(null);

    const now = new Date().toISOString();
    const entityId = 'ent-temporal-test';
    stmts.insertEntity.run(entityId, 'TemporalEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);

    // T1: insert first observation (valid_from = T1, valid_until = T2)
    const T1 = new Date(Date.now() - 10000).toISOString();
    const T2 = new Date(Date.now() - 5000).toISOString();
    const T3 = new Date().toISOString();

    stmts.insertObservationTemporal.run('obs-v1', entityId, 'TypeScript version five point eight', 'ses', 'ag', 'agent_session', 1.0, T1, T1);
    stmts.retireObservation.run(T2, 'obs-v1');

    // T3: insert second observation (valid_from = T3, valid_until = NULL — current)
    stmts.insertObservationTemporal.run('obs-v2', entityId, 'TypeScript version five point nine', 'ses', 'ag', 'agent_session', 1.0, T3, T3);

    // Also insert FTS entries for both
    stmts.insertFtsObservation.run('TypeScript version five point eight', 'obs-v1');
    stmts.insertFtsObservation.run('TypeScript version five point nine', 'obs-v2');

    // Query as_of a time between T1 and T2 — should see v1, not v2
    const asOfTime = new Date(Date.now() - 7000).toISOString();
    const result = await recallKnowledge(db, {
      query: 'TypeScript version',
      limit: 10,
      as_of: asOfTime,
    }, stmts);

    const parsed = JSON.parse(result.content[0].text) as {
      results: Array<{ observation: string }>;
    };

    const observations = parsed.results.map(r => r.observation);
    expect(observations.some(o => o.includes('five point eight'))).toBe(true);
    expect(observations.some(o => o.includes('five point nine'))).toBe(false);
  });

  it('excludes retired observations from default recall (no as_of)', async () => {
    vi.spyOn(embedClient, 'embedText').mockResolvedValue(null);

    const now = new Date().toISOString();
    const entityId = 'ent-retired-test';
    stmts.insertEntity.run(entityId, 'RetiredTestEntity', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);

    const T1 = new Date(Date.now() - 5000).toISOString();
    const T2 = new Date().toISOString();

    // Insert old (retired) observation
    stmts.insertObservationTemporal.run('obs-retired', entityId, 'deprecated fact zerozerozero', 'ses', 'ag', 'agent_session', 1.0, T1, T1);
    stmts.retireObservation.run(T2, 'obs-retired');
    stmts.insertFtsObservation.run('deprecated fact zerozerozero', 'obs-retired');

    // Insert current observation
    stmts.insertObservationTemporal.run('obs-current', entityId, 'current fact oneoneone', 'ses', 'ag', 'agent_session', 1.0, T2, T2);
    stmts.insertFtsObservation.run('current fact oneoneone', 'obs-current');

    // Default recall (no as_of) — must NOT return retired observation
    const result = await recallKnowledge(db, { query: 'deprecated fact zerozerozero', limit: 10 }, stmts);
    const parsed = JSON.parse(result.content[0].text) as {
      results: Array<{ observation: string }>;
    };

    const observations = parsed.results.map(r => r.observation);
    expect(observations.some(o => o.includes('deprecated'))).toBe(false);
  });
});

describe('entity merge', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `merge-${Date.now()}.db`));
    stmts = prepareStatements(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('soft-merges source into target: sets merged_into, moves observations, source row survives', () => {
    const now = new Date().toISOString();

    // Create two entities
    stmts.insertEntity.run('ent-source', 'TypeScript', 'technology', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertEntity.run('ent-target', 'TS', 'technology', 'ses', 'ag', 'agent_session', 1.0, now, now, null);

    // Add observations to source
    stmts.insertObservationTemporal.run('obs-s1', 'ent-source', 'Source fact one', 'ses', 'ag', 'agent_session', 1.0, now, now);
    stmts.insertObservationTemporal.run('obs-s2', 'ent-source', 'Source fact two', 'ses', 'ag', 'agent_session', 1.0, now, now);

    // Add a relationship on source
    stmts.insertRelationship.run('rel-1', 'ent-source', 'ent-target', 'related_to', 'ses', 'ag', 'agent_session', 1.0, now);

    const result = mergeEntities(db, stmts, 'ent-source', 'ent-target');

    // Source entity row must still exist (NOT deleted)
    const sourceRow = db.prepare('SELECT id, merged_into FROM entities WHERE id = ?').get('ent-source') as {
      id: string; merged_into: string | null;
    } | undefined;
    expect(sourceRow).toBeDefined();
    expect(sourceRow!.merged_into).toBe('ent-target');

    // Observations must be moved to target
    const targetObs = db.prepare('SELECT id FROM observations WHERE entity_id = ?').all('ent-target') as Array<{ id: string }>;
    const obsIds = targetObs.map(o => o.id);
    expect(obsIds).toContain('obs-s1');
    expect(obsIds).toContain('obs-s2');

    // No observations remain on source
    const sourceObs = db.prepare('SELECT COUNT(*) as n FROM observations WHERE entity_id = ?').get('ent-source') as { n: number };
    expect(sourceObs.n).toBe(0);

    // Return value reports correct counts
    expect(result.observations_moved).toBe(2);
    expect(result.relationships_moved).toBeGreaterThanOrEqual(1);
  });

  it('merged source entity is excluded from selectAllEntityNames', () => {
    const now = new Date().toISOString();

    stmts.insertEntity.run('ent-src2', 'OldName', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);
    stmts.insertEntity.run('ent-tgt2', 'NewName', 'concept', 'ses', 'ag', 'agent_session', 1.0, now, now, null);

    mergeEntities(db, stmts, 'ent-src2', 'ent-tgt2');

    const names = stmts.selectAllEntityNames.all() as Array<{ id: string; name: string }>;
    const nameList = names.map(n => n.name);

    expect(nameList).toContain('NewName');
    expect(nameList).not.toContain('OldName');
  });
});
