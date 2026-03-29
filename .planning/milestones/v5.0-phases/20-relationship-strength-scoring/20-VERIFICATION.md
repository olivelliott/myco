---
phase: 20-relationship-strength-scoring
verified: 2026-03-27T23:10:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 20: Relationship Strength Scoring Verification Report

**Phase Goal:** Every relationship in the knowledge graph carries a strength score that grows each time it is reinforced by a remember call, and the dashboard graph visualizes edge weight via line thickness
**Verified:** 2026-03-27T23:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Calling remember twice with the same relationship produces strength=2.0 and reinforcement_count=1 on a single row | VERIFIED | Behavioral spot-check confirmed: upsert SQL run twice against in-memory SQLite produced row_count=1, strength=2, reinforcement_count=1 |
| 2 | The API /api/graph response includes strength and reinforcement_count in every link object | VERIFIED | `RelationshipRow` interface has both fields (graph.ts:26-27); links mapping passes `row.strength` and `row.reinforcement_count` (graph.ts:78-79); `selectGraphRelationships` SELECT includes both columns (statements.ts:467) |
| 3 | Dashboard edges render with varying line thickness proportional to strength (1px at 1, 5px at 10+) | VERIFIED | `strengthWidth` formula verified programmatically: strength=1 -> 1.000px, strength=10 -> 5.000px, clamps at 5 for strength>10 |
| 4 | Hovering a reinforced edge shows a strength tooltip below the type label | VERIFIED | Strength sub-label block exists at graph-view.tsx:751-773, guarded by `if (strength > 1)` inside `if (showLabel && l.type)`, uses `reinforcementCount` and renders "Strength: N (reinforced Nx)" |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/statements.ts` | Upsert insertRelationship with ON CONFLICT DO UPDATE, selectGraphRelationships with strength columns | VERIFIED | Lines 164-171: upsert SQL with `ON CONFLICT(from_id, to_id, type) DO UPDATE SET strength = strength + 1, reinforcement_count = reinforcement_count + 1`; line 467: SELECT includes both columns |
| `packages/api-server/src/routes/graph.ts` | RelationshipRow with strength + reinforcement_count, links mapping passes them through | VERIFIED | Interface at lines 18-28 adds both fields; links map at lines 76-80 passes `row.strength` and `row.reinforcement_count` |
| `packages/dashboard/src/lib/api.ts` | GraphData links type with strength and reinforcement_count | VERIFIED | Lines 97-98: `strength: number` and `reinforcement_count: number` added to `GraphData.links` array type |
| `packages/dashboard/src/components/graph-view.tsx` | GraphLink type with strength, strength-based width formula, hover tooltip | VERIFIED | `GraphLink` type at lines 41-42 adds optional fields; `strengthWidth` at line 681; sub-label tooltip at lines 751-773 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/core/src/statements.ts` | relationships table | ON CONFLICT upsert | WIRED | Pattern `ON CONFLICT(from_id, to_id, type)` confirmed at line 167; UNIQUE constraint confirmed in migration 001_baseline (migrations.ts:55) |
| `packages/api-server/src/routes/graph.ts` | `packages/core/src/statements.ts` | selectGraphRelationships returns strength | WIRED | `row.strength` at graph.ts:78; `selectGraphRelationships` SELECT includes `strength, reinforcement_count` at statements.ts:467 |
| `packages/dashboard/src/components/graph-view.tsx` | `packages/dashboard/src/lib/api.ts` | GraphData links carry strength to GraphLink | WIRED | `GraphData.links` has `strength: number` (api.ts:97); `GraphViewProps.links` has `strength?: number` (graph-view.tsx:53); used as `(l as GraphLink).strength ?? 1.0` at line 680 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `graph-view.tsx` | `strength` (GraphLink) | `selectGraphRelationships` SQL query in statements.ts | Yes — DB query reads the `strength` column written by upsert | FLOWING |
| `graph.ts` (API route) | `links[].strength` | `relRows` from `selectGraphRelationships` prepared statement | Yes — direct column passthrough from DB | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Upsert produces single row with strength=2.0 and reinforcement_count=1 after two inserts | node in-memory SQLite test with actual upsert SQL | row_count=1, strength=2, reinforcement_count=1 | PASS |
| strengthWidth formula: 1px at strength=1, 5px at strength=10, clamped at 5 for strength>10 | node formula evaluation | 1.000 / 5.000 / 5.000 at respective inputs | PASS |
| TypeScript compilation — core package | `npx tsc --noEmit -p packages/core/tsconfig.json` | No errors | PASS |
| TypeScript compilation — dashboard package | `npx tsc --noEmit -p packages/dashboard/tsconfig.json` | No errors | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STRENGTH-01 | 20-01-PLAN.md | Relationships have a strength score that increases when reinforced by multiple remember calls | SATISFIED | Upsert `DO UPDATE SET strength = strength + 1` in insertRelationship; migration 009_relationships_strength adds column with DEFAULT 1.0 |
| STRENGTH-02 | 20-01-PLAN.md | Strength scoring uses an upsert pattern (ON CONFLICT DO UPDATE) on the existing relationships table | SATISFIED | `ON CONFLICT(from_id, to_id, type)` targets existing UNIQUE constraint from migration 001_baseline — no new constraint required |
| STRENGTH-03 | 20-01-PLAN.md | Relationship strength is visible in query results and the dashboard graph | SATISFIED | selectGraphRelationships returns strength; /api/graph exposes it in every link; graph-view.tsx renders edge thickness 1-5px and sub-label tooltip |

No orphaned requirements — all three STRENGTH-0N IDs claimed by plan 20-01 are accounted for. REQUIREMENTS.md traceability table shows them as "Pending" (not updated post-execution), but the requirement checklist at lines 61-63 shows all three checked `[x]` — minor documentation gap only, not a code gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api-server/src/routes/graph.ts` | 5 | Pre-existing `@myco/core` missing declaration file causes TS7016 | Info | Pre-existing infrastructure debt noted in SUMMARY, unrelated to this phase. api-server package still compiles functionally via tsup; only strict mode tsc reports this. |

No blockers. The api-server TypeScript error is pre-existing (documented in SUMMARY line 100-101) and affects multiple routes package-wide, not introduced by this phase.

### Human Verification Required

#### 1. Visual edge thickness variation in browser

**Test:** Open the dashboard knowledge graph with at least two relationships where one has been remembered multiple times (strength > 1). Visually compare edge line widths.
**Expected:** Reinforced edges appear noticeably thicker than single-occurrence edges; differences become more pronounced at high zoom levels.
**Why human:** Canvas rendering cannot be verified programmatically without a headless browser harness.

#### 2. Strength tooltip visibility on hover

**Test:** In the dashboard graph, hover over a node that has a reinforced relationship (strength > 1). Look below the edge type label.
**Expected:** A sub-label appears reading "Strength: N (reinforced Nx)" in smaller font below the type pill. Single-occurrence relationships show no sub-label.
**Why human:** Canvas `drawImage`/`fillText` calls cannot be asserted without pixel inspection.

### Gaps Summary

No gaps. All four observable truths verified, all three requirements satisfied, all artifacts substantive and wired, data flows from DB through API to canvas renderer. Two items need human eye-check for the visual rendering (standard for canvas-based UI).

---

_Verified: 2026-03-27T23:10:00Z_
_Verifier: Claude (gsd-verifier)_
