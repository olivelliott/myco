# Phase 11: Query Filters + Error Handling — Research

**Researched:** 2026-03-25
**Domain:** Hono request validation, SQL query filtering, MCP tool error formatting
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Query Filter Design**
- Recall tool accepts `entity_type` (string), `min_confidence` (number 0-1), and `limit` (number) as optional filter parameters
- Multiple filters combine with AND logic — all specified filters narrow results simultaneously
- Filters are applied as post-KNN/FTS SQL WHERE clauses — simple and effective
- Both semantic (KNN) and FTS fallback paths honor all filters equally

**Error Response Format**
- MCP tool errors return structured `{ error: string, code: string }` in JSON text content — simple and parseable
- API error responses use standard REST shape: `{ error: { message: string, code: string, status: number } }`
- Zod validation runs on API routes only — MCP SDK already validates tool inputs via its own Zod schemas
- Unknown errors wrapped in generic 500/INTERNAL_ERROR with sanitized message — never leak stack traces

**Validation Scope**
- All 5 API route groups get Zod schemas where they accept input (approvals PATCH body, entities query params, episodes query params; dashboard and graph need none currently)
- Invalid recall filter values trigger graceful degradation — warning in response metadata, not a 400 error
- Zod error messages are human-readable field-level: "entity_type must be a string"

### Claude's Discretion
- Specific Zod schema definitions and middleware placement
- Error code naming conventions (e.g., INVALID_INPUT, NOT_FOUND, INTERNAL_ERROR)
- Whether to use Hono middleware or per-route validation

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUERY-01 | recall tool accepts optional entity_type filter parameter | SQL WHERE clause added post-KNN/FTS; query-time prepared statements in recallKnowledge() |
| QUERY-02 | recall tool accepts optional min_confidence filter parameter | Same SQL WHERE path as QUERY-01; entities.confidence column already exists |
| QUERY-03 | recall tool accepts optional project filter parameter | Filtered on entities.project column — NOTE: project column does not exist until Phase 12; implementation must be deferred or use graceful no-op |
| QUERY-04 | All query filters use parameterized SQL (no string interpolation) | Query-time db.prepare() with bound params; same STMT-02 exception pattern already used in queryEntities() |
| ERR-01 | API routes validate input with Zod schemas | @hono/zod-validator 0.5.0 already installed in api-server; zValidator middleware with custom hook |
| ERR-02 | API routes return structured error responses with status codes | Hono onError() global handler + zValidator hook returning `{ error: { message, code, status } }` |
| ERR-03 | MCP tool errors follow consistent format | try/catch wrappers in tool handlers returning `{ content: [{ type: 'text', text: JSON.stringify({ error, code }) }] }` |
</phase_requirements>

---

## Summary

Phase 11 covers two orthogonal concerns: adding typed filter parameters to the `recall` MCP tool, and making all API routes and MCP tools return consistently-shaped errors. Neither change requires schema migrations — both are pure code changes.

The filter work extends `recallKnowledge()` in `tools.ts` to accept `entity_type`, `min_confidence`, and `limit` as optional params, and applies them as parameterized SQL WHERE clauses appended after the KNN/FTS results are joined with entity data. Because `knnSearchObservations` and `ftsSearchObservations` are pre-compiled prepared statements (from Phase 10), adding filters requires either query-time `db.prepare()` calls (the STMT-02 exception pattern already used in `queryEntities()`) or separate pre-compiled statement variants. Query-time preparation is simpler and already precedented in the codebase.

**QUERY-03 flag:** The `project` filter column does not exist until Phase 12. QUERY-03 should be implemented as a graceful no-op (warning in metadata, filter silently skipped) so Phase 11 code compiles and passes without breaking Phase 12's schema migration.

The error handling work has two parts: API routes (Hono + `@hono/zod-validator`) and MCP tools (try/catch in handler closures). `@hono/zod-validator` version 0.5.0 is already installed in `packages/api-server`. The library's third argument to `zValidator()` is an optional hook — without it, validation failures return the raw Zod error object at HTTP 400. With a hook, the response shape can be locked to `{ error: { message, code, status } }`. A global `app.onError()` handler in `index.ts` catches uncaught route errors (DB failures, etc.) and wraps them in the same shape with `500/INTERNAL_ERROR`.

