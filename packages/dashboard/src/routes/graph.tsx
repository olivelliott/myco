import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useGraph } from '../hooks/use-graph'
import { useNeighborhood } from '../hooks/use-neighborhood'
import { GraphView } from '../components/graph-view'
import type { GraphNode } from '../components/graph-view'
import { EntityPanel } from '../components/entity-panel'
import { GraphToolbar } from '../components/graph-toolbar'
import { GraphLegend } from '../components/graph-legend'
import { GraphAnalytics } from '../components/graph-analytics'
import { TimelineSlider } from '../components/timeline-slider'
import { type GraphModeState, DEFAULT_MODE_STATE } from '../lib/graph-types'
import { detectCommunities, buildClusterInfos } from '../lib/graph-clusters'
import type { ClusterInfo } from '../lib/graph-clusters'
import { getNodeColor } from '../components/graph-view'

export const Route = createFileRoute('/graph')({ component: GraphPage })

function bfs(
  startId: string,
  endId: string,
  links: Array<{ source: string; target: string }>,
): string[] | null {
  const adjacency = new Map<string, string[]>()
  for (const link of links) {
    const src = link.source
    const tgt = link.target
    if (!adjacency.has(src)) adjacency.set(src, [])
    if (!adjacency.has(tgt)) adjacency.set(tgt, [])
    adjacency.get(src)!.push(tgt)
    adjacency.get(tgt)!.push(src)
  }

  const visited = new Set<string>()
  const queue: Array<{ id: string; path: string[] }> = [
    { id: startId, path: [startId] },
  ]
  visited.add(startId)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.id === endId) return current.path

    for (const neighbor of adjacency.get(current.id) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push({ id: neighbor, path: [...current.path, neighbor] })
      }
    }
  }
  return null
}

