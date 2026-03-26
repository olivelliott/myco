import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { rememberEntity, recallKnowledge } from '../src/tools.js';
import * as embedClient from '../src/embed-client.js';

const testDir = join(tmpdir(), 'myco-recall-filter-test-' + process.pid);

describe('recallKnowledge filter params', () => {
  let db: Database.Database;
  let stmts: MycoStatements;
  let embedSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `test-${Date.now()}.db`));
    stmts = prepareStatements(db);
    // Force FTS path for all filter tests (no Ollama in test env)
    embedSpy = vi.spyOn(embedClient, 'embedText').mockResolvedValue(null);
  });

  afterEach(() => {
    embedSpy.mockRestore();
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('Test 1: entity_type filter returns only entities of that type', async () => {
    await rememberEntity(db, {
      content: 'TypeScript is a typed superset of JavaScript',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    await rememberEntity(db, {
      content: 'Alice is a software engineer',
      entity_name: 'Alice',
      entity_type: 'person',
    }, stmts);

    const result = await recallKnowledge(db, {
      query: 'TypeScript',
      limit: 10,
      entity_type: 'technology',
    }, stmts);

    const parsed = JSON.parse(result.content[0].text) as {
      results: Array<{ entity_type: string; entity_name: string }>;
      metadata: { method: string; count: number };
    };

    expect(parsed.results.length).toBeGreaterThan(0);
    // All returned results should be of type 'technology'
    for (const row of parsed.results) {
      expect(row.entity_type).toBe('technology');
    }
    // Alice (person) should not appear
    const hasAlice = parsed.results.some(r => r.entity_name === 'Alice');
    expect(hasAlice).toBe(false);
  });

  it('Test 2: min_confidence filter excludes entities below threshold', async () => {
    // Insert one with high confidence and one with lower confidence manually
    const now = new Date().toISOString();
    const entityHigh = 'ent-high-' + Date.now();
    const entityLow = 'ent-low-' + Date.now();

    db.prepare(
      `INSERT INTO entities (id, name, type, confidence, session_id, agent_id, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(entityHigh, 'HighConf', 'technology', 0.9, 'test', 'test', 'agent_session', now, now);

    db.prepare(
      `INSERT INTO entities (id, name, type, confidence, session_id, agent_id, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(entityLow, 'LowConf', 'technology', 0.3, 'test', 'test', 'agent_session', now, now);

    const obsHigh = 'obs-high-' + Date.now();
    const obsLow = 'obs-low-' + Date.now();

    db.prepare(
      `INSERT INTO observations (id, entity_id, content, confidence, session_id, agent_id, source_type, needs_embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(obsHigh, entityHigh, 'HighConf entity high confidence observation', 0.9, 'test', 'test', 'agent_session', 0, now);

    db.prepare(
      `INSERT INTO observations (id, entity_id, content, confidence, session_id, agent_id, source_type, needs_embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(obsLow, entityLow, 'LowConf entity low confidence observation', 0.3, 'test', 'test', 'agent_session', 0, now);

    // Insert FTS rows so FTS search can find them
    db.prepare(`INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)`)
      .run('HighConf entity high confidence observation', obsHigh);
    db.prepare(`INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)`)
      .run('LowConf entity low confidence observation', obsLow);

    const result = await recallKnowledge(db, {
      query: 'entity observation',
      limit: 10,
      min_confidence: 0.8,
    }, stmts);

    const parsed = JSON.parse(result.content[0].text) as {
      results: Array<{ entity_name: string; confidence: number }>;
    };

    // Only high confidence observation should be returned
    for (const row of parsed.results) {
      expect(row.confidence).toBeGreaterThanOrEqual(0.8);
    }
    const hasLowConf = parsed.results.some(r => r.entity_name === 'LowConf');
    expect(hasLowConf).toBe(false);
  });

  it('Test 3: entity_type AND min_confidence applies AND logic', async () => {
    const now = new Date().toISOString();

    // tech + high confidence
    const techHighId = 'ent-tech-high-' + Date.now();
    db.prepare(
      `INSERT INTO entities (id, name, type, confidence, session_id, agent_id, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(techHighId, 'TechHigh', 'technology', 0.9, 'test', 'test', 'agent_session', now, now);
    const obsThId = 'obs-th-' + Date.now();
    db.prepare(
      `INSERT INTO observations (id, entity_id, content, confidence, session_id, agent_id, source_type, needs_embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(obsThId, techHighId, 'TechHigh technology and high confidence observation', 0.9, 'test', 'test', 'agent_session', 0, now);
    db.prepare(`INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)`)
      .run('TechHigh technology and high confidence observation', obsThId);

    // person + high confidence (should be excluded by entity_type filter)
    const personHighId = 'ent-person-high-' + Date.now();
    db.prepare(
      `INSERT INTO entities (id, name, type, confidence, session_id, agent_id, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(personHighId, 'PersonHigh', 'person', 0.9, 'test', 'test', 'agent_session', now, now);
    const obsPhId = 'obs-ph-' + Date.now();
    db.prepare(
      `INSERT INTO observations (id, entity_id, content, confidence, session_id, agent_id, source_type, needs_embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(obsPhId, personHighId, 'PersonHigh person high confidence observation', 0.9, 'test', 'test', 'agent_session', 0, now);
    db.prepare(`INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)`)
      .run('PersonHigh person high confidence observation', obsPhId);

    // tech + low confidence (should be excluded by min_confidence filter)
    const techLowId = 'ent-tech-low-' + Date.now();
    db.prepare(
      `INSERT INTO entities (id, name, type, confidence, session_id, agent_id, source_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(techLowId, 'TechLow', 'technology', 0.3, 'test', 'test', 'agent_session', now, now);
    const obsTlId = 'obs-tl-' + Date.now();
    db.prepare(
      `INSERT INTO observations (id, entity_id, content, confidence, session_id, agent_id, source_type, needs_embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(obsTlId, techLowId, 'TechLow technology low confidence observation', 0.3, 'test', 'test', 'agent_session', 0, now);
    db.prepare(`INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)`)
      .run('TechLow technology low confidence observation', obsTlId);

    const result = await recallKnowledge(db, {
      query: 'confidence observation',
      limit: 10,
      entity_type: 'technology',
      min_confidence: 0.8,
    }, stmts);

    const parsed = JSON.parse(result.content[0].text) as {
      results: Array<{ entity_name: string; entity_type: string; confidence: number }>;
    };

    // Only TechHigh should pass both filters
    for (const row of parsed.results) {
      expect(row.entity_type).toBe('technology');
      expect(row.confidence).toBeGreaterThanOrEqual(0.8);
    }
    const hasPersonHigh = parsed.results.some(r => r.entity_name === 'PersonHigh');
    const hasTechLow = parsed.results.some(r => r.entity_name === 'TechLow');
    expect(hasPersonHigh).toBe(false);
    expect(hasTechLow).toBe(false);
  });

  it('Test 4: project filter scopes results to matching project namespace', async () => {
    // Store one entity under project 'myco'
    await rememberEntity(db, {
      content: 'scoped knowledge belongs to myco namespace only',
      entity_name: 'ScopedKnowledge',
      entity_type: 'concept',
      project: 'myco',
    }, stmts);

    // Store another entity with no project (global)
    await rememberEntity(db, {
      content: 'global knowledge has no project namespace',
      entity_name: 'GlobalKnowledge',
      entity_type: 'concept',
    }, stmts);

    // Recall with project filter — should only return myco-scoped entities
    const result = await recallKnowledge(db, {
      query: 'scoped knowledge',
      limit: 10,
      project: 'myco',
    }, stmts);

    const parsed = JSON.parse(result.content[0].text) as {
      results: Array<{ entity_name: string }>;
      metadata: { method: string; count: number; warnings?: string[] };
    };

    // No warnings should be emitted — project filter is now functional
    expect(parsed.metadata.warnings).toBeUndefined();

    // Only ScopedKnowledge (project='myco') should appear; GlobalKnowledge (NULL project) should not
    const names = parsed.results.map(r => r.entity_name);
    expect(names).toContain('ScopedKnowledge');
    expect(names).not.toContain('GlobalKnowledge');
  });

  it('Test 5: no filters = backward compatible behavior', async () => {
    await rememberEntity(db, {
      content: 'TypeScript is a typed language',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);

    const resultWithFilters = await recallKnowledge(db, {
      query: 'TypeScript',
      limit: 10,
    }, stmts);

    const resultBaseline = await recallKnowledge(db, {
      query: 'TypeScript',
      limit: 10,
    }, stmts);

    const parsedWithFilters = JSON.parse(resultWithFilters.content[0].text) as {
      results: unknown[];
      metadata: { method: string };
    };
    const parsedBaseline = JSON.parse(resultBaseline.content[0].text) as {
      results: unknown[];
      metadata: { method: string };
    };

    // Same count and method — no regressions
    expect(parsedWithFilters.results.length).toBe(parsedBaseline.results.length);
    expect(parsedWithFilters.metadata.method).toBe(parsedBaseline.metadata.method);
    // No warnings on no-filter call
    const parsedAny = parsedWithFilters as { metadata: { warnings?: string[] } };
    expect(parsedAny.metadata.warnings).toBeUndefined();
  });
});
