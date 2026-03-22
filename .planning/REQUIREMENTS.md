# Requirements: Myco

**Defined:** 2026-03-22
**Core Value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## v2.0 Requirements

Requirements for public open source release. Each maps to roadmap phases.

### Rename

- [x] **REN-01**: All package names renamed from `@ai-workbots/*` to `@myco/*`
- [x] **REN-02**: All internal imports and cross-package references updated to `@myco/*`
- [x] **REN-03**: CLI commands renamed from `brain-mcp`/`brain-cli` to `myco`/`myco-cli`
- [x] **REN-04**: Default database path changed from `~/.local/share/ai-workbots/` to `~/.local/share/myco/`
- [x] **REN-05**: MCP server name, tool descriptions, and user-facing strings updated to "Myco"
- [x] **REN-06**: Dashboard title, branding, and PWA manifest updated to "Myco"

### Open Source

- [ ] **OSS-01**: Apache 2.0 LICENSE file in repo root
- [ ] **OSS-02**: README.md with project description, architecture diagram, quick start, MCP tool reference, and knowledge graph visualization showcase
- [ ] **OSS-03**: CONTRIBUTING.md with development setup, PR guidelines, and code style expectations
- [ ] **OSS-04**: CODE_OF_CONDUCT.md (Contributor Covenant)
- [ ] **OSS-05**: GitHub issue and PR templates (`.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`)

### Tech Debt

- [x] **DEBT-01**: Fix `/api/episodes` response shape to match `fetchEpisodes()` client expectations
- [x] **DEBT-02**: Remove dead `fetchEpisodes` export from `api.ts`
- [x] **DEBT-03**: Verify fresh-clone `npm install --legacy-peer-deps && npm run build` succeeds with no errors

## Future Requirements

Deferred to v2.1+. Tracked but not in current roadmap.

### Agent Intelligence
- **AGENT-01**: Agents query the brain at session start for project context
- **AGENT-02**: Contextual recall factors in current project and recent topics
- **AGENT-03**: Confidence decay on old observations unless reinforced

### Distribution
- **DIST-01**: npm publishable packages
- **DIST-02**: PWA build + deploy as installable app
- **DIST-03**: Backup/export knowledge graph as JSON/Markdown

### Cross-Project
- **CROSS-01**: Global GSD hooks auto-log episodes from all projects
- **CROSS-02**: Relationship inference between entities

## Out of Scope

| Feature | Reason |
|---------|--------|
| New MCP tools or capabilities | v2.0 is packaging only — new features are v2.1+ |
| Cloud storage or external APIs | Core constraint — everything local |
| Multi-user / team features | Single user, single machine |
| npm publish | Not yet — get the repo public first, publish later |
| Directory/repo rename on disk | User will handle GitHub repo creation separately |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REN-01 | Phase 6 | Complete |
| REN-02 | Phase 6 | Complete |
| REN-03 | Phase 6 | Complete |
| REN-04 | Phase 6 | Complete |
| REN-05 | Phase 6 | Complete |
| REN-06 | Phase 6 | Complete |
| DEBT-01 | Phase 7 | Complete |
| DEBT-02 | Phase 7 | Complete |
| DEBT-03 | Phase 7 | Complete |
| OSS-01 | Phase 8 | Pending |
| OSS-02 | Phase 8 | Pending |
| OSS-03 | Phase 8 | Pending |
| OSS-04 | Phase 8 | Pending |
| OSS-05 | Phase 8 | Pending |

**Coverage:**
- v2.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation*
