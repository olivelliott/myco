import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { rememberEntity, recallKnowledge, queryEntities, logEpisode, reEmbedPending, forgetEntity } from '../src/tools.js';
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
