export type SourceType = 'agent_session' | 'consolidation' | 'human_edit' | 'gsd_hook';

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
  needs_embedding?: number; // 0 or 1 — 1 means Ollama was unavailable at insert time
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
}

export interface Episode {
  id: string;
  session_id: string;
  agent_id: string;
  event_type: string;
  payload: string; // JSON string
  created_at: string;
}

export interface ApprovalQueueItem {
  id: string;
  item_type: string; // "entity" | "observation" | "relationship"
  item_id: string;
  status: string; // "pending" | "approved" | "rejected"
  reason: string | null;
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
