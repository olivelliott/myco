# Pitfalls Research

**Domain:** AI agent persistent memory systems — MCP server, knowledge graph, embedding pipeline, consolidation
**Researched:** 2026-03-20
**Confidence:** HIGH (multiple independent sources, official documentation, direct issue reports)

---

## Critical Pitfalls

### Pitfall 1: SQLite Without WAL Mode Under Concurrent Sessions

**What goes wrong:**
Multiple Claude Code sessions write to the same SQLite database simultaneously. Without WAL mode, write operations use an exclusive lock — any concurrent write fails instantly with `SQLITE_BUSY`. Under the default journal mode, a second session trying to write while a consolidation cycle is running will throw and silently drop that episode. The data simply disappears with no retry.

**Why it happens:**
The official MCP memory reference implementation uses JSONL files with no locking at all. Developers who migrate to SQLite copy that assumption without enabling WAL mode. The failure is intermittent — it only manifests when two sessions overlap, which isn't obvious during solo testing.

**How to avoid:**
Enable WAL mode and set a busy timeout at connection open time:
```javascript
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
```
WAL allows unlimited concurrent readers and one writer, with readers never blocking writers. The busy timeout retries writes for up to 5 seconds before throwing rather than failing instantly.

Also: run `PRAGMA wal_checkpoint(TRUNCATE)` periodically (e.g., at the start of each consolidation cycle) to prevent the WAL file from growing without bound.

**Warning signs:**
- Sporadic missing episodes when two sessions were open simultaneously
- `SQLITE_BUSY` errors in MCP server logs
- WAL file growing past 50MB without checkpointing

**Phase to address:** Foundation phase (MCP server + SQLite schema setup). This must be in the initial schema design, not retrofitted later.

---

### Pitfall 2: Memory Poisoning via Injected Episodes

**What goes wrong:**
An agent processes a document, webpage, API response, or code file that contains embedded instructions designed to create false memories. The episode gets written verbatim to the store. On the next consolidation cycle, the LLM reads this episode as trusted agent activity and promotes it into the knowledge graph as a fact. Future sessions retrieve this poisoned fact and treat it as ground truth.

Unlike prompt injection (which ends when the session closes), memory poisoning creates persistent compromise. Research at NeurIPS 2025 demonstrated 95%+ injection success rates and 70%+ attack success rates against production memory systems using the MINJA approach — attacking via query-only interaction, no direct database access needed.

**Why it happens:**
Systems treat all episodes as equally trusted because they came through the "correct" channel (the MCP server). No distinction is made between facts the agent reasoned to versus content the agent read from an external source.

**How to avoid:**
- Attach provenance metadata to every episode at write time: `source_type` (agent-reasoned, file-read, tool-output), `source_path` (which file/URL), `trust_level` (internal/external)
- During consolidation, apply lower confidence scores to facts extracted from `source_type: external` episodes
- Strip instruction-pattern content from raw episode text before it enters the consolidation prompt (check for "remember that", "always do", imperative forms directed at Claude)
- Surface externally-sourced facts to the human approval queue regardless of confidence score

**Warning signs:**
- Knowledge graph contains facts phrased as instructions ("always do X when Y")
- Facts appear with no traceable agent reasoning in their episode chain
- Consolidation output references tool outputs as if they were agent-derived knowledge

**Phase to address:** Episode capture phase (define schema with provenance fields) and consolidation phase (differentiate trust levels in extraction prompt).

---

### Pitfall 3: Context Rot — Injecting Everything Into Agent Context

**What goes wrong:**
The `recall` tool returns too many memories. The agent receives a large block of retrieved context on every call. Over time, as the graph grows, recall results become noisy — old assumptions, superseded facts, and low-relevance entities fill the context window. The agent anchors on stale or irrelevant content. Performance degrades below what the agent achieved with no memory at all.

This is called "context rot" in the literature: simply enlarging the context window with memory retrieval degrades performance before the window is even full.

