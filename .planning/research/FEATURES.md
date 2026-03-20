# Feature Research

**Domain:** AI Agent Persistent Memory System (MCP Server + Knowledge Graph + PWA)
**Researched:** 2026-03-20
**Confidence:** HIGH (core MCP/memory features), MEDIUM (consolidation patterns, PWA specifics)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that an AI agent memory system must have to be credible. Missing these means the product is broken by definition.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| MCP tool surface (remember, recall, query) | Every competing system exposes an MCP API; without tools agents cannot interact with the memory system at all | MEDIUM | Official `@modelcontextprotocol/server-memory` pattern is the reference: entities, relations, observations. At minimum expose `store`, `search`, `get`, `link`, `forget`. |
| Cross-session persistence | The entire value prop is that agents don't forget between sessions; if memory is in-process and dies with the session, there is no product | LOW | SQLite handles this trivially. The hard part is schema design and migration. |
| Semantic search / vector retrieval | Every production memory system in 2026 (Mem0, Zep, Letta, SuperLocalMemory) uses embedding-based retrieval. Keyword-only search produces poor recall for agent use cases | HIGH | Ollama + nomic-embed-text is the right local approach. sqlite-vec or a brute-force cosine similarity layer over SQLite is sufficient at single-user scale. |
| Entity + relation + observation model | The standard knowledge graph primitive. Every serious MCP memory server (official Anthropic server, shaneholloman fork, mcp-memory-service) uses this model | MEDIUM | Entities have types, observations attach facts to entities, relations connect entities. Open schema means no fixed type list at the application level. |
| Episodic log (session events with timestamps) | Required to support consolidation — you cannot summarize what you haven't recorded. Also directly valuable for debugging agent behavior | LOW | A time-indexed event log is simpler than a knowledge graph; implement as a separate table. Timestamp + session ID + agent ID + event payload. |
| Write operations from agent tools | Agents must be able to write memories during a session, not just read them. Read-only memory is useless | LOW | MCP tool `remember` or `store` with a schema. Conflict detection at write time is important. |
| Basic retrieval operations (by entity name, by tag, semantic) | Users expect to retrieve memory by multiple access patterns. Semantic-only is not enough (sometimes exact lookup is needed) | LOW | Three access patterns: exact entity lookup, tag/type filter, semantic similarity. All three are standard in existing MCP servers. |
| Provenance / source tracking | Every piece of knowledge should know where it came from (which agent session, when, what confidence). Without this, the approval queue has nothing to show users | LOW | Add `source_session_id`, `created_at`, `confidence` columns to facts table. Foundational for the approval workflow. |

### Differentiators (Competitive Advantage)

