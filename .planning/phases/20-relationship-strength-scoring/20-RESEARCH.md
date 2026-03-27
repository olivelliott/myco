# Phase 20: Relationship Strength Scoring - Research

**Researched:** 2026-03-27
**Domain:** SQLite upsert patterns, react-force-graph-2d edge rendering, better-sqlite3 prepared statements
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Linear increment: `strength = strength + 1` per reinforcement — simple, predictable
- Initial strength value: 1.0 for new relationships
- Upsert via `INSERT ... ON CONFLICT DO UPDATE SET strength = strength + 1, reinforcement_count = reinforcement_count + 1` — single SQL statement
- Strength does NOT decay over time — it only grows via remember calls. Decay is separate (Phase 21)
- Line thickness range: 1px (strength=1) to 5px (strength≥10), linear clamp
- Tooltip on hover: "Strength: N (reinforced N times)"
- Single edge color — vary only thickness, not color, for clarity
- Include `strength` and `reinforcement_count` in relationship objects returned by recall/query API results
- Relationship strength updated only on `remember` (not `recall`) — STATE.md decision, avoids write amplification
- better-sqlite3 synchronous API
- react-force-graph-2d for dashboard graph visualization

### Claude's Discretion
- SQL upsert implementation details
- Dashboard component structure for edge rendering
- Test approach and edge cases

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRENGTH-01 | Relationships have a strength score that increases when reinforced by multiple remember calls | SQLite upsert pattern confirmed; migration 009 already adds columns; `rememberEntity` in tools.ts is the insertion site |
| STRENGTH-02 | Strength scoring uses an upsert pattern (ON CONFLICT DO UPDATE) on the existing relationships table | UNIQUE(from_id, to_id, type) constraint in baseline schema enables ON CONFLICT DO UPDATE; existing `insertRelationship` uses INSERT OR IGNORE — must replace with upsert variant |
| STRENGTH-03 | Relationship strength is visible in query results and the dashboard graph | API graph route must SELECT strength/reinforcement_count; GraphLink type must carry strength; linkCanvasObject in graph-view.tsx must use strength for lineWidth |
</phase_requirements>

---

## Summary

Phase 20 is a surgical, well-scoped change across three layers: (1) SQL upsert logic in `tools.ts`, (2) API graph response in `routes/graph.ts`, and (3) canvas edge rendering in `graph-view.tsx`. The heavy lifting is already done: migration `009_relationships_strength` (in `migrations.ts`) has already added `strength REAL NOT NULL DEFAULT 1.0` and `reinforcement_count INTEGER NOT NULL DEFAULT 0` to the relationships table. The TypeScript `Relationship` interface in `types.ts` already carries both fields.

The core change is replacing the existing `insertRelationship` prepared statement — which uses `INSERT OR IGNORE` (silently skips duplicates) — with a new upsert statement that uses `INSERT INTO ... ON CONFLICT(from_id, to_id, type) DO UPDATE SET strength = strength + 1, reinforcement_count = reinforcement_count + 1`. This single statement change makes reinforcement automatic and atomic.

On the dashboard, the edge `linkCanvasObject` painter in `graph-view.tsx` already computes `width` from `confidence`. The strength-based width replaces or augments this existing formula. The `GraphLink` type and `GraphData` API interface both need `strength` and `reinforcement_count` fields added — currently they carry only `confidence`.

**Primary recommendation:** Replace `insertRelationship` prepared statement with an upsert; pass `strength` through the API and graph rendering pipeline; map strength to line width with a linear clamp in the canvas painter.

---

## Standard Stack

### Core (already in project — no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.8.0 | SQLite driver | Project standard; synchronous API used throughout |
| react-force-graph-2d | latest | Graph canvas rendering | Project standard; `linkCanvasObject` already handles custom edge drawing |
| Vitest | in project | Test runner | Project standard; all existing tests use it |

**No new packages required for this phase.**

---

## Architecture Patterns

### The SQLite Upsert Pattern (ON CONFLICT DO UPDATE)

**What:** SQLite `INSERT INTO ... ON CONFLICT(columns) DO UPDATE SET ...` atomically inserts a new row or updates an existing one.

**Constraint requirement:** The `ON CONFLICT(from_id, to_id, type)` clause requires a UNIQUE constraint on exactly those columns. The baseline schema (`001_baseline`) already has `UNIQUE(from_id, to_id, type)` on the relationships table — confirmed in `packages/core/src/migrations.ts` line 55 and `packages/core/src/schema.ts` line 42.

