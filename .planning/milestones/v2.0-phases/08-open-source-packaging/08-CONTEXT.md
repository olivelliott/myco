# Phase 8: Open Source Packaging - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Create all standard open source community files for a public GitHub release: LICENSE, README, CONTRIBUTING, CODE_OF_CONDUCT, and GitHub issue/PR templates.

</domain>

<decisions>
## Implementation Decisions

### README Content & Branding
- Developer-focused, technical, concise tone — matches the tool's nature as developer infrastructure
- ASCII art architecture diagram (same style as GETTING-STARTED.md) — works everywhere, no rendering dependencies
- No screenshots for v2.0 — keep README text-only, add visual showcase later
- Tagline: "Myco — your knowledge web." as subtitle under the project name

### Contribution Guidelines & Community
- CONTRIBUTING.md covers: dev setup, how to run tests, PR process — standard for dev tools
- Two issue templates: Bug Report and Feature Request
- PR template with checklist: description, testing done, breaking changes
- Contributor Covenant v2.1 for CODE_OF_CONDUCT.md

### Claude's Discretion
- Exact README section ordering and content depth
- GitHub template formatting and field choices
- Whether to include a .gitignore update for common OS files
- Apache 2.0 LICENSE header format (standard full text with year + author)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- GETTING-STARTED.md has architecture diagram, MCP tool reference, quick start — reusable for README
- PROJECT.md has tech stack table and constraint descriptions
- Phase 6 renamed everything to Myco — all references are current

### Established Patterns
- Monorepo with 4 packages under `packages/`
- `npm install --legacy-peer-deps` required (Vite 8 peer dep conflict)
- Vitest for testing, tsx for dev, tsup for building

### Integration Points
- README replaces GETTING-STARTED.md as the primary entry point
- GETTING-STARTED.md can be removed or kept as detailed guide (Claude's discretion)

</code_context>

<specifics>
## Specific Ideas

- README should showcase the knowledge graph visualization concept (text description, not screenshot)
- Include MCP tool reference table (remember, recall, query, log_episode, consolidate, approvals)
- Architecture section should show the 4-package monorepo + SQLite + Ollama stack

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
