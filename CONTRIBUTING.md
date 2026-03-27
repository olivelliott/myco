# Contributing to Myco

Thanks for your interest in contributing! By participating, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development Setup

### Prerequisites

- **Node.js 22.x** LTS
- **Ollama** running locally (`ollama serve`)
  - Pull required models: `ollama pull nomic-embed-text` and `ollama pull llama3.2`

### Getting Started

```bash
# Clone the repo
git clone https://github.com/olivelliott/myco.git
cd myco

# Install dependencies (--legacy-peer-deps needed for Vite 8 peer dep conflict)
npm install --legacy-peer-deps

# Build all packages
npm run build

# Run tests
npm test
```

### Dev Mode

```bash
# MCP server (watches for changes)
npm run dev

# API server (separate terminal)
npm run api

# Dashboard (separate terminal)
cd packages/dashboard && npm run dev
```

## Project Structure

```
packages/
├── core/          — Shared DB, schema, types, prepared statement factory, provenance
├── mcp-server/    — MCP tools, query filters, consolidation pipeline, cron, CLI
├── api-server/    — Hono REST API (port 3001), Zod validation, structured errors
└── dashboard/     — React PWA (approval queue, graph explorer)
```

## Running Tests

```bash
npm test              # Run all tests with Vitest
npm run test:watch    # Watch mode
```

Tests live alongside their packages in `packages/*/tests/`.

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run build` and `npm test` to verify nothing is broken
4. Write a clear PR description explaining **what** and **why**
5. Reference any related issues

### What Makes a Good PR

- Focused on a single change
- Includes tests if adding new functionality
- Doesn't break existing tests
- Follows existing code patterns

## Reporting Bugs

Use the [Bug Report](https://github.com/olivelliott/myco/issues/new?template=bug_report.md) issue template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version, Ollama version, OS

## Requesting Features

Use the [Feature Request](https://github.com/olivelliott/myco/issues/new?template=feature_request.md) template. Describe the **problem** you're trying to solve, not just the solution.

## Code Style

- TypeScript strict mode
- ESLint with `@typescript-eslint`
- No specific formatter enforced — match existing code style
- ESM modules with `.js` extensions in relative imports

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