**Why it happens:**
Developers build recall as "return top-K by cosine similarity" and set K=10 or K=20 to be safe. They never reduce it because more context "feels safer." The quality problem is invisible until the agent starts making worse decisions than a fresh session.

**How to avoid:**
- Return at most 5-7 highly relevant items from recall, not 20
- Apply recency weighting alongside semantic similarity — recent episodes get a score boost
- Implement temporal decay: facts older than N days get a confidence penalty unless they've been recently accessed or confirmed
- Filter by relevance threshold, not just top-K: if the best match is below 0.7 cosine similarity, return nothing rather than irrelevant noise
- Structure recall output as a compact summary, not raw graph dumps

**Warning signs:**
- Recall results exceed 500 tokens regularly
- Agent responses reference outdated project states
- Agent contradicts knowledge the user explicitly approved as correct

**Phase to address:** MCP tools phase (recall tool design) and consolidation phase (implement decay scoring).

---

### Pitfall 4: LLM Hallucination During Consolidation

**What goes wrong:**
The consolidation cycle uses an LLM to extract entities, infer relationships, and assess confidence from raw episode logs. The LLM fabricates plausible-sounding facts that were never in the episodes. These hallucinated facts get written into the knowledge graph, often with high confidence scores. High-confidence auto-approval means they bypass human review entirely and become permanent.

**Why it happens:**
Episode logs are ambiguous. An agent saying "worked on the auth module" gives the LLM latitude to infer things like "the project uses JWT" or "authentication is incomplete" — neither of which may be true. LLMs are trained to be helpful and will fill gaps rather than saying "insufficient evidence."

**How to avoid:**
- The consolidation prompt must instruct the LLM to extract only facts that are explicitly supported by the episode text, with a direct quote from the episode as evidence
- Every extracted fact should include a `evidence_quote` field — reject any fact extraction missing this field
- Tune confidence thresholds conservatively: start with auto-approve threshold at 0.90 not 0.75; lower it only after observing consolidation quality over several cycles
- For the first month of operation, route a random 10% sample of high-confidence facts through the human queue for spot-checking
- Limit the LLM to extraction, not inference: "What entities are mentioned?" not "What can you infer about the project?"

**Warning signs:**
- Extracted facts contain information not findable in any recent episode log
- Knowledge graph contains confident assertions about technology choices that were never discussed
- Spot-checking high-confidence auto-approved facts reveals fabrications

**Phase to address:** Consolidation phase (extraction prompt design and confidence calibration).

---

### Pitfall 5: Entity Identity Collapse — Silent Deduplication Failures

**What goes wrong:**
The knowledge graph creates duplicate entities for the same real-world thing. "auth-service", "AuthService", "the auth module", and "authentication service" are four separate nodes with no edges between them. Knowledge accumulates on each node independently. Semantic search returns the wrong node depending on query phrasing. The graph becomes fragmented and retrieval quality degrades silently.

Conversely, aggressive deduplication merges entities that are actually distinct: "User entity (database model)" and "User (authentication concept)" get collapsed into one node, losing important distinctions.

**Why it happens:**
Entity resolution is genuinely hard. Simple exact-match deduplication misses synonyms. Pure embedding similarity over-merges. No strategy is perfect. Teams often implement one approach and assume it works without testing edge cases.

**How to avoid:**
- Use a two-pass entity resolution approach: (1) exact/normalized match for high-confidence merges, (2) embedding similarity above 0.92 threshold for candidate merges that go to human queue
- Never auto-merge entities — all merges above the exact-match threshold should surface to the human approval queue with a "these look like the same thing" explanation
- Store entity aliases explicitly: each entity has a `canonical_name` and an `aliases` array, so future episodes can match on any known alias
- Log all rejected merge candidates so the user can see "I chose not to merge X and Y"

**Warning signs:**
- Multiple nodes in the graph for the same file path or module name
- Recall for "auth module" returns different results than recall for "authentication"
- Human approval queue contains merge proposals the user keeps rejecting (threshold is too aggressive)

**Phase to address:** Knowledge graph schema phase (canonical names + aliases) and consolidation phase (merge strategy and queue routing).

