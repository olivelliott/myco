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
import { type GraphModeState, type GraphInteractionMode, DEFAULT_MODE_STATE } from '../lib/graph-types'

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
  const [timelineDate, setTimelineDate] = useState<string>('')

  // Panels
  const [legendOpen, setLegendOpen] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

  // Compute date range for timeline
  const dateRange = useMemo(() => {
    if (!data?.nodes?.length) return { min: '', max: '' }
    const dates = data.nodes
      .map((n) => n.created_at)
      .filter(Boolean)
      .sort()
    return {
      min: dates[0] || new Date().toISOString(),
      max: dates[dates.length - 1] || new Date().toISOString(),
    }
  }, [data])

  // Initialize timeline date to max
  useEffect(() => {
    if (timelineEnabled && !timelineDate && dateRange.max) {
      setTimelineDate(dateRange.max)
    }
  }, [timelineEnabled, timelineDate, dateRange.max])

  // Filter data by timeline
  const filteredData = useMemo(() => {
    if (!data) return data
    if (!timelineEnabled || !timelineDate) return data

    const cutoff = new Date(timelineDate).getTime()
    const nodes = data.nodes.filter(
      (n) => !n.created_at || new Date(n.created_at).getTime() <= cutoff,
    )
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links = data.links.filter(
      (l) =>
        nodeIds.has(l.source as string) &&
        nodeIds.has(l.target as string) &&
        (!l.created_at || new Date(l.created_at).getTime() <= cutoff),
    )
    return { nodes, links }
  }, [data, timelineEnabled, timelineDate])

  // Path tracing computation
  const pathResult = useMemo(() => {
    if (modeState.type !== 'path' || !modeState.source || !modeState.target || !filteredData) return null
    const stringLinks = filteredData.links.map((l) => ({
      source: typeof l.source === 'string' ? l.source : (l.source as any).id,
      target: typeof l.target === 'string' ? l.target : (l.target as any).id,
    }))
    return bfs(modeState.source, modeState.target, stringLinks)
  }, [modeState, filteredData])

  const highlightedPath = useMemo(() => {
    if (!pathResult) return null
    return new Set(pathResult)
  }, [pathResult])

  // Neighborhood mode: derive subgraph from mode state
  const neighborhoodDepth = modeState.type === 'neighborhood' ? modeState.depth : 1
  const neighborhoodCenterId = modeState.type === 'neighborhood' ? modeState.centerId : null

  const neighborhoodData = useNeighborhood(
    neighborhoodCenterId,
    filteredData?.nodes ?? [],
    filteredData?.links ?? [],
    neighborhoodDepth as 1 | 2,
  )

  const pathInfo = useMemo(() => {
    if (!pathResult || !filteredData) return null
    const nodeMap = new Map(filteredData.nodes.map((n: { id: string; name: string }) => [n.id, n.name]))
    return pathResult.map((id) => nodeMap.get(id) ?? id).join(' -> ')
  }, [pathResult, filteredData])

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

  if (!isLoading && (!filteredData?.nodes || filteredData.nodes.length === 0))
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
      {filteredData && (
        <GraphView
          nodes={filteredData.nodes}
          links={filteredData.links}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          highlightedPath={highlightedPath}
          neighborhoodData={neighborhoodData}
        />
      )}

      <GraphToolbar
        activeMode={modeState.type}
        onModeChange={(mode: GraphInteractionMode) => {
          if (mode === modeState.type) {
            // Clicking active mode chip returns to explore
            setModeState(DEFAULT_MODE_STATE)
          } else if (mode === 'path') {
            setModeState({ type: 'path', source: null, target: null })
          } else if (mode === 'explore') {
            setModeState(DEFAULT_MODE_STATE)
          } else if (mode === 'neighborhood') {
            // Neighborhood entry is via double-click; toolbar chip just shows mode
            setModeState(DEFAULT_MODE_STATE)
          } else if (mode === 'search') {
            setModeState({ type: 'search', query: '' })
          }
        }}
        pathInfo={pathInfo}
        onClearPath={() => {
          setModeState({ type: 'path', source: null, target: null })
        }}
        neighborhoodCenter={
          modeState.type === 'neighborhood'
            ? (filteredData?.nodes.find((n) => n.id === modeState.centerId)?.name ?? null)
            : null
        }
        neighborhoodDepth={modeState.type === 'neighborhood' ? modeState.depth : 1}
        onNeighborhoodDepthChange={(depth) => {
          if (modeState.type === 'neighborhood') {
            setModeState({ ...modeState, depth })
          }
        }}
        onExitNeighborhood={() => setModeState(DEFAULT_MODE_STATE)}
        timelineEnabled={timelineEnabled}
        onToggleTimeline={() => setTimelineEnabled(!timelineEnabled)}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen(!legendOpen)}
        analyticsOpen={analyticsOpen}
        onToggleAnalytics={() => setAnalyticsOpen(!analyticsOpen)}
      />

      {legendOpen && <GraphLegend />}

      {analyticsOpen && filteredData && (
        <GraphAnalytics
          nodes={filteredData.nodes}
          links={filteredData.links}
          hoveredNode={hoveredNode}
          onNodeFocus={handleNodeFocus}
        />
      )}

      {timelineEnabled && dateRange.min && (
        <TimelineSlider
          minDate={dateRange.min}
          maxDate={dateRange.max}
          currentDate={timelineDate || dateRange.max}
          onDateChange={setTimelineDate}
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
