import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { ApprovalQueueItem, ExtractedFact, MycoStatements } from '@myco/core';
import { validationErrorHook } from '../validation.js';

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

export function approvalsRoutes(db: Database.Database, stmts: MycoStatements): Hono {
  const app = new Hono();

  // GET / — list pending approvals
  app.get('/', (c) => {
    const rows = stmts.selectAllPendingApprovals.all() as ApprovalQueueItem[];

    const items = rows.map((item) => ({
      ...item,
      metadata: item.metadata ? JSON.parse(item.metadata as string) : null,
    }));

    return c.json({ items });
  });

  // PATCH /:id — resolve an approval item
  app.patch('/:id', zValidator('json', resolveSchema, validationErrorHook), (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');

    const item = stmts.selectApprovalById.get(id) as ApprovalRow | undefined;

    if (!item) {
      return c.json({ error: { message: 'Approval item not found', code: 'NOT_FOUND', status: 404 } }, 404);
    }

    if (item.status !== 'pending') {
      return c.json({ error: { message: 'Item already resolved', code: 'CONFLICT', status: 409 } }, 409);
    }

    const now = new Date().toISOString();

    // Reject path
    if (data.status === 'rejected') {
      stmts.updateApprovalStatus.run('rejected', now, id);
      return c.json({ status: 'rejected', id });
    }

    // Approve path
    if (!item.metadata) {
      return c.json({ error: { message: 'Item has no metadata — cannot determine what to approve', code: 'UNPROCESSABLE', status: 422 } }, 422);
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
        const primaryEntity = stmts.selectEntityByNameType.get(meta.fact.entity_name, meta.fact.entity_type) as { id: string } | undefined;

        if (primaryEntity) {
          for (const secondaryId of meta.merge_candidate_ids) {
            stmts.updateObservationEntityId.run(primaryEntity.id, secondaryId);
            stmts.updateRelationshipFromId.run(primaryEntity.id, secondaryId);
            stmts.updateRelationshipToId.run(primaryEntity.id, secondaryId);
            stmts.deleteEntityById.run(secondaryId);
          }
        }
      }

      // Upsert primary entity
      const existingEntity = stmts.selectEntityByNameType.get(meta.fact.entity_name, meta.fact.entity_type) as { id: string } | undefined;

      let entityId: string;
      if (existingEntity) {
        entityId = existingEntity.id;
        stmts.updateEntityTimestampConfidence.run(now, meta.fact.confidence, entityId);
      } else {
        entityId = nanoid();
        stmts.insertEntity.run(entityId, meta.fact.entity_name, meta.fact.entity_type, 'api-server', 'api-server', 'consolidation', meta.fact.confidence, now, now, null);
      }

      // Insert observation with needs_embedding=1 (MCP server startup sweep handles embedding)
      const obsId = nanoid();
      stmts.insertObservationWithEmbeddingFlag.run(obsId, entityId, observationText, 'api-server', 'api-server', 'consolidation', meta.fact.confidence, now, now);

      // Insert FTS index entry
      stmts.insertFtsObservation.run(observationText, obsId);

      // Handle related entities — upsert each and insert relationship
      for (const related of meta.fact.related_entities) {
        const relatedExisting = stmts.selectEntityByNameType.get(related.name, related.type) as { id: string } | undefined;

        let relatedEntityId: string;
        if (relatedExisting) {
          relatedEntityId = relatedExisting.id;
        } else {
          relatedEntityId = nanoid();
          stmts.insertEntity.run(relatedEntityId, related.name, related.type, 'api-server', 'api-server', 'consolidation', 0.5, now, now, null);
        }

        // Insert relationship (ignore duplicates via INSERT OR IGNORE in the prepared statement)
        const relId = nanoid();
        try {
          stmts.insertRelationship.run(relId, entityId, relatedEntityId, related.relation_type, 'api-server', 'api-server', 'consolidation', meta.fact.confidence, now);
        } catch {
          // Relationship may already exist — ignore duplicate key errors
        }
      }

      // Finalize approval
      stmts.updateApprovalStatus.run('approved', now, id);
    });

    approveTransaction();

    return c.json({ status: 'approved', id, entity: meta.fact.entity_name });
  });

  return app;
}