---

### Pitfall 6: Ollama Dependency Failures Blocking the Critical Path

**What goes wrong:**
Every `remember` and `recall` MCP call requires a live Ollama instance running the embedding model. If Ollama is not running, has not loaded the model, or is undergoing model swap, all memory operations fail. An agent session that needs to recall context on startup simply fails with a connection error. The MCP server becomes completely unavailable.

Additionally, the first embedding request after Ollama starts can take 3-8 seconds for model loading — this is a cold start problem that manifests as tool timeout in the agent.

**Why it happens:**
Developers test with Ollama always running. Production use has Ollama on a sleep-capable machine where it may be stopped. The dependency is synchronous and not designed to degrade gracefully.

**How to avoid:**
- Implement a health check for Ollama on MCP server startup with a clear error message, not a crash
- Make embedding optional for episode writes: if Ollama is unavailable, write the episode text without an embedding vector; flag it for re-embedding on next consolidation cycle
- For `recall`: if Ollama is down, fall back to FTS5 full-text search on episode text rather than vector similarity
- Cache embedding model status and warm the model on a startup probe request (empty string embedding)
- Set aggressive timeouts: if Ollama does not respond within 3 seconds, fail fast and fall back — do not hang the agent

**Warning signs:**
- `recall` returning empty results when episodes clearly exist
- MCP tool calls timing out intermittently
- Memory operations work in morning but fail after laptop sleep

**Phase to address:** Embedding pipeline phase (Ollama integration with graceful degradation).

---

### Pitfall 7: The PWA Cannot Share the SQLite Database

**What goes wrong:**
The MCP server holds an open SQLite connection. The PWA is a browser-based app. The browser cannot directly open a native SQLite file — it has no filesystem access to `/Users/olive/...`. Building the PWA as a direct SQLite reader requires the user to drag-and-drop the database file or use the File System Access API, which provides no live updates and requires re-importing on every view.

Teams discover this late because the MCP server "works fine" and the PWA mockup works with fake data — the integration gap only surfaces when wiring them together.

**Why it happens:**
Project requirements say "shared SQLite database" without specifying the access architecture. Developers assume this means both sides read from the same file directly, which is not how browsers work.

**How to avoid:**
- The MCP server must expose an HTTP API (local, e.g., `localhost:3747`) that the PWA calls — the SQLite database is never accessed by the browser directly
- Use Server-Sent Events (SSE) or WebSocket for the PWA's live activity dashboard — the MCP server pushes events; the PWA does not poll
- Design the HTTP API from the start, not as an afterthought: approval queue endpoints, entity search, episode timeline all need explicit routes
- Keep the HTTP server and MCP server as the same Node.js process to avoid port conflict and lifecycle issues

**Warning signs:**
- PWA mockups using static JSON fixtures while "the real integration comes later"
- Architecture diagrams showing "shared SQLite" without specifying the access mechanism
- MCP server and PWA backend described as separate services with no IPC defined

**Phase to address:** Architecture phase (define data access boundaries before any code). The HTTP API must be designed in the same phase as the MCP server, not the PWA phase.

---

### Pitfall 8: Approval Queue Fatigue — Surfacing Too Much

**What goes wrong:**
The human approval queue becomes a firehose. Every consolidation cycle produces 30-50 items: low-confidence facts, possible merges, minor contradictions. The user stops reviewing and either bulk-approves everything (defeating the purpose) or bulk-rejects and disables the feature. The knowledge graph either fills with garbage or never grows.

**Why it happens:**
Developers set conservative thresholds to "be safe." Any fact under 0.85 confidence goes to the queue. Any two entities with >0.70 embedding similarity get flagged as possible duplicates. After a week of real use, the queue has hundreds of items and no one looks at it.

