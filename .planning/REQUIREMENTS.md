# Requirements: Myco v5.0

**Defined:** 2026-03-27
**Core Value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## v5.0 Requirements

Requirements for Feature Parity & Differentiation milestone. Each maps to roadmap phases.

### Schema & Infrastructure

- [x] **INFRA-01**: System uses a versioned schema migration framework instead of try/catch ALTER TABLE pattern
- [x] **INFRA-02**: Existing databases upgrade cleanly on startup with no data loss

### Temporal Versioning

- [x] **TEMP-01**: Observations track `valid_from` and `valid_until` timestamps for fact versioning
- [x] **TEMP-02**: User can query "what was true at time X" via the recall/query tools with a timestamp parameter
- [x] **TEMP-03**: Superseded observations are soft-retired (valid_until set) rather than deleted

### Conflict Resolution & Dedup

- [x] **DEDUP-01**: When a new memory conflicts with an existing observation, the system classifies it as ADD/UPDATE/NOOP
- [x] **DEDUP-02**: UPDATE actions retire the old observation (temporal) and insert the new version
- [x] **DEDUP-03**: Entity merges use soft-delete (`merged_into` column) so merges are reversible
- [x] **DEDUP-04**: Near-duplicate observations are detected and deduplicated at write time

### Incremental Consolidation

- [ ] **CONSOL-01**: Episodes are consolidated on-the-fly after `log_episode`, not just at the nightly 2am cycle
- [ ] **CONSOL-02**: A consolidation lock prevents race conditions between incremental and nightly consolidation
- [ ] **CONSOL-03**: Nightly cycle performs deeper analysis (relationship inference, contradiction detection) beyond incremental

### Auto-Entity Extraction

- [ ] **EXTRACT-01**: The system passively extracts entities and relationships from conversation context via LLM
- [ ] **EXTRACT-02**: Extraction runs asynchronously (fire-and-forget) and never blocks the MCP tool response
- [ ] **EXTRACT-03**: All auto-extracted items route through the approval queue before becoming permanent knowledge

### Import/Export

- [ ] **IO-01**: User can export the entire knowledge graph as a JSON file via MCP tool
- [ ] **IO-02**: User can import knowledge from a JSON file via MCP tool
- [ ] **IO-03**: Export → import round-trip is idempotent (no data loss or duplication)
- [ ] **IO-04**: Import supports adapters for common formats (Mem0, MCP reference server JSONL)

### REST API

- [ ] **API-01**: Memory write operations (remember, forget, import, export) are accessible via HTTP endpoints
- [ ] **API-02**: REST API includes OpenAPI/Swagger documentation
- [ ] **API-03**: Optional API key authentication protects write endpoints

### Memory Decay

- [x] **DECAY-01**: Observation importance score decays over time based on age and reinforcement frequency
- [x] **DECAY-02**: Decay is computed lazily at read time (not stored, no write-path overhead)
- [ ] **DECAY-03**: Recall results factor in importance decay when ranking

### Relationship Strength

- [x] **STRENGTH-01**: Relationships have a strength score that increases when reinforced by multiple remember calls
- [x] **STRENGTH-02**: Strength scoring uses an upsert pattern (ON CONFLICT DO UPDATE) on the existing relationships table
- [x] **STRENGTH-03**: Relationship strength is visible in query results and the dashboard graph

## Future Requirements

- [ ] **CODIFY-01**: `codify` MCP tool turns project structure and conventions into graph knowledge via TypeScript Compiler API — *deferred to v5.1*
- [ ] **CODIFY-02**: Codebase ingestion supports incremental re-ingestion (diff from previous run) — *deferred to v5.1*

## Out of Scope

- Cloud storage or external APIs — everything runs locally
- Multi-user / team features — single user, single machine
- Real-time collaboration between concurrent agent sessions
- Tree-sitter for AST parsing — TypeScript Compiler API chosen instead (research: tree-sitter npm has v0.25/v0.26 gap, requires Node 24)
- NLP libraries for entity extraction — LLM via Ollama chosen instead (research: NLP libraries fail on technical domain entities)

## Traceability

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| INFRA-01 | Phase 18 | TBD | Pending |
| INFRA-02 | Phase 18 | TBD | Pending |
| TEMP-01 | Phase 19 | TBD | Pending |
| TEMP-02 | Phase 19 | 19-03 | Complete |
| TEMP-03 | Phase 19 | TBD | Pending |
| DEDUP-01 | Phase 19 | TBD | Pending |
| DEDUP-02 | Phase 19 | TBD | Pending |
| DEDUP-03 | Phase 19 | TBD | Pending |
| DEDUP-04 | Phase 19 | TBD | Pending |
| STRENGTH-01 | Phase 20 | TBD | Pending |
| STRENGTH-02 | Phase 20 | TBD | Pending |
| STRENGTH-03 | Phase 20 | TBD | Pending |
| DECAY-01 | Phase 21 | TBD | Pending |
| DECAY-02 | Phase 21 | TBD | Pending |
| DECAY-03 | Phase 21 | TBD | Pending |
| API-01 | Phase 22 | TBD | Pending |
| API-02 | Phase 22 | TBD | Pending |
| API-03 | Phase 22 | TBD | Pending |
| IO-01 | Phase 22 | TBD | Pending |
| IO-02 | Phase 22 | TBD | Pending |
| IO-03 | Phase 22 | TBD | Pending |
| IO-04 | Phase 22 | TBD | Pending |
| EXTRACT-01 | Phase 23 | TBD | Pending |
| EXTRACT-02 | Phase 23 | TBD | Pending |
| EXTRACT-03 | Phase 23 | TBD | Pending |
| CONSOL-01 | Phase 23 | TBD | Pending |
| CONSOL-02 | Phase 23 | TBD | Pending |
| CONSOL-03 | Phase 23 | TBD | Pending |
