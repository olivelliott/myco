# Myco QA Checklist

Complete testing guide — work through each tier in order.

---

## Tier 0: Prerequisites

- [ ] **Ollama installed and running**: `ollama serve`
- [ ] **Embedding model pulled**: `ollama pull nomic-embed-text`
- [ ] **Consolidation model pulled**: `ollama pull llama3.2`
- [ ] **Node.js 22.x**: `node --version` → should be 22.x
- [ ] **Dependencies installed**: `npm install --legacy-peer-deps`
- [ ] **Build passes**: `npm run build` (ignore TS2688 type-def warnings — pre-existing)
- [ ] **Tests pass**: `npm test` → 72 tests, 4 files, all green

---

## Tier 1: MCP Server + Core Tools

Start the MCP server: `npm run dev`

Open a **separate Claude Code session** in any project directory. Verify `brain` (or `myco`) appears in your MCP server list.

### remember

- [ ] Store a basic fact:
  ```
  Use brain remember with content "TypeScript supports static typing" and entity_name "TypeScript" and entity_type "technology"
  ```
- [ ] Verify it returns a success message with entity ID
- [ ] Store a fact with relationships:
  ```
  Use brain remember with content "React uses JSX for templating" entity_name "React" entity_type "technology" with relations to target_name "JSX" target_type "concept" relation_type "uses"
  ```
- [ ] Store a fact mentioning an existing entity name to test **auto-relationship discovery**:
  ```
  Use brain remember with content "Vite works great with React for fast HMR" entity_name "Vite" entity_type "technology"
  ```
  → Should auto-create a `related_to` relationship from Vite to React (name-mention scanning)

### recall

- [ ] Semantic search:
  ```
  Use brain recall with query "JavaScript frameworks"
  ```
  → Should return React, TypeScript, or similar. Check `method: "semantic"`
- [ ] Kill Ollama (`pkill ollama`) and try recall again:
  ```
  Use brain recall with query "TypeScript"
  ```
  → Should still work via FTS5 fallback. Check `method: "fts"`
- [ ] Restart Ollama: `ollama serve`

### query

- [ ] Query by name:
  ```
  Use brain query with entity_name "React"
  ```
  → Should return entity with observations and relationship counts
- [ ] Query by type:
  ```
  Use brain query with entity_type "technology"
  ```
  → Should return all technology entities
- [ ] Query by relationship:
  ```
  Use brain query with relation_type "uses"
  ```
  → Should return entities that have "uses" relationships

### log_episode

- [ ] Log a test episode:
  ```
  Use brain log_episode with event_type "test_event" and payload {"context": "QA testing", "result": "all good"}
  ```
  → Should return episode ID and session ID

---

## Tier 2: Consolidation Pipeline

### Manual consolidation

- [ ] Trigger consolidation:
  ```
  Use brain consolidate
  ```
  → Should return summary: `totalProcessed`, `totalExtracted`, `totalAutoApproved`, `totalQueued`, `errors`
- [ ] If you logged episodes in Tier 1, verify `totalProcessed > 0`
- [ ] High-confidence facts (≥ 0.85) should auto-approve → check `totalAutoApproved`
- [ ] Low-confidence or contradictory facts → check `totalQueued`

### Approval queue

- [ ] List pending approvals:
  ```
  Use brain list_pending_approvals
  ```
  → Should show queued items with reasons (contradiction, low_confidence, merge_candidate)
- [ ] Approve an item:
  ```
  Use brain resolve_approval with id "<id-from-above>" action "approve"
  ```
  → Should write fact to knowledge graph
- [ ] Reject an item:
  ```
  Use brain resolve_approval with id "<id>" action "reject"
  ```
  → Should mark as rejected, fact NOT written
- [ ] Edit and approve:
  ```
  Use brain resolve_approval with id "<id>" action "edit" edited_content "corrected fact text"
  ```

### CLI

- [ ] `npx myco-cli consolidate` — triggers consolidation from terminal
- [ ] `npx myco-cli list-approvals` — shows pending items
- [ ] `npx myco-cli resolve-approval <id> approve` — resolves from terminal

---

## Tier 3: Auto-Relationship Discovery

### Name-mention scanning

