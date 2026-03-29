/**
 * onboarding-scanner.ts
 *
 * Project file reader and LLM-based entity extraction for `myco init`.
 * Reads project configuration files (package.json, tsconfig.json, .eslintrc*,
 * README.md, CLAUDE.md, git config) and uses Ollama via Vercel AI SDK to infer
 * non-obvious conventions that an AI coding agent should know about.
 *
 * All logging goes to stderr — stdout is reserved for MCP transport.
 */

import { generateText, Output } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { z } from 'zod';
import type { ZodType } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProposedEntity {
  entity_name: string;
  entity_type: 'project' | 'convention' | 'tooling' | 'user_preference' | 'workflow_rule';
  observation: string;
  confidence: number;
  category: string;
  relations: Array<{ target_name: string; target_type: string; relation_type: string }>;
}

export interface ScanResult {
  project_name: string;
  project_path: string;
  proposed_entities: ProposedEntity[];
  files_scanned: string[];
  scan_duration_ms: number;
}

// ─── Ollama provider ──────────────────────────────────────────────────────────

function getOllamaProvider() {
  return createOllama({
    baseURL: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
  });
}

function getScanModel(): string {
  return process.env.MYCO_CONSOLIDATION_MODEL ?? 'llama3.2';
}

// ─── Zod schema for LLM output ───────────────────────────────────────────────

const ProposedEntitySchema = z.object({
  entity_name: z.string().describe('Short name of the entity or convention'),
  entity_type: z.enum(['project', 'convention', 'tooling', 'user_preference', 'workflow_rule'])
    .describe('Category of the entity'),
  observation: z.string().describe('A clear declarative statement about this entity'),
  confidence: z.number().min(0).max(1).default(0.7).describe('Confidence score 0.0-1.0'),
  category: z.string().describe('Subcategory or domain (e.g. "testing", "style", "deployment")'),
  relations: z.array(z.object({
    target_name: z.string(),
    target_type: z.string(),
    relation_type: z.string(),
  })).default([]),
});

const ScanOutputSchema = z.object({
  entities: z.array(ProposedEntitySchema),
});

// ─── File reading ─────────────────────────────────────────────────────────────

/**
 * Reads project configuration files from the given directory.
 * Returns a Record<filename, content> for all files that exist and have content.
 * README.md and CLAUDE.md are truncated to 2000 chars.
 * All errors are silently ignored.
 */
export async function readProjectFiles(projectPath: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // Files to read completely
  const plainFiles = ['package.json', 'tsconfig.json'];
  // ESLint config — first match wins
  const eslintCandidates = [
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.yml',
    '.eslintrc.yaml',
    '.eslintrc',
  ];
  // Files to truncate at 2000 chars
  const truncatedFiles = ['README.md', 'CLAUDE.md'];

  for (const file of plainFiles) {
    const fullPath = path.join(projectPath, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8').trim();
      if (content) result[file] = content;
    } catch {
      // Skip missing or unreadable files
    }
  }

  for (const candidate of eslintCandidates) {
    const fullPath = path.join(projectPath, candidate);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8').trim();
      if (content) {
        result[candidate] = content;
        break; // First found wins
      }
    } catch {
      // Try next candidate
    }
  }

  for (const file of truncatedFiles) {
    const fullPath = path.join(projectPath, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8').trim();
      if (content) result[file] = content.substring(0, 2000);
    } catch {
      // Skip missing or unreadable files
    }
  }

  // Git config — name and email
  try {
    const gitName = execSync('git config --get user.name', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    if (gitName) result['git.user.name'] = gitName;
  } catch {
    // git not configured or not a git repo
  }

  try {
    const gitEmail = execSync('git config --get user.email', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    if (gitEmail) result['git.user.email'] = gitEmail;
  } catch {
    // git not configured or not a git repo
  }

  return result;
}

// ─── Fallback: basic package.json extraction ─────────────────────────────────

/**
 * When Ollama is unavailable, extract basic entities from package.json alone.
 * Returns tooling entities for each main dependency.
 */
function fallbackExtract(
  files: Record<string, string>,
  projectName: string,
): ProposedEntity[] {
  const entities: ProposedEntity[] = [];

  if (!files['package.json']) return entities;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(files['package.json']) as Record<string, unknown>;
  } catch {
    return entities;
  }

  const deps = {
    ...(pkg['dependencies'] as Record<string, string> | undefined ?? {}),
    ...(pkg['devDependencies'] as Record<string, string> | undefined ?? {}),
  };

  const topDeps = Object.keys(deps).slice(0, 10); // Limit to 10 most prominent

  for (const dep of topDeps) {
    entities.push({
      entity_name: dep,
      entity_type: 'tooling',
      observation: `${projectName} uses ${dep} (${deps[dep]})`,
      confidence: 0.9,
      category: 'dependencies',
      relations: [{ target_name: projectName, target_type: 'project', relation_type: 'used_by' }],
    });
  }

  // Add description if present
  if (typeof pkg['description'] === 'string' && pkg['description']) {
    entities.push({
      entity_name: projectName,
      entity_type: 'project',
      observation: pkg['description'] as string,
      confidence: 0.95,
      category: 'project',
      relations: [],
    });
  }

  return entities;
}