**Current state of `insertRelationship`:**
```sql
-- Current (INSERT OR IGNORE — silently skips, does NOT update strength)
INSERT OR IGNORE INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)
```

**Required replacement:**
```sql
-- Upsert: inserts new row OR increments strength on existing row
INSERT INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)
ON CONFLICT(from_id, to_id, type)
DO UPDATE SET
  strength = strength + 1,
  reinforcement_count = reinforcement_count + 1
```

**Key behavior:** The `id` in the VALUES clause is ignored on conflict — the existing row's `id` is preserved. This is correct: the relationship already exists, we only want to update its strength counters.

**Idempotency proof:** Two calls to `remember` with the same entity pair and relation type will produce exactly one relationship row. The first call inserts with `strength = 1.0, reinforcement_count = 0`. The second call triggers the ON CONFLICT path, producing `strength = 2.0, reinforcement_count = 1`. No duplicate rows. This satisfies STRENGTH-02.

### Prepared Statement Naming Convention

Looking at `MycoStatements` in `statements.ts`, the relationship section currently has:
- `insertRelationship` — the statement to replace with upsert
- `selectRelationshipExists` — reads, unchanged
- `updateRelationshipFromId` — merge support, unchanged
- `updateRelationshipToId` — merge support, unchanged

The replacement statement keeps the name `insertRelationship` — callers in `tools.ts` (lines 180, 941) and `relationship-discovery.ts` reference it by name. Renaming would require updating all call sites. Keeping the name is the minimal-diff approach.

### API Layer: Adding Strength to Graph Response

**Current `selectGraphRelationships` statement** (statements.ts line 462-463):
```sql
SELECT id, from_id, to_id, type, confidence, source_type, created_at FROM relationships
```

**Required change** — add `strength` and `reinforcement_count`:
```sql
SELECT id, from_id, to_id, type, confidence, source_type, created_at, strength, reinforcement_count FROM relationships
```

**`RelationshipRow` interface** in `routes/graph.ts` (lines 17-26) needs two new fields:
```typescript
interface RelationshipRow {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  confidence: number;
  source_type: string;
  created_at: string;
  strength: number;           // ADD
  reinforcement_count: number; // ADD
}
```

**Links response mapping** (routes/graph.ts lines 69-76) must pass through the new fields:
```typescript
const links = relRows.map((row) => ({
  source: row.from_id,
  target: row.to_id,
  type: row.type,
  confidence: row.confidence,
  source_type: row.source_type,
  created_at: row.created_at,
  strength: row.strength,                   // ADD
  reinforcement_count: row.reinforcement_count, // ADD
}));
```

### Dashboard: GraphLink Type and GraphData Interface

**`GraphLink` type** in `graph-view.tsx` (lines 34-41) needs `strength` and `reinforcement_count`:
```typescript
export type GraphLink = {
  source: string | GraphNode
  target: string | GraphNode
  type: string
  confidence: number
  source_type: string
  created_at: string
  strength?: number              // ADD — optional, defaults to 1.0
  reinforcement_count?: number   // ADD — optional
}
```

**`GraphData` interface** in `lib/api.ts` (lines 80-98) needs matching additions:
```typescript
links: Array<{
  source: string
  target: string
  type: string
  confidence: number
  source_type: string
  created_at: string
  strength: number          // ADD
  reinforcement_count: number // ADD
}>
```

**`GraphViewProps.links` prop type** in `graph-view.tsx` (lines 44-53):
```typescript
links: Array<{
  source: string; target: string; type: string
  confidence?: number; source_type?: string; created_at?: string
  strength?: number          // ADD
  reinforcement_count?: number // ADD
}>
```

### Canvas Edge Rendering: Strength-Based Width

**Current width formula** in `graph-view.tsx` (lines 676-679):
```typescript
const width = isHoveredLink
  ? (2 + (l.confidence ?? 1) * 2) / globalScale
  : (0.8 + (l.confidence ?? 1) * 1) / globalScale
```

**Required: replace with strength-aware formula.**

Locked decisions specify: 1px at strength=1, 5px at strength≥10, linear clamp.

Linear interpolation: `strengthWidth = 1 + (strength - 1) * (4/9)`, clamped to [1, 5].

