import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { openDatabase, prepareStatements } from '@myco/core';
import type Database from 'better-sqlite3';
import type { MycoStatements } from '@myco/core';
import { queryEntities } from '@myco/core';

// Unique per-process test dir to avoid collisions in parallel test runs
const testDir = join(tmpdir(), 'myco-temporal-test-' + process.pid);

// ── Test scenario constants ────────────────────────────────────────────────
const ENTITY_ID = 'ent-temporal-01';
const ENTITY_NAME = 'TypeScript';
const ENTITY_TYPE = 'technology';

// Observation A: valid from Jan → Mar 2026 (retired)
const OBS_A_ID = 'obs-old-01';
const OBS_A_CONTENT = 'TypeScript is slow';
const OBS_A_VALID_FROM = '2026-01-01T00:00:00.000Z';
const OBS_A_VALID_UNTIL = '2026-03-01T00:00:00.000Z';

// Observation B: valid from Mar 2026 → present (current)
const OBS_B_ID = 'obs-new-01';
const OBS_B_CONTENT = 'TypeScript is fast';
const OBS_B_VALID_FROM = '2026-03-01T00:00:00.000Z';
// valid_until = NULL (current)

// Point-in-time test dates
const AS_OF_DURING_A = '2026-02-01T00:00:00.000Z'; // obs A valid, obs B not yet created
const AS_OF_DURING_B = '2026-03-15T00:00:00.000Z'; // obs B valid, obs A retired

