import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { ApprovalQueueItem, ExtractedFact } from '@myco/core';

const resolveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  edited_content: z.string().optional(),
});

interface ApprovalRow {
  id: string;
  item_type: string;
  metadata: string | null;
  status: string;
}

export function approvalsRoutes(db: Database.Database): Hono {
  const app = new Hono();

  // GET / — list pending approvals
  app.get('/', (c) => {
    const rows = db.prepare(
      "SELECT * FROM approval_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50"
    ).all() as ApprovalQueueItem[];

    const items = rows.map((item) => ({
      ...item,
      metadata: item.metadata ? JSON.parse(item.metadata as string) : null,
    }));

    return c.json({ items });
  });

  // PATCH /:id — resolve an approval item
  app.patch('/:id', zValidator('json', resolveSchema), (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');

    const item = db.prepare(
      'SELECT id, item_type, metadata, status FROM approval_queue WHERE id = ?'
    ).get(id) as ApprovalRow | undefined;

    if (!item) {
      return c.json({ error: 'Approval item not found' }, 404);
    }

    if (item.status !== 'pending') {
      return c.json({ error: 'Item already resolved' }, 409);
    }

    const now = new Date().toISOString();

    // Reject path
    if (data.status === 'rejected') {
      db.prepare(
        'UPDATE approval_queue SET status = ?, resolved_at = ? WHERE id = ?'
      ).run('rejected', now, id);
      return c.json({ status: 'rejected', id });
    }

    // Approve path
    if (!item.metadata) {
      return c.json({ error: 'Item has no metadata — cannot determine what to approve' }, 422);
    }

    const meta = JSON.parse(item.metadata) as {
      fact: ExtractedFact;
      merge_candidate_ids?: string[];
    };

    const observationText = data.edited_content ?? meta.fact.observation;

    // Execute the entire approve path in a transaction for atomicity
    const approveTransaction = db.transaction(() => {
      // Handle merge candidates: reassign observations + relationships, delete secondary entities
      if (meta.merge_candidate_ids && meta.merge_candidate_ids.length > 0) {
        const primaryEntity = db.prepare(
          'SELECT id FROM entities WHERE name = ? AND type = ?'
        ).get(meta.fact.entity_name, meta.fact.entity_type) as { id: string } | undefined;

        if (primaryEntity) {
          for (const secondaryId of meta.merge_candidate_ids) {
            db.prepare('UPDATE observations SET entity_id = ? WHERE entity_id = ?').run(primaryEntity.id, secondaryId);
            db.prepare('UPDATE relationships SET from_id = ? WHERE from_id = ?').run(primaryEntity.id, secondaryId);
            db.prepare('UPDATE relationships SET to_id = ? WHERE to_id = ?').run(primaryEntity.id, secondaryId);
            db.prepare('DELETE FROM entities WHERE id = ?').run(secondaryId);
          }
        }
      }

      // Upsert primary entity
      const existingEntity = db.prepare(
        'SELECT id FROM entities WHERE name = ? AND type = ?'
      ).get(meta.fact.entity_name, meta.fact.entity_type) as { id: string } | undefined;

      let entityId: string;
      if (existingEntity) {
        entityId = existingEntity.id;
        db.prepare(
          'UPDATE entities SET updated_at = ?, confidence = MAX(confidence, ?) WHERE id = ?'
        ).run(now, meta.fact.confidence, entityId);
      } else {
        entityId = nanoid();
        db.prepare(
          `INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
           VALUES (?, ?, ?, NULL, '{}', 'api-server', 'api-server', 'consolidation', ?, ?, ?)`
        ).run(entityId, meta.fact.entity_name, meta.fact.entity_type, meta.fact.confidence, now, now);
      }

      // Insert observation with needs_embedding=1 (MCP server startup sweep handles embedding)
      const obsId = nanoid();
      db.prepare(
        `INSERT INTO observations (id, entity_id, content, metadata, session_id, agent_id, source_type, confidence, created_at, needs_embedding)
         VALUES (?, ?, ?, '{}', 'api-server', 'api-server', 'consolidation', ?, ?, 1)`
      ).run(obsId, entityId, observationText, meta.fact.confidence, now);

      // Insert FTS index entry
      db.prepare(
        'INSERT INTO fts_observations (content, observation_id) VALUES (?, ?)'
      ).run(observationText, obsId);

      // Handle related entities — upsert each and insert relationship
      for (const related of meta.fact.related_entities) {
        const relatedExisting = db.prepare(
          'SELECT id FROM entities WHERE name = ? AND type = ?'
        ).get(related.name, related.type) as { id: string } | undefined;

        let relatedEntityId: string;
        if (relatedExisting) {
          relatedEntityId = relatedExisting.id;
        } else {
          relatedEntityId = nanoid();
          db.prepare(
            `INSERT INTO entities (id, name, type, summary, metadata, session_id, agent_id, source_type, confidence, created_at, updated_at)
             VALUES (?, ?, ?, NULL, '{}', 'api-server', 'api-server', 'consolidation', 0.5, ?, ?)`
          ).run(relatedEntityId, related.name, related.type, now, now);
        }

        // Insert relationship (ignore duplicates)
        const relId = nanoid();
        try {
          db.prepare(
            `INSERT INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
             VALUES (?, ?, ?, ?, '{}', 'api-server', 'api-server', 'consolidation', ?, ?)`
          ).run(relId, entityId, relatedEntityId, related.relation_type, meta.fact.confidence, now);
        } catch {
          // Relationship may already exist — ignore duplicate key errors
        }
      }

      // Finalize approval
      db.prepare(
        'UPDATE approval_queue SET status = ?, resolved_at = ? WHERE id = ?'
      ).run('approved', now, id);
    });

    approveTransaction();

    return c.json({ status: 'approved', id, entity: meta.fact.entity_name });
  });

  return app;
}