```typescript
// Compute strength-based base width (1px at strength=1, 5px at strength≥10)
const strength = (l as GraphLink).strength ?? 1.0
const strengthWidth = Math.min(5, Math.max(1, 1 + (strength - 1) * (4 / 9)))

const width = isHoveredLink
  ? (strengthWidth + 1) / globalScale   // +1px boost on hover
  : strengthWidth / globalScale
```

**Note on units:** The canvas `lineWidth` is in canvas coordinate units divided by `globalScale` to keep visual width consistent across zoom levels. The computed `strengthWidth` is the visual pixel width at globalScale=1.

### Hover Tooltip: Strength Display

The CONTEXT.md decision requires "Strength: N (reinforced N times)" on hover. Looking at `graph-view.tsx`, there is no existing HTML tooltip — the node panel is shown via `onNodeClick`, not hover. For edges, there is no existing tooltip mechanism.

Two viable approaches:
1. **Canvas text label extension** — add strength text to the existing `linkCanvasObject` label rendering (already shows relationship type on hover). This keeps everything in canvas — no DOM overlay needed.
2. **State-based DOM tooltip** — track hovered link in state, render a `<div>` positioned via mouse coordinates.

**Recommendation (Claude's discretion):** Extend the existing canvas label in `linkCanvasObject`. The label already renders at `cpX, cpY` (bezier midpoint). Add a second line below the type label showing "Strength: N (N reinforcements)". This is consistent with the existing canvas-only approach and requires no new DOM elements.

```typescript
// After rendering the type label, add strength sub-label
if (showLabel && strength > 1) {
  const strengthLabel = `Strength: ${strength.toFixed(0)} (${reinforcement_count ?? 0}×)`
  // Render at cpY + fontSize + pad
}
```

### Recommended Project Structure (No Changes Needed)

The phase touches existing files only — no new directories or files required:

```
packages/core/src/
├── statements.ts     -- UPDATE: insertRelationship SQL (upsert), selectGraphRelationships (add strength)
├── types.ts          -- NO CHANGE: Relationship interface already has strength + reinforcement_count

packages/api-server/src/routes/
├── graph.ts          -- UPDATE: RelationshipRow interface, links mapping

packages/dashboard/src/
├── components/graph-view.tsx  -- UPDATE: GraphLink type, linkCanvasObject width + tooltip
├── lib/api.ts                 -- UPDATE: GraphData links interface
```

### Anti-Patterns to Avoid

- **Two-step INSERT + UPDATE:** Do not insert with `INSERT OR IGNORE` and then separately `UPDATE SET strength = strength + 1`. This is two round-trips and has a race condition if two sessions call `remember` simultaneously. The single upsert statement is atomic.
- **Client-side strength tracking:** Do not read the current strength value in application code and compute the new value there. `strength = strength + 1` in the SQL UPDATE expression is evaluated atomically by SQLite — no read-modify-write race.
- **Storing strengthWidth as a new DB column:** Width is a rendering concern, computed at display time from `strength`. It does not belong in the database.
- **Changing `insertRelationship` call signature:** The upsert statement takes the same parameters as the current `INSERT OR IGNORE`. Callers in `tools.ts` and `relationship-discovery.ts` do not need to change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic upsert | Read-then-write in application code | `INSERT ... ON CONFLICT DO UPDATE` | Single statement, no race condition, no extra round-trip |
| Edge width scaling | Custom interpolation function | Simple linear clamp (1 + (s-1) * 4/9) | Already specified; trivial inline math |
| Relationship existence check | Separate SELECT before INSERT | UNIQUE constraint + ON CONFLICT | DB enforces uniqueness at insert; no need to check first |

---

## Common Pitfalls

### Pitfall 1: INSERT OR IGNORE vs ON CONFLICT DO UPDATE
**What goes wrong:** Leaving `INSERT OR IGNORE` in place. When the same relationship is asserted again, the conflict is silently ignored. `strength` stays at 1.0 forever — STRENGTH-01 is never satisfied.
**Why it happens:** `INSERT OR IGNORE` is the existing behavior. Easy to miss that it needs changing.
**How to avoid:** The `insertRelationship` prepared statement SQL must be updated to use `ON CONFLICT(from_id, to_id, type) DO UPDATE SET strength = strength + 1, reinforcement_count = reinforcement_count + 1`.
**Warning signs:** Test that calls `remember` twice with the same relationship and then checks `strength` — if strength is still 1.0, the wrong statement is running.

### Pitfall 2: ON CONFLICT Clause Must Match the UNIQUE Constraint Exactly
**What goes wrong:** Using `ON CONFLICT(from_id, to_id)` instead of `ON CONFLICT(from_id, to_id, type)`. SQLite will raise an error if the conflict target columns don't match an existing UNIQUE or PRIMARY KEY constraint.
**Why it happens:** Forgetting that the UNIQUE constraint is a 3-tuple.
**How to avoid:** The conflict target in the upsert must be `(from_id, to_id, type)` — exactly matching the `UNIQUE(from_id, to_id, type)` in migration `001_baseline`.
**Warning signs:** `SqliteError: ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE expression`.

### Pitfall 3: strength Field Missing from API Response Causes NaN Width
**What goes wrong:** `selectGraphRelationships` still selects without `strength`. The API returns links without the field. In the dashboard, `(l as GraphLink).strength ?? 1.0` defaults to 1.0, and all edges appear at minimum width — feature silently doesn't work.
**Why it happens:** Forgetting to update the SQL query in `statements.ts` and the `RelationshipRow` interface in `routes/graph.ts`.
**How to avoid:** Update both the SQL and the TypeScript interfaces in the same change. The `GraphData` interface in `lib/api.ts` should have `strength: number` (non-optional) so TypeScript catches missing fields at compile time.
**Warning signs:** All edges render at 1px regardless of call count. Check the network response for `/api/graph` — if `strength` is absent from link objects, the API layer is the missing piece.

### Pitfall 4: graphDataKey Stability — Strength Changes Must Not Trigger Full Remount
**What goes wrong:** If `strength` is included in the `computeGraphDataKey` computation, every strength update causes the force graph to fully remount and restart the physics simulation — graph resets on every `remember` call.
**Why it happens:** `computeGraphDataKey` in `graph-types.ts` uses node IDs and link source/target pairs. If strength were included, every change would produce a new key.
**How to avoid:** `computeGraphDataKey` must NOT include `strength` or `reinforcement_count`. The existing implementation already uses only `nodeIds` and `linkPairs` (source/target). As long as strength is only used inside `linkCanvasObject` (a render function, not a key input), this is safe. Confirmed: the existing `graphDataKey` memo does not include link properties beyond source/target identity.
**Warning signs:** Force graph simulation restarts every time strength changes — nodes scatter and re-settle after each `remember` call.

### Pitfall 5: Canvas lineWidth Needs globalScale Division
**What goes wrong:** Setting `ctx.lineWidth = strengthWidth` without dividing by `globalScale`. At high zoom levels, edges appear extremely thick; at low zoom, they look hairline thin — the intended 1–5px visual range is not maintained.
**Why it happens:** Canvas context lineWidth is in canvas coordinate units, not screen pixels. When the user zooms, `globalScale` changes but canvas unit size does not.
**How to avoid:** Always set `ctx.lineWidth = strengthWidth / globalScale`. The existing `width` calculation in `linkCanvasObject` already divides by `globalScale` — the strength formula must follow the same pattern.

---

## Code Examples

Verified patterns from the existing codebase:

### Upsert SQL (better-sqlite3 synchronous)
```typescript
// Source: packages/core/src/statements.ts (pattern from existing statements)
// Replace the insertRelationship prepared statement with:
insertRelationship: db.prepare(
  `INSERT INTO relationships (id, from_id, to_id, type, metadata, session_id, agent_id, source_type, confidence, created_at)
   VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)
   ON CONFLICT(from_id, to_id, type)
   DO UPDATE SET
     strength            = strength + 1,
     reinforcement_count = reinforcement_count + 1`
),
```