- [ ] Create entity "PostgreSQL":
  ```
  Use brain remember with content "PostgreSQL is a relational database" entity_name "PostgreSQL" entity_type "technology"
  ```
- [ ] Create entity that mentions it:
  ```
  Use brain remember with content "Our API uses PostgreSQL for persistent storage" entity_name "API Service" entity_type "project"
  ```
- [ ] Query relationships:
  ```
  Use brain query with entity_name "API Service"
  ```
  → Should show `related_to` relationship to PostgreSQL (auto-discovered)

### Back-linking

- [ ] Create entity with existing mentions:
  ```
  Use brain remember with content "Docker containers run our services" entity_name "Infrastructure" entity_type "concept"
  ```
  Then later:
  ```
  Use brain remember with content "A containerization platform" entity_name "Docker" entity_type "technology"
  ```
  → Creating "Docker" should back-link to "Infrastructure" (FTS found "Docker" in its observation)

### Short name protection

- [ ] Entities with names < 3 chars should NOT trigger auto-relationships:
  ```
  Use brain remember with content "Go is fast" entity_name "Go" entity_type "technology"
  ```
  → "Go" won't be scanned for in other observations (too short, too many false positives)

---

## Tier 4: Dashboard + API Server

### Start services

- [ ] Start API server: `npm run api` → `http://localhost:3001`
- [ ] Start dashboard: `cd packages/dashboard && npm run dev` → `http://localhost:5173`

### Dashboard home page

- [ ] **Stat cards** show: Entities, Observations, Relationships, Pending Approvals
- [ ] Pending approvals card **glows amber** when count > 0
- [ ] **"+N this week"** sub-text appears under stat cards
- [ ] **Web density** metric shows under Relationships card (ratio of relationships to entities)
- [ ] **Mini knowledge graph** renders in left panel (top 20 nodes, animated)
- [ ] Clicking mini graph navigates to full `/graph` view
- [ ] **Most Connected** panel shows top 5 entities by link count
- [ ] **Activity feed** shows recent episodes with event_type badges
- [ ] **Quick Approve** section shows top pending items with approve/reject buttons

### Mycelium theme

- [ ] Background is deep void black (`#050510`)
- [ ] Sidebar has "Myco" text with **teal glow** effect
- [ ] Active nav item has teal left border with subtle glow
- [ ] Cards have `#0a0a1f` background with subtle borders
- [ ] Approval count badge is amber-colored
- [ ] Mobile: bottom tab bar with teal active indicator

---

## Tier 5: Knowledge Graph Visualization

### Basic rendering

- [ ] Navigate to `/graph`
- [ ] Nodes render as **glowing circles** with radial glow halos (not flat circles)
- [ ] Each entity type has a distinct color:
  - Person/Agent: teal (`#06ffc8`)
  - Project/Codebase: violet (`#a78bfa`)
  - Concept/Topic: amber (`#fbbf24`)
  - Tool/Library: emerald (`#34d399`)
  - Technology: blue (`#60a5fa`)
  - Decision: pink (`#f472b6`)
- [ ] Node **size** reflects observation count (more observations = bigger)
- [ ] Labels visible on all nodes (not just when zoomed in)
- [ ] Background is `#050510` (darker than sidebar)

### Links

- [ ] Links are **curved** (not straight lines)
- [ ] Link **thickness** varies by confidence (higher = thicker)
- [ ] **Dashed links** for auto-discovered relationships, solid for explicit
- [ ] Link color matches source node type color (at low opacity)

### Hover illumination

- [ ] Hover a node → it and its **direct neighbors brighten**
- [ ] Everything else **dims to ~8% opacity**
- [ ] Hovered node's glow radius **increases**
- [ ] **Relationship labels** appear on illuminated links (e.g., "uses", "related_to")

### Search & filter

- [ ] Search box (top-left) filters nodes by name in real-time
- [ ] Non-matching nodes dim to 15% opacity
- [ ] Type dropdown filters to show only selected entity type

### Click → Entity panel

- [ ] Click a node → side panel slides in from right
- [ ] Panel shows:
  - [ ] Entity name colored by type
  - [ ] Type badge with matching color
  - [ ] **Confidence bar** (colored, percentage)
  - [ ] **Summary** (if entity has one — italic text)
  - [ ] Observations list with colored bullet dots
  - [ ] Connected entities with colored type dots and relationship labels
