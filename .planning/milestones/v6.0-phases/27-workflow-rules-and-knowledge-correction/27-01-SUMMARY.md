---
phase: 27-workflow-rules-and-knowledge-correction
plan: "01"
subsystem: mcp-server/tools
tags: [mcp-tools, workflow-rules, knowledge-correction, temporal-observations]
dependency_graph:
  requires: []
  provides: [remember_rule-tool, update_knowledge-tool]
  affects: [session-start-hook, knowledge-graph-observations]
tech_stack:
  added: []
  patterns: [two-phase-search-confirm, atomic-retire-insert, decay-exempt-entities, sha256-entity-naming]
key_files:
  created: []
  modified:
    - packages/mcp-server/src/tools.ts
decisions:
  - "Entity name for workflow rules uses rule:{sha256-8} — stable, collision-resistant, auto-generated"
  - "decay_exempt set via direct SQL UPDATE after rememberEntity() call — rememberEntity does not expose that parameter"
  - "Triggers stored inline in observation content as [triggers: ...] rather than metadata JSON (simpler, FTS-searchable)"
  - "updateKnowledge Phase 2 runs retire+insert+FTS in a single db.transaction(), embedding attempted after (async constraint)"
  - "No candidates found returns action:no_matches rather than error — correct behavior, not an error state"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-29T15:37:42Z"
  tasks_completed: 2
  files_modified: 1
---

# Phase 27 Plan 01: Workflow Rules and Knowledge Correction Summary

Two new MCP tools added: `remember_rule` for storing decay-exempt workflow instructions as `workflow_rule` entities, and `update_knowledge` for two-phase search-then-confirm correction of stale observations using temporal retirement.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Add remember_rule tool | aee22a5 | packages/mcp-server/src/tools.ts |
| 2 | Add update_knowledge tool | 06635ce | packages/mcp-server/src/tools.ts |

## What Was Built

### rememberRule() + remember_rule MCP tool

- Exported `rememberRule()` function: thin wrapper over `rememberEntity()` with `entity_type='workflow_rule'`, `confidence=1.0`, `source_type='agent_session'`
- Entity name auto-generated: `rule:{sha256-8chars-of-instruction}` — stable across re-calls with same instruction
- `decay_exempt=1` set via direct SQL UPDATE after `rememberEntity()` (that function has no decay_exempt param)
- Triggers appended to observation content: `\n[triggers: git commit, git push]`
- MCP tool registered with `instruction`, `project?`, `triggers?` schema
- Phase 25 session-start hook already queries `type='workflow_rule'` — no hook changes needed

### updateKnowledge() + update_knowledge MCP tool

- Two-phase operation controlled by presence of `confirm_id`:
  - **Phase 1 (search)**: Returns top-3 candidate active observations using KNN (sqlite-vec) with FTS5 fallback. `entity_name` param narrows to that entity only. Returns `{action:"confirm", candidates:[...], instructions:"..."}`.
  - **Phase 2 (confirm)**: Looks up observation by `confirm_id`, atomically retires old (sets `valid_until`) and inserts replacement (`valid_from=now`, new nanoid). Embedding attempted post-transaction (async cannot run inside `db.transaction()`); flagged `needs_embedding` if Ollama unavailable.
- Retired observations already excluded from `recall` via existing `valid_until IS NULL` filter
- Returns `{action:"no_matches"}` when no candidates found (not an error)
- MCP tool registered with `query`, `new_value`, `entity_name?`, `confirm_id?` schema

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both tools are fully wired to live DB operations.

## Self-Check: PASSED

- `packages/mcp-server/src/tools.ts` — modified: FOUND
- Commit aee22a5 — FOUND (`git log --oneline | grep aee22a5`)
- Commit 06635ce — FOUND (`git log --oneline | grep 06635ce`)
- `npx tsc --noEmit -p packages/mcp-server/tsconfig.json` — PASS (no errors)
- `grep -c "server.registerTool" packages/mcp-server/src/tools.ts` — returns 11 (9 + 2 new)
