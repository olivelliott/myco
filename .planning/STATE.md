---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: Proactive Knowledge & Onboarding
status: v6.0 milestone complete
stopped_at: Completed 28-02-PLAN.md — source attribution in session-start preference injection
last_updated: "2026-03-29T17:12:11.127Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 20
  completed_plans: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.
**Current focus:** Merge complete — v5.0 + v6.0 consolidated

## Current Position

Phase: 28
Plan: Not started

## Performance Metrics

**Velocity:**

- Total plans completed: 20 (v5.0 + v6.0)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*
| Phase 18 P01 | 3 | 2 tasks | 6 files |
| Phase 19-temporal-versioning-dedup-resolution P01 | 215 | 2 tasks | 6 files |
| Phase 19 P02 | 4 | 1 tasks | 1 files |
| Phase 19 P03 | 7 | 2 tasks | 3 files |
| Phase 20-relationship-strength-scoring P01 | 8 | 2 tasks | 4 files |
| Phase 21-memory-importance-decay P01 | 2 | 2 tasks | 3 files |
| Phase 21-memory-importance-decay P02 | 3 | 2 tasks | 2 files |
| Phase 22-core-refactor-rest-write-routes-import-export P01 | 15 | 2 tasks | 14 files |
| Phase 22-core-refactor-rest-write-routes-import-export P02 | 525609 | 1 tasks | 5 files |
| Phase 22-core-refactor-rest-write-routes-import-export P03 | 4 | 2 tasks | 6 files |
| Phase 23-auto-extraction-incremental-consolidation P01 | 98 | 2 tasks | 3 files |
| Phase 23-auto-extraction-incremental-consolidation P02 | 144 | 2 tasks | 4 files |
| Phase 24 P01 | 2 | 2 tasks | 6 files |
| Phase 25-session-start-recall P01 | 250s | 1 tasks | 3 files |
| Phase 26-project-onboarding P01 | 325 | 2 tasks | 2 files |
| Phase 26-project-onboarding P02 | 300 | 2 tasks | 2 files |
| Phase 27-workflow-rules-and-knowledge-correction P01 | 480 | 2 tasks | 1 files |
| Phase 27-workflow-rules-and-knowledge-correction P02 | 480 | 2 tasks | 3 files |
| Phase 28-user-preferences P01 | 344 | 1 tasks | 4 files |
| Phase 28-user-preferences P02 | 124 | 1 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v5.0 research]: Vercel AI SDK locked at v4.3.19 — do NOT upgrade in v5.0 (ollama-ai-provider incompatibility)
- [v5.0 research]: All auto-extracted entities unconditionally route to approval queue — no auto-approve threshold applies
- [v5.0 research]: Relationship strength updated only on `remember` (not `recall`) to avoid write amplification
- [v5.0 research]: `computeEffectiveConfidence` is a pure function at read time — no write-back to DB
- [v5.0 research]: Phase 18 must land before any other v5.0 phase — migration framework prerequisite
- [Phase 18]: columnExists() guards in migrations 002-005 handle v4.0 databases that already have those columns — avoids duplicate column errors without try/catch
- [Phase 18]: Per-migration db.transaction() wrappers isolate failures; a partial failure rolls back only that migration, not prior work
- [Phase 18]: NOT NULL columns with DB defaults typed as required number in TypeScript; nullable columns typed as optional string | null
- [Phase 19-temporal-versioning-dedup-resolution]: Embedding fetched before classifyObservation — KNN near-dup check needs embedding upfront
- [Phase 19-temporal-versioning-dedup-resolution]: UPDATE transaction wraps retire+FTS insert only — vec embedding insert outside transaction
- [Phase 19-temporal-versioning-dedup-resolution]: valid_from = now matches created_at on new observations — same timestamp at insert time
- [Phase 19-02]: Soft-delete merge: secondary entity stays in DB with merged_into = primary.id rather than hard-deleted
- [Phase 19-02]: Observations NOT reassigned during merge — they stay on source entity for historical queryability
- [Phase 19-02]: Merged entities excluded from queryEntities results via default condition e.merged_into IS NULL
- [Phase 19-03]: valid_until IS NULL added to JOIN clause (not WHERE) on knnSearchObservations and ftsSearchObservations — filters at join time
- [Phase 19-03]: useDefaultTemporalOnly guard preserves fast path; any additional filter forces dynamic WHERE
- [Phase 19-03]: history output includes valid_from/valid_until fields; default output omits them for backward compatibility
- [Phase 19-03]: as_of queryEntities uses inline db.prepare() (STMT-02 exception) — runtime SQL construction required
- [Phase 20]: ON CONFLICT targets (from_id, to_id, type) matching migration 001_baseline UNIQUE constraint — no new constraint needed for strength upsert
- [Phase 20]: strengthWidth replaces confidence-based formula — edge visual weight reflects reinforcement frequency, not semantic confidence
- [Phase 21]: computeEffectiveConfidence is pure (no DB handle) — DECAY-02 design confirmed
- [Phase 21]: null lastAccessedAt defaults to 30 days — conservative decay for never-accessed observations
- [Phase 21]: DECAY-03: recall results re-sorted by final_score (similarity * effective_confidence) not raw relevance_score
- [Phase 21]: Lazy last_accessed_at write uses dynamic IN (?) — STMT-02 exception applies since placeholder count varies with result set
- [Phase 21]: Empty result guard (scoredRows.length > 0) prevents SQL syntax error on empty IN () clause in lazy write
- [Phase 22-01]: @myco/core/embed-client subpath export required for vi.spyOn testability — memory-ops.js imports embed-client.js directly (same ESM module instance), not through barrel
- [Phase 22-01]: MCP tools.ts thin wrapper pattern: only registerTools + Zod schemas remain; all business logic imported from @myco/core
- [Phase Phase 22-02]: registerMemoryRoutes() registers on main OpenAPIHono instance (not sub-app) so routes appear in app.doc() spec
- [Phase Phase 22-02]: apiKeyAuth disabled (passthrough) when MYCO_API_KEY unset — zero-config local dev, opt-in security
- [Phase Phase 22-02]: @hono/zod-openapi handler returns cast to any — avoids fighting TypedResponse generics when JSON parsed from MCP envelope
- [Phase 22-03]: importGraph preserves original valid_from timestamps — critical for as_of temporal queries on imported data
- [Phase 22-03]: Anthropic JSONL adapter uses two-pass parsing — entities first to build name map, then relations resolved against it
- [Phase 23]: All auto-extracted facts unconditionally route to approval queue — no auto-approve threshold applies (micro-consolidation is capture-only)
- [Phase 23]: acquireLock uses INSERT OR IGNORE singleton-row mutex with 5-min stale expiry recovery; releaseLock always runs in finally block
- [Phase 23]: runMicroConsolidation: no rememberEntity, detectContradiction, or findMergeCandidates — those are nightly-only (CONSOL-03)
- [Phase 23]: setImmediate used in logEpisode (not setTimeout/nextTick) — fires after current I/O cycle, never blocks MCP response
- [Phase 23]: registerEpisodeCallback: dependency inversion — core exports slot, mcp-server fills it at startup — avoids circular import between packages
- [Phase 23]: Nightly cron skips with warning if micro holds lock (no retry) — next 2am run catches remaining episodes
- [v6.0 research]: SessionStart hook with `additionalContext` is the only correct injection mechanism — MCP Resources require explicit user invocation, not automatic
- [v6.0 research]: Hook binary must open SQLite in read-only mode, FTS5-only, complete under 500ms — never call Ollama from hook
- [v6.0 research]: Token cap is 1,500 tokens enforced at query layer (priority ordering), not end-truncation
- [v6.0 research]: Preferences start project-scoped, promote to global user entity only after 2+ project corroboration or explicit confirmation
- [v6.0 research]: `myco init` scans README, CLAUDE.md, package manifests only — no source files (anchoring bias research)
- [v6.0 research]: One new npm dependency: `ignore@5.3.x` for gitignore-aware file filtering during `myco init`
- [v6.0 research]: Novelty filter tracking needs design decision — `injection_log` table vs deferred consolidation update
- [Phase 24]: Migration framework (migrations.ts + schema_migrations table) added alongside existing try/catch ALTER TABLE pattern — new tables use migration tracking, legacy column additions keep try/catch
- [Phase 24]: selectProjectForPath uses named $path parameter with slash-boundary LIKE (directory_path || '/%') to prevent false prefix matches like /a/bx matching /a/b
- [Phase 25-session-start-recall]: hooks/package.json with type:commonjs required to fix ESM/CJS conflict from root monorepo type:module
- [Phase 25-session-start-recall]: Session-start hook opens DB readonly:true, uses file-based hash cache at ~/.local/share/myco/last-injection-hash for novelty tracking (no DB write)
- [Phase 26-project-onboarding]: source_type 'onboarding' not in SourceType union — use 'agent_session' for myco init writes as closest semantic match for human-guided initial population
- [Phase 26-project-onboarding]: myco init scanner reads README/CLAUDE.md truncated to 2000 chars, .eslintrc* (first found), package.json, tsconfig.json, git config — no source files per anchoring bias research
- [Phase 26-project-onboarding]: init_project omits relations from MCP response to keep agent output clean — agent passes relations when calling remember()
- [Phase 26-project-onboarding]: Top-level await import for onboarding-scanner in tests ensures vi.mock('ai') is applied before scanner module loads
- [Phase 27]: Entity name for workflow rules uses rule:{sha256-8} — stable, collision-resistant, auto-generated from instruction text
- [Phase 27]: updateKnowledge Phase 2 uses db.transaction() for retire+insert+FTS atomicity; embedding attempted post-transaction due to async constraint
- [Phase 27]: decay_exempt column must live on entities table (not just observations) — added migration 10
- [Phase 27]: updateKnowledge confirm phase must pass 'unknown' agent_id (NOT NULL constraint on observations)
- [Phase 28-user-preferences]: promotePreference triggers when allProjects.size >= 2 (entity.project + source_projects + incomingProject) — handles the case where selectEntityByNameType is project-agnostic so multiple projects share one entity row
- [Phase 28-user-preferences]: merged_into nullable FK on entities table added via try/catch migration (consistent with existing schema.ts migration pattern)
- [Phase 28-user-preferences]: obs_metadata in GROUP BY picks one observation's metadata per entity; acceptable because Plan 01 ensures all active observations on a promoted preference share the same source_projects value

### Pending Todos

None.

### Blockers/Concerns

- [Phase 25]: Token cap enforcement strategy — SQLite has no native "stop at N tokens"; must be enforced at app layer with priority-ordered queries; design needed in planning
- [Phase 25]: Novelty filter write strategy — hook is read-only, but tracking `last_injected_at` requires a write; decide between `injection_log` table (separate write) or deferred update
- [Phase 26]: Batch approval UX pattern — distinct from existing per-item queue; needs design decision (new dashboard route vs terminal-interactive flow)
- [Phase 26]: `myco init` idempotency — re-run must not duplicate entities; dedup classifier handles single observations but batch flow may need separate "already seen" check

## Session Continuity

Last session: 2026-03-29T17:12:11.127Z
Stopped at: Completed 28-02-PLAN.md — source attribution in session-start preference injection
Resume file: None
