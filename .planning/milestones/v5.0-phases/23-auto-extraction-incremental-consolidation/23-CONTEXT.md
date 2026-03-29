# Phase 23: Auto-Extraction + Incremental Consolidation - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Every `log_episode` call passively captures entities and relationships from the conversation context via LLM extraction without blocking the response, and high-confidence episodes trigger a micro-consolidation immediately rather than waiting for the nightly 2am cycle.

Requirements: EXTRACT-01, EXTRACT-02, EXTRACT-03, CONSOL-01, CONSOL-02, CONSOL-03

</domain>

<decisions>
## Implementation Decisions

### Auto-Extraction Pipeline
- LLM: Ollama with existing model via Vercel AI SDK (`generateObject` for structured output)
- Extraction prompt: Structured output schema defining entities (name, type), observations (content), and relationships (from, to, type)
- Fire-and-forget: `setImmediate(() => extract(...))` — non-blocking, runs after MCP tool response returns
- Extracts: Entity names, types, observations, and relationships from episode content

### Incremental Consolidation
- Trigger: Every `log_episode` triggers extraction → extracted items go to approval queue (no confidence threshold)
- Lock: `consolidation_lock` table row with `locked_at` timestamp + 5-minute expiry — atomic check-and-lock via SQL
- Micro-consolidation: Extract entities/relationships → route ALL to approval queue with `source_type: 'auto_extracted'`. No inference or contradiction detection
- Nightly-only operations: Relationship inference across episodes, contradiction detection, stale entity cleanup — deeper analysis that micro skips

### Claude's Discretion
- Extraction prompt wording and schema structure
- Error handling for Ollama unavailability (graceful degradation)
- Lock table migration details
- Consolidation log format and storage
- Test mocking strategy for LLM calls

### Prior Decisions (Locked)
- All auto-extracted entities unconditionally route to approval queue — no auto-approve threshold (STATE.md)
- Consolidation lock must be fully specified before implementation (STATE.md blocker)
- Vercel AI SDK with @ai-sdk/ollama provider for LLM calls (CLAUDE.md)
- node-cron for nightly scheduling (CLAUDE.md)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp-server/src/consolidator.ts` — existing nightly consolidation logic
- `packages/mcp-server/src/tools.ts` — log_episode handler
- `packages/core/src/statements.ts` — approval queue insert statements
- Approval queue infrastructure from Phase 3

### Established Patterns
- Approval queue items with `source_type` field
- Episode logging with structured metadata
- Ollama embedding calls (existing pattern in tools.ts)

### Integration Points
- `log_episode` tool handler — add extraction trigger after response
- Consolidation pipeline — split into micro (incremental) and full (nightly)
- Approval queue — receives auto-extracted items
- Lock table — new migration needed

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
