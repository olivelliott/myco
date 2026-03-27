---
phase: 19
plan: 02
subsystem: mcp-server
tags: [entity-merge, soft-delete, dedup, knowledge-graph]
dependency_graph:
  requires: [19-01]
  provides: [reversible-entity-merge, merge-history-preservation]
  affects: [packages/mcp-server/src/tools.ts]
tech_stack:
  added: []
  patterns: [soft-delete via merged_into column, db.transaction() for atomic merge, default WHERE filter for merged entities]
key_files:
  created: []
  modified:
    - packages/mcp-server/src/tools.ts
decisions:
  - "Soft-delete merge: secondary entity stays in DB with merged_into = primary.id rather than hard-deleted"
  - "Observations NOT reassigned during merge — they stay on source entity for historical queryability"
  - "Merged entities excluded from queryEntities results via default condition e.merged_into IS NULL"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-27"
  tasks_completed: 1
  files_modified: 1
---

# Phase 19 Plan 02: Soft-Delete Entity Merge Summary

**One-liner:** Replaced hard-delete entity merge with soft-delete using merged_into column, preserving source entity and its observation history.

## What Was Built

Updated the `resolve_approval` merge block in `packages/mcp-server/src/tools.ts` to use a soft-delete pattern:

1. **Removed** `stmts.updateObservationEntityId.run(primaryEntity.id, secondaryId)` — observations now stay on the source entity, preserving historical chains
2. **Removed** `stmts.deleteEntityById.run(secondaryId)` — secondary entity is no longer hard-deleted
3. **Added** `UPDATE entities SET merged_into = ? WHERE id = ?` — marks secondary as merged into primary (soft-delete)
4. **Wrapped** merge operations in `db.transaction()` — all relationship re-pointing and the soft-delete happen atomically
5. **Added** `'e.merged_into IS NULL'` as the default condition in `queryEntities` — merged entities are excluded from normal entity queries but remain in the DB

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace hard-delete merge with soft-delete via merged_into | c4c6e87 | packages/mcp-server/src/tools.ts |

## Verification Results

- `npx vitest run` — 122 tests passing (8 test files)
- `deleteEntityById` no longer appears in merge block (only in `forgetEntity`)
- `updateObservationEntityId` no longer appears in merge block
- `merged_into` present in both merge block and `queryEntities` default conditions

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- File modified: `packages/mcp-server/src/tools.ts` — FOUND
- Commit c4c6e87 — FOUND (verified via git log)
- All 122 tests pass