**How to avoid:**
- Queue should surface no more than 5-10 items per consolidation cycle in steady state
- Only three categories belong in the queue: (1) direct contradictions of existing graph facts, (2) entity merge proposals, (3) facts extracted from untrusted external sources
- Routine low-confidence facts that don't contradict anything should be written to a "tentative" layer in the graph, not queued — they auto-expire if not reinforced within 30 days
- Show queue items in context: "This new fact contradicts what I stored on [date] from [session]" — make it a one-tap decision, not a research task
- Track queue acceptance rate: if it drops below 40%, the confidence thresholds are too aggressive

**Warning signs:**
- Queue grows faster than it is drained (>20 items/day from normal usage)
- User bulk-approving without reading items
- Queue backlog older than 7 days

**Phase to address:** Consolidation phase (queue routing logic) and PWA phase (approval UX design).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store raw episode text as plain string | Simple to implement | No structured retrieval; consolidation LLM must parse unstructured text every cycle | Never — add minimal structure at episode write time |
| Use embedding cosine similarity as the only retrieval method | Simple API | Fails for exact entity lookups, recent-episode queries, and boolean filters | Never alone — hybrid FTS5 + vector required from day one |
| Skip provenance metadata on episodes | Faster writes | No way to assess trust, no memory poisoning defense, no audit trail | Never — provenance fields are cheap and critical |
| Single auto-approve threshold (e.g., 0.85) for all fact types | Simple logic | Over-approves entity merges; under-approves routine facts | Acceptable for MVP if threshold is 0.95 for merges, lower for non-merge facts |
| Nightly cron only, no manual trigger | Less infrastructure | Blocks testing the consolidation pipeline without waiting | Acceptable for initial implementation if `gsd:consolidate` command is added early |
| Embed on every write (synchronous) | Simpler code path | Ollama unavailability blocks all memory writes | Never — writes must succeed without embeddings; embed async |

---

## Integration Gotchas

Common mistakes when connecting components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Ollama `/api/embed` | Calling synchronously in the hot path of `remember` | Call async with 3s timeout; fall back to write-without-embedding if timeout hit |
| Ollama model loading | Assuming the model is warm on first call | Send a probe embedding on MCP server startup; log "embedding unavailable" rather than crashing |
| SQLite + better-sqlite3 | Using default journal mode | Set WAL mode + busy_timeout on every connection open |
| SQLite WAL + multiple Node.js processes | Opening separate MCP and HTTP server processes | Use a single Node.js process for both; or use a connection pool with WAL mode and a shared busy_timeout |
| PWA + MCP server HTTP API | Forgetting CORS headers for localhost:PORT | Set `Access-Control-Allow-Origin: *` (localhost only, acceptable for local tool) |
| GSD hooks + episode capture | Writing a hook that fails if MCP server is down | Hooks must fire-and-forget; memory capture failure must never block GSD workflow |
| Claude Code MCP config | Forgetting to restart Claude Code after config changes | MCP config is read once at startup; restart is always required |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading full embedding table for similarity search | Recall latency grows linearly with episodes | Use sqlite-vec with HNSW index from day one | ~5,000 episodes (roughly 6-12 months of active use) |
| Consolidation LLM reads all recent episodes in one prompt | Consolidation prompt exceeds 32k tokens, LLM truncates or errors | Chunk episodes into groups of 20-30 before LLM processing | After a highly active day (50+ episodes) |
| Scanning all graph nodes for entity resolution | Merge candidate search takes minutes | Pre-cluster entities by type; only compare within-type | >1,000 entities in graph |
| WAL file never checkpointed | SQLite WAL grows to GB range; all queries slow | Run `PRAGMA wal_checkpoint(TRUNCATE)` at consolidation start | WAL exceeds 50MB (roughly 2-3 weeks without checkpoint) |
| Embedding every recall query against entire graph at query time | Recall takes 2-5 seconds | Pre-compute and store all embeddings; use indexed vector search | >500 entities in graph |

---

## Security Mistakes

