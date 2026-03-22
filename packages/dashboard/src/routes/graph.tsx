import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useGraph } from '../hooks/use-graph'
import { GraphView, getLinkNodeId } from '../components/graph-view'
import type { GraphNode, GraphLink } from '../components/graph-view'
import { EntityPanel } from '../components/entity-panel'
import { GraphToolbar } from '../components/graph-toolbar'
import { GraphLegend } from '../components/graph-legend'
import { TimelineSlider } from '../components/timeline-slider'

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

  // Path tracing
  const [pathMode, setPathMode] = useState(false)
  const [pathSource, setPathSource] = useState<string | null>(null)
  const [pathTarget, setPathTarget] = useState<string | null>(null)

  // Timeline
  const [timelineEnabled, setTimelineEnabled] = useState(false)
  const [timelineDate, setTimelineDate] = useState<string>('')

  // Legend
  const [legendOpen, setLegendOpen] = useState(false)

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
    if (!pathSource || !pathTarget || !filteredData) return null
    // Build string-id links for BFS
    const stringLinks = filteredData.links.map((l) => ({
      source: typeof l.source === 'string' ? l.source : (l.source as any).id,
      target: typeof l.target === 'string' ? l.target : (l.target as any).id,
    }))
    return bfs(pathSource, pathTarget, stringLinks)
  }, [pathSource, pathTarget, filteredData])

  const highlightedPath = useMemo(() => {
    if (!pathResult) return null
    return new Set(pathResult)
  }, [pathResult])

  const pathInfo = useMemo(() => {
    if (!pathResult || !filteredData) return null
    const nodeMap = new Map(filteredData.nodes.map((n) => [n.id, n.name]))
    return pathResult.map((id) => nodeMap.get(id) ?? id).join(' → ')
  }, [pathResult, filteredData])

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (pathMode) {
        if (!pathSource) {
          setPathSource(node.id)
        } else if (!pathTarget && node.id !== pathSource) {
          setPathTarget(node.id)
        } else {
          // Reset
          setPathSource(node.id)
          setPathTarget(null)
        }
      } else {
        setSelectedNodeId(node.id)
      }
    },
    [pathMode, pathSource, pathTarget],
  )

  // Escape exits path mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && pathMode) {
        setPathMode(false)
        setPathSource(null)
        setPathTarget(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pathMode])

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
          highlightedPath={highlightedPath}
        />
      )}

      <GraphToolbar
        pathMode={pathMode}
        onTogglePathMode={() => {
          setPathMode(!pathMode)
          if (pathMode) {
            setPathSource(null)
            setPathTarget(null)
          }
        }}
        pathInfo={pathInfo}
        onClearPath={() => {
          setPathSource(null)
          setPathTarget(null)
        }}
        timelineEnabled={timelineEnabled}
        onToggleTimeline={() => setTimelineEnabled(!timelineEnabled)}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen(!legendOpen)}
      />

      {legendOpen && <GraphLegend />}

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
        />
      )}
    </div>
  )
}
