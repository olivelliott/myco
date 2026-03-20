import { nanoid } from 'nanoid';
import type { ProvenanceRecord, SourceType } from './types.js';

export function generateSessionId(): string {
  return nanoid(); // ~21 char URL-safe ID
}

export function buildProvenance(
  sessionId: string,
  agentId: string = 'unknown',
  sourceType: SourceType = 'agent_session',
  confidence: number = 1.0,
): ProvenanceRecord {
  return {
    session_id: sessionId,
    agent_id: agentId,
    source_type: sourceType,
    confidence,
    created_at: new Date().toISOString(),
  };
}
