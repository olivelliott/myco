# Phase 3: Consolidation + Approval - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

LLM-powered consolidation pipeline that processes episode logs into knowledge graph facts, with contradiction detection, entity deduplication, confidence-based auto-approval, and MCP tools for managing the approval queue. Nightly cron scheduling via croner.

</domain>

<decisions>
## Implementation Decisions

### Consolidation Pipeline
- Use Ollama via Vercel AI SDK (`ai` + `@ai-sdk/ollama` provider) for LLM fact extraction — keeps everything local, consistent with embeddings approach
- Structured JSON output via `generateObject()` — each extracted fact gets: entity name, observation content, confidence, evidence_quote, related_entities
- Process 10 episodes per LLM call in batches — balances context quality with throughput. Process all unconsolidated episodes in sequential batches
- Add `consolidated_at` column to episodes table (NULL = unconsolidated, ISO timestamp = processed) — preserves audit trail

### Contradiction Detection & Entity Merging
- Detect contradictions via semantic similarity search against existing observations for the same entity — if new fact has high similarity but opposing content, flag as contradiction. Use vector distance threshold (< 0.3 = potential conflict)
- Identify entity merge candidates via name similarity (Levenshtein distance <= 2 OR same name different case) plus vector similarity of entity observations. Surface as merge candidate in approval queue
- Auto-approve: confidence >= 0.85, no contradictions, no merge candidates. Queue: confidence < 0.85, contradictions, merge candidates, cross-session entity merges
- Approval queue items include `reason` field with tagged values: `low_confidence`, `contradiction`, `merge_candidate`, `cross_session`. Include source episode IDs and evidence quotes in metadata

### Scheduling & Approval CLI
- Use `croner` package (more actively maintained than node-cron) running in-process with the MCP server. Cron expression: `0 2 * * *` in America/New_York timezone
- Manual consolidation via new MCP tool `consolidate` — agents can trigger it, user can invoke via CLI. Returns consolidation summary (episodes processed, facts extracted, auto-approved, queued)
- Approval management via MCP tools: `list_pending_approvals` (shows queue with reason, evidence, confidence) and `resolve_approval` (action: approve/reject/edit, with optional edited content)
- Approved items: create/merge into knowledge graph with `source_type: 'consolidation'`. Rejected items: status set to `rejected`, retained for audit. Edited items: user's content replaces proposed, then approves

### Claude's Discretion
- Consolidation prompt template wording and structure
- Levenshtein distance implementation (inline vs library)
- Consolidation log format and storage
- Error handling for LLM failures during consolidation
- Batch retry strategy for failed episode batches

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `openDatabase()` in `packages/core/src/db.ts` — loads sqlite-vec, WAL mode, applies schema
- `embedText()` in `packages/mcp-server/src/embed-client.ts` — lazy Ollama singleton with 2s timeout, returns number[] | null
- `buildProvenance()` in `packages/core/src/provenance.ts` — builds provenance with source_type field (includes 'consolidation' value)
- `approval_queue` table already exists in schema with id, item_type, item_id, status, reason, created_at, resolved_at
- `vec_embeddings` table for similarity search (KNN MATCH queries proven in Phase 2)
- `registerTools()` pattern in `packages/mcp-server/src/tools.ts` for adding new MCP tools

### Established Patterns
- Synchronous better-sqlite3 for DB, async MCP tool handlers wrapping sync calls
- Module-scoped SESSION_ID for provenance
- Zod schemas for tool input validation
- NodeNext module resolution with .js extensions
- Test pattern using in-memory DB via `openDatabase(':memory:')`

### Integration Points
- `episodes` table: `consolidated_at` column migration needed (same ALTER TABLE pattern as `needs_embedding`)
- `approval_queue` table: ready to use, existing schema sufficient
- `rememberEntity()` can be called from consolidation to write approved facts
- `recallKnowledge()` internal logic can be reused for contradiction similarity search
- `index.ts` server startup: wire croner schedule alongside existing reEmbedPending()

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the technology stack defined in CLAUDE.md.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-consolidation-approval*
*Context gathered: 2026-03-21*
