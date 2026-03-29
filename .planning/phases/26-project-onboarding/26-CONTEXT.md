# Phase 26: Project Onboarding - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement `myco init` — a CLI subcommand and MCP tool that scans a project's configuration files, infers non-obvious conventions and preferences via LLM, presents results as a terminal table for cherry-pick approval, commits approved entities to the knowledge graph, and registers the project path in `project_paths` for automatic session-start recall.

</domain>

<decisions>
## Implementation Decisions

### CLI & Tool Architecture
- Add `init` subcommand to existing `packages/mcp-server/src/cli.ts` (alongside consolidate, list-approvals, resolve-approval)
- Add `init_project` MCP tool in `packages/mcp-server/src/tools.ts` that wraps the same scanner logic
- Core scanning logic lives in a new `packages/mcp-server/src/onboarding-scanner.ts` module
- Uses `generateObject` from Vercel AI SDK (same pattern as consolidator.ts) for structured extraction

### What Gets Scanned
- package.json (name, dependencies, scripts, engines)
- tsconfig.json (strict settings, target, module)
- .eslintrc* (rule overrides, extends)
- git config (user.name, user.email via `git config --get`)
- README.md (first 2000 chars — project description, purpose)
- CLAUDE.md (if exists — existing human instructions, but DO NOT duplicate as rules)
- Hard 30-second timeout for the entire scan
- Do NOT scan source files (anchoring bias — research confirmed -2-3% task success)

### LLM Extraction
- Single `generateObject` call with all file contents concatenated
- Structured output schema: array of `{ entity_name, entity_type, observation, confidence, category }`
- entity_type values: "project", "convention", "tooling", "user_preference", "workflow_rule"
- Default confidence: 0.7 for inferred items (below auto-approve threshold)
- Prompt focus: "What are the non-obvious conventions and preferences that an agent cannot discover by reading the source code?"

### Terminal Approval UX
- Present results as a numbered terminal table: `# | Type | Entity | Observation | Confidence`
- User input: `y` to accept all, `n` to reject all, or comma-separated line numbers to cherry-pick (e.g., "1,3,5")
- Approved items commit to graph via `rememberEntity()`
- Rejected items are discarded (not queued for later)
- On accept: register project path in `project_paths` table

### MCP Tool Behavior
- `init_project` MCP tool accepts `{ path?: string }` — defaults to session cwd
- Returns the same structured output as the CLI (list of proposed entities)
- Agent presents to user for approval within the conversation
- On approval: agent calls `remember` for each approved item

### Idempotency
- Re-running `myco init` on a project that already has entities should not create duplicates
- Check existing entities for the project namespace before inserting
- If entity already exists with similar observation, classify as NOOP (skip)

### Claude's Discretion
- Exact LLM prompt wording for extraction
- How to handle Ollama being unavailable (fallback to basic file parsing?)
- Test strategy (unit tests for scanner module, integration test with mock LLM)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/mcp-server/src/cli.ts` — existing CLI with subcommand pattern
- `packages/mcp-server/src/consolidator.ts` — uses `generateObject` from Vercel AI SDK (reference for LLM call pattern)
- `packages/mcp-server/src/tools.ts` — `rememberEntity()` function for writing to graph
- `packages/core/src/statements.ts` — `insertProjectPath`, `selectProjectForPath` prepared statements
- `packages/core/src/types.ts` — `ProjectPath` type

### Established Patterns
- CLI subcommands follow the `cmdXxx()` async function pattern
- LLM calls use `import { generateObject } from 'ai'` with `import { ollama } from 'ollama-ai-provider'`
- Entity creation uses `rememberEntity(db, stmts, { name, type, observations, relations })`
- All database writes go through the prepared statement factory

### Integration Points
- `cli.ts` main switch/case dispatches to subcommand functions
- `package.json` bin entries already point to compiled `dist/` outputs
- `project_paths` table from Phase 24 for path registration
- Session-start hook from Phase 25 will surface what `myco init` populates

</code_context>

<specifics>
## Specific Ideas

- The scanner should produce a clean data structure that both CLI and MCP tool consume
- For the MCP tool, return the proposed entities as the tool result so the agent can present them conversationally
- Consider a `--dry-run` flag for CLI that shows what would be extracted without writing

</specifics>

<deferred>
## Deferred Ideas

- `myco init --refresh` to re-scan and diff against existing graph — v6.1
- Dashboard view of onboarding results — future
- Scanning additional file types (.env.example, Dockerfile) — future

</deferred>
