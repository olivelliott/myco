import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { polygonHull } from 'd3-polygon'

export interface ClusterInfo {
  id: string
  nodeIds: Set<string>
  dominantType: string
  dominantColor: string
  label: string
}

/**
 * Detect communities using Louvain algorithm via graphology.
 * Returns a Map of nodeId -> communityId (string).
 *
 * Per Pitfall 10: use stable community IDs based on canonical node,
 * not rank order, to prevent color flipping during timeline playback.
 */
export function detectCommunities(
  nodes: Array<{ id: string; type: string }>,
  links: Array<{ source: string; target: string }>
): Map<string, string> {
  if (nodes.length === 0) return new Map()

  const g = new Graph({ type: 'undirected' })

  for (const n of nodes) {
    if (!g.hasNode(n.id)) g.addNode(n.id, { type: n.type })
  }

  for (const l of links) {
    const src = typeof l.source === 'string' ? l.source : (l.source as any).id
    const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id
    if (g.hasNode(src) && g.hasNode(tgt) && !g.hasEdge(src, tgt)) {
      g.addEdge(src, tgt)
    }
  }

  // Louvain returns { nodeId: communityNumber }
  const communities = louvain(g)

  const result = new Map<string, string>()
  for (const [nodeId, communityId] of Object.entries(communities)) {
    result.set(nodeId, String(communityId))
  }
  return result
}

/**
 * Build ClusterInfo objects from community assignments.
 * Each cluster gets a label = most common entity type in that cluster.
 * Color = TYPE_COLORS[dominantType].
 */
export function buildClusterInfos(
  communityMap: Map<string, string>,
  nodes: Array<{ id: string; type: string }>,
  typeColorFn: (type: string) => string
): ClusterInfo[] {
  // Group nodes by community
  const clusters = new Map<string, string[]>()
  for (const [nodeId, communityId] of communityMap) {
    if (!clusters.has(communityId)) clusters.set(communityId, [])
    clusters.get(communityId)!.push(nodeId)
  }

  const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]))

  const infos: ClusterInfo[] = []
  for (const [communityId, nodeIds] of clusters) {
    // Skip clusters with only 1 node
    if (nodeIds.length < 2) continue

    // Find dominant type
    const typeCounts = new Map<string, number>()
    for (const nid of nodeIds) {
      const t = nodeTypeMap.get(nid) ?? 'unknown'
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
    }
    let dominantType = 'unknown'
    let maxCount = 0
    for (const [t, c] of typeCounts) {
      if (c > maxCount) { maxCount = c; dominantType = t }
    }

    infos.push({
      id: communityId,
      nodeIds: new Set(nodeIds),
      dominantType,
      dominantColor: typeColorFn(dominantType),
      label: dominantType,
    })
  }

  return infos
}

/**
 * Compute convex hull points for a cluster given current node positions.
 * Returns array of [x, y] pairs forming the hull, or null if < 3 unique positions.
 *
 * Per CONTEXT.md: use d3-polygon polygonHull().
 * Add padding around hull points so boundary doesn't clip nodes.
 */
export function computeClusterHull(
  nodeIds: Set<string>,
  nodePositions: Map<string, { x: number; y: number }>,
  padding: number = 20
): [number, number][] | null {
  const points: [number, number][] = []
  for (const nid of nodeIds) {
    const pos = nodePositions.get(nid)
    if (pos && pos.x !== undefined && pos.y !== undefined) {
      points.push([pos.x, pos.y])
    }
  }

  if (points.length < 3) return null

  const hull = polygonHull(points)
  if (!hull) return null

  // Add padding: expand each hull point outward from centroid
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length

  return hull.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    return [x + (dx / dist) * padding, y + (dy / dist) * padding] as [number, number]
  })
}