Domain-specific security issues for a local AI memory system.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating all episode content as trusted | Memory poisoning via documents/files the agent reads; attacker plants instructions that survive into knowledge graph | Tag all external-source content at write time; apply lower trust during consolidation; route externally-sourced facts to human queue |
| No provenance on knowledge graph facts | Cannot audit what the agent "knows" or trace errors back to source; no rollback possible | Every entity and relationship stores `created_by_episode`, `source_type`, `created_at` |
| Exposing HTTP API without localhost binding | If the machine is on a network, other machines could read/write the knowledge graph | Bind HTTP server to `127.0.0.1` explicitly, never `0.0.0.0` |
| Storing PII from processed files in the graph | Personal data (email addresses, names) accumulates in the knowledge graph with no deletion path | Add entity deletion and graph "forget" command before storing any PII; document what categories of data are and aren't stored |
| No memory integrity audit | Poisoned memories are never detected; baseline behavior drift goes unnoticed | Periodically log a "memory health check": count of facts by source type, flagging any instruction-patterned facts |

---

## UX Pitfalls

Common user experience mistakes in approval queue and knowledge graph explorer interfaces.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw LLM extraction output in approval queue | User cannot parse JSON graph triples; ignores the queue | Render as natural-language sentences: "I think X is related to Y because [quote]" |
| Binary approve/reject with no edit | User rejects everything that's slightly wrong rather than correcting it | Allow inline editing of fact text before approving |
| Knowledge graph explorer as a raw node/edge list | User cannot navigate; the tool feels alien | Default to entity-centric view: "here's everything I know about [entity]" grouped by relationship type |
| No activity feed showing "what the agent learned today" | User has no sense of memory accumulation; it feels like a black box | Activity dashboard is the first thing visible after the approval queue |
| Approval queue items with no context | User cannot make a good approve/reject decision | Each item shows: source episode snippet, conflicting existing fact (if any), and confidence score with plain-English meaning |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **MCP server memory tools:** Often missing graceful degradation — verify that `remember` succeeds even when Ollama is down (write without embedding, flag for re-embedding)
- [ ] **Episode capture:** Often missing provenance fields — verify that every episode written has `source_type`, `agent_session_id`, and `created_at`
- [ ] **Consolidation cycle:** Often missing evidence quotes — verify that the extraction prompt requires a direct quote from episode text for every extracted fact
- [ ] **Knowledge graph entity resolution:** Often missing alias tracking — verify that merged entities retain all previous name variants as searchable aliases
- [ ] **Approval queue:** Often missing contradiction detection — verify that consolidation checks new facts against existing graph facts for semantic conflicts, not just structural uniqueness
- [ ] **PWA knowledge graph explorer:** Often missing the delete/forget flow — verify that facts and entities can be permanently removed, not just hidden
- [ ] **SQLite schema:** Often missing WAL mode and busy_timeout — verify in a test with two concurrent writers that no data is lost
- [ ] **GSD hooks:** Often missing failure isolation — verify that a memory write error does not throw and interrupt the GSD phase transition

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SQLite data corruption from concurrent writes | MEDIUM | Restore from most recent backup; re-run missed episodes from GSD `.planning/` files; enable WAL mode and busy_timeout before re-starting |
| Memory poisoning discovered in graph | MEDIUM | Use provenance fields to find all facts sourced from the suspect episode; delete them via admin command; run integrity scan for instruction-patterned facts |
| Hallucinated facts promoted to graph | LOW-MEDIUM | Facts have `created_by_episode` — trace back, delete fact, add to blocklist pattern; adjust consolidation prompt to require evidence quotes |
| Approval queue overflow (hundreds of items) | LOW | Bulk-archive items older than 30 days without review (mark as "expired"); tune thresholds down; clear tentative-layer facts that haven't been reinforced |
| Ollama performance degradation (embeddings getting slower) | LOW | Restart Ollama process; run `ollama pull nomic-embed-text` to refresh model; check for WAL checkpoint starvation on SQLite side |
| Entity graph fragmented with duplicates | HIGH | Write a one-time deduplication script that surfaces all near-duplicate pairs above 0.85 similarity to human review; merge approved pairs; re-index embeddings |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SQLite concurrency / no WAL mode | Phase 1: Foundation (SQLite schema + MCP server) | Write a test with two concurrent writers; verify no data loss |
| Memory poisoning via external content | Phase 2: Episode capture (provenance schema) and Phase 4: Consolidation (trust-aware extraction) | Inject a synthetic "poison episode" sourced from a fake file read; verify it surfaces in human queue, not auto-approved |
| Context rot / noisy recall | Phase 3: MCP recall tools | Benchmark recall with 50, 200, and 500 graph entities; verify result count stays <=7 and relevance stays high |
| Consolidation hallucination | Phase 4: Consolidation cycle | Spot-check 10 auto-approved facts against their source episodes; all 10 must have direct textual support |
| Entity identity collapse | Phase 4: Consolidation cycle | Create two episodes about the same module with different names; verify they merge correctly with alias tracking |
| Ollama dependency failures | Phase 3: Embedding pipeline | Kill Ollama mid-session; verify `remember` writes episode without embedding and `recall` falls back to FTS5 |
| PWA cannot access SQLite directly | Phase 1: Architecture design | Confirm HTTP API design is decided before Phase 5 (PWA) begins |
| Approval queue fatigue | Phase 4: Consolidation cycle + Phase 5: PWA | Simulate 7 days of consolidation; verify queue stays under 10 items/day |