// ─── LLM extraction ──────────────────────────────────────────────────────────

/**
 * Calls Ollama via Vercel AI SDK to extract non-obvious conventions and patterns
 * from project configuration files.
 *
 * On timeout (30s) or LLM error: returns empty array (logs to stderr).
 * On Ollama unavailable: returns basic fallback entities from package.json.
 */
export async function extractEntities(
  files: Record<string, string>,
  projectName: string,
): Promise<ProposedEntity[]> {
  const fileBlock = Object.entries(files)
    .filter(([k]) => !k.startsWith('git.')) // Exclude git config from file block
    .map(([filename, content]) => `--- ${filename} ---\n${content}`)
    .join('\n\n');

  const gitInfo = [
    files['git.user.name'] ? `Git user: ${files['git.user.name']}` : null,
    files['git.user.email'] ? `Git email: ${files['git.user.email']}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are analyzing a software project's configuration files. Project name: "${projectName}".

Extract non-obvious conventions, preferences, and patterns that an AI coding agent should know about but cannot discover by reading source code alone.

DO NOT extract things that are obvious from the file contents (like "this project uses TypeScript" when tsconfig.json exists).

Focus on:
- Coding style preferences (unusual linting rules, formatting choices)
- Architectural patterns (module structure, import conventions)
- Unusual configurations or constraints
- Team conventions and workflow rules
- Deployment targets or runtime constraints
- Testing strategies or test conventions
- Build pipeline or tooling choices that imply workflow constraints

${gitInfo ? `Developer info:\n${gitInfo}\n` : ''}

Configuration files:
${fileBlock}

Return a JSON object with an "entities" array. Each entity should have:
- entity_name: short descriptive name
- entity_type: one of [convention, tooling, user_preference, workflow_rule]
- observation: a clear declarative statement
- confidence: 0.0-1.0 (default 0.7 for inferred items)
- category: domain subcategory
- relations: array of related entities`;

  try {
    const ollamaProvider = getOllamaProvider();
    // Cast schema to satisfy ai@4 + Zod v4 type compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputSpec = Output.object({ schema: ScanOutputSchema as unknown as ZodType<{ entities: ProposedEntity[] }, any, any> });
    const result = await generateText({
      model: ollamaProvider(getScanModel()),
      prompt,
      experimental_output: outputSpec,
      abortSignal: AbortSignal.timeout(30_000),
    });

    const output = result.experimental_output as { entities: ProposedEntity[] } | undefined;
    return output?.entities ?? [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Detect Ollama unavailability (connection refused, ECONNREFUSED, etc.)
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('fetch failed') ||
      message.includes('connect ECONNREFUSED') ||
      message.includes('Connection refused')
    ) {
      console.error('[onboarding-scanner] Ollama unavailable — using fallback extraction');
      return fallbackExtract(files, projectName);
    }

    // Timeout or other LLM error — return empty
    console.error('[onboarding-scanner] extractEntities error:', message);
    return [];
  }
}

// ─── Main scan function ───────────────────────────────────────────────────────

/**
 * Scans a project directory, reads its configuration files, and uses Ollama to
 * extract non-obvious conventions as ProposedEntity objects for human review.
 *
 * Always includes a `project` type entity for the project itself.
 * Adds `belongs_to` relations from each proposed entity back to the project.
 */
export async function scanProject(projectPath: string): Promise<ScanResult> {
  const startMs = Date.now();
  const absolutePath = path.resolve(projectPath);

  const files = await readProjectFiles(absolutePath);
  const filesScanned = Object.keys(files).filter(k => !k.startsWith('git.'));

  // Determine project name from package.json or directory basename
  let projectName: string;
  if (files['package.json']) {
    try {
      const pkg = JSON.parse(files['package.json']) as Record<string, unknown>;
      projectName = typeof pkg['name'] === 'string' && pkg['name']
        ? (pkg['name'] as string)
        : path.basename(absolutePath);
    } catch {
      projectName = path.basename(absolutePath);
    }
  } else {
    projectName = path.basename(absolutePath);
  }

  // Extract entities via LLM (or fallback)
  const llmEntities = await extractEntities(files, projectName);

  // Add belongs_to relation to each proposed entity
  const enrichedEntities: ProposedEntity[] = llmEntities.map(entity => ({
    ...entity,
    relations: [
      ...entity.relations,
      { target_name: projectName, target_type: 'project', relation_type: 'belongs_to' },
    ],
  }));

  // Always prepend the project entity itself
  const projectEntity: ProposedEntity = {
    entity_name: projectName,
    entity_type: 'project',
    observation: `Software project at ${absolutePath}`,
    confidence: 1.0,
    category: 'project',
    relations: [],
  };

  const proposed_entities: ProposedEntity[] = [projectEntity, ...enrichedEntities];

  const scan_duration_ms = Date.now() - startMs;

  console.error(`[onboarding-scanner] Scanned ${filesScanned.length} files in ${scan_duration_ms}ms, found ${proposed_entities.length} proposed entities`);

  return {
    project_name: projectName,
    project_path: absolutePath,
    proposed_entities,
    files_scanned: filesScanned,
    scan_duration_ms,
  };
}
