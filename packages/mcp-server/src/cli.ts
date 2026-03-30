#!/usr/bin/env node
/**
 * myco-cli: Standalone CLI for triggering consolidation and managing
 * the approval queue without an active MCP session.
 *
 * Usage: myco-cli <command> [options]
 */

import { loadConfig } from '@myco/core';
loadConfig();
import { openDatabase, prepareStatements, rememberEntity } from '@myco/core';
import { runConsolidation } from './consolidator.js';
import { scanProject } from './onboarding-scanner.js';
import { nanoid } from 'nanoid';
import * as readline from 'node:readline/promises';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`Usage: myco-cli <command>

Commands:
  init [path]                   Scan a project and populate knowledge graph
  consolidate                   Trigger consolidation pipeline
  list-approvals [--limit N]    Show pending approval queue
  resolve-approval <id> <approve|reject|edit> [--content "..."]  Resolve a queued item
`);
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].slice(2);
      result[key] = args[i + 1];
      i++;
    }
  }
  return result;
}

// ─── Subcommands ──────────────────────────────────────────────────────────────

async function cmdInit(args: string[]): Promise<void> {
  const projectPath = args[0] || process.cwd();

  console.error('[myco-cli] Scanning project at', projectPath, '...');

  const result = await scanProject(projectPath);

  if (result.proposed_entities.length === 0) {
    console.log('No entities found during scan.');
    return;
  }

  // Print numbered table
  console.log('\n  Proposed Knowledge for: ' + result.project_name);
  console.log('  ' + '─'.repeat(70));
  console.log(
    '  #  │ Type             │ Entity                │ Observation'
  );
  console.log('  ' + '─'.repeat(70));

  result.proposed_entities.forEach((e, i) => {
    const num = String(i + 1).padStart(2);
    const type = e.entity_type.padEnd(16);
    const name = e.entity_name.substring(0, 21).padEnd(21);
    const obs = e.observation.substring(0, 50);
    console.log(`  ${num} │ ${type} │ ${name} │ ${obs}`);
  });

  console.log('  ' + '─'.repeat(70));
  console.log(`  Files scanned: ${result.files_scanned.join(', ')}`);
  console.log(`  Scan time: ${result.scan_duration_ms}ms\n`);

  // Prompt for approval
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('  Accept? [y]es all / [n]o / comma-separated numbers (e.g. 1,3,5): ');
  rl.close();

  const trimmed = answer.trim().toLowerCase();

  if (trimmed === 'n' || trimmed === 'no') {
    console.log('Rejected all. Nothing written.');
    return;
  }

  let selectedIndices: number[];
  if (trimmed === 'y' || trimmed === 'yes' || trimmed === '') {
    selectedIndices = result.proposed_entities.map((_, i) => i);
  } else {
    // Parse comma-separated line numbers (1-indexed)
    selectedIndices = trimmed.split(',')
      .map(s => parseInt(s.trim(), 10) - 1)
      .filter(i => i >= 0 && i < result.proposed_entities.length);

    if (selectedIndices.length === 0) {
      console.log('No valid selections. Nothing written.');
      return;
    }
  }

  // Write approved entities to graph
  const db = openDatabase();
  const stmts = prepareStatements(db);

  let written = 0;
  for (const idx of selectedIndices) {
    const entity = result.proposed_entities[idx];
    try {
      await rememberEntity(db, {
        content: entity.observation,
        entity_name: entity.entity_name,
        entity_type: entity.entity_type,
        confidence: entity.confidence,
        // 'onboarding' is not in SourceType union — use 'agent_session' as the
        // closest match for human-guided initial knowledge population
        source_type: 'agent_session',
        relations: entity.relations.map(r => ({
          target_name: r.target_name,
          target_type: r.target_type,
          relation_type: r.relation_type,
        })),
        project: result.project_name,
      }, stmts);
      written++;
    } catch (err) {
      console.error(`  Warning: failed to write "${entity.entity_name}":`, (err as Error).message);
    }
  }

  // Register project path
  const existing = stmts.selectProjectForPath.get({ path: result.project_path }) as { id: string } | undefined;
  if (!existing) {
    stmts.insertProjectPath.run(
      nanoid(),
      result.project_name,
      result.project_path,
      new Date().toISOString(),
    );
    console.log(`  Registered project path: ${result.project_path}`);
  } else {
    console.log(`  Project path already registered.`);
  }

  console.log(`\n  Done. Wrote ${written}/${selectedIndices.length} entities to knowledge graph.`);
  console.log(`  Session-start recall will now surface this knowledge.\n`);
}

async function cmdConsolidate(): Promise<void> {
  const db = openDatabase();
  const stmts = prepareStatements(db);
  try {
    console.error('[myco-cli] Starting consolidation…');
    const summary = await runConsolidation(db, stmts);
    console.log(`Consolidation complete.
Episodes processed: ${summary.totalProcessed}
Facts extracted:    ${summary.totalExtracted}
Auto-approved:      ${summary.totalAutoApproved}
Queued for review:  ${summary.totalQueued}`);
  } catch (err) {
    console.error('[myco-cli] Consolidation failed:', (err as Error).message);
    process.exit(1);
  }
}