describe('Temporal query filtering', () => {
  let db: Database.Database;
  let stmts: MycoStatements;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    db = openDatabase(join(testDir, 'test.db'));
    stmts = prepareStatements(db);

    // Insert test entity
    db.prepare(
      `INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
       VALUES (?, ?, ?, NULL, '{}', 'sess-01', 'agent-01', 'agent_session', 1.0, ?, ?)`
    ).run(ENTITY_ID, ENTITY_NAME, ENTITY_TYPE, OBS_A_VALID_FROM, OBS_B_VALID_FROM);

    // Insert observation A (retired — has valid_until set)
    db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, valid_from, valid_until)
       VALUES (?, ?, ?, '{}', 'sess-01', 'agent-01', 'agent_session', 1.0, ?, ?, ?)`
    ).run(OBS_A_ID, ENTITY_ID, OBS_A_CONTENT, OBS_A_VALID_FROM, OBS_A_VALID_FROM, OBS_A_VALID_UNTIL);

    // Insert observation B (current — valid_until is NULL)
    db.prepare(
      `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, valid_from)
       VALUES (?, ?, ?, '{}', 'sess-01', 'agent-01', 'agent_session', 1.0, ?, ?)`
    ).run(OBS_B_ID, ENTITY_ID, OBS_B_CONTENT, OBS_B_VALID_FROM, OBS_B_VALID_FROM);

    // Insert FTS entries for both observations (for recall FTS path tests)
    stmts.insertFtsObservation.run(OBS_A_CONTENT, OBS_A_ID);
    stmts.insertFtsObservation.run(OBS_B_CONTENT, OBS_B_ID);
  });

  afterEach(() => {
    db.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  // ── Prepared statement tests ───────────────────────────────────────────────

  describe('selectObservationsByEntityId (current-only)', () => {
    it('returns only current observations (valid_until IS NULL)', () => {
      const rows = stmts.selectObservationsByEntityId.all(ENTITY_ID) as Array<{
        id: string;
        content: string;
      }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(OBS_B_ID);
      expect(rows[0].content).toBe(OBS_B_CONTENT);
    });

    it('does not return retired observations', () => {
      const rows = stmts.selectObservationsByEntityId.all(ENTITY_ID) as Array<{ id: string }>;
      const ids = rows.map(r => r.id);
      expect(ids).not.toContain(OBS_A_ID);
    });
  });

  describe('selectAllObservationsByEntityId (history view)', () => {
    it('returns all versions including retired observations', () => {
      const rows = stmts.selectAllObservationsByEntityId.all(ENTITY_ID) as Array<{
        id: string;
        content: string;
        valid_from: string;
        valid_until: string | null;
      }>;
      expect(rows).toHaveLength(2);
      const ids = rows.map(r => r.id);
      expect(ids).toContain(OBS_A_ID);
      expect(ids).toContain(OBS_B_ID);
    });

    it('orders results by valid_from DESC (newest first)', () => {
      const rows = stmts.selectAllObservationsByEntityId.all(ENTITY_ID) as Array<{
        id: string;
        valid_from: string;
      }>;
      expect(rows[0].id).toBe(OBS_B_ID); // newer
      expect(rows[1].id).toBe(OBS_A_ID); // older
    });

    it('includes valid_from and valid_until fields', () => {
      const rows = stmts.selectAllObservationsByEntityId.all(ENTITY_ID) as Array<{
        id: string;
        valid_from: string;
        valid_until: string | null;
      }>;
      const obsA = rows.find(r => r.id === OBS_A_ID)!;
      const obsB = rows.find(r => r.id === OBS_B_ID)!;
      expect(obsA.valid_from).toBe(OBS_A_VALID_FROM);
      expect(obsA.valid_until).toBe(OBS_A_VALID_UNTIL);
      expect(obsB.valid_from).toBe(OBS_B_VALID_FROM);
      expect(obsB.valid_until).toBeNull();
    });
  });

  // ── queryEntities temporal mode tests ─────────────────────────────────────

  describe('queryEntities — default (no temporal params)', () => {
    it('returns entity with only current observation (obs B)', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results).toHaveLength(1);
      const obs = parsed.results[0].observations;
      expect(obs).toHaveLength(1);
      expect(obs[0].content).toBe(OBS_B_CONTENT);
    });

    it('does not include temporal fields in default mode output', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      const obs = parsed.results[0].observations[0];
      expect(obs.valid_from).toBeUndefined();
      expect(obs.valid_until).toBeUndefined();
    });
  });

  describe('queryEntities — history=true', () => {
    it('returns both observations (retired + current)', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME, history: true }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      const obs = parsed.results[0].observations as Array<{ content: string }>;
      expect(obs).toHaveLength(2);
      const contents = obs.map(o => o.content);
      expect(contents).toContain(OBS_A_CONTENT);
      expect(contents).toContain(OBS_B_CONTENT);
    });

    it('includes valid_from and valid_until fields in history output', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME, history: true }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      const obs = parsed.results[0].observations as Array<{
        content: string;
        valid_from: string;
        valid_until: string | null;
      }>;
      const obsA = obs.find(o => o.content === OBS_A_CONTENT)!;
      const obsB = obs.find(o => o.content === OBS_B_CONTENT)!;
      expect(obsA.valid_until).toBe(OBS_A_VALID_UNTIL);
      expect(obsB.valid_until).toBeNull();
      expect(obsB.valid_from).toBe(OBS_B_VALID_FROM);
    });
  });

  describe('queryEntities — as_of point-in-time', () => {
    it('returns only obs A when queried at a time when obs A was valid', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME, as_of: AS_OF_DURING_A }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      const obs = parsed.results[0].observations as Array<{ content: string }>;
      expect(obs).toHaveLength(1);
      expect(obs[0].content).toBe(OBS_A_CONTENT);
    });

    it('returns only obs B when queried at a time when obs B is valid', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME, as_of: AS_OF_DURING_B }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      const obs = parsed.results[0].observations as Array<{ content: string }>;
      expect(obs).toHaveLength(1);
      expect(obs[0].content).toBe(OBS_B_CONTENT);
    });

    it('includes temporal fields when as_of is specified', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME, as_of: AS_OF_DURING_A }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      const obs = parsed.results[0].observations[0];
      expect(obs.valid_from).toBeDefined();
      expect(obs.valid_until).toBeDefined();
    });

    it('returns no observations when queried before obs A was created', () => {
      const result = queryEntities(db, { entity_name: ENTITY_NAME, as_of: '2025-01-01T00:00:00.000Z' }, stmts);
      const parsed = JSON.parse(result.content[0].text);
      const obs = parsed.results[0].observations as Array<unknown>;
      expect(obs).toHaveLength(0);
    });
  });

  // ── FTS temporal filtering tests ───────────────────────────────────────────

  describe('ftsSearchObservations (current-only via prepared statement)', () => {
    it('excludes retired observations from FTS results', () => {
      // Search for obs A content — it's retired, should not appear in FTS prepared stmt results
      const ftsQuery = '"TypeScript is slow"';
      const rows = stmts.ftsSearchObservations.all(ftsQuery, 10) as Array<{
        observation_id: string;
        content: string;
      }>;
      const ids = rows.map(r => r.observation_id);
      expect(ids).not.toContain(OBS_A_ID);
    });

    it('returns current observations from FTS results', () => {
      const ftsQuery = '"TypeScript is fast"';
      const rows = stmts.ftsSearchObservations.all(ftsQuery, 10) as Array<{
        observation_id: string;
        content: string;
      }>;
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].observation_id).toBe(OBS_B_ID);
    });
  });
});