### Reading Strength Back After Upsert (for verification)
```typescript
// In test: verify strength increments correctly
const rel = db.prepare(
  `SELECT strength, reinforcement_count FROM relationships WHERE from_id = ? AND to_id = ? AND type = ?`
).get(fromId, toId, relType) as { strength: number; reinforcement_count: number }
expect(rel.strength).toBe(2.0)
expect(rel.reinforcement_count).toBe(1)
```

### Strength-Based Width in linkCanvasObject
```typescript
// Source: packages/dashboard/src/components/graph-view.tsx (extend existing linkCanvasObject)
// Linear clamp: 1px at strength=1, 5px at strength≥10
const strength = (l as GraphLink & { strength?: number }).strength ?? 1.0
const strengthWidth = Math.min(5, Math.max(1, 1 + (strength - 1) * (4 / 9)))

const width = isHoveredLink
  ? (strengthWidth + 1) / globalScale
  : strengthWidth / globalScale
```

### Strength Tooltip in Canvas (extend existing label block)
```typescript
// Source: extend the showLabel block in linkCanvasObject (~line 714)
if (showLabel && l.type) {
  // ... existing type label rendering ...

  // Strength sub-label below the type label
  const reinforcementCount = (l as GraphLink & { reinforcement_count?: number }).reinforcement_count ?? 0
  if (strength > 1.0) {
    const strengthLabel = `Strength: ${strength.toFixed(0)} (reinforced ${reinforcementCount}×)`
    const sLabelY = cpY + fontSize + pad * 2 + 2 / globalScale
    const sTextWidth = ctx.measureText(strengthLabel).width
    const sFontSize = Math.max(7 / globalScale, 2)
    ctx.font = `400 ${sFontSize}px ui-sans-serif, system-ui, sans-serif`
    ctx.fillStyle = hexToRgba(srcColor, 0.6)
    ctx.fillText(strengthLabel, cpX, sLabelY)
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `INSERT OR IGNORE` (current) | `INSERT ... ON CONFLICT DO UPDATE` | SQLite upsert syntax available since SQLite 3.24.0 (2018); better-sqlite3 12.8.0 ships SQLite 3.51.3 |
| Separate existence check + update | Single atomic upsert | Eliminates race condition; simpler code |

---

## Open Questions

1. **Project-filtered graph endpoint and strength**
   - What we know: `routes/graph.ts` has a project-filter code path (lines 42-53) that filters relationships in JavaScript after fetching all of them via `stmts.selectGraphRelationships.all()`
   - What's unclear: If `selectGraphRelationships` is updated to include `strength` in the SELECT, the project-filter path automatically inherits the change — no separate action needed
   - Recommendation: Confirm by inspection that the project-filter path uses the same `RelationshipRow` type as the non-filtered path (it does — line 51)

2. **Relationship direction and strength: is A→B strength the same as B→A?**
   - What we know: `UNIQUE(from_id, to_id, type)` is directional — `(A, B, type)` and `(B, A, type)` are different rows
   - What's unclear: If `remember` is called once with A→B and once with B→A for the same conceptual relationship, they will be separate rows with separate strength counters
   - Recommendation: This is correct existing behavior — no change needed. The upsert only increments strength when the exact same (from_id, to_id, type) is re-asserted.

---

## Environment Availability

Step 2.6: SKIPPED — this phase modifies existing TypeScript/SQL code only. No new external tools, services, databases, or CLI utilities are required.

---

## Sources

### Primary (HIGH confidence)
- `packages/core/src/migrations.ts` — migration 009_relationships_strength confirms columns already exist; UNIQUE(from_id, to_id, type) confirmed in 001_baseline
- `packages/core/src/types.ts` — Relationship interface confirms `strength: number` and `reinforcement_count: number` already defined
- `packages/core/src/statements.ts` — `insertRelationship` uses INSERT OR IGNORE; `selectGraphRelationships` omits strength columns
- `packages/mcp-server/src/tools.ts` — `rememberEntity` function, relationship insertion at lines 180 and 941
- `packages/dashboard/src/components/graph-view.tsx` — `linkCanvasObject` implementation, existing `width` formula at lines 676-679
- `packages/api-server/src/routes/graph.ts` — `RelationshipRow` interface, links mapping

### Secondary (MEDIUM confidence)
- SQLite documentation: `INSERT INTO ... ON CONFLICT ... DO UPDATE` syntax available since SQLite 3.24.0; better-sqlite3 12.8.0 ships SQLite 3.51.3 (confirmed in CLAUDE.md stack table)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all stack choices are locked by CLAUDE.md; no new dependencies
- Architecture: HIGH — migration columns already exist, UNIQUE constraint confirmed, existing code patterns directly observable
- Pitfalls: HIGH — derived from direct code inspection of the exact files being modified
- Dashboard rendering: HIGH — `linkCanvasObject` fully read; existing width formula confirmed

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable — no external dependencies)
