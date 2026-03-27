// Typed fetch wrappers for all API endpoints
// Types are simplified client-side versions of core types

export interface GrowthPoint {
  day: string
  entities: number
  observations: number
  relationships: number
}

export interface HealthMetrics {
  embeddingCoverage: number
  orphanedNodes: number
  confidenceDistribution: Array<{ bucket: string; count: number }>
  unconsolidatedEpisodes: number
}

export interface ActivityCard {
  id: string
  name: string
  type: string
  confidence: number
  created_at: string
  event: string
}

export interface DashboardStats {
  pending: number
  entities: number
  relationships: number
  observations: number
  recentEpisodes: Array<{
    id: string
    session_id: string
    agent_id: string
    event_type: string
    created_at: string
  }>
  recentActivity: ActivityCard[]
  topConnected: Array<{
    id: string
    name: string
    type: string
    connection_count: number
  }>
  typeBreakdown: Array<{
    type: string
    count: number
  }>
  growthStats: {
    entitiesLast7d: number
    observationsLast7d: number
    relationshipsLast7d: number
  }
  health: HealthMetrics
}

export interface ApprovalItem {
  id: string
  item_type: string
  item_id: string
  status: string
  reason: string | null
  created_at: string
  resolved_at: string | null
  metadata: {
    fact: {
      entity_name: string
      entity_type: string
      observation: string
      confidence: number
      evidence_quote: string
      related_entities: Array<{ name: string; type: string; relation_type: string }>
    }
    source_episode_ids?: string[]
    merge_candidate_ids?: string[]
  } | null
}

export interface GraphData {
  nodes: Array<{
    id: string
    name: string
    type: string
    val: number
    confidence: number
    summary: string | null
    created_at: string
  }>
  links: Array<{
    source: string
    target: string
    type: string
    confidence: number
    source_type: string
    created_at: string
    strength: number
    reinforcement_count: number
  }>
}

export interface EntityDetail {
  entity: {
    id: string
    name: string
    type: string
    confidence: number
    created_at: string
    updated_at: string
  }
  observations: Array<{
    id: string
    content: string
    confidence: number
    created_at: string
  }>
  connected: Array<{
    id: string
    name: string
    type: string
    relation_type: string
  }>
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export function fetchDashboard(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/api/dashboard')
}

export function fetchGrowthStats(): Promise<{ points: GrowthPoint[] }> {
  return apiFetch<{ points: GrowthPoint[] }>('/api/stats/growth')
}

export function fetchApprovals(): Promise<{ items: ApprovalItem[] }> {
  return apiFetch<{ items: ApprovalItem[] }>('/api/approvals')
}

export function resolveApproval(
  id: string,
  status: 'approved' | 'rejected',
  edited_content?: string,
): Promise<{ status: string; id: string }> {
  return apiFetch<{ status: string; id: string }>(`/api/approvals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, edited_content }),
  })
}

export function fetchGraph(): Promise<GraphData> {
  return apiFetch<GraphData>('/api/graph')
}

export function fetchEntityDetail(id: string): Promise<EntityDetail> {
  return apiFetch<EntityDetail>(`/api/entities/${id}`)
}
