---
phase: 06-rename
verified: 2026-03-22T17:30:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 06: Rename Verification Report

**Phase Goal:** Every reference to "ai-workbots" or "AI Workbots Brain" in the codebase is replaced with "myco" or "Myco"
**Verified:** 2026-03-22T17:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                    | Status     | Evidence                                                                                 |
|----|--------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------|
| 1  | All four package.json files use @myco/* package names                    | VERIFIED   | All 5 package.json names confirmed: myco, @myco/core, @myco/mcp-server, @myco/api-server, @myco/dashboard |
| 2  | Cross-package imports resolve to @myco/core                              | VERIFIED   | All 9 source files importing across packages use `from '@myco/core'`                    |
| 3  | MCP server binary is 'myco' and CLI binary is 'myco-cli'                 | VERIFIED   | mcp-server/package.json bin: `"myco": "./dist/index.js"`, `"myco-cli": "./dist/cli.js"` |
| 4  | Default database path uses ~/.local/share/myco/                          | VERIFIED   | packages/core/src/db.ts line 10: `path.join(xdgData, 'myco', 'brain.db')`              |
| 5  | MCP server identifies as 'myco' not 'ai-workbots-brain'                  | VERIFIED   | packages/mcp-server/src/index.ts line 21: `name: 'myco'`                                |
| 6  | Tool descriptions reference 'Myco' not 'brain'                           | VERIFIED   | tools.ts lines 389, 436: "Store a piece of knowledge in Myco.", "Retrieve relevant knowledge from Myco" |
| 7  | BRAIN_DB_PATH is still accepted as fallback, MYCO_DB_PATH is primary     | VERIFIED   | db.ts line 14: `process.env.MYCO_DB_PATH ?? process.env.BRAIN_DB_PATH ?? getDefaultDbPath()` |
| 8  | Dashboard PWA manifest shows 'Myco' as app name                          | VERIFIED   | vite.config.ts: `name: 'Myco'`, `short_name: 'Myco'`                                   |
| 9  | Dashboard title bar shows 'Myco' not 'Brain Dashboard'                   | VERIFIED   | index.html: `<title>Myco</title>`                                                        |
| 10 | Dashboard sidebar shows 'Myco' not 'Brain'                               | VERIFIED   | sidebar.tsx line 38: `Myco`                                                              |
| 11 | Dashboard heading shows 'Myco Dashboard'                                 | VERIFIED   | routes/index.tsx line 21: `Myco Dashboard`                                               |
| 12 | GSD hook uses new myco directory path with BRAIN_DB_PATH fallback        | VERIFIED   | hook line 24: `MYCO_DB_PATH \|\| BRAIN_DB_PATH`, line 28: `path.join(xdgData, 'myco', 'brain.db')` |
| 13 | All three test files use @myco/core, MYCO_DB_PATH, and myco paths        | VERIFIED   | db.test.ts: MYCO_DB_PATH primary + BRAIN_DB_PATH fallback test; server.test.ts: @myco/core; gsd-episode.test.ts: MYCO_DB_PATH primary |
| 14 | Zero remaining references to ai-workbots, brain-mcp, brain-cli in source | VERIFIED   | Comprehensive grep across all .ts/.tsx/.js/.json/.md/.html files outside .planning/ and dist/ returned no matches |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact                                              | Expected                                          | Status     | Details                                                 |
|-------------------------------------------------------|---------------------------------------------------|------------|---------------------------------------------------------|
| `package.json`                                        | Root workspace package name "myco"                | VERIFIED   | `"name": "myco"`                                        |
| `packages/core/package.json`                          | @myco/core package identity                       | VERIFIED   | `"name": "@myco/core"`                                  |
| `packages/mcp-server/package.json`                    | @myco/mcp-server with myco/myco-cli binaries      | VERIFIED   | Name @myco/mcp-server, bins myco + myco-cli             |
| `packages/api-server/package.json`                    | @myco/api-server package identity                 | VERIFIED   | `"name": "@myco/api-server"`, dep `@myco/core: "*"`     |
| `packages/dashboard/package.json`                     | @myco/dashboard package identity                  | VERIFIED   | `"name": "@myco/dashboard"`                             |
| `packages/core/src/db.ts`                             | Database path using myco directory, dual env vars | VERIFIED   | myco dir path, MYCO_DB_PATH primary, BRAIN_DB_PATH fallback |
| `packages/mcp-server/src/index.ts`                    | MCP server named myco                             | VERIFIED   | `name: 'myco'`, import from @myco/core                  |
| `packages/dashboard/vite.config.ts`                   | PWA manifest with Myco branding                   | VERIFIED   | name: 'Myco', short_name: 'Myco'                        |
| `packages/dashboard/index.html`                       | HTML title with Myco                              | VERIFIED   | `<title>Myco</title>`                                   |
| `packages/dashboard/src/routes/index.tsx`             | Dashboard heading with Myco                       | VERIFIED   | "Myco Dashboard" h1                                     |
| `packages/dashboard/src/components/sidebar.tsx`       | Sidebar branding with Myco                        | VERIFIED   | "Myco" in sidebar title div                             |
| `.claude/hooks/gsd-brain-episode.js`                  | DB path via getDbPath, myco dir, dual env vars    | VERIFIED   | MYCO_DB_PATH \|\| BRAIN_DB_PATH, myco default path      |
| `packages/core/tests/db.test.ts`                      | Tests using myco paths and MYCO_DB_PATH           | VERIFIED   | myco-test- prefix, MYCO_DB_PATH primary test, BRAIN_DB_PATH fallback test |
| `packages/mcp-server/tests/server.test.ts`            | Tests using @myco/core imports                    | VERIFIED   | `from '@myco/core'`, myco-mcp-test- prefix              |
| `packages/mcp-server/tests/gsd-brain-episode.test.ts` | Tests using MYCO_DB_PATH and myco paths           | VERIFIED   | MYCO_DB_PATH primary in getDbPath(), BRAIN_DB_PATH fallback preserved |

### Key Link Verification

| From                                      | To                            | Via                          | Status   | Details                                                              |
|-------------------------------------------|-------------------------------|------------------------------|----------|----------------------------------------------------------------------|
| packages/mcp-server/src/index.ts          | @myco/core                    | import statement             | WIRED    | `import { openDatabase } from '@myco/core'`                         |
| packages/api-server/src/db.ts             | @myco/core                    | import statement             | WIRED    | `import { openDatabase } from '@myco/core'`                         |
| packages/core/src/db.ts                   | ~/.local/share/myco/brain.db  | getDefaultDbPath function    | WIRED    | `path.join(xdgData, 'myco', 'brain.db')` confirmed at line 10       |
| packages/dashboard/vite.config.ts         | PWA install prompt            | manifest.name                | WIRED    | `name: 'Myco'` in VitePWA manifest config                           |
| .claude/hooks/gsd-brain-episode.js        | ~/.local/share/myco/brain.db  | getDbPath function           | WIRED    | `path.join(xdgData, 'myco', 'brain.db')` at line 28                |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                 | Status    | Evidence                                                               |
|-------------|-------------|-----------------------------------------------------------------------------|-----------|------------------------------------------------------------------------|
| REN-01      | 06-01       | All package names renamed from @ai-workbots/* to @myco/*                   | SATISFIED | All 5 package.json files confirmed with @myco/* names                 |
| REN-02      | 06-01       | All internal imports and cross-package references updated to @myco/*        | SATISFIED | 9 source files confirmed using @myco/core; zero @ai-workbots found    |
| REN-03      | 06-01       | CLI commands renamed from brain-mcp/brain-cli to myco/myco-cli              | SATISFIED | mcp-server package.json bins confirmed; cli.ts strings confirmed       |
| REN-04      | 06-01       | Default database path changed from ~/.local/share/ai-workbots/ to ~/.local/share/myco/ | SATISFIED | db.ts line 10 confirmed; test assertions in db.test.ts confirmed       |
| REN-05      | 06-01       | MCP server name, tool descriptions, and user-facing strings updated to "Myco" | SATISFIED | index.ts name: 'myco'; tools.ts descriptions reference Myco; cli.ts strings updated |
| REN-06      | 06-02       | Dashboard title, branding, and PWA manifest updated to "Myco"               | SATISFIED | vite.config.ts manifest, index.html title, sidebar.tsx, routes/index.tsx all confirmed |

No orphaned requirements: REN-01 through REN-06 are all mapped to Phase 6 plans and verified present in code.

### Anti-Patterns Found

None. No TODO/FIXME markers, empty stubs, or placeholder implementations found in the renamed files. All changes are substantive string replacements that are live in the actual source.

### Human Verification Required

None required for this rename phase. All verification items are string-content checks verifiable programmatically.

The only items requiring any human judgment would be:

1. **PWA install prompt on a device** — whether the installed PWA on a phone home screen shows "Myco" as the app name. Automated checks confirm `manifest.name: 'Myco'` is in the config, but actual PWA install behavior can only be confirmed on a device.
   - Test: Build the dashboard, serve it, trigger PWA install prompt
   - Expected: Install prompt shows "Myco" as the app name
   - Why human: Requires browser + installable PWA environment

### Gaps Summary

No gaps. All 14 observable truths are verified. All 6 requirements (REN-01 through REN-06) are satisfied.

The comprehensive grep sweep confirmed zero remaining occurrences of `ai-workbots`, `@ai-workbots`, `brain-mcp`, `brain-cli`, or `AI Workbots Brain` in any `.ts`, `.tsx`, `.js`, `.json`, `.md`, or `.html` file outside the `.planning/` history directory and compiled `dist/` output.

---
_Verified: 2026-03-22T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
