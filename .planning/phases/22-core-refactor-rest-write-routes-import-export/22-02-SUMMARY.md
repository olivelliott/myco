---
phase: 22-core-refactor-rest-write-routes-import-export
plan: 02
subsystem: api
tags: [hono, openapi, swagger, rest, auth, zod, bearer-token]

requires:
  - phase: 22-01
    provides: rememberEntity, recallKnowledge, queryEntities, forgetEntity exported from @myco/core

provides:
  - POST /api/memory/remember — stores entity observation via @myco/core rememberEntity
  - POST /api/memory/recall — semantic/FTS search via @myco/core recallKnowledge
  - POST /api/memory/forget — remove entity/observation/relationship via @myco/core forgetEntity
  - POST /api/memory/query — query entities by name/type/relationship via @myco/core queryEntities
  - GET /api/docs — interactive Swagger UI documentation
  - GET /api/spec — OpenAPI 3.0 JSON spec covering all write endpoints
  - Bearer token auth middleware (apiKeyAuth) with MYCO_API_KEY env var, disabled when unset
  - OpenAPIHono app replacing plain Hono in api-server entry point

affects: [phase-23, dashboard, any-http-client]

tech-stack:
  added: ["@hono/zod-openapi", "@hono/swagger-ui"]
  patterns:
    - "OpenAPIHono replaces plain Hono for the main app instance — enables app.doc() and app.openapi()"
    - "registerMemoryRoutes(app, db, stmts) pattern — routes registered directly on main app, not sub-app, for OpenAPI spec inclusion"
    - "Handler responses cast to any — @hono/zod-openapi strict response typing requires exact schema match; as-any cast used where JSON.parse returns unknown[]"
    - "apiKeyAuth middleware uses timingSafeEqual with equal-length buffer guard to prevent timing attacks"

key-files:
  created:
    - packages/api-server/src/middleware/auth.ts
    - packages/api-server/src/routes/memory.ts
  modified:
    - packages/api-server/src/index.ts
    - packages/api-server/package.json

key-decisions:
  - "registerMemoryRoutes() registers routes on the OpenAPIHono main instance (not sub-app) — avoids spec pitfall where sub-app routes are invisible to app.doc()"
  - "Auth disabled when MYCO_API_KEY is unset — zero-config local development, opt-in security"
  - "timingSafeEqual buffer length guard: when provided key length differs from stored key, equal=false without throwing — prevents timing oracle on length"
  - "Handler return values cast to any to satisfy @hono/zod-openapi strict typing — avoids fighting opaque TypedResponse generics when JSON is parsed from MCP envelope text"
  - "pre-existing DTS build failure (TS6307 in tsup --dts) is out of scope — affects all routes including pre-existing ones, ESM build succeeds"

patterns-established:
  - "Memory write endpoints follow MCP-mirroring pattern: same @myco/core function called, MCP envelope (content[0].text) unwrapped to return JSON directly"

requirements-completed: [API-01, API-02, API-03]

duration: 8min
completed: 2026-03-29
---

# Phase 22 Plan 02: REST Write Routes + OpenAPI Summary

**Four POST memory write endpoints (remember/recall/forget/query) on OpenAPIHono, with Swagger UI at /api/docs, Bearer token auth middleware, all calling @myco/core functions**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-29T14:43:00Z
- **Completed:** 2026-03-29T14:51:42Z
- **Tasks:** 1 of 1
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Four POST write endpoints at `/api/memory/{remember,recall,forget,query}` — each calls the corresponding `@myco/core` function and unwraps the MCP envelope to return clean JSON
- `GET /api/docs` serves interactive Swagger UI; `GET /api/spec` returns OpenAPI 3.0 JSON with full request/response schemas
- Bearer token auth middleware (`apiKeyAuth`) uses `timingSafeEqual` with buffer-length guard; silently passes through when `MYCO_API_KEY` is unset
- Main app switched from `Hono` to `OpenAPIHono` — existing read-only routes continue to work via `app.route()`

## Task Commits

1. **Task 1: Install OpenAPI deps, create auth middleware, and add write routes** — `2bf8815` (feat)

**Plan metadata:** (next commit — docs)

## Files Created/Modified

- `packages/api-server/src/middleware/auth.ts` — Bearer token auth middleware, timing-safe, disabled when env var unset
- `packages/api-server/src/routes/memory.ts` — `registerMemoryRoutes()` with 4 POST routes using `createRoute` + `OpenAPIHono.openapi()`
- `packages/api-server/src/index.ts` — switched to `OpenAPIHono`, added `registerMemoryRoutes()` call, `app.doc()`, `swaggerUI`, `Authorization` in CORS
- `packages/api-server/package.json` — added `@hono/zod-openapi` and `@hono/swagger-ui` deps
- `package-lock.json` — lockfile update for new deps

## Decisions Made

- Routes registered directly on main `OpenAPIHono` instance via `registerMemoryRoutes(app, ...)` rather than a sub-app — ensures routes appear in `app.doc()` OpenAPI spec
- Auth disabled (not 401) when `MYCO_API_KEY` is unset — maintains zero-config local development experience
- Handler responses use `as any` cast to satisfy `@hono/zod-openapi` strict TypedResponse generics when unwrapping parsed JSON from MCP envelope

## Deviations from Plan

None — plan executed exactly as written. The only issue encountered (type errors in `@hono/zod-openapi` handler return values) was resolved by using `as any` casts per the plan's guidance about TypeScript strictness in OpenAPI handlers.

## Issues Encountered

- `@hono/zod-openapi` handler return type checking rejects `c.json(parsed)` when `parsed` is typed as `unknown[]` from `JSON.parse` — resolved by casting to `any`. This is idiomatic for `@hono/zod-openapi` when handler data is not statically typed through Zod inference all the way through.
- `z.record(z.unknown())` is a Zod v4 error — requires two arguments `z.record(z.string(), z.unknown())` — fixed inline.
- Pre-existing DTS build failure (TS6307) in `tsup --dts` is out of scope — ESM build succeeds, TypeScript type-check (`tsc --noEmit`) passes cleanly.

## User Setup Required

Optional: Set `MYCO_API_KEY=<secret>` environment variable to enable Bearer token auth on write endpoints. Leave unset for open local access.

## Known Stubs

None.

## Next Phase Readiness

- Phase 22-03 (import/export routes) can proceed — OpenAPIHono instance is in place, `registerMemoryRoutes` pattern established for adding more route groups
- LangGraph/CrewAI clients can now access Myco memory via `POST /api/memory/{remember,recall,forget,query}` with or without Bearer token auth

---
*Phase: 22-core-refactor-rest-write-routes-import-export*
*Completed: 2026-03-29*