**Primary recommendation:** Use query-time `db.prepare()` for filtered recall queries (STMT-02 exception pattern), use `zValidator` with a custom error hook for API routes, and wrap every MCP tool handler in a try/catch returning `{ error, code }` in the content array.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.3.6 | Schema validation for filter params and API inputs | Already project dep (MCP SDK peer dep); v4 used throughout |
| `@hono/zod-validator` | 0.5.0 | Hono middleware integrating Zod validation | Already in `packages/api-server` deps |
| `hono` | 4.7.5 | HTTP framework with built-in `onError()` hook | Already in use; `app.onError()` is the global error catcher |

**No new packages required for this phase.**

### Version Verification

Confirmed from `packages/api-server/package.json` (read directly from source):
- `@hono/zod-validator`: `^0.5.0`
- `hono`: `^4.7.5`
- `zod`: `^4.3.6` (in `packages/mcp-server`, which `@myco/core` depends on)

---

## Architecture Patterns

### Pattern 1: zValidator with custom error hook (API routes)

`@hono/zod-validator`'s `zValidator(target, schema, hook?)` accepts an optional third argument. The hook receives `{ data, success, error }` and a Hono context `c`. If the hook returns a `Response`, that response is sent instead of the default 400 + raw Zod error.

```typescript
// Source: node_modules/@hono/zod-validator/dist/index.js (read from repo)
// Pattern: custom hook to shape error response
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const entitiesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
});

app.get(
  '/',
  zValidator('query', entitiesQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            message: result.error.issues[0]?.message ?? 'Invalid query parameters',
            code: 'INVALID_INPUT',
            status: 400,
          },
        },
        400,
      );
    }
  }),
  (c) => {
    const { limit, offset } = c.req.valid('query');
    // handler with typed, validated params
  },
);
```

**Key detail:** Without the hook, `zValidator` returns `c.json(result, 400)` where `result` is the raw `SafeParseReturnType` object — not the structured format decided in CONTEXT.md. The hook is required for spec-compliant error shapes.

**Key detail:** For query params, use `z.coerce.number()` not `z.number()` — query strings are always strings, coercion converts `"50"` to `50` before validation.

### Pattern 2: Global Hono onError handler (API server)

Hono provides `app.onError(handler)` which catches any error thrown inside a route handler that isn't caught locally. Register it once in `packages/api-server/src/index.ts`:

```typescript
// Source: Hono docs pattern (verified against Hono 4.x API)
app.onError((err, c) => {
  console.error('[api-server] unhandled error:', err);
  return c.json(
    {
      error: {
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
        status: 500,
      },
    },
    500,
  );
});
```

This must be registered **before** `app.route()` calls to ensure it catches all routes. Stack traces are logged to stderr (MCP convention) but never returned to the caller.

### Pattern 3: MCP tool error wrapping

MCP tools currently have no try/catch. Any unhandled exception propagates to the MCP SDK, which surfaces an unstructured error to the caller. The decided format is `{ error: string, code: string }` returned as JSON text content:

```typescript
// Pattern: wrap tool handler body in try/catch
server.registerTool('recall', schema, async (params) => {
  try {
    return await recallKnowledge(db, params, stmts);
  } catch (err) {
    console.error('[recall] tool error:', err);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'An unexpected error occurred',
          code: 'INTERNAL_ERROR',
        }),
      }],
    };
  }
});
```

The inner function (`recallKnowledge`, `rememberEntity`, etc.) is **not** changed — only the tool registration closures in `registerTools()` get try/catch wrappers. This keeps the core functions independently testable.

### Pattern 4: Query-time filtered recall (QUERY-01, QUERY-02)

The existing `knnSearchObservations` prepared statement has no WHERE clause on entity columns. Since filters change the SQL structure (optional WHERE clauses), query-time `db.prepare()` follows the same STMT-02 exception pattern already used in `queryEntities()`:

