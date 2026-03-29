import { nanoid } from 'nanoid';
import type { GraphExport } from './import-export.js';

// ── Mem0 format ──────────────────────────────────────────────────────────────

interface Mem0Memory {
  id: string;
  memory: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

interface Mem0Export {
  results: Mem0Memory[];
}

/**
 * Normalize a Mem0 export to Myco's native GraphExport format.
 *
 * Mem0 memories that include metadata.entity_name / metadata.entity_type are
 * grouped under a named entity. All others are grouped under a catch-all entity
 * "mem0_import" with type "import_batch".
 */
export function normalizeMem0(input: Mem0Export): GraphExport {
  const now = new Date().toISOString();

  // Map entity key (name+type) to entity id
  const entityMap = new Map<string, string>();

  const entities: GraphExport['entities'] = [];
  const observations: GraphExport['observations'] = [];

  for (const mem of input.results) {
    const entityName: string =
      (mem.metadata?.entity_name as string | undefined) ?? 'mem0_import';
    const entityType: string =
      (mem.metadata?.entity_type as string | undefined) ?? 'import_batch';

    const key = `${entityName}::${entityType}`;

    if (!entityMap.has(key)) {
      const entityId = nanoid();
      entityMap.set(key, entityId);
      entities.push({
        id: entityId,
        name: entityName,
        type: entityType,
        summary: null,
        metadata: '{}',
        session_id: 'mem0-import',
        agent_id: 'mem0-import',
        source_type: 'human_edit',
        confidence: 1.0,
        created_at: now,
        updated_at: now,
        project: null,
        merged_into: null,
      });
    }

    const entityId = entityMap.get(key)!;
    const obsId = nanoid();
    const createdAt = mem.created_at ?? now;

    observations.push({
      id: obsId,
      entity_id: entityId,
      content: mem.memory,
      metadata: '{}',
      session_id: 'mem0-import',
      agent_id: mem.user_id ?? 'mem0-import',
      source_type: 'human_edit',
      confidence: 1.0,
      created_at: createdAt,
      valid_from: createdAt,
      valid_until: null,
      last_accessed_at: null,
      needs_embedding: 0,
      decay_exempt: 0,
      strength: 1.0,
      reinforcement_count: 0,
    });
  }

  return {
    metadata: {
      version: 'mem0-import',
      exported_at: now,
      entity_count: entities.length,
      observation_count: observations.length,
      relationship_count: 0,
    },
    entities,
    observations,
    relationships: [],
  };
}

// ── Anthropic JSONL format ────────────────────────────────────────────────────

interface AnthropicEntityLine {
  type: 'entity';
  name: string;
  entityType: string;
  observations: string[];
}

/**
 * Normalize an Anthropic MCP reference server JSONL export to Myco's native
 * GraphExport format.
 *
 * The Anthropic reference server stores data as JSONL where each line is one of:
 *   {"type":"entity","name":"...","entityType":"...","observations":["..."]}
 *   {"type":"relation","from":"...","to":"...","relationType":"..."}
 *
 * We process entity lines to produce entities + observations, and relation lines
 * to produce relationships (when matching entities are found).
 */
export function normalizeAnthropicJSONL(jsonl: string): GraphExport {
  const now = new Date().toISOString();

  const lines = jsonl
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const entities: GraphExport['entities'] = [];
  const observations: GraphExport['observations'] = [];
  const relationships: GraphExport['relationships'] = [];

  // First pass: build entity name -> id map and create entities + observations
  const entityNameMap = new Map<string, string>();

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Skip malformed lines
      continue;
    }

    const record = parsed as Record<string, unknown>;

    if (record['type'] !== 'entity') continue;

    const entityLine = record as AnthropicEntityLine;
    const entityId = nanoid();
    entityNameMap.set(entityLine.name, entityId);

    entities.push({
      id: entityId,
      name: entityLine.name,
      type: entityLine.entityType,
      summary: null,
      metadata: '{}',
      session_id: 'anthropic-import',
      agent_id: 'anthropic-import',
      source_type: 'human_edit',
      confidence: 1.0,
      created_at: now,
      updated_at: now,
      project: null,
      merged_into: null,
    });

    for (const content of entityLine.observations) {
      const obsId = nanoid();
      observations.push({
        id: obsId,
        entity_id: entityId,
        content,
        metadata: '{}',
        session_id: 'anthropic-import',
        agent_id: 'anthropic-import',
        source_type: 'human_edit',
        confidence: 1.0,
        created_at: now,
        valid_from: now,
        valid_until: null,
        last_accessed_at: null,
        needs_embedding: 0,
        decay_exempt: 0,
        strength: 1.0,
        reinforcement_count: 0,
      });
    }
  }

  // Second pass: process relation lines
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const record = parsed as Record<string, unknown>;

    if (record['type'] !== 'relation') continue;

    const fromName = record['from'] as string | undefined;
    const toName = record['to'] as string | undefined;
    const relationType = record['relationType'] as string | undefined;

    if (!fromName || !toName || !relationType) continue;

    const fromId = entityNameMap.get(fromName);
    const toId = entityNameMap.get(toName);

    if (!fromId || !toId) continue;

    relationships.push({
      id: nanoid(),
      from_id: fromId,
      to_id: toId,
      type: relationType,
      metadata: '{}',
      session_id: 'anthropic-import',
      agent_id: 'anthropic-import',
      source_type: 'human_edit',
      confidence: 1.0,
      created_at: now,
      strength: 1.0,
      reinforcement_count: 0,
    });
  }

  return {
    metadata: {
      version: 'anthropic-import',
      exported_at: now,
      entity_count: entities.length,
      observation_count: observations.length,
      relationship_count: relationships.length,
    },
    entities,
    observations,
    relationships,
  };
}
