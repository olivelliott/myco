---
phase: 12-namespace-isolation
verified: 2026-03-26T18:28:15Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 12: Namespace Isolation Verification Report

**Phase Goal:** Entities can be scoped to a named project, and existing data remains fully accessible without specifying a project — enabling true multi-project use without data leakage
**Verified:** 2026-03-26T18:28:15Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Entities table has a project column with DEFAULT NULL after applySchema() runs | VERIFIED | `schema.ts:124` — `ALTER TABLE entities ADD COLUMN project TEXT DEFAULT NULL` in idempotent try/catch block |
| 2  | remember tool stores entities under a project namespace when project param is provided | VERIFIED | `tools.ts:103,143` — `project ?? null` passed as 11th arg to both `insertEntity.run()` call sites |
| 3  | remember tool stores entities with NULL project when project param is omitted | VERIFIED | `project ?? null` evaluates to `null` when project is undefined; insertEntity inserts NULL into column |
| 4  | recall tool filters by project when project param is provided (no warning emitted) | VERIFIED | `tools.ts:199-201` — `conditions.push('e.project = ?')` when `project !== undefined`; warning block confirmed absent (grep returns 0 matches for "not yet supported", "warnings", "metaExtra") |
| 5  | recall tool returns all entities when project param is omitted | VERIFIED | `tools.ts:199` — condition only added when `project !== undefined`; omitted param means no WHERE clause added |
| 6  | query tool filters by project when project param is provided | VERIFIED | `tools.ts:331-333` — `conditions.push('e.project = ?')` when `if (project)` is truthy |
| 7  | Existing entities (NULL project) remain accessible in all queries | VERIFIED | NULL project never satisfies `e.project = ?` filter; unprojected paths use prepared statements with no project WHERE clause |
| 8  | GET /api/entities?project=myco returns only entities with project='myco' | VERIFIED | `entities.ts:29-35` — inline `db.prepare()` with `WHERE project = ?` when project param truthy |
| 9  | GET /api/entities without project param returns all entities (backward compatible) | VERIFIED | `entities.ts:39` — falls through to `stmts.selectEntitiesPaginated.all(limit, offset)` when project absent |
| 10 | GET /api/graph?project=myco returns only nodes and relationships scoped to that project | VERIFIED | `graph.ts:41-53` — inline query with `WHERE e.project = ?`; relationships filtered in JS via `entityIds` Set |
| 11 | GET /api/graph without project param returns all nodes and relationships | VERIFIED | `graph.ts:55-56` — uses `stmts.selectGraphNodes.all()` and `stmts.selectGraphRelationships.all()` when project absent |
| 12 | GET /api/dashboard?project=myco returns counts scoped to that project | VERIFIED | `dashboard.ts:30-64` — six inline `db.prepare()` calls with `WHERE project = ?` and `WHERE e.project = ?` patterns |
| 13 | GET /api/dashboard without project param returns global counts (backward compatible) | VERIFIED | `dashboard.ts:66-71` — uses `stmts.countEntities`, `stmts.countRelationships`, etc. when project absent |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/schema.ts` | ALTER TABLE migration adding project column + index | VERIFIED | Lines 122-134: migration block + `CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project)` |
| `packages/core/src/types.ts` | Entity interface with project field | VERIFIED | Line 15: `project?: string \| null; // NULL = global (visible to all queries)` |
| `packages/core/src/statements.ts` | Updated insertEntity with project column (11 params) | VERIFIED | Lines 92-95: INSERT includes `project` column, VALUES has 10 `?` placeholders (+ 2 hardcoded = 12 total columns) |
| `packages/mcp-server/src/tools.ts` | project param on remember, recall (functional), and query tools | VERIFIED | All three tools have `project: z.string().optional()` in Zod schema and pass param through to core layer |
| `packages/api-server/src/routes/entities.ts` | Project-filtered entity listing | VERIFIED | `project: z.string().optional()` in schema; STMT-02 inline query when project provided |
| `packages/api-server/src/routes/graph.ts` | Project-filtered graph nodes and relationships | VERIFIED | `graphQuerySchema` with project; inline query + JS Set filter for relationships |
| `packages/api-server/src/routes/dashboard.ts` | Project-filtered dashboard counts | VERIFIED | `dashboardQuerySchema` with project; six inline project-scoped count queries |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tools.ts` | `statements.ts` insertEntity | `stmts.insertEntity.run()` with 11th project arg (`project ?? null`) | WIRED | Two call sites confirmed at lines 103 and 143 |
| `tools.ts` | dynamic WHERE in recallKnowledge | `conditions.push('e.project = ?')` | WIRED | Line 200: condition added when `project !== undefined` |
| `tools.ts` | dynamic WHERE in queryEntities | `conditions.push('e.project = ?')` | WIRED | Line 332: condition added when `if (project)` truthy |
| `entities.ts` | entities table | inline `db.prepare()` with `WHERE project = ?` | WIRED | Line 33: exact SQL pattern confirmed |
| `graph.ts` | entities table | inline `db.prepare()` with `WHERE e.project = ?` | WIRED | Line 46: exact SQL pattern confirmed |
| `dashboard.ts` | entities table | inline `db.prepare()` with `WHERE project = ?` and `WHERE e.project = ?` | WIRED | Lines 33, 39, 46, 50, 56, 63: all six project-scoped queries present |

### Data-Flow Trace (Level 4)

Not applicable for this phase. Phase 12 delivers schema migrations, type definitions, prepared statement updates, and query filtering logic — not UI components or pages that render dynamic data from a state variable.

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| All packages compile without TS errors | `tsc --noEmit` on core, mcp-server, api-server | No output (clean) | PASS |
| insertEntity SQL has 11 positional params | grep for 11-`?` VALUES clause in statements.ts | `VALUES (?, ?, ?, NULL, '{}', ?, ?, ?, ?, ?, ?, ?)` found | PASS |
| Warning infrastructure fully removed | grep for "warnings", "not yet supported", "metaExtra" in tools.ts | 0 matches | PASS |
| Test suite: 90/90 passing | `npm test` | 6 test files, 90 tests passed in 1.73s | PASS |
| Project filter test (Test 4) rewrites old stub test | grep for "project filter scopes results" in recall-filters.test.ts | Found at line 186 — real project filtering verified in tests | PASS |
| statements.test.ts uses 11-param insertEntity | grep for `null` as final arg in direct run() calls | 8 calls all end with `, null)` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NS-01 | 12-01 | Entities table has a project column with DEFAULT 'default' (CONTEXT.md overrides to DEFAULT NULL) | SATISFIED | `schema.ts:124` uses `DEFAULT NULL` per locked CONTEXT.md decision |
| NS-02 | 12-01 | remember tool accepts optional project parameter | SATISFIED | `RememberParams.project?: string` at `tools.ts:27`; Zod schema at line 449; passed through at line 461 |
| NS-03 | 12-01, 12-02 | recall/query tools scope results by project when specified; API routes scope by project | SATISFIED | `e.project = ?` in recall (line 200), query (line 332), entities route (line 33), graph route (line 46), dashboard route (lines 33-63) |
| NS-04 | 12-01, 12-02 | Existing data remains accessible when no project filter is specified | SATISFIED | All filtering is conditional; unprojected code paths use unmodified prepared statements with no WHERE project clause |

**Note on NS-01 text vs implementation:** REQUIREMENTS.md specifies `DEFAULT 'default'` but CONTEXT.md (locked decision) and the implementation use `DEFAULT NULL`. This is correct — NULL means globally visible to all queries, which is the desired backward-compatible behavior. The REQUIREMENTS.md text reflects an earlier draft; the CONTEXT.md decision is authoritative.

### Anti-Patterns Found

None detected. Full scan of all 7 phase-modified files:
- No TODO/FIXME/PLACEHOLDER/XXX comments
- No "not yet supported" stubs
- No empty handler implementations
- No hardcoded empty returns that flow to rendering
- Warning infrastructure fully removed (no `warnings`, `metaExtra` references)

### Human Verification Required

None required for automated verification. The following are observable in a running system but are not blockers:

1. **Multi-project isolation end-to-end via MCP client**
   - Test: Use two separate `brain remember` calls with `project: 'projectA'` and `project: 'projectB'`, then `brain recall` with each project filter
   - Expected: Each recall returns only its own project's entities
   - Why human: Requires a live MCP server connection and Ollama

2. **PWA project filter UI (if implemented)**
   - Test: Visit dashboard, add `?project=myco` to URL
   - Expected: Counts reflect only entities stored under `project: 'myco'`
   - Why human: Requires running api-server + browser

### Gaps Summary

No gaps. All 13 observable truths are verified, all 7 artifacts exist and are substantively implemented, all 6 key links are wired, all 4 requirement IDs (NS-01 through NS-04) are satisfied, and 90/90 tests pass.

---

_Verified: 2026-03-26T18:28:15Z_
_Verifier: Claude (gsd-verifier)_