```typescript
// Pattern: dynamic WHERE for recall filters — STMT-02 exception
export async function recallKnowledge(
  db: Database.Database,
  params: { query: string; limit: number; entity_type?: string; min_confidence?: number },
  stmts: MycoStatements,
): Promise<RecallResult> {
  const { query, limit, entity_type, min_confidence } = params;

  const queryEmbedding = await embedText(query);

  if (queryEmbedding !== null) {
    const queryVec = new Float32Array(queryEmbedding);
    // Base KNN — always runs with fixed params
    const knnRows = stmts.knnSearchObservations.all(queryVec, limit * 3) as RecallRow[];

    // Apply filters in-memory after KNN (simplest approach for small result sets)
    // OR use query-time prepared statement for SQL filtering
    const conditions: string[] = [];
    const filterParams: unknown[] = [];

    if (entity_type !== undefined) {
      conditions.push('e.type = ?');
      filterParams.push(entity_type);
    }
    if (min_confidence !== undefined) {
      conditions.push('o.confidence >= ?');
      filterParams.push(min_confidence);
    }

    // If no filters, use existing prepared statement path
    if (conditions.length === 0) {
      // ... existing logic
    } else {
      // Query-time prepare with parameterized WHERE (STMT-02 exception)
      const whereClause = `AND ${conditions.join(' AND ')}`;
      const filteredStmt = db.prepare(`
        WITH knn AS (
          SELECT item_id, distance FROM vec_embeddings
          WHERE embedding MATCH ? AND k = ? AND item_type = 'observation'
        )
        SELECT o.id AS observation_id, o.content, o.confidence,
               e.name AS entity_name, e.type AS entity_type,
               knn.distance AS relevance_score
        FROM knn
        JOIN observations o ON o.id = knn.item_id
        JOIN entities e ON e.id = o.entity_id
        WHERE 1=1 ${whereClause}
        ORDER BY knn.distance
      `);
      const rows = filteredStmt.all(queryVec, limit, ...filterParams) as RecallRow[];
      // ...
    }
  }
}
```

**Important:** `better-sqlite3` does not support re-using prepared statements with different parameter counts. Each unique filter combination needs its own `db.prepare()` call. This is already established as acceptable by the STMT-02 exception — the key constraint (QUERY-04) is that no string values are interpolated; all filter values are bound parameters.

### Pattern 5: QUERY-03 graceful no-op

The `project` column does not exist until Phase 12. If QUERY-03 is included in Phase 11's scope, the implementation must be a graceful degradation rather than a real filter:

```typescript
// If project filter requested but column doesn't exist yet: warn in metadata
if (project !== undefined) {
  metadata.warnings = metadata.warnings ?? [];
  metadata.warnings.push('project filter is not yet supported — will be enabled in a future update');
}
```

Alternatively, QUERY-03 can be deferred to Phase 12 entirely. The REQUIREMENTS.md traceability table maps QUERY-03 to Phase 11, but since Phase 12 adds the column, implementing it in Phase 12 alongside NS-01 through NS-04 is a clean alternative. The planner should decide.

### Recommended Project Structure (changes only)

```
packages/
├── mcp-server/src/
│   └── tools.ts              # recallKnowledge() signature extended; registerTools() gets try/catch
├── api-server/src/
│   ├── index.ts              # app.onError() global handler added
│   └── routes/
│       ├── approvals.ts      # zValidator hook added to PATCH /:id (schema already exists)
│       ├── entities.ts       # zValidator added to GET / (limit/offset query params)
│       └── episodes.ts       # zValidator added to GET / (limit query param)
```

`dashboard.ts` and `graph.ts` accept no input — no changes needed (confirmed by reading source).

### Anti-Patterns to Avoid

- **String interpolation of filter values:** Never `WHERE e.type = '${entity_type}'`. Always use `?` bound params, even for strings. This is QUERY-04.
- **Raw Zod error in API response:** `zValidator` without a hook returns the full Zod `SafeParseError` object. This leaks internal schema structure. Always use the hook to control response shape.
- **Catching errors inside `recallKnowledge()` or `rememberEntity()`:** Wrap at the tool registration layer, not inside business logic functions. Business functions should throw freely; tool closures catch and format.
- **Stack traces in error responses:** Log to `console.error` (stderr, MCP convention), return sanitized message to caller.
- **400 for invalid recall filter values:** The decision is graceful degradation (warning in metadata), not error. Don't reject an otherwise valid recall query because `entity_type` has an unexpected value.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request body/query validation | Manual `if (!body.status)` checks | `zValidator` with Zod schema | Already in codebase (approvals.ts line 36); consistent, type-safe, produces typed `c.req.valid()` |
| JSON error shape enforcement | Per-route error constructors | `zValidator` hook + `app.onError()` | Single place to define shape; routes just throw or return errors |
| Query param type coercion | `parseInt(limitParam, 10)` + NaN checks | `z.coerce.number()` in Zod schema | `entities.ts` and `episodes.ts` currently do manual coerce+NaN-check; Zod handles this cleanly |

