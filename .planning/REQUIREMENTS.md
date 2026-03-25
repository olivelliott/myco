# Requirements: Myco

**Defined:** 2026-03-25
**Core Value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## v3.0 Requirements

Requirements for performance & architecture optimization. Each maps to roadmap phases.

### Embedding Performance

- [x] **EMBED-01**: Ollama client is a singleton reused across all embedding calls
- [x] **EMBED-02**: Failed Ollama connections trigger 30s cooldown before retrying
- [x] **EMBED-03**: Batch embedding uses Ollama's string[] input for multiple texts in one call
- [x] **EMBED-04**: reEmbedPending processes all pending observations in a single batch call

### Configuration

- [x] **CONFIG-01**: Server loads .env file at startup via dotenv before reading any env vars
- [x] **CONFIG-02**: Resolved configuration is logged to stderr at startup
- [x] **CONFIG-03**: .env.example documents all supported environment variables

### Query Filtering

- [x] **QUERY-01**: recall tool accepts optional entity_type filter parameter
- [x] **QUERY-02**: recall tool accepts optional min_confidence filter parameter
- [x] **QUERY-03**: recall tool accepts optional project filter parameter
- [x] **QUERY-04**: All query filters use parameterized SQL (no string interpolation)

### Prepared Statements

- [x] **STMT-01**: All hot-path SQL queries use prepared statements created once at startup
- [x] **STMT-02**: No db.prepare() calls exist inside request/tool handler functions

### Namespace Isolation

- [ ] **NS-01**: Entities table has a project column with DEFAULT 'default'
- [ ] **NS-02**: remember tool accepts optional project parameter
- [ ] **NS-03**: recall/query tools scope results by project when specified
- [ ] **NS-04**: Existing data remains accessible when no project filter is specified

### Error Handling

- [x] **ERR-01**: API routes validate input with Zod schemas
- [x] **ERR-02**: API routes return structured error responses with status codes
- [x] **ERR-03**: MCP tool errors follow consistent format

## Validated (Prior Milestones)

- [x] **REN-01** through **REN-06**: Package rename to @myco/* — *v2.0*
- [x] **OSS-01** through **OSS-05**: Open source packaging — *v2.0*
- [x] **DEBT-01** through **DEBT-03**: Tech debt cleanup — *v2.0*

## Future Requirements

Deferred to v3.1+. Tracked but not in current roadmap.

### Agent Intelligence
- **AGENT-01**: Agents query the brain at session start for project context
- **AGENT-02**: Contextual recall factors in current project and recent topics
- **AGENT-03**: Confidence decay on old observations unless reinforced

### Distribution
- **DIST-01**: npm publishable packages
- **DIST-02**: PWA build + deploy as installable app
- **DIST-03**: Backup/export knowledge graph as JSON/Markdown

### Cross-Project
- **CROSS-01**: Global GSD hooks auto-log episodes from all projects
- **CROSS-02**: Relationship inference between entities

## Out of Scope

| Feature | Reason |
|---------|--------|
| Generic filter DSL ($gt/$lt/$and/$or) | LLMs can't reliably construct operator queries — use typed params instead |
| Separate DB files per project | Maintenance nightmare — logical partition via column is sufficient |
| Config file (YAML/JSON) | Env vars + dotenv sufficient for single-user local server |
| Connection pooling | better-sqlite3 is synchronous, single connection is correct |
| Logging library (pino/winston) | console.error to stderr is the MCP convention |
| Dashboard changes | v3.0 is backend optimization only — dashboard consumes API unchanged |
| Cloud storage or external APIs | Core constraint — everything local |
| Multi-user / team features | Single user, single machine |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONFIG-01 | Phase 9 | Complete |
| CONFIG-02 | Phase 9 | Complete |
| CONFIG-03 | Phase 9 | Complete |
| EMBED-01 | Phase 9 | Complete |
| EMBED-02 | Phase 9 | Complete |
| EMBED-03 | Phase 9 | Complete |
| EMBED-04 | Phase 9 | Complete |
| STMT-01 | Phase 10 | Complete |
| STMT-02 | Phase 10 | Complete |
| QUERY-01 | Phase 11 | Complete |
| QUERY-02 | Phase 11 | Complete |
| QUERY-03 | Phase 11 | Complete |
| QUERY-04 | Phase 11 | Complete |
| ERR-01 | Phase 11 | Complete |
| ERR-02 | Phase 11 | Complete |
| ERR-03 | Phase 11 | Complete |
| NS-01 | Phase 12 | Pending |
| NS-02 | Phase 12 | Pending |
| NS-03 | Phase 12 | Pending |
| NS-04 | Phase 12 | Pending |

**Coverage:**
- v3.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 — traceability mapped to Phases 9-12*
