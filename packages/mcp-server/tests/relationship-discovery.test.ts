import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { discoverRelationships, createBackLinks } from '../src/relationship-discovery.js';
import { rememberEntity } from '../src/tools.js';

const testDir = join(tmpdir(), 'myco-reldiscovery-test-' + process.pid);

describe('relationship-discovery', () => {
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

  describe('discoverRelationships — name mentions', () => {
    it('creates a related_to relationship when observation text mentions an existing entity', async () => {
      // Setup: create an existing entity "React"
      await rememberEntity(db, {
        content: 'A JavaScript UI library',
        entity_name: 'React',
        entity_type: 'technology',
      }, stmts);

      // Create a new entity "Vite" with observation that mentions "React"
      await rememberEntity(db, {
        content: 'Vite is a build tool',
        entity_name: 'Vite',
        entity_type: 'technology',
      }, stmts);

      const viteEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('Vite') as { id: string };

      // Act: discover relationships for the Vite observation
      await discoverRelationships(db, viteEntity.id, 'Vite works great with React for fast HMR', null, stmts);

      // Assert: should have created a related_to relationship from Vite to React
      const rels = db.prepare(
        `SELECT * FROM relationships WHERE from_id = ? AND type = 'related_to'`
      ).all(viteEntity.id) as Array<{ to_id: string; type: string; source_type: string }>;

      expect(rels.length).toBe(1);
      expect(rels[0].source_type).toBe('auto_discovery');
    });

    it('skips entity names shorter than 3 characters', async () => {
      await rememberEntity(db, {
        content: 'A programming language',
        entity_name: 'Go',
        entity_type: 'technology',
      }, stmts);

      await rememberEntity(db, {
        content: 'Testing stuff',
        entity_name: 'TestLib',
        entity_type: 'library',
      }, stmts);

      const testEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('TestLib') as { id: string };
      await discoverRelationships(db, testEntity.id, 'We should go ahead and test it', null, stmts);

      const rels = db.prepare(
        `SELECT * FROM relationships WHERE from_id = ?`
      ).all(testEntity.id) as Array<{ type: string }>;

      expect(rels.length).toBe(0);
    });

    it('does not create duplicate relationships', async () => {
      await rememberEntity(db, {
        content: 'A JavaScript UI library',
        entity_name: 'React',
        entity_type: 'technology',
      }, stmts);

      const viteEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('React') as { id: string };
      // Calling twice with same mention should not create duplicates
      await discoverRelationships(db, viteEntity.id, 'React is great', null, stmts);
      // Self-mention should be ignored (entity mentions itself)
      const rels = db.prepare(
        `SELECT * FROM relationships WHERE from_id = ? AND type = 'related_to'`
      ).all(viteEntity.id) as Array<{ type: string }>;

      expect(rels.length).toBe(0); // Can't relate to self
    });
  });

  describe('createBackLinks', () => {
    it('finds existing observations mentioning the new entity name via FTS', async () => {
      // Create entity with observation that mentions "Vite"
      await rememberEntity(db, {
        content: 'We use Vite for fast builds in this project',
        entity_name: 'ProjectX',
        entity_type: 'project',
      }, stmts);

      // Now create the "Vite" entity
      await rememberEntity(db, {
        content: 'A build tool',
        entity_name: 'Vite',
        entity_type: 'technology',
      }, stmts);

      const viteEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('Vite') as { id: string };
      const projectEntity = db.prepare('SELECT id FROM entities WHERE name = ?').get('ProjectX') as { id: string };

      // Act
      createBackLinks(db, viteEntity.id, 'Vite', stmts);

      // Assert
      const rels = db.prepare(
        `SELECT * FROM relationships WHERE to_id = ? AND type = 'related_to'`
      ).all(viteEntity.id) as Array<{ from_id: string; source_type: string }>;

      expect(rels.length).toBe(1);
      expect(rels[0].from_id).toBe(projectEntity.id);
      expect(rels[0].source_type).toBe('auto_discovery');
    });
  });
});