Features that go beyond what existing MCP memory servers do. These are the reasons this project exists — existing solutions (official MCP server, mcp-memory-service) do not have all of these.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Deep sleep consolidation cycle | No existing local-first MCP memory server has a dedicated offline consolidation pass. Most systems do inline extraction at write time (slow, synchronous) or never consolidate at all. A nightly batch pass can use an LLM to summarize episode clusters, extract facts, detect contradictions, and merge entities — quality impossible to achieve in real time | HIGH | Dual-stream pattern: real-time event capture (fast, low quality) + offline batch consolidation (slow, high quality). Nightly cron at 2am EST. Consolidation reads episode log, calls LLM, writes to knowledge graph, flags uncertain items. MAGMA and Zep's architecture informed this. |
| Confidence-scored approval queue | Most memory systems auto-accept everything or expose no human control at all. Routing high-confidence facts to auto-accept and surfacing only contradictions, low-confidence inferences, and entity merge candidates to the human keeps the queue manageable and gives the user actual control over permanent knowledge | MEDIUM | Confidence threshold per fact type. High-confidence (>0.85): auto-approve into graph. Low-confidence / contradictions / entity merges: queue for human review. Critical calibration challenge: wrong threshold makes queue useless (too noisy) or dangerous (accepts bad facts). |
| GSD workflow hook integration | Generic MCP memory servers are session-agnostic. This system captures structured episodes at GSD phase transitions, milestone completions, and command invocations — giving consolidation higher-signal inputs than raw conversation text | MEDIUM | Hooks into `/gsd:transition`, `/gsd:new-milestone`, etc. Event schema matches GSD's phase/milestone model. Structured events consolidate better than free-form text. |
| PWA knowledge graph explorer | No existing local MCP memory server ships a visual graph explorer. Users have no way to understand what the agent knows, correct wrong facts, or spot gaps without a UI. The mcp-memory-service D3.js approach validates that users want this | HIGH | Interactive graph visualization (D3.js or Cytoscape.js). Browse entities and their relationships. Click-to-inspect observations. This is the knowledge introspection surface. |
| PWA approval queue UI | The confidence-scored queue above needs a UI. A mobile-friendly approval queue (approve/reject/edit) is what makes the human-in-the-loop workflow actually usable. Without UI, the queue is just a database table | MEDIUM | Approval cards showing: entity or fact being proposed, source session, confidence score, contradicted existing fact (if any), approve/reject/edit actions. Works on phone. |
| PWA activity dashboard | Users want to know what agents did while they were away. A timeline of agent sessions, what was captured, what was auto-approved, what's pending — this is the monitoring surface | MEDIUM | Session timeline, episode count per session, knowledge graph growth over time, pending approval count. Push-style notifications for new pending items would be differentiating. |
| Local-first / privacy-preserving architecture | Zep and Mem0 (the dominant commercial systems) are cloud-first. Data sovereignty and offline operation are real differentiators for a single-user developer tool. SuperLocalMemory validates this market position | LOW | SQLite + Ollama covers this by design. No external API calls during normal operation. This is architectural, not a feature to build — just a constraint to maintain. |
| Per-agent episode isolation with shared brain | Agents maintain separate session histories (for consolidation), but share a common knowledge graph (for learning). Existing systems either fully isolate agents or fully share memory. The shared-brain + separate-episode model enables one agent's findings to benefit future agents | MEDIUM | Episode table has `agent_session_id`. Knowledge graph is global. Consolidation merges episode insights into graph. This is the key architectural differentiator from flat per-session storage. |
| Manual consolidation trigger | Most systems only do automatic consolidation. Offering on-demand consolidation ("checkpoint now") lets users force knowledge synthesis before starting a new project or after a productive session | LOW | A CLI command or PWA button that triggers the same consolidation pipeline as the nightly cron. Low complexity once the pipeline exists. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful but create problems disproportionate to their value. Explicitly choosing not to build these keeps scope sane.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time consolidation (inline at write time) | Feels like memories should be "learned" immediately | Blocks the write path with LLM inference (high latency). Causes context window pressure during active agent sessions. Existing systems (Mem0) do this and it creates 120ms+ write latency. Batch consolidation produces higher quality output anyway because it can reason across multiple episodes | Dual-stream: fast writes into episode log, async batch consolidation overnight |
| Cloud sync / multi-device | Obvious user value — access memories from any device | Directly contradicts the privacy-first value prop. Introduces auth, sync conflicts, external dependencies. Single-user, single-machine is the design constraint. Adding sync is a separate product | Mark as v2+ only after local system is stable |
| Obsidian / markdown mirror | Many developers use Obsidian and want knowledge graph in their vault | Creates two sources of truth. Sync conflicts when either side is edited. The brain is the authoritative store — exporting to Obsidian at the user's request is fine, mirroring is not | Offer one-way export command if users request it |
| Real-time collaboration between concurrent sessions | Multiple Claude Code windows running simultaneously | Introduces write conflicts, locking, and consistency requirements for SQLite. "Eventual consistency is fine" is already in PROJECT.md — last-writer-wins on facts is safer than a distributed lock system at this scale | Last-writer-wins with provenance tracking catches conflicts post-hoc during consolidation |
| Automatic memory deletion / forgetting | Users want the system to prune stale memory automatically | Irreversible data loss without user awareness. Automated forgetting in production systems is a documented failure mode — deleting the wrong facts silently erodes agent quality | Confidence decay + approval queue: low-confidence old facts surface for human review rather than auto-delete |
| Full RAG over raw episode logs | Tempting to make the raw episode log directly queryable by agents | Episode logs are noisy, redundant, and verbose. Stuffing raw episodes into agent context degrades quality. This is why consolidation exists — the knowledge graph is the curated, agent-facing surface | Raw episodes are input to consolidation only; agents query the knowledge graph, not the episode log |
| Multi-user / team features | Sharing agent knowledge across a team | Out of scope per PROJECT.md. Team memory requires auth, access control, conflict resolution, and data governance that dwarf the core system in complexity | Single user. This is a personal cognitive prosthetic, not a team knowledge base. |

## Feature Dependencies

