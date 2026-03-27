# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Myco, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email: **olivelliott48@gmail.com** with the subject line `[SECURITY] Myco vulnerability report`.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity, but we aim for prompt resolution

## Scope

Myco runs entirely on your local machine. The primary security concerns are:

- **Database access**: `brain.db` contains your knowledge graph data
- **MCP server**: Runs over stdio, not exposed to the network by default
- **API server**: Binds to `localhost:3001` — not exposed externally unless you configure it
- **Ollama integration**: Communicates with your local Ollama instance only

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

Note: Internal milestone tags (v1.0, v2.0, v3.0) track development milestones, not npm releases. The npm package version is 0.1.x.
