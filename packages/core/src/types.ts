export type SourceType = 'agent_session' | 'consolidation' | 'human_edit' | 'gsd_hook' | 'auto_discovery';

export interface Entity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  metadata: string; // JSON string
  session_id: string;
  agent_id: string;
  source_type: SourceType;
  confidence: number;
  created_at: string; // ISO 8601 UTC
  updated_at: string; // ISO 8601 UTC
  project?: string | null; // NULL = global (visible to all queries)
  merged_into?: string | null; // ID of entity this was merged into (soft-delete)
}

export interface Observation {
  id: string;
  entity_id: string;
  content: string;
  metadata: string; // JSON string
  session_id: string;
  agent_id: string;
  source_type: SourceType;
  confidence: number;
  created_at: string;
  needs_embedding?: number;           // 0 or 1 — 1 means Ollama was unavailable at insert time
  valid_from?: string | null;         // ISO 8601 — when this fact became true
  valid_until?: string | null;        // ISO 8601 — when this fact was superseded (NULL = current)
  last_accessed_at?: string | null;   // ISO 8601 — last time this observation was returned by recall
  decay_exempt?: number;              // 0 or 1 — 1 means confidence never decays
  reinforcement_count?: number;       // How many times this fact has been reinforced (default 1)
}

export interface Relationship {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  metadata: string; // JSON string
  session_id: string;
  agent_id: string;
  source_type: SourceType;
  confidence: number;
  created_at: string;
  strength?: number;                  // Strength score (default 1.0), increases on reinforcement
  reinforcement_count?: number;       // How many times this relationship has been reinforced
}

export interface Episode {
  id: string;
  session_id: string;
  agent_id: string;
  event_type: string;
  payload: string; // JSON string
  created_at: string;
  consolidated_at?: string | null;
}

export interface ApprovalQueueItem {
  id: string;
  item_type: string; // "entity" | "observation" | "relationship"
  item_id: string;
  status: string; // "pending" | "approved" | "rejected"
  reason: string | null;
  metadata?: string | null; // JSON string with proposed fact payload
  created_at: string;
  resolved_at: string | null;
}

export interface ProvenanceRecord {
  session_id: string;
  agent_id: string;
  source_type: SourceType;
  confidence: number;
  created_at: string;
}

export interface ExtractedFact {
  entity_name: string;
  entity_type: string;
  observation: string;
  confidence: number;
  evidence_quote: string;
  related_entities: Array<{
    name: string;
    type: string;
    relation_type: string;
  }>;
}

export interface ConsolidationSummary {
  totalProcessed: number;
  totalExtracted: number;
  totalAutoApproved: number;
  totalQueued: number;
  errors: number;
}

// ── Dedup / temporal versioning types (Phase 19) ──────────────────────────────

/**
 * Classification result for an incoming observation against existing facts.
 * - ADD: Observation is new — no semantic overlap with existing observations
 * - UPDATE: Observation supersedes an existing observation (conflicting/updated fact)
 * - NOOP: Observation is a near-duplicate — ignore to avoid noise
 */
export type DedupClassification = 'ADD' | 'UPDATE' | 'NOOP';

export interface ClassificationResult {
  classification: DedupClassification;
  superseded_observation_id?: string; // Set when UPDATE — the observation to retire
  reason: string;                     // Human-readable explanation
}

// -- Context scoping types (Phase 24) ----------------------------------------

export interface ProjectPath {
  id: string;
  project_name: string;
  directory_path: string;  // Absolute filesystem path, no trailing slash
  created_at: string;      // ISO 8601 UTC
}
