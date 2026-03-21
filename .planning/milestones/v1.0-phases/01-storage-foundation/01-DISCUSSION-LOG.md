# Phase 1: Storage Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-20
**Phase:** 01-storage-foundation
**Areas discussed:** Database location, Provenance model

---

## Database Location

### Where should brain.db live by default?

| Option | Description | Selected |
|--------|-------------|----------|
| ~/.local/share/ai-workbots/ | XDG data directory convention. Standard on Linux/macOS for app data. | ✓ |
| ~/.config/ai-workbots/ | XDG config directory. Simpler but technically wrong for data files. | |
| Configurable via env var only | No default — user must set BRAIN_DB_PATH. | |

**User's choice:** ~/.local/share/ai-workbots/
**Notes:** None

### Should BRAIN_DB_PATH env var override the default?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, env var override | BRAIN_DB_PATH overrides default. Useful for testing, multiple brains. | ✓ |
| No overrides | Always use default location. Simpler code. | |

**User's choice:** Yes, env var override
**Notes:** None

### Auto-create on first run?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, auto-create everything | mkdir -p directory, create brain.db with full schema. Zero setup. | ✓ |
| Create DB, require directory exists | Won't mkdir — user must create directory first. | |
| Require explicit init command | Run 'brain init' before first use. | |

**User's choice:** Yes, auto-create everything
**Notes:** None

### Single file or split?

| Option | Description | Selected |
|--------|-------------|----------|
| Single file (brain.db) | One file holds everything. Simpler backups, WAL mode works across all tables. | ✓ |
| Split by concern | Separate files for knowledge graph vs episode logs. | |

**User's choice:** Single file
**Notes:** None

---

## Provenance Model

### Session ID format

| Option | Description | Selected |
|--------|-------------|----------|
| nanoid | Short, URL-safe, collision-resistant. Already in tech stack. | ✓ |
| UUID v4 | Standard 128-bit. Universally recognized but longer. | |
| Timestamp + random suffix | Human-readable, naturally sortable. Not standard. | |

**User's choice:** nanoid
**Notes:** None

### Agent identity capture

| Option | Description | Selected |
|--------|-------------|----------|
| Caller-provided string | MCP tool caller passes agent_id. Falls back to 'unknown'. | ✓ |
| Auto-detect from environment | Infer from env vars. Fragile. | |
| Generated per-connection | Server generates unique ID per client. Accurate but meaningless. | |

**User's choice:** Caller-provided string
**Notes:** None

### Confidence scale

| Option | Description | Selected |
|--------|-------------|----------|
| 0.0–1.0 float | Standard probability scale. 0.85 threshold for auto-approval. | ✓ |
| 1–100 integer | Percentage-like. More intuitive for display. | |

**User's choice:** 0.0–1.0 float
**Notes:** None

### Source type field

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, tagged source types | e.g. 'agent_session', 'consolidation', 'human_edit', 'gsd_hook'. | ✓ |
| No, just session + agent | Simpler schema. Source inferred from agent_id. | |

**User's choice:** Yes, tagged source types
**Notes:** None

---

## Claude's Discretion

- Schema openness (entity type flexibility, observation modeling)
- Package boundaries (monorepo split, workspace tooling)
- Timestamp format and granularity
- Table naming conventions and index strategy

## Deferred Ideas

None — discussion stayed within phase scope