function GraphPage() {
  const { data, isLoading, error } = useGraph()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  // Graph interaction mode system (replaces pathMode + pathSource + pathTarget)
  const [modeState, setModeState] = useState<GraphModeState>(DEFAULT_MODE_STATE)

  // Timeline
  const [timelineEnabled, setTimelineEnabled] = useState(false)
  // Shared ref: canvas painter reads this directly — no React re-renders during playback (Pitfall 2 fix)
  const timelineCutoffRef = useRef<number>(Infinity)

  // Panels
  const [legendOpen, setLegendOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  // Cluster visualization and confidence filter
  const [clustersEnabled, setClustersEnabled] = useState(false)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0)

  // Compute date range for timeline — ms timestamps
  const dateRange = useMemo(() => {
    if (!data?.nodes?.length) return { min: 0, max: 0, minStr: '', maxStr: '' }
    const dates = data.nodes
      .map((n) => n.created_at)
      .filter(Boolean)
      .sort()
    const minStr = dates[0] || new Date().toISOString()
    const maxStr = dates[dates.length - 1] || new Date().toISOString()
    return {
      min: new Date(minStr).getTime(),
      max: new Date(maxStr).getTime(),
      minStr,
      maxStr,
    }
  }, [data])

  // When timeline toggles ON: set cutoff to min (start from earliest)
  // When toggled OFF: set cutoff to Infinity (show everything)
  useEffect(() => {
    if (timelineEnabled && dateRange.min) {
      timelineCutoffRef.current = dateRange.min
    } else {
      timelineCutoffRef.current = Infinity
    }
  }, [timelineEnabled, dateRange.min])

  // onScrub: slider calls this when manually scrubbed (already updated the ref)
  const handleScrub = useCallback((ms: number) => {
    timelineCutoffRef.current = ms
  }, [])

  // Always pass ALL data to GraphView — timeline visibility is purely visual via canvas painter
  // This is the critical Pitfall 1 fix: graphData reference never changes during timeline playback
  const displayData = data

  // Compute Louvain community clusters when clusters toggle is enabled
  const clusterInfos = useMemo<ClusterInfo[] | null>(() => {
    if (!clustersEnabled || !data?.nodes?.length) return null
    const communityMap = detectCommunities(
      data.nodes,
      data.links.map((l) => ({
        source: typeof l.source === 'string' ? l.source : (l.source as any).id,
        target: typeof l.target === 'string' ? l.target : (l.target as any).id,
      }))
    )
    return buildClusterInfos(communityMap, data.nodes, getNodeColor)
  }, [clustersEnabled, data])

  // Path tracing computation
  const pathResult = useMemo(() => {
    if (modeState.type !== 'path' || !modeState.source || !modeState.target || !data) return null
    const stringLinks = data.links.map((l) => ({
      source: typeof l.source === 'string' ? l.source : (l.source as any).id,
      target: typeof l.target === 'string' ? l.target : (l.target as any).id,
    }))
    return bfs(modeState.source, modeState.target, stringLinks)
  }, [modeState, data])

  const highlightedPath = useMemo(() => {
    if (!pathResult) return null
    return new Set(pathResult)
  }, [pathResult])

  // Neighborhood mode: derive subgraph from mode state
  const neighborhoodDepth = modeState.type === 'neighborhood' ? modeState.depth : 1
  const neighborhoodCenterId = modeState.type === 'neighborhood' ? modeState.centerId : null

  const neighborhoodData = useNeighborhood(
    neighborhoodCenterId,
    data?.nodes ?? [],
    data?.links ?? [],
    neighborhoodDepth as 1 | 2,
  )

  const pathInfo = useMemo(() => {
    if (!pathResult || !data) return null
    const nodeMap = new Map(data.nodes.map((n: { id: string; name: string }) => [n.id, n.name]))
    return pathResult.map((id) => nodeMap.get(id) ?? id).join(' -> ')
  }, [pathResult, data])

  const lastClickRef = useRef<{ id: string; time: number } | null>(null)

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      const now = Date.now()
      const lastClick = lastClickRef.current

      // Double-click detection (< 400ms between clicks on same node)
      if (lastClick && lastClick.id === node.id && now - lastClick.time < 400) {
        // Enter neighborhood mode
        setModeState({ type: 'neighborhood', centerId: node.id, depth: 1 })
        lastClickRef.current = null
        return
      }

      lastClickRef.current = { id: node.id, time: now }

      if (modeState.type === 'path') {
        if (!modeState.source) {
          setModeState({ type: 'path', source: node.id, target: null })
        } else if (!modeState.target && node.id !== modeState.source) {
          setModeState({ type: 'path', source: modeState.source, target: node.id })
        } else {
          setModeState({ type: 'path', source: node.id, target: null })
        }
      } else {
        setSelectedNodeId(node.id)
      }
    },
    [modeState],
  )

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node)
  }, [])

  // Focus a node from analytics panel (select it to open entity panel)
  const handleNodeFocus = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
  }, [])

  // Escape exits any non-explore mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && modeState.type !== 'explore') {
        setModeState(DEFAULT_MODE_STATE)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modeState.type])

  if (error)
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Cannot reach API server
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Start the api-server with `npm run api` and refresh.
        </p>
      </div>
    )

  if (!isLoading && (!displayData?.nodes || displayData.nodes.length === 0))
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Graph is empty
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Run a consolidation cycle to populate the knowledge graph.
        </p>
      </div>
    )

  return (
    <div className="relative h-[calc(100vh-theme(spacing.12))]">
      {displayData && (
        <GraphView
          nodes={displayData.nodes}
          links={displayData.links}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          highlightedPath={highlightedPath}
          neighborhoodData={neighborhoodData}
          clusterInfos={clusterInfos}
          confidenceThreshold={confidenceThreshold}
          timelineCutoffRef={timelineEnabled ? timelineCutoffRef : undefined}
          timelineActive={timelineEnabled}
        />
      )}

      <GraphToolbar
        activeMode={modeState.type}
        onExitMode={() => setModeState(DEFAULT_MODE_STATE)}
        onTogglePathMode={() => {
          if (modeState.type === 'path') {
            setModeState(DEFAULT_MODE_STATE)
          } else {
            setModeState({ type: 'path', source: null, target: null })
          }
        }}
        pathInfo={pathInfo}
        onClearPath={() => {
          setModeState({ type: 'path', source: null, target: null })
        }}
        neighborhoodCenter={
          modeState.type === 'neighborhood'
            ? (displayData?.nodes.find((n) => n.id === modeState.centerId)?.name ?? null)
            : null
        }
        neighborhoodDepth={modeState.type === 'neighborhood' ? modeState.depth : 1}
        onNeighborhoodDepthChange={(depth) => {
          if (modeState.type === 'neighborhood') {
            setModeState({ ...modeState, depth })
          }
        }}
        timelineEnabled={timelineEnabled}
        onToggleTimeline={() => setTimelineEnabled(!timelineEnabled)}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen(!legendOpen)}
        analyticsOpen={analyticsOpen}
        onToggleAnalytics={() => setAnalyticsOpen(!analyticsOpen)}
        confidenceThreshold={confidenceThreshold}
        onConfidenceChange={setConfidenceThreshold}
        clustersEnabled={clustersEnabled}
        onToggleClusters={() => setClustersEnabled(!clustersEnabled)}
      />

      {legendOpen && <GraphLegend />}

      {analyticsOpen && displayData && (
        <GraphAnalytics
          nodes={displayData.nodes}
          links={displayData.links}
          hoveredNode={hoveredNode}
          onNodeFocus={handleNodeFocus}
        />
      )}

      {timelineEnabled && dateRange.min > 0 && (
        <TimelineSlider
          minMs={dateRange.min}
          maxMs={dateRange.max}
          cutoffRef={timelineCutoffRef}
          onScrub={handleScrub}
        />
      )}

      {selectedNodeId && (
        <EntityPanel
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
          onExploreNeighborhood={(nodeId) => {
            setModeState({ type: 'neighborhood', centerId: nodeId, depth: 1 })
            setSelectedNodeId(null)
          }}
        />
      )}
    </div>
  )
}
