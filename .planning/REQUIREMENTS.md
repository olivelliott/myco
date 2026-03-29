# Requirements: Myco v6.0

**Defined:** 2026-03-27
**Core Value:** Agents never lose what they've learned — knowledge accumulates across sessions, and the human stays in control of what becomes permanent.

## v6.0 Requirements

Requirements for Proactive Knowledge & Onboarding milestone. Each maps to roadmap phases.

### Context Scoping

- [x] **SCOPE-01**: Working directory automatically maps to a project entity via `project_paths` table with walk-up directory resolution
- [x] **SCOPE-02**: Starting a Claude Code session in a project directory scopes all recall to that project without explicit `project` parameter

### Session-Start Recall

- [x] **RECALL-01**: A SessionStart hook automatically injects relevant knowledge into every Claude Code session via `additionalContext`
- [x] **RECALL-02**: Injected context is capped at 1,500 tokens with priority ordering (rules first, then top-K facts)
- [x] **RECALL-03**: The hook tracks what was injected and skips unchanged knowledge across consecutive sessions
- [x] **RECALL-04**: The hook uses FTS5-only queries (no Ollama) and completes in under 500ms with a read-only DB connection

### Workflow Rules

- [ ] **RULE-01**: Workflow rules are stored as `entity_type='workflow_rule'` entities with structured observation format
- [ ] **RULE-02**: A `remember_rule` MCP tool captures actionable instructions with optional trigger context
- [ ] **RULE-03**: All workflow rules for the current project + global scope are always included in session-start injection, not similarity-ranked

### Project Onboarding

- [ ] **ONBOARD-01**: `myco init` CLI command scans project files (package.json, tsconfig, git config, README, CLAUDE.md) and infers non-obvious conventions via LLM
- [ ] **ONBOARD-02**: Scan results are presented as a batch summary for human approval before committing to the knowledge graph
- [ ] **ONBOARD-03**: The onboarding scan registers the project path in `project_paths` for automatic context scoping
- [ ] **ONBOARD-04**: `init_project` MCP tool provides the same onboarding capability from within a Claude Code session

### Knowledge Correction

- [ ] **CORRECT-01**: An `update_knowledge` MCP tool finds stale observations by natural language query and presents them for confirmation
- [ ] **CORRECT-02**: Confirmed corrections supersede the old observation (via `valid_until`) and insert the replacement in a single operation

### User Preferences

- [ ] **PREF-01**: User preferences are stored on a global user entity (`project=NULL`) with the source project as evidence
- [ ] **PREF-02**: Preferences start project-scoped and promote to global only after corroboration from 2+ projects or explicit user confirmation
- [ ] **PREF-03**: User preferences are included in session-start recall alongside workflow rules and project facts

## Future Requirements

- **TRIGGER-01**: Trigger-aware rule surfacing — surface only relevant rules based on current agent action (e.g., commit rules before `git commit`) — *deferred to v6.1*
- **REFRESH-01**: `myco init --refresh` re-runs onboarding and diffs against existing graph state — *deferred to v6.1*

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full codebase source file ingestion | Anchoring bias — LLM-generated overviews reduce task success 2-3% (Osmani 2026) |
| Auto-extracting CLAUDE.md into rules | Two-source-of-truth problem — CLAUDE.md is already read by Claude Code directly |
| MCP Resources for proactive context | Resources require explicit user invocation, not automatic |
| Mid-conversation injection | Per-turn latency, brittle coupling to Claude Code internals |
| Live codebase indexing (chokidar) | `myco init` is intentionally one-shot for v6.0 |
| User onboarding wizard in PWA | Target user works in terminal — CLI is the right surface |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCOPE-01 | Phase 24 | Complete |
| SCOPE-02 | Phase 25 | Complete |
| RECALL-01 | Phase 25 | Complete |
| RECALL-02 | Phase 25 | Complete |
| RECALL-03 | Phase 25 | Complete |
| RECALL-04 | Phase 25 | Complete |
| RULE-01 | Phase 27 | Pending |
| RULE-02 | Phase 27 | Pending |
| RULE-03 | Phase 27 | Pending |
| ONBOARD-01 | Phase 26 | Pending |
| ONBOARD-02 | Phase 26 | Pending |
| ONBOARD-03 | Phase 26 | Pending |
| ONBOARD-04 | Phase 26 | Pending |
| CORRECT-01 | Phase 27 | Pending |
| CORRECT-02 | Phase 27 | Pending |
| PREF-01 | Phase 28 | Pending |
| PREF-02 | Phase 28 | Pending |
| PREF-03 | Phase 28 | Pending |

**Coverage:**
- v6.0 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 after roadmap creation*