---

## Sources

- [Fixing Claude Code's Concurrent Session Problem: Implementing Memory MCP with SQLite WAL Mode](https://dev.to/daichikudo/fixing-claude-codes-concurrent-session-problem-implementing-memory-mcp-with-sqlite-wal-mode-o7k) — MEDIUM confidence (community article, verified against SQLite official docs)
- [SQLite Write-Ahead Logging — official documentation](https://sqlite.org/wal.html) — HIGH confidence
- [Memory poisoning in AI agents: exploits that wait — Christian Schneider](https://christian-schneider.net/blog/persistent-memory-poisoning-in-ai-agents/) — HIGH confidence (referenced by Palo Alto Unit 42 and ICLR 2025)
- [When AI Remembers Too Much — Palo Alto Networks Unit 42](https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/) — HIGH confidence (security research)
- [MemoryGraft: Persistent Compromise of LLM Agents via Poisoned Experience Retrieval](https://arxiv.org/abs/2512.16962) — HIGH confidence (peer-reviewed, NeurIPS 2025)
- [Memory for AI Agents: A New Paradigm of Context Engineering — The New Stack](https://thenewstack.io/memory-for-ai-agents-a-new-paradigm-of-context-engineering/) — MEDIUM confidence
- [Entity Resolution at Scale: Deduplication Strategies for Knowledge Graph Construction](https://medium.com/@shereshevsky/entity-resolution-at-scale-deduplication-strategies-for-knowledge-graph-construction-7499a60a97c3) — MEDIUM confidence
- [Embeddings getting slower and slower — Ollama GitHub Issue #14314](https://github.com/ollama/ollama/issues/14314) — HIGH confidence (reported by multiple users, tracked in official repo)
- [Ollama slow performance — Issue #13552](https://github.com/ollama/ollama/issues/13552) — HIGH confidence (official repo)
- [The Current State of SQLite Persistence on the Web: November 2025 Update](https://www.powersync.com/blog/sqlite-persistence-on-the-web) — HIGH confidence
- [Memory Engineering for AI Agents — Agent Memory Wars](https://medium.com/@nraman.n6/agent-memory-wars-why-your-multi-agent-system-forgets-what-matters-and-how-to-fix-it-a9a1901df0d9) — MEDIUM confidence (community article, patterns corroborated across multiple sources)
- [Context Engineering in Agent — Weaviate](https://weaviate.io/blog/context-engineering) — HIGH confidence (official vendor documentation)
- [Memory in the Age of AI Agents — arXiv 2512.13564](https://arxiv.org/abs/2512.13564) — HIGH confidence (survey paper)

---
*Pitfalls research for: AI agent persistent memory system — MCP server, knowledge graph, embedding pipeline, consolidation*
*Researched: 2026-03-20*