---

## Common Pitfalls

### Pitfall 1: zValidator without hook dumps raw Zod error

**What goes wrong:** `zValidator('json', schema)` without a third argument returns `c.json(result, 400)` where `result` is the `SafeParseReturnType` object. This has shape `{ success: false, error: { issues: [...], ... } }` — not the decided `{ error: { message, code, status } }` shape.

**Why it happens:** `@hono/zod-validator` defaults to raw Zod error for simplicity. The custom hook opt-in is needed for shaped responses.

**How to avoid:** Always pass the third argument to `zValidator`. A shared `validationErrorHook` function can be defined once and imported in each route file.

**Warning signs:** API returns `{ "success": false, "error": { "issues": [...] } }` instead of `{ "error": { "message": "...", "code": "INVALID_INPUT", "status": 400 } }`.

### Pitfall 2: z.number() rejects query string params

**What goes wrong:** Query parameters are always strings. `z.number()` on a query param schema will always fail validation because `"50"` is not a number.

**Why it happens:** Zod doesn't auto-coerce by default for `z.number()`.

**How to avoid:** Use `z.coerce.number()` for any query parameter that should be numeric. Already evidenced by the manual `parseInt()` calls in `entities.ts` and `episodes.ts`.

**Warning signs:** Valid requests like `GET /api/entities?limit=50` return 400 validation errors.

### Pitfall 3: Prepared statement parameter count mismatch

**What goes wrong:** `better-sqlite3` prepared statements bind to a fixed number of `?` placeholders. Calling `.all(queryVec, limit, entity_type)` on a statement with only 2 placeholders throws a runtime error.

**Why it happens:** Filter-aware queries have a variable number of bound params (0, 1, or 2 filter values).

**How to avoid:** Use the STMT-02 exception pattern — build the SQL string with conditions, call `db.prepare()` at query time, then `.all()`. No string interpolation of values — only structural SQL fragments (column names, operators) are interpolated.

**Warning signs:** `TypeError: Expected X arguments, got Y` from better-sqlite3 at runtime.

### Pitfall 4: MCP tool errors propagating as unhandled exceptions

**What goes wrong:** An unhandled throw inside a tool handler reaches the MCP SDK. The SDK may surface it as a non-`CallToolResult`, causing the Claude client to receive an opaque error rather than structured text content.

**Why it happens:** Current tool handlers have no try/catch (confirmed by reading tools.ts — only `resolve_approval` has inline not-found/conflict checks, no generic catch).

**How to avoid:** Every `registerTool` handler closure gets a top-level `try/catch` that returns `{ content: [{ type: 'text', text: JSON.stringify({ error: '...', code: 'INTERNAL_ERROR' }) }] }`.

### Pitfall 5: QUERY-03 project filter crashing at runtime

**What goes wrong:** If `recallKnowledge()` builds a WHERE clause referencing `e.project` before Phase 12 adds that column, the SQL query throws `no such column: e.project` at runtime.

**Why it happens:** Phase 12 adds the column; Phase 11 runs before it.

**How to avoid:** Either defer QUERY-03 entirely to Phase 12, or implement it as a graceful no-op that warns in metadata without referencing the column.

---

## Code Examples

### Shared validation error hook

```typescript
// Source: inferred from @hono/zod-validator source (read from node_modules)
// packages/api-server/src/validation.ts — shared helper
import type { Context } from 'hono';
import type { ZodError } from 'zod';

export function validationErrorHook(
  result: { success: false; error: ZodError } | { success: true; data: unknown },
  c: Context,
) {
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    return c.json(
      {
        error: {
          message: firstIssue?.message ?? 'Invalid request',
          code: 'INVALID_INPUT',
          status: 400,
        },
      },
      400 as const,
    );
  }
}
```

### Approvals PATCH — hook on existing zValidator

The `approvals.ts` route already has `zValidator('json', resolveSchema)` at line 36. This needs the hook added:

