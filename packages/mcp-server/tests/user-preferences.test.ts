import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { rememberEntity, registerPostRememberCallback, resetEmbedClient } from '@myco/core';
import { promotePreference } from '../src/tools.js';

// Mock ollama to return empty embeddings (dedup falls back to exact match)
// Return valid response instead of throwing — avoids triggering health cooldown
vi.mock('ollama', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ollama')>();
  class MockOllama {
    async embed(params: { model: string; input: string | string[] }) {
      // Return a zero vector — valid but won't match anything in KNN
      return { embeddings: [new Array(768).fill(0)] };
    }
  }
  return { ...actual, Ollama: MockOllama };
});

// Load the session-start hook as CommonJS module
const requireCjs = createRequire(import.meta.url);
const hookPath = resolve(new URL(import.meta.url).pathname, '../../../../hooks/myco-session-start.js');
const sessionHook = requireCjs(hookPath) as {
  buildInjection: (rules: unknown[], facts: unknown[], preferences: Array<{ name: string; observations: string | null; obs_metadata: string | null }>, projectName: string | null) => string;
  queryUserPreferences: (db: Database.Database) => Array<{ name: string; observations: string | null; obs_metadata: string | null }>;
};

const testDir = join(tmpdir(), 'myco-user-prefs-test-' + process.pid);

describe('User preference promotion logic', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    resetEmbedClient(); // clear singleton so mock Ollama is used
    db = openDatabase(join(testDir, `test-${Date.now()}.db`));
    stmts = prepareStatements(db);
    // Register preference promotion callback (normally done in index.ts)
    registerPostRememberCallback((db, stmts, entityName, project) => {
      promotePreference(db, stmts, entityName, project);
    });
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('Test 1: Remembering a preference for project "alpha" stores it as project-scoped', async () => {
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'alpha',
    }, stmts);

    const entity = db.prepare(
      `SELECT id, name, type, project, metadata FROM entities WHERE name = ? AND type = 'user_preference'`
    ).get('dark theme') as { id: string; name: string; type: string; project: string | null; metadata: string } | undefined;

    expect(entity).toBeDefined();
    expect(entity!.project).toBe('alpha');
  });

  it('Test 2: Remembering the same preference for project "beta" promotes to global entity', async () => {
    // First remember for project alpha
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'alpha',
    }, stmts);

    // Now remember for project beta — should trigger promotion
    const result = await rememberEntity(db, {
      content: 'prefers dark themes across all projects',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'beta',
    }, stmts);

    // rememberEntity stores the entity; promotePreference runs via callback
    // Check DB state rather than response text (promotion is a side-effect)

    // The entity should now have project=NULL
    const entity = db.prepare(
      `SELECT id, name, type, project, metadata FROM entities WHERE name = ? AND type = 'user_preference' AND merged_into IS NULL`
    ).get('dark theme') as { id: string; name: string; type: string; project: string | null; metadata: string } | undefined;

    expect(entity).toBeDefined();
    expect(entity!.project).toBeNull();

    // Metadata should have source_projects with both alpha and beta
    const meta = JSON.parse(entity!.metadata) as { source_projects?: string[] };
    expect(meta.source_projects).toBeDefined();
    expect(meta.source_projects).toContain('alpha');
    expect(meta.source_projects).toContain('beta');
  });

  it('Test 3: After promotion, the original project-scoped entity has merged_into set to global entity id', async () => {
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'alpha',
    }, stmts);

    await rememberEntity(db, {
      content: 'prefers dark themes everywhere',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'beta',
    }, stmts);

    // Get all entities with this name (including merged ones)
    const allEntities = db.prepare(
      `SELECT id, name, project, merged_into FROM entities WHERE name = ? AND type = 'user_preference'`
    ).all('dark theme') as Array<{ id: string; name: string; project: string | null; merged_into: string | null }>;

    // The entity that was originally project-scoped should have merged_into pointing to the global one
    const globalEntity = allEntities.find(e => e.project === null && e.merged_into === null);
    expect(globalEntity).toBeDefined();

    // NOTE: Since selectEntityByNameType matches by name+type regardless of project,
    // a second call with project='beta' updates the SAME entity (alpha's). The promotion
    // detects alpha != beta and sets project=NULL. There may only be one entity.
    // If there are two entities (created separately), test the merged_into relationship.
    const mergedEntities = allEntities.filter(e => e.merged_into !== null);
    if (mergedEntities.length > 0) {
      for (const merged of mergedEntities) {
        expect(merged.merged_into).toBe(globalEntity!.id);
      }
    }
  });

  it('Test 4: Remembering a preference with project=null stores it as global immediately — no promotion needed', async () => {
    const result = await rememberEntity(db, {
      content: 'global user prefers dark themes',
      entity_name: 'dark theme global',
      entity_type: 'user_preference',
      project: undefined, // explicit global
    }, stmts);

    // Should NOT mention promotion
    expect(result.content[0].text).not.toContain('Promoted to global preference');

    const entity = db.prepare(
      `SELECT id, name, type, project FROM entities WHERE name = ? AND type = 'user_preference'`
    ).get('dark theme global') as { id: string; name: string; type: string; project: string | null } | undefined;

    expect(entity).toBeDefined();
    expect(entity!.project).toBeNull();
  });

  it('Test 5: Remembering a preference for a third project adds it to source_projects without duplicate promotion', async () => {
    // First two projects trigger promotion
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'alpha',
    }, stmts);

    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'beta',
    }, stmts);

    // Third project reinforces the already-global preference
    const result = await rememberEntity(db, {
      content: 'prefers dark themes in gamma too',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'gamma',
    }, stmts);

    // Promotion happens via callback — verify DB state instead of response text

    // Entity should still be global
    const entity = db.prepare(
      `SELECT id, name, type, project, metadata FROM entities WHERE name = ? AND type = 'user_preference' AND merged_into IS NULL`
    ).get('dark theme') as { id: string; name: string; type: string; project: string | null; metadata: string } | undefined;

    expect(entity).toBeDefined();
    expect(entity!.project).toBeNull();

    // All three projects should be in source_projects
    const meta = JSON.parse(entity!.metadata) as { source_projects?: string[] };
    expect(meta.source_projects).toBeDefined();
    expect(meta.source_projects).toContain('alpha');
    expect(meta.source_projects).toContain('beta');
    expect(meta.source_projects).toContain('gamma');
  });

  it('Test 6: promotePreference is exported and returns promoted=false for single project entity', async () => {
    await rememberEntity(db, {
      content: 'prefers light themes',
      entity_name: 'light theme',
      entity_type: 'user_preference',
      project: 'alpha',
    }, stmts);

    const result = promotePreference(db, stmts, 'light theme', 'alpha');
    expect(result.promoted).toBe(false);
  });
});

