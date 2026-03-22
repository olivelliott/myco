# Roadmap: Myco

## Milestones

- ✅ **v1.0 AI Workbots Brain** — Phases 1-5 (shipped 2026-03-21)
- 🚧 **v2.0 Open Source Release** — Phases 6-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 AI Workbots Brain (Phases 1-5) — SHIPPED 2026-03-21</summary>

- [x] Phase 1: Storage Foundation (2/2 plans) — completed 2026-03-20
- [x] Phase 2: MCP Server + Memory (2/2 plans) — completed 2026-03-21
- [x] Phase 3: Consolidation + Approval (3/3 plans) — completed 2026-03-21
- [x] Phase 4: REST API + PWA (5/5 plans) — completed 2026-03-21
- [x] Phase 5: GSD Integration (2/2 plans) — completed 2026-03-21

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v2.0 Open Source Release (In Progress)

**Milestone Goal:** Rename the project to Myco, clean up known tech debt, and package it for public GitHub release under Apache 2.0.

- [ ] **Phase 6: Rename** - Update all packages, imports, CLI commands, DB paths, and branding from "ai-workbots" to "myco"
- [ ] **Phase 7: Tech Debt** - Fix the episodes API mismatch, remove dead exports, and verify fresh-clone installability
- [ ] **Phase 8: Open Source Packaging** - Add LICENSE, README, CONTRIBUTING, CODE_OF_CONDUCT, and GitHub templates

## Phase Details

### Phase 6: Rename
**Goal**: Every reference to "ai-workbots" or "AI Workbots Brain" in the codebase is replaced with "myco" or "Myco"
**Depends on**: Phase 5 (v1.0 shipped)
**Requirements**: REN-01, REN-02, REN-03, REN-04, REN-05, REN-06
**Plans:** 2/3 plans executed
Plans:
- [x] 06-01-PLAN.md — Rename package identities, imports, binaries, DB path, and MCP server strings
- [x] 06-02-PLAN.md — Update dashboard branding, PWA manifest, hooks, and documentation
- [x] 06-03-PLAN.md — Update tests, rebuild, and verify zero stale references
**Success Criteria** (what must be TRUE):
  1. All four package.json files use `@myco/*` package names with no `@ai-workbots/*` references remaining
  2. All cross-package imports resolve correctly under the new `@myco/*` namespace
  3. The MCP server binary is `myco` and CLI binary is `myco-cli`; `brain-mcp` and `brain-cli` no longer exist
  4. The default database path is `~/.local/share/myco/` — no file or path references `ai-workbots`
  5. The dashboard PWA title and manifest show "Myco"; MCP server tool descriptions reference "Myco"

### Phase 7: Tech Debt
**Goal**: Known v1.0 defects are resolved and the project installs and builds cleanly from a fresh clone
**Depends on**: Phase 6
**Requirements**: DEBT-01, DEBT-02, DEBT-03
**Success Criteria** (what must be TRUE):
  1. `/api/episodes` returns a response shape that `fetchEpisodes()` in the dashboard client can parse without error
  2. The dead `fetchEpisodes` export is removed from `api.ts` and no consumer references it
  3. Running `npm install --legacy-peer-deps && npm run build` on a fresh clone completes with no errors
**Plans:** 1 plan
Plans:
- [ ] 07-01-PLAN.md — Fix episodes API shape, remove dead export, verify clean build

### Phase 8: Open Source Packaging
**Goal**: The repository is ready to make public — all standard open source community files are present and accurate
**Depends on**: Phase 7
**Requirements**: OSS-01, OSS-02, OSS-03, OSS-04, OSS-05
**Success Criteria** (what must be TRUE):
  1. An Apache 2.0 LICENSE file exists in the repo root with the correct year and author
  2. README.md describes the project, shows architecture, provides a quick-start that works, and documents every MCP tool
  3. CONTRIBUTING.md explains how to set up the dev environment, run tests, and submit a pull request
  4. CODE_OF_CONDUCT.md (Contributor Covenant) exists in the repo root
  5. `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md` are present and usable
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Storage Foundation | v1.0 | 2/2 | Complete | 2026-03-20 |
| 2. MCP Server + Memory | v1.0 | 2/2 | Complete | 2026-03-21 |
| 3. Consolidation + Approval | v1.0 | 3/3 | Complete | 2026-03-21 |
| 4. REST API + PWA | v1.0 | 5/5 | Complete | 2026-03-21 |
| 5. GSD Integration | v1.0 | 2/2 | Complete | 2026-03-21 |
| 6. Rename | v2.0 | 2/3 | In Progress|  |
| 7. Tech Debt | v2.0 | 0/1 | Not started | - |
| 8. Open Source Packaging | v2.0 | 0/? | Not started | - |