```typescript
// Before (line 36 in approvals.ts):
app.patch('/:id', zValidator('json', resolveSchema), (c) => {

// After:
app.patch('/:id', zValidator('json', resolveSchema, validationErrorHook), (c) => {
```

### Entities GET / — replace manual parseInt with Zod

```typescript
// Current (entities.ts lines 18-23): manual parseInt + isNaN + Math.min/max
// Replace with:
const entitiesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
});

app.get('/', zValidator('query', entitiesQuerySchema, validationErrorHook), (c) => {
  const { limit, offset } = c.req.valid('query');
  // limit and offset are now typed numbers, no parseInt needed
```

### Recall tool — extended signature

```typescript
// tools.ts — updated recall tool registration
server.registerTool(
  'recall',
  {
    description: 'Retrieve relevant knowledge from Myco using natural language',
    inputSchema: {
      query: z.string().describe('Natural language query'),
      limit: z.number().default(10).describe('Max results to return'),
      entity_type: z.string().optional().describe('Filter by entity type (e.g. "technology", "person")'),
      min_confidence: z.number().min(0).max(1).optional().describe('Minimum confidence score 0.0-1.0'),
    },
  },
  async ({ query, limit, entity_type, min_confidence }) => {
    try {
      return await recallKnowledge(db, { query, limit, entity_type, min_confidence }, stmts);
    } catch (err) {
      console.error('[recall] tool error:', err);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Recall failed', code: 'INTERNAL_ERROR' }) }],
      };
    }
  },
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod v3 error format | Zod v4 error format | v4 release 2025 | `error.issues` shape same; `ZodError` import path unchanged for Hono integration |
| `@hono/zod-validator` auto-format | Custom hook for error shape | Unchanged — hook always existed | Hook is the right pattern; no version bump needed |

---

## Open Questions

1. **QUERY-03 scope: Phase 11 no-op or defer to Phase 12?**
   - What we know: `project` column doesn't exist until Phase 12 (NS-01). Implementing a real filter would crash.
   - What's unclear: REQUIREMENTS.md maps QUERY-03 to Phase 11, but the column dependency is Phase 12.
   - Recommendation: Implement as graceful no-op in Phase 11 (accepts param, warns in metadata, ignores it). Full implementation in Phase 12 when NS-01 adds the column. This satisfies QUERY-03 at the schema level without breaking anything.

2. **Error code naming convention**
   - What we know: CONTEXT.md gives examples: `INVALID_INPUT`, `NOT_FOUND`, `INTERNAL_ERROR`
   - What's unclear: Whether to define an enum/const object for codes or use inline strings
   - Recommendation: Define a `const ErrorCode` object in a shared `packages/api-server/src/errors.ts` file. Keeps codes consistent across all 5 route files and the global handler.

3. **MCP tool error wrapping: wrap inner functions or only tool closures?**
   - What we know: `rememberEntity`, `recallKnowledge`, `queryEntities`, `logEpisode` are exported and tested directly in `server.test.ts`
   - What's unclear: Whether errors from these functions should ever surface differently from tool-level errors
   - Recommendation: Wrap only at the `registerTool` handler closure level. Inner functions stay unwrapped and throw naturally — they're already tested without error wrapping in `server.test.ts`.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all changes are code/config in existing packages with already-installed libraries)

---

## Sources

### Primary (HIGH confidence)
- `packages/api-server/src/routes/approvals.ts` — confirms `@hono/zod-validator` already in use at line 36
- `packages/api-server/src/routes/entities.ts` — confirms manual parseInt pattern that Zod replaces
- `packages/mcp-server/src/tools.ts` — confirms `recallKnowledge()` current signature at line 172
- `packages/core/src/statements.ts` — confirms `knnSearchObservations` and `ftsSearchObservations` statement shapes
- `node_modules/@hono/zod-validator/dist/index.js` — confirms hook API and default 400 behavior

### Secondary (MEDIUM confidence)
- `packages/api-server/package.json` — confirmed `@hono/zod-validator@^0.5.0` installed
- `packages/mcp-server/package.json` — confirmed `zod@^4.3.6` installed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, read from package.json directly
- Architecture: HIGH — patterns inferred from reading actual source code; `zValidator` hook behavior confirmed from node_modules source
- Pitfalls: HIGH — derived from direct code reading (parseInt pattern, no try/catch in tools, STMT-02 precedent)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable libraries, code-reading-based findings don't expire)
