import { useMemo } from 'react'

interface NeighborhoodNode {
  id: string
  [key: string]: unknown
}

interface NeighborhoodLink {
  source: string | { id: string }
  target: string | { id: string }
  [key: string]: unknown
}

/**
 * BFS subgraph extraction at configurable depth (1 or 2 hops).
 * Returns the subgraph containing only the focal node and its neighbors,
 * or null when no focal node is set (full graph shown).
 *
 * Per ARCHITECTURE.md: the neighborhood hook returns filtered nodes/links.
 * GraphView receives these instead of the full decoratedNodes when active.
 */
export function useNeighborhood<
  N extends NeighborhoodNode,
  L extends NeighborhoodLink,
>(
  focalId: string | null,
  nodes: N[],
  links: L[],
  depth: 1 | 2,
): { nodes: N[]; links: L[] } | null {
  return useMemo(() => {
    if (!focalId) return null

    // Build adjacency from links
    const adjacency = new Map<string, Set<string>>()
    for (const link of links) {
      const src = typeof link.source === 'string' ? link.source : link.source.id
      const tgt = typeof link.target === 'string' ? link.target : link.target.id
      if (!adjacency.has(src)) adjacency.set(src, new Set())
      if (!adjacency.has(tgt)) adjacency.set(tgt, new Set())
      adjacency.get(src)!.add(tgt)
      adjacency.get(tgt)!.add(src)
    }

    // BFS to collect nodes within depth hops
    const visited = new Set<string>([focalId])
    let frontier = [focalId]

    for (let d = 0; d < depth; d++) {
      const nextFrontier: string[] = []
      for (const nodeId of frontier) {
        for (const neighbor of adjacency.get(nodeId) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            nextFrontier.push(neighbor)
          }
        }
      }
      frontier = nextFrontier
    }

    // Filter nodes and links to subgraph
    const subNodes = nodes.filter((n) => visited.has(n.id))
    const subLinks = links.filter((l) => {
      const src = typeof l.source === 'string' ? l.source : l.source.id
      const tgt = typeof l.target === 'string' ? l.target : l.target.id
      return visited.has(src) && visited.has(tgt)
    })

    return { nodes: subNodes, links: subLinks }
  }, [focalId, nodes, links, depth])
}