```
[Episodic Log Capture]
    └──required by──> [Deep Sleep Consolidation]
                          └──required by──> [Approval Queue]
                                                └──required by──> [PWA Approval Queue UI]

[Semantic Search / Embeddings]
    └──required by──> [Knowledge Graph Query]
    └──required by──> [Entity Deduplication in Consolidation]

[Knowledge Graph (entities + relations)]
    └──required by──> [PWA Graph Explorer]
    └──required by──> [Agent recall tools]
    └──populated by──> [Deep Sleep Consolidation]

[Provenance / Confidence Scoring]
    └──required by──> [Approval Queue routing]
    └──required by──> [PWA Approval Queue UI]

[MCP Tool Surface]
    └──depends on──> [Episodic Log Capture]
    └──depends on──> [Knowledge Graph]
    └──depends on──> [Semantic Search]

[PWA Backend / API]
    └──required by──> [PWA Graph Explorer]
    └──required by──> [PWA Approval Queue UI]
    └──required by──> [PWA Activity Dashboard]
    └──shares DB with──> [MCP Server]

[GSD Hook Integration]
    └──enhances──> [Episodic Log Capture] (higher signal events)
    └──depends on──> [MCP Tool Surface] (hooks call MCP tools)

[Manual Consolidation Trigger]
    └──depends on──> [Deep Sleep Consolidation] (same pipeline)
```

### Dependency Notes

- **Deep Sleep Consolidation requires Episodic Log Capture:** Consolidation has nothing to process without a stream of captured events. The episode log is the raw input — consolidation is the processing pass. Build logging before building consolidation.
- **Approval Queue requires Consolidation:** The queue is populated by the consolidation pass, which scores confidence and detects contradictions. Without consolidation, there is nothing to surface for review.
- **PWA requires a working knowledge graph:** The graph explorer has nothing to show until entities exist. Build MCP server + consolidation first, then add PWA as a read layer over real data.
- **Semantic Search requires Ollama running:** The embedding pipeline depends on Ollama serving nomic-embed-text. If Ollama is not running, embedding writes fail. The system must degrade gracefully (write without embedding, re-embed on next consolidation pass) rather than blocking writes.
- **GSD hooks enhance but do not block:** The core system works without GSD hooks — hooks are additive, not foundational. They improve episode signal quality but are not required for MVP.
- **MCP server and PWA share SQLite:** They must use the same database file. The MCP server owns write operations during agent sessions; the PWA is primarily read-only with narrow write paths (approve/reject in queue).

## MVP Definition

### Launch With (v1)

Minimum viable product — validates that persistent memory across Claude Code sessions is useful and that the consolidation + approval model works.

- [ ] MCP server with `remember`, `recall`, `query` tools — without these, there is no product
- [ ] Episodic log: captures session events with timestamps, agent ID, and context payload
- [ ] Knowledge graph: SQLite entities + relations + observations with open schema
- [ ] Semantic search: Ollama embeddings via nomic-embed-text, sqlite-vec for similarity
- [ ] Deep sleep consolidation pipeline: nightly cron + manual trigger, reads episodes, writes to graph
- [ ] Confidence scoring + approval queue: contradictions and low-confidence facts surface for human review, high-confidence facts auto-approve
- [ ] Basic PWA approval queue UI: the human-in-the-loop workflow needs a usable interface or approval friction kills the system

### Add After Validation (v1.x)

Features to add once the core memory + consolidation + approval loop is confirmed to be working correctly.

- [ ] PWA knowledge graph explorer — add when there is enough data in the graph to make visualization useful; empty graph explorer is not valuable
- [ ] PWA activity dashboard — add when users want historical visibility into agent sessions
- [ ] GSD hook integration — add once the MCP tools are stable; hooks just call the tools with structured payloads
- [ ] Manual consolidation trigger in PWA — add to PWA once the CLI version is stable and confirmed working

### Future Consideration (v2+)

Features to defer until the product has validated its core value proposition.