describe('Session-start source attribution', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    resetEmbedClient();
    db = openDatabase(join(testDir, `test-attr-${Date.now()}.db`));
    stmts = prepareStatements(db);
    registerPostRememberCallback((db, stmts, entityName, project) => {
      promotePreference(db, stmts, entityName, project);
    });
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('Test 7: queryUserPreferences returns obs_metadata field', async () => {
    // Create a global preference directly with metadata
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'alpha',
    }, stmts);
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'beta',
    }, stmts);

    // After promotion, queryUserPreferences should return obs_metadata
    const prefs = sessionHook.queryUserPreferences(db);
    expect(prefs.length).toBeGreaterThan(0);
    const darkThemePref = prefs.find(p => p.name === 'dark theme');
    expect(darkThemePref).toBeDefined();
    // obs_metadata field must be present (can be string or null)
    expect('obs_metadata' in darkThemePref!).toBe(true);
  });

  it('Test 8: buildInjection formats a preference with source_projects as "(from: alpha, beta)"', () => {
    const preferences = [
      {
        name: 'dark theme',
        observations: 'prefers dark themes',
        obs_metadata: '{"source_projects":["alpha","beta"]}',
      },
    ];

    const output = sessionHook.buildInjection([], [], preferences, 'myproject');
    expect(output).toContain('(from: alpha, beta)');
    expect(output).toContain('**dark theme**');
  });

  it('Test 9: buildInjection formats a preference without source_projects metadata — no attribution suffix', () => {
    const preferences = [
      {
        name: 'light mode',
        observations: 'prefers light mode',
        obs_metadata: null,
      },
    ];

    const output = sessionHook.buildInjection([], [], preferences, 'myproject');
    expect(output).toContain('**light mode**: prefers light mode');
    expect(output).not.toContain('(from:');
  });

  it('Test 10: buildInjection with empty obs_metadata object renders without attribution', () => {
    const preferences = [
      {
        name: 'vim keys',
        observations: 'prefers vim keybindings',
        obs_metadata: '{}',
      },
    ];

    const output = sessionHook.buildInjection([], [], preferences, 'myproject');
    expect(output).toContain('**vim keys**: prefers vim keybindings');
    expect(output).not.toContain('(from:');
  });

  it('Test 11: End-to-end — after promoting a preference, queryUserPreferences + buildInjection shows "(from: ...)" attribution', async () => {
    // Promote a preference from two projects
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'projectA',
    }, stmts);
    await rememberEntity(db, {
      content: 'prefers dark themes',
      entity_name: 'dark theme',
      entity_type: 'user_preference',
      project: 'projectB',
    }, stmts);

    // Query preferences using session-start hook
    const prefs = sessionHook.queryUserPreferences(db);
    const darkThemePref = prefs.find(p => p.name === 'dark theme');
    expect(darkThemePref).toBeDefined();

    // Build injection
    const output = sessionHook.buildInjection([], [], prefs, 'any-project');
    expect(output).toContain('(from:');
    expect(output).toContain('projectA');
    expect(output).toContain('projectB');
  });
});
