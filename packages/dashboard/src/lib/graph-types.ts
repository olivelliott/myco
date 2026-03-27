/**
 * Graph interaction mode system.
 * Only one mode is active at a time. Per CONTEXT.md decision:
 * explore (default), path, neighborhood, search.
 */
export type GraphInteractionMode = 'explore' | 'path' | 'neighborhood' | 'search'

export type GraphModeState =
  | { type: 'explore' }
  | { type: 'path'; source: string | null; target: string | null }
  | { type: 'neighborhood'; centerId: string; depth: 1 | 2 }
  | { type: 'search'; query: string }

export const DEFAULT_MODE_STATE: GraphModeState = { type: 'explore' }

/**
 * Compute a stable identity key from node and link ID sets.
 * Used to memoize graphData — only changes when structural data changes.
 * Visual-only changes (opacity, color) must NOT change this key.
 */
export function computeGraphDataKey(
  nodeIds: string[],
  linkPairs: Array<{ source: string; target: string }>
): string {
  // Sort for deterministic key regardless of order
  const nk = nodeIds.slice().sort().join(',')
  const lk = linkPairs
    .map(l => `${l.source}-${l.target}`)
    .sort()
    .join(',')
  return `${nk}|${lk}`
}