- [ ] Escape key or backdrop click closes panel

### Path tracing

- [ ] Click **"Trace Path"** button (top-right toolbar)
- [ ] Button turns teal, shows "Tracing..."
- [ ] Click first node → highlighted ring appears
- [ ] Click second node → **shortest path** highlights between them
- [ ] Path info shows below toolbar: "Entity A → Entity B → Entity C"
- [ ] Path nodes have extra glow ring
- [ ] Click **X** on path info to clear
- [ ] **Escape** exits path mode

### Timeline slider

- [ ] Click **"Timeline"** button in toolbar
- [ ] Slider appears at bottom of graph
- [ ] Drag slider left → nodes/links created after that date **disappear**
- [ ] Drag right → they **reappear**
- [ ] **Play button** auto-advances through time
- [ ] **Speed selector**: 1x, 2x, 5x
- [ ] Date label shows current position

### Legend

- [ ] Click **"Legend"** button in toolbar
- [ ] Legend panel appears bottom-left showing:
  - [ ] All entity type colors with labels
  - [ ] Solid vs dashed link explanation
  - [ ] Node size meaning

---

## Tier 6: Approval Queue Page

- [ ] Navigate to `/approvals`
- [ ] Cards use mycelium theme (dark surface, glow accents)
- [ ] Each card shows:
  - [ ] Entity name
  - [ ] Reason badge (contradiction=pink, low_confidence=amber, merge_candidate=violet)
  - [ ] **Confidence bar** (green ≥85%, amber ≥50%, rose <50%)
  - [ ] Observation text
  - [ ] "Show evidence" toggle → reveals evidence quote with violet left border
- [ ] **Approve** button (emerald) → card exits with slide animation
- [ ] **Reject** button (rose) → card exits
- [ ] **Edit** button → textarea appears, "Save & Approve" / "Cancel"
- [ ] **Merge cards** show two-column layout (primary entity vs merge candidates)
- [ ] Empty state: "All caught up" message

---

## Tier 7: Graceful Degradation

- [ ] **Ollama down during remember()**: observation stored, `needs_embedding=1` flagged, no error
- [ ] **Ollama down during recall()**: falls back to FTS5 search, `method: "fts"` in response
- [ ] **Ollama down during consolidation**: episodes marked consolidated, error count incremented, no crash
- [ ] **API server down**: Dashboard shows "Cannot reach API server" message on all pages
- [ ] **Empty database**: Dashboard shows zeros, graph shows "Graph is empty" message
- [ ] **Re-embedding on restart**: When Ollama comes back and MCP server restarts, pending embeddings are backfilled (batch of 50)

---

## Tier 8: Environment Variables

Test each override individually:

- [ ] `MYCO_DB_PATH=/tmp/test-brain.db npm run dev` → uses custom DB path
- [ ] `OLLAMA_HOST=http://localhost:11435 npm run dev` → connects to different Ollama port
- [ ] `BRAIN_CONSOLIDATION_MODEL=mistral npm run dev` → uses different LLM for consolidation

---

## Tier 9: PWA & Mobile

- [ ] Open `http://localhost:5173` on phone (same network) or use Chrome DevTools mobile view
- [ ] Bottom tab bar appears (Dashboard / Approvals / Graph)
- [ ] Active tab has teal indicator
- [ ] Approval count badge shows on Approvals tab
- [ ] Graph is full-width, touch-scrollable
- [ ] Entity panel takes full width on mobile

---

## Database Verification

At any point, you can inspect the database directly:

```bash
# Find your database
ls ~/.local/share/myco/brain.db

# Open with sqlite3
sqlite3 ~/.local/share/myco/brain.db

# Useful queries:
SELECT COUNT(*) FROM entities;
SELECT COUNT(*) FROM observations;
SELECT COUNT(*) FROM relationships;
SELECT COUNT(*) FROM episodes;
SELECT COUNT(*) FROM approval_queue WHERE status = 'pending';
SELECT type, COUNT(*) FROM entities GROUP BY type;
SELECT type, source_type, COUNT(*) FROM relationships GROUP BY type, source_type;
SELECT * FROM entities ORDER BY updated_at DESC LIMIT 5;
```
