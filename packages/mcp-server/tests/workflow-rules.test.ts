import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { rememberEntity, recallKnowledge } from '@myco/core';
import { rememberRule, updateKnowledge } from '../src/tools.js';

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    embed: vi.fn().mockRejectedValue(new Error('mock: Ollama unavailable')),
  })),
}));

const testDir = join(tmpdir(), 'myco-workflow-rules-test-' + process.pid);

// ─────────────────────────────────────────────────────────────
// describe: rememberRule
// ─────────────────────────────────────────────────────────────

describe('rememberRule', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `test-${Date.now()}.db`));
    stmts = prepareStatements(db);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates an entity with type workflow_rule', async () => {
    await rememberRule(db, { instruction: 'Always write tests first' }, stmts);

    const row = db.prepare("SELECT * FROM entities WHERE type = 'workflow_rule'").get() as {
      type: string;
    };
    expect(row).toBeDefined();
    expect(row.type).toBe('workflow_rule');
  });

  it('created entity has decay_exempt=1', async () => {
    await rememberRule(db, { instruction: 'Always write tests first' }, stmts);

    const row = db.prepare("SELECT decay_exempt FROM entities WHERE type = 'workflow_rule'").get() as {
      decay_exempt: number;
    };
    expect(row).toBeDefined();
    expect(row.decay_exempt).toBe(1);
  });

  it('created entity has confidence=1.0', async () => {
    await rememberRule(db, { instruction: 'Always write tests first' }, stmts);

    const row = db.prepare("SELECT confidence FROM entities WHERE type = 'workflow_rule'").get() as {
      confidence: number;
    };
    expect(row).toBeDefined();
    expect(row.confidence).toBe(1.0);
  });

  it('entity name matches rule:{sha256first8} pattern', async () => {
    await rememberRule(db, { instruction: 'Always write tests first' }, stmts);

    const row = db.prepare("SELECT name FROM entities WHERE type = 'workflow_rule'").get() as {
      name: string;
    };
    expect(row).toBeDefined();
    expect(row.name).toMatch(/^rule:[0-9a-f]{8}$/);
  });

  it('observation content matches the instruction text', async () => {
    const instruction = 'Always write tests first';
    await rememberRule(db, { instruction }, stmts);

    const entity = db.prepare("SELECT id FROM entities WHERE type = 'workflow_rule'").get() as { id: string };
    const obs = db.prepare('SELECT content FROM observations WHERE entity_id = ?').get(entity.id) as {
      content: string;
    };
    expect(obs).toBeDefined();
    expect(obs.content).toContain(instruction);
  });

  it('with project param, entity.project is set', async () => {
    await rememberRule(db, { instruction: 'Always write tests first', project: 'my-project' }, stmts);

    const row = db.prepare("SELECT project FROM entities WHERE type = 'workflow_rule'").get() as {
      project: string | null;
    };
    expect(row).toBeDefined();
    expect(row.project).toBe('my-project');
  });

  it('without project param, entity.project is NULL (global scope)', async () => {
    await rememberRule(db, { instruction: 'Always write tests first' }, stmts);

    const row = db.prepare("SELECT project FROM entities WHERE type = 'workflow_rule'").get() as {
      project: string | null;
    };
    expect(row).toBeDefined();
    expect(row.project).toBeNull();
  });

  it('with triggers, observation content includes trigger annotation', async () => {
    await rememberRule(db, {
      instruction: 'Always write tests first',
      triggers: ['before coding', 'at task start'],
    }, stmts);

    const entity = db.prepare("SELECT id FROM entities WHERE type = 'workflow_rule'").get() as { id: string };
    const obs = db.prepare('SELECT content FROM observations WHERE entity_id = ?').get(entity.id) as {
      content: string;
    };
    expect(obs.content).toContain('[triggers:');
    expect(obs.content).toContain('before coding');
    expect(obs.content).toContain('at task start');
  });

  it('session-start query surfaces the rule (proves RULE-03)', async () => {
    await rememberRule(db, { instruction: 'Always write tests first', project: 'test-project' }, stmts);

    // Replicate the exact SQL the session-start hook uses (queryWorkflowRules)
    const rules = db.prepare(`
      SELECT e.name, e.type, GROUP_CONCAT(o.content, '\n') as observations
      FROM entities e
      LEFT JOIN observations o ON o.entity_id = e.id AND o.valid_until IS NULL
      WHERE e.type = 'workflow_rule'
        AND (e.project = ? OR e.project IS NULL)
        AND e.merged_into IS NULL
      GROUP BY e.id
      ORDER BY e.confidence DESC
    `).all('test-project') as Array<{ name: string; type: string; observations: string }>;

    expect(rules.length).toBeGreaterThanOrEqual(1);
    const ruleEntry = rules.find(r => r.observations?.includes('Always write tests first'));
    expect(ruleEntry).toBeDefined();
    expect(ruleEntry!.type).toBe('workflow_rule');
  });

  it('duplicate instruction does not create a duplicate entity (idempotent)', async () => {
    const instruction = 'Always write tests first';
    await rememberRule(db, { instruction }, stmts);
    await rememberRule(db, { instruction }, stmts);

    const rows = db.prepare("SELECT id FROM entities WHERE type = 'workflow_rule'").all() as Array<{ id: string }>;
    // Same instruction produces same entity name (rule:{sha256-8}), so upsert keeps 1 entity
    expect(rows.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// describe: updateKnowledge
// ─────────────────────────────────────────────────────────────

describe('updateKnowledge', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, `test-${Date.now()}.db`));
    stmts = prepareStatements(db);

    // Seed a known entity and observation so there is something to search and update
    await rememberEntity(db, {
      content: 'TypeScript strict mode improves type safety',
      entity_name: 'TypeScript',
      entity_type: 'technology',
    }, stmts);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('search phase returns candidates matching query text', async () => {
    const result = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: 'replacement value',
    }, stmts);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.action).toBe('confirm');
    expect(Array.isArray(parsed.candidates)).toBe(true);
    expect(parsed.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('search phase candidate has expected fields', async () => {
    const result = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: 'replacement value',
    }, stmts);

    const parsed = JSON.parse(result.content[0].text);
    const candidate = parsed.candidates[0];
    expect(candidate).toHaveProperty('id');
    expect(candidate).toHaveProperty('entity_name');
    expect(candidate).toHaveProperty('content');
    expect(candidate).toHaveProperty('confidence');
    expect(candidate).toHaveProperty('created_at');
  });

  it('search with entity_name narrows results to that entity', async () => {
    // Add a second entity so narrowing can be verified
    await rememberEntity(db, {
      content: 'strict mode is good for safety',
      entity_name: 'OtherEntity',
      entity_type: 'concept',
    }, stmts);

    const result = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: 'replacement',
      entity_name: 'TypeScript',
    }, stmts);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.action).toBe('confirm');
    // All candidates must belong to TypeScript only
    for (const c of parsed.candidates) {
      expect(c.entity_name).toBe('TypeScript');
    }
  });

  it('search with no matches returns no_matches action', async () => {
    const result = await updateKnowledge(db, {
      query: '"xyzzy-impossible-query-string-12345"',
      new_value: 'replacement',
    }, stmts);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.action).toBe('no_matches');
  });

  it('confirm phase retires old observation (valid_until is set)', async () => {
    // Get candidate id
    const searchResult = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: 'TypeScript strict mode also catches null errors',
    }, stmts);
    const { candidates } = JSON.parse(searchResult.content[0].text);
    const oldId = candidates[0].id;

    // Confirm the update
    await updateKnowledge(db, {
      query: 'strict mode',
      new_value: 'TypeScript strict mode also catches null errors',
      confirm_id: oldId,
    }, stmts);

    const oldObs = db.prepare('SELECT valid_until FROM observations WHERE id = ?').get(oldId) as {
      valid_until: string | null;
    };
    expect(oldObs.valid_until).not.toBeNull();
  });

  it('confirm phase inserts new observation with valid_from set', async () => {
    const newValue = 'TypeScript strict mode also catches null errors';

    const searchResult = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: newValue,
    }, stmts);
    const { candidates } = JSON.parse(searchResult.content[0].text);

    await updateKnowledge(db, {
      query: 'strict mode',
      new_value: newValue,
      confirm_id: candidates[0].id,
    }, stmts);

    const newObs = db.prepare('SELECT valid_from, content FROM observations WHERE content = ?').get(newValue) as {
      valid_from: string | null;
      content: string;
    };
    expect(newObs).toBeDefined();
    expect(newObs.content).toBe(newValue);
    expect(newObs.valid_from).not.toBeNull();
  });

  it('retired observation is excluded from default recall results', async () => {
    const originalContent = 'TypeScript strict mode improves type safety';
    const newValue = 'TypeScript strict mode catches type errors and null refs';

    const searchResult = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: newValue,
    }, stmts);
    const { candidates } = JSON.parse(searchResult.content[0].text);

    await updateKnowledge(db, {
      query: 'strict mode',
      new_value: newValue,
      confirm_id: candidates[0].id,
    }, stmts);

    // Recall should NOT include the retired content
    const recallResult = await recallKnowledge(db, {
      query: 'strict mode',
      limit: 10,
    }, stmts);

    const parsed = JSON.parse(recallResult.content[0].text);
    const contents = parsed.results?.map((r: { content: string }) => r.content) ?? [];
    expect(contents).not.toContain(originalContent);
  });

  it('confirm with invalid observation_id returns NOT_FOUND error', async () => {
    const result = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: 'replacement',
      confirm_id: 'nonexistent-id-xyz',
    }, stmts);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error || parsed.code || parsed.action).toBeTruthy();
    // Should contain some indication of not-found
    const text = result.content[0].text.toLowerCase();
    expect(text).toMatch(/not.?found|error/i);
  });

  it('atomic transaction: both retire and insert happen with no partial state', async () => {
    const newValue = 'TypeScript strict mode prevents runtime errors';

    const searchResult = await updateKnowledge(db, {
      query: 'strict mode',
      new_value: newValue,
    }, stmts);
    const { candidates } = JSON.parse(searchResult.content[0].text);
    const oldId = candidates[0].id;

    await updateKnowledge(db, {
      query: 'strict mode',
      new_value: newValue,
      confirm_id: oldId,
    }, stmts);

    // Old observation is retired
    const oldObs = db.prepare('SELECT valid_until FROM observations WHERE id = ?').get(oldId) as {
      valid_until: string | null;
    };
    expect(oldObs.valid_until).not.toBeNull();

    // New observation exists
    const newObs = db.prepare('SELECT id FROM observations WHERE content = ?').get(newValue);
    expect(newObs).toBeDefined();
  });
});