- [ ] Cloud sync / multi-device — only if users explicitly need it and are willing to trade privacy; requires significant architectural work
- [ ] Richer knowledge graph ontology (typed relation schemas, domain-specific entity types) — deferred until usage patterns reveal what structure is actually useful
- [ ] Embedding model upgrade (mxbai-embed-large or nomic-embed-text-v2-moe) — profile quality vs. current model before investing in larger model overhead

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| MCP tool surface (remember/recall/query) | HIGH | MEDIUM | P1 |
| Cross-session persistence (SQLite) | HIGH | LOW | P1 |
| Episodic log capture | HIGH | LOW | P1 |
| Knowledge graph (entity/relation/obs) | HIGH | MEDIUM | P1 |
| Semantic search (Ollama + sqlite-vec) | HIGH | MEDIUM | P1 |
| Deep sleep consolidation pipeline | HIGH | HIGH | P1 |
| Confidence scoring + approval routing | HIGH | MEDIUM | P1 |
| PWA approval queue UI | HIGH | MEDIUM | P1 |
| PWA knowledge graph explorer | MEDIUM | HIGH | P2 |
| PWA activity dashboard | MEDIUM | MEDIUM | P2 |
| GSD hook integration | MEDIUM | MEDIUM | P2 |
| Manual consolidation trigger (CLI) | MEDIUM | LOW | P2 |
| Manual consolidation trigger (PWA) | LOW | LOW | P3 |
| Push notifications for pending approvals | LOW | MEDIUM | P3 |
| Embedding model upgrade (larger model) | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch — without these the product doesn't work
- P2: Should have — add after P1 is stable and validated
- P3: Nice to have — future consideration

## Competitor Feature Analysis

| Feature | Official MCP server-memory | mcp-memory-service (doobidoo) | Mem0 | Zep | This Project |
|---------|---------------------------|-------------------------------|------|-----|--------------|
| Entity/relation/observation model | Yes | Yes | No (flat facts) | Partial (temporal KG) | Yes |
| Semantic search | No (keyword only) | Yes (ONNX local) | Yes (cloud OpenAI) | Yes (cloud) | Yes (Ollama local) |
| Episodic log | No | Partial | No | Partial | Yes |
| Consolidation / sleep cycle | No | Yes (autonomous) | Inline | Inline | Yes (nightly batch) |
| Confidence scoring | No | Partial (quality score) | No | No | Yes |
| Human approval queue | No | No | No | No | Yes |
| Visual graph explorer | No | Yes (D3.js) | No | No | Yes (PWA) |
| Activity dashboard | No | Partial (analytics page) | Dashboard (cloud) | Dashboard (cloud) | Yes (PWA) |
| Local-first / no cloud | Yes | Yes | No | Partial | Yes |
| GSD workflow integration | No | No | No | No | Yes |
| Mobile-responsive PWA | No | No | No | No | Yes |

## Sources

- [MachineLearningMastery: 6 Best AI Agent Memory Frameworks 2026](https://machinelearningmastery.com/the-6-best-ai-agent-memory-frameworks-you-should-try-in-2026/)
- [DEV: 5 AI Agent Memory Systems Compared (2026 Benchmark Data)](https://dev.to/varun_pratapbhardwaj_b13/5-ai-agent-memory-systems-compared-mem0-zep-letta-supermemory-superlocalmemory-2026-benchmark-59p3)
- [GitHub: doobidoo/mcp-memory-service](https://github.com/doobidoo/mcp-memory-service)
- [GitHub: shaneholloman/mcp-knowledge-graph](https://github.com/shaneholloman/mcp-knowledge-graph)
- [Vectorize.io: Best AI Agent Memory Systems 2026](https://vectorize.io/articles/best-ai-agent-memory-systems)
- [arXiv: Memory in the Age of AI Agents (2512.13564)](https://arxiv.org/abs/2512.13564)
- [The New Stack: Memory for AI Agents — A New Paradigm of Context Engineering](https://thenewstack.io/memory-for-ai-agents-a-new-paradigm-of-context-engineering/)
- [MyEngineeringPath: Human-in-the-Loop Patterns for AI Agents 2026](https://myengineeringpath.dev/genai-engineer/human-in-the-loop/)
- [DEV: The Problem with AI Agent Memory](https://medium.com/@DanGiannone/the-problem-with-ai-agent-memory-9d47924e7975)
- [AWS: Building Smarter AI Agents — AgentCore Long-Term Memory Deep Dive](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive/)
- [arXiv: MAGMA Multi-Graph Agentic Memory Architecture (2601.03236)](https://arxiv.org/html/2601.03236v1)
- [Letta Forum: Agent Memory Solutions Comparison](https://forum.letta.com/t/agent-memory-letta-vs-mem0-vs-zep-vs-cognee/88)
- [Ollama: Embedding Models Documentation](https://ollama.com/blog/embedding-models)
- [Redis: AI Agent Memory Architecture](https://redis.io/blog/ai-agent-memory-stateful-systems/)
- [DEV: Building a Universal Memory Layer for AI Agents](https://dev.to/varun_pratapbhardwaj_b13/building-a-universal-memory-layer-for-ai-agents-architecture-and-patterns-3n41)

---
*Feature research for: AI Agent Persistent Memory System (ai-workbots brain)*
*Researched: 2026-03-20*
