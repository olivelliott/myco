# Requirements: AI Workbots Brain

**Defined:** 2026-03-20
**Core Value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## v1 Requirements

### Memory Core

- [ ] **CORE-01**: MCP server exposes `remember`, `recall`, and `query` tools to any Claude Code session
- [ ] **CORE-02**: All knowledge persists across sessions in a local SQLite database (WAL mode)
- [ ] **CORE-03**: Open-schema knowledge graph stores entities with types, observations, and inter-entity relations
- [ ] **CORE-04**: Every piece of knowledge includes provenance metadata (source session, agent ID, timestamp, confidence)
- [ ] **CORE-05**: Agents can write new entities, observations, and relations via MCP tools during a session

### Semantic Search

- [ ] **SRCH-01**: Local embeddings generated via Ollama (nomic-embed-text) for all entities and observations
- [ ] **SRCH-02**: Vector similarity search via sqlite-vec for semantic recall
- [ ] **SRCH-03**: Multi-access retrieval: exact entity lookup, tag/type filter, and semantic similarity
- [ ] **SRCH-04**: System degrades gracefully when Ollama is unavailable (writes succeed without embeddings, re-embeds on next consolidation)

### Episode Capture

- [ ] **EPSD-01**: Timestamped episode log captures session events with agent ID and context payload
- [ ] **EPSD-02**: Per-agent episode isolation — each agent session has its own episode stream
- [ ] **EPSD-03**: Episodes are the raw input for consolidation, not directly queryable by agents

### Consolidation

- [ ] **CNSLD-01**: Nightly deep sleep cycle runs at 2am EST via cron, reading episode logs and extracting facts into the knowledge graph
- [ ] **CNSLD-02**: LLM-assisted extraction requires direct evidence quotes for every extracted fact
- [ ] **CNSLD-03**: Contradiction detection identifies when new facts conflict with existing knowledge
- [ ] **CNSLD-04**: Entity deduplication merges equivalent entities discovered across sessions
- [ ] **CNSLD-05**: Manual consolidation trigger available via CLI command

### Human Approval

- [ ] **APRV-01**: Confidence scoring assigns a score to every extracted fact during consolidation
- [ ] **APRV-02**: Facts above confidence threshold (0.85+) auto-approve into the knowledge graph
- [ ] **APRV-03**: Low-confidence facts, contradictions, and entity merge candidates queue for human review
- [ ] **APRV-04**: Human can approve, reject, or edit queued items

### PWA Dashboard

- [ ] **PWA-01**: Approval queue UI displays pending items with source session, confidence score, and contradicted facts
- [ ] **PWA-02**: Approve/reject/edit actions on queued items from the PWA
- [ ] **PWA-03**: Knowledge graph explorer visualizes entities, relationships, and connections interactively
- [ ] **PWA-04**: Activity dashboard shows session timeline, episode counts, graph growth, and pending approval count
- [ ] **PWA-05**: Responsive design works equally well on phone and desktop
- [ ] **PWA-06**: PWA reads from the same SQLite database as the MCP server via a Hono REST API

### GSD Integration

- [ ] **GSD-01**: Hooks auto-capture episodes at GSD phase transitions (phase complete, milestone complete)
- [ ] **GSD-02**: Structured episode payloads include phase name, requirements covered, and outcome summary
- [ ] **GSD-03**: Hooks call existing MCP tools — no separate write path

## v2 Requirements

### Extended Features

- **EXT-01**: Push notifications for new pending approval items
- **EXT-02**: Embedding model upgrade path (mxbai-embed-large or newer models)
- **EXT-03**: One-way export to Obsidian vault (human-readable markdown mirror)
- **EXT-04**: Confidence decay — old low-confidence facts surface for re-review over time

### Scale

- **SCALE-01**: Cloud sync / multi-device access
- **SCALE-02**: Richer knowledge graph ontology (typed relation schemas, domain-specific entity types)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time consolidation (inline at write time) | Blocks write path with LLM inference; batch consolidation produces higher quality output |
| Obsidian bidirectional sync | Creates two sources of truth with sync conflicts; brain is authoritative store |
| Multi-user / team features | Single user, single machine — team knowledge requires auth, access control, governance |
| Automatic memory deletion | Irreversible data loss without user awareness; use confidence decay + approval queue instead |
| Full RAG over raw episode logs | Episodes are noisy and redundant; knowledge graph is the curated agent-facing surface |
| Real-time collaboration between concurrent sessions | Last-writer-wins with provenance tracking catches conflicts during consolidation |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | — | Pending |
| CORE-02 | — | Pending |
| CORE-03 | — | Pending |
| CORE-04 | — | Pending |
| CORE-05 | — | Pending |
| SRCH-01 | — | Pending |
| SRCH-02 | — | Pending |
| SRCH-03 | — | Pending |
| SRCH-04 | — | Pending |
| EPSD-01 | — | Pending |
| EPSD-02 | — | Pending |
| EPSD-03 | — | Pending |
| CNSLD-01 | — | Pending |
| CNSLD-02 | — | Pending |
| CNSLD-03 | — | Pending |
| CNSLD-04 | — | Pending |
| CNSLD-05 | — | Pending |
| APRV-01 | — | Pending |
| APRV-02 | — | Pending |
| APRV-03 | — | Pending |
| APRV-04 | — | Pending |
| PWA-01 | — | Pending |
| PWA-02 | — | Pending |
| PWA-03 | — | Pending |
| PWA-04 | — | Pending |
| PWA-05 | — | Pending |
| PWA-06 | — | Pending |
| GSD-01 | — | Pending |
| GSD-02 | — | Pending |
| GSD-03 | — | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 0
- Unmapped: 30

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