function cmdListApprovals(args: string[]): void {
  const flags = parseArgs(args);
  const limit = flags['limit'] ? parseInt(flags['limit'], 10) : 20;

  const db = openDatabase();
  const stmts = prepareStatements(db);
  try {
    const rows = stmts.selectPendingApprovals.all(limit) as Array<{
      id: string;
      item_type: string;
      reason: string | null;
      metadata: string | null;
      created_at: string;
    }>;

    if (rows.length === 0) {
      console.log('No pending approvals.');
      return;
    }

    for (const row of rows) {
      let factInfo = '';
      if (row.metadata) {
        try {
          const meta = JSON.parse(row.metadata) as {
            fact?: {
              entity_name?: string;
              entity_type?: string;
              observation?: string;
              confidence?: number;
              evidence_quote?: string;
            };
          };
          if (meta.fact) {
            const f = meta.fact;
            factInfo = `  Type: ${row.item_type}
  Entity: ${f.entity_name ?? '(unknown)'} (${f.entity_type ?? 'concept'})
  Observation: ${f.observation ?? '(none)'}
  Confidence: ${f.confidence ?? '(unknown)'}
  Evidence: "${f.evidence_quote ?? ''}"`;
          }
        } catch {
          factInfo = `  Metadata: (parse error)`;
        }
      }
      console.log(`[${row.id}] ${row.reason ?? '(no reason)'} (${row.created_at})
${factInfo}`);
    }
  } catch (err) {
    console.error('[myco-cli] Failed to list approvals:', (err as Error).message);
    process.exit(1);
  }
}

async function cmdResolveApproval(args: string[]): Promise<void> {
  const id = args[0];
  const action = args[1] as 'approve' | 'reject' | 'edit' | undefined;

  if (!id) {
    console.error('Error: missing approval ID.');
    console.error('Usage: myco-cli resolve-approval <id> <approve|reject|edit> [--content "..."]');
    process.exit(1);
  }

  if (!action || !['approve', 'reject', 'edit'].includes(action)) {
    console.error(`Error: missing or invalid action "${action ?? ''}". Must be approve, reject, or edit.`);
    console.error('Usage: myco-cli resolve-approval <id> <approve|reject|edit> [--content "..."]');
    process.exit(1);
  }

  const flags = parseArgs(args.slice(2));
  const editedContent = flags['content'];

  if (action === 'edit' && !editedContent) {
    console.error('Error: --content is required for the edit action.');
    process.exit(1);
  }

  const db = openDatabase();
  const stmts = prepareStatements(db);
  try {
    // Fetch pending item
    const item = stmts.selectApprovalById.get(id) as { id: string; item_type: string; metadata: string | null; status: string } | undefined;

    if (!item) {
      console.error(`Error: Approval item ${id} not found.`);
      process.exit(1);
    }

    if (item.status !== 'pending') {
      console.error(`Error: Item ${id} is already resolved (${item.status}).`);
      process.exit(1);
    }

    const now = new Date().toISOString();

    if (action === 'reject') {
      stmts.updateApprovalStatus.run('rejected', now, id);
      console.log(`Rejected approval item ${id}.`);
      return;
    }

    // approve or edit — write to knowledge graph
    if (!item.metadata) {
      console.error(`Error: Item ${id} has no metadata — cannot determine what to approve.`);
      process.exit(1);
    }

    const meta = JSON.parse(item.metadata) as {
      fact: {
        entity_name: string;
        entity_type: string;
        observation: string;
        confidence: number;
        evidence_quote: string;
        related_entities: Array<{ name: string; type: string; relation_type: string }>;
      };
      merge_candidate_ids?: string[];
    };

    const observation = action === 'edit' ? editedContent! : meta.fact.observation;

    // Handle merge_candidate items: reassign observations+relationships from secondary to primary
    // ('reject' returned early above — action is 'approve' or 'edit' here)
    if (item.item_type === 'proposed_fact' && meta.merge_candidate_ids && meta.merge_candidate_ids.length > 0) {
      const primaryEntity = stmts.selectEntityByNameType.get(meta.fact.entity_name, meta.fact.entity_type) as { id: string } | undefined;

      if (primaryEntity) {
        for (const secondaryId of meta.merge_candidate_ids) {
          stmts.updateObservationEntityId.run(primaryEntity.id, secondaryId);
          stmts.updateRelationshipFromId.run(primaryEntity.id, secondaryId);
          stmts.updateRelationshipToId.run(primaryEntity.id, secondaryId);
          stmts.deleteEntityById.run(secondaryId);
        }
        console.error(`[myco-cli] Merged ${meta.merge_candidate_ids.length} secondary entity/entities into ${meta.fact.entity_name}`);
      }
    }

    // Write the fact to the knowledge graph
    await rememberEntity(db, {
      content: observation,
      entity_name: meta.fact.entity_name,
      entity_type: meta.fact.entity_type,
      confidence: meta.fact.confidence,
      source_type: 'consolidation',
      relations: meta.fact.related_entities.map(r => ({
        target_name: r.name,
        target_type: r.type,
        relation_type: r.relation_type,
      })),
    }, stmts);

    stmts.updateApprovalStatus.run('approved', now, id);

    console.log(`Approved item ${id}.
Entity: ${meta.fact.entity_name} (${meta.fact.entity_type})
Action: ${action}`);
  } catch (err) {
    console.error('[myco-cli] Failed to resolve approval:', (err as Error).message);
    process.exit(1);
  }
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

const subcommand = process.argv[2];

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  printUsage();
  process.exit(0);
}

switch (subcommand) {
  case 'init':
    await cmdInit(process.argv.slice(3));
    break;

  case 'consolidate':
    await cmdConsolidate();
    break;

  case 'list-approvals':
    cmdListApprovals(process.argv.slice(3));
    break;

  case 'resolve-approval':
    await cmdResolveApproval(process.argv.slice(3));
    break;

  default:
    console.error(`Unknown command: ${subcommand}`);
    printUsage();
    process.exit(1);
}
