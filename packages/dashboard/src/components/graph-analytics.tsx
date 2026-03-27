import { useMemo } from 'react'
import { ScrollArea } from './ui/scroll-area'
import { getNodeColor } from './graph-view'
import type { GraphNode } from './graph-view'

interface GraphAnalyticsProps {
  nodes: Array<{
    id: string; name: string; type: string; val: number
    confidence?: number; summary?: string | null; created_at?: string
  }>
  links: Array<{
    source: string; target: string; type: string
    confidence?: number; source_type?: string; created_at?: string
  }>
  hoveredNode?: GraphNode | null
  onNodeFocus?: (nodeId: string) => void
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface GraphMetrics {
  nodeCount: number
  edgeCount: number
  typeCount: number
  density: number
  avgDegree: number
  maxDegree: number
  componentCount: number
  isolatedCount: number
  avgConfidence: number
  confidenceBands: { high: number; medium: number; low: number }
  typeDistribution: Array<{ type: string; count: number; pct: number }>
  topHubs: Array<{ id: string; name: string; type: string; degree: number }>
  bridgeNodes: Array<{ id: string; name: string; type: string; typesConnected: number }>
  relationshipTypes: Array<{ type: string; count: number }>
  autoDiscoveredPct: number
}

function computeMetrics(
  nodes: GraphAnalyticsProps['nodes'],
  links: GraphAnalyticsProps['links'],
): GraphMetrics {
  const nodeCount = nodes.length
  const edgeCount = links.length

  // Degree map
  const degreeMap = new Map<string, number>()
  const neighborTypes = new Map<string, Set<string>>()
  const nodeTypeMap = new Map<string, string>()

  for (const n of nodes) {
    degreeMap.set(n.id, 0)
    neighborTypes.set(n.id, new Set())
    nodeTypeMap.set(n.id, n.type)
  }

  for (const l of links) {
    const src = typeof l.source === 'string' ? l.source : (l.source as any).id
    const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id
    degreeMap.set(src, (degreeMap.get(src) ?? 0) + 1)
    degreeMap.set(tgt, (degreeMap.get(tgt) ?? 0) + 1)

    const srcType = nodeTypeMap.get(src) ?? ''
    const tgtType = nodeTypeMap.get(tgt) ?? ''
    neighborTypes.get(src)?.add(tgtType)
    neighborTypes.get(tgt)?.add(srcType)
  }

  // Graph density: edges / max possible edges (undirected)
  const maxEdges = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 1
  const density = edgeCount / maxEdges

  // Average and max degree
  const degrees = [...degreeMap.values()]
  const avgDegree = nodeCount > 0 ? degrees.reduce((a, b) => a + b, 0) / nodeCount : 0
  const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0

  // Connected components via union-find
  // See also: ../lib/graph-clusters.ts for Louvain community detection (topology-based clustering)
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x)
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b))
  }

  for (const n of nodes) parent.set(n.id, n.id)
  for (const l of links) {
    const src = typeof l.source === 'string' ? l.source : (l.source as any).id
    const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id
    union(src, tgt)
  }

  const components = new Set<string>()
  for (const n of nodes) components.add(find(n.id))
  const componentCount = components.size

  // Isolated nodes (degree 0)
  const isolatedCount = degrees.filter((d) => d === 0).length

  // Type distribution
  const typeCounts = new Map<string, number>()
  for (const n of nodes) {
    typeCounts.set(n.type, (typeCounts.get(n.type) ?? 0) + 1)
  }
  const typeDistribution = [...typeCounts.entries()]
    .map(([type, count]) => ({
      type,
      count,
      pct: nodeCount > 0 ? Math.round((count / nodeCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Confidence metrics
  const confidences = nodes.map((n) => n.confidence ?? 1)
  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 1
  const confidenceBands = {
    high: confidences.filter((c) => c >= 0.8).length,
    medium: confidences.filter((c) => c >= 0.5 && c < 0.8).length,
    low: confidences.filter((c) => c < 0.5).length,
  }

  // Top hubs (most connected)
  const topHubs = [...degreeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([id, degree]) => {
      const node = nodes.find((n) => n.id === id)
      return {
        id,
        name: node?.name ?? id,
        type: node?.type ?? 'unknown',
        degree,
      }
    })

  // Bridge nodes: nodes that connect the most different entity types
  const bridgeNodes = [...neighborTypes.entries()]
    .map(([id, types]) => {
      const node = nodes.find((n) => n.id === id)
      return {
        id,
        name: node?.name ?? id,
        type: node?.type ?? 'unknown',
        typesConnected: types.size,
      }
    })
    .filter((b) => b.typesConnected >= 2)
    .sort((a, b) => b.typesConnected - a.typesConnected)
    .slice(0, 5)

  // Relationship type breakdown
  const relTypeCounts = new Map<string, number>()
  let autoDiscovered = 0
  for (const l of links) {
    relTypeCounts.set(l.type, (relTypeCounts.get(l.type) ?? 0) + 1)
    if (l.source_type === 'auto_discovery') autoDiscovered++
  }
  const relationshipTypes = [...relTypeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const autoDiscoveredPct = edgeCount > 0 ? Math.round((autoDiscovered / edgeCount) * 100) : 0

  return {
    nodeCount,
    edgeCount,
    typeCount: typeCounts.size,
    density,
    avgDegree,
    maxDegree,
    componentCount,
    isolatedCount,
    avgConfidence,
    confidenceBands,
    typeDistribution,
    topHubs,
    bridgeNodes,
    relationshipTypes,
    autoDiscoveredPct,
  }
}

function MetricRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-xs font-mono" style={{ color: color ?? 'var(--text-secondary)' }}>{value}</span>
    </div>
  )
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full flex-1 mx-2" style={{ backgroundColor: 'var(--bg-elevated)' }}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.min(pct, 100)}%`,
          backgroundColor: color,
          boxShadow: `0 0 4px ${hexToRgba(color, 0.4)}`,
        }}
      />
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-semibold mb-2 mt-4 first:mt-0 uppercase tracking-wider"
      style={{ color: 'var(--text-secondary)', fontSize: '10px' }}
    >
      {children}
    </p>
  )
}

export function GraphAnalytics({ nodes, links, hoveredNode, onNodeFocus }: GraphAnalyticsProps) {
  const metrics = useMemo(() => computeMetrics(nodes, links), [nodes, links])

  // Compute hovered node's local stats
  const hoveredStats = useMemo(() => {
    if (!hoveredNode) return null
    const degree = links.filter((l) => {
      const src = typeof l.source === 'string' ? l.source : (l.source as any).id
      const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id
      return src === hoveredNode.id || tgt === hoveredNode.id
    }).length
    const neighborSet = new Set<string>()
    const relTypes = new Set<string>()
    for (const l of links) {
      const src = typeof l.source === 'string' ? l.source : (l.source as any).id
      const tgt = typeof l.target === 'string' ? l.target : (l.target as any).id
      if (src === hoveredNode.id) {
        neighborSet.add(tgt)
        relTypes.add(l.type)
      }
      if (tgt === hoveredNode.id) {
        neighborSet.add(src)
        relTypes.add(l.type)
      }
    }
    return { degree, neighborCount: neighborSet.size, relationTypes: relTypes.size }
  }, [hoveredNode, links])

  return (
    <div
      className="absolute top-4 right-[170px] z-10 w-[260px] rounded-lg overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'rgba(5, 5, 16, 0.92)',
        border: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(12px)',
        maxHeight: 'calc(100vh - 8rem)',
      }}
    >
      <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--glow-teal)' }}>
          Graph Analytics
        </p>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <div className="pb-3">
          {/* Hovered node context */}
          {hoveredNode && hoveredStats && (
            <>
              <SectionHeader>Selected Node</SectionHeader>
              <div
                className="rounded-md px-2 py-2 mb-3"
                style={{
                  backgroundColor: hexToRgba(getNodeColor(hoveredNode.type), 0.08),
                  border: `1px solid ${hexToRgba(getNodeColor(hoveredNode.type), 0.2)}`,
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: getNodeColor(hoveredNode.type) }}
                  />
                  <span className="text-xs font-medium truncate" style={{ color: getNodeColor(hoveredNode.type) }}>
                    {hoveredNode.name}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
                      {hoveredStats.degree}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>edges</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
                      {hoveredNode.val}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>obs</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>
                      {Math.round((hoveredNode.confidence ?? 1) * 100)}%
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>conf</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Overview */}
          <SectionHeader>Overview</SectionHeader>
          <MetricRow label="Nodes" value={metrics.nodeCount} color="var(--glow-teal)" />
          <MetricRow label="Edges" value={metrics.edgeCount} color="var(--glow-violet)" />
          <MetricRow label="Types" value={metrics.typeCount} color="var(--glow-amber)" />
          <MetricRow label="Clusters" value={metrics.componentCount} color="var(--glow-blue)" />
          <MetricRow label="Isolated" value={metrics.isolatedCount} color={metrics.isolatedCount > 0 ? 'var(--glow-rose)' : 'var(--text-muted)'} />
          <MetricRow label="Avg Degree" value={metrics.avgDegree.toFixed(1)} />
          <MetricRow label="Max Degree" value={metrics.maxDegree} />
          <MetricRow
            label="Density"
            value={metrics.density < 0.01 ? metrics.density.toExponential(1) : (metrics.density * 100).toFixed(1) + '%'}
          />

          {/* Confidence */}
          <SectionHeader>Knowledge Confidence</SectionHeader>
          <MetricRow
            label="Average"
            value={`${Math.round(metrics.avgConfidence * 100)}%`}
            color="var(--glow-teal)"
          />
          <div className="space-y-1.5 mt-1">
            <div className="flex items-center text-xs">
              <span className="w-14 shrink-0" style={{ color: 'var(--glow-emerald)' }}>High</span>
              <MiniBar
                pct={metrics.nodeCount > 0 ? (metrics.confidenceBands.high / metrics.nodeCount) * 100 : 0}
                color="var(--glow-emerald)"
              />
              <span className="w-6 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                {metrics.confidenceBands.high}
              </span>
            </div>
            <div className="flex items-center text-xs">
              <span className="w-14 shrink-0" style={{ color: 'var(--glow-amber)' }}>Mid</span>
              <MiniBar
                pct={metrics.nodeCount > 0 ? (metrics.confidenceBands.medium / metrics.nodeCount) * 100 : 0}
                color="var(--glow-amber)"
              />
              <span className="w-6 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                {metrics.confidenceBands.medium}
              </span>
            </div>
            <div className="flex items-center text-xs">
              <span className="w-14 shrink-0" style={{ color: 'var(--glow-rose)' }}>Low</span>
              <MiniBar
                pct={metrics.nodeCount > 0 ? (metrics.confidenceBands.low / metrics.nodeCount) * 100 : 0}
                color="var(--glow-rose)"
              />
              <span className="w-6 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                {metrics.confidenceBands.low}
              </span>
            </div>
          </div>

          {/* Type Distribution */}
          <SectionHeader>Entity Types</SectionHeader>
          <div className="space-y-1.5">
            {metrics.typeDistribution.map(({ type, count, pct }) => {
              const color = getNodeColor(type)
              return (
                <div key={type} className="flex items-center text-xs">
                  <span
                    className="w-2 h-2 rounded-full shrink-0 mr-1.5"
                    style={{ backgroundColor: color }}
                  />
                  <span className="w-20 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {type}
                  </span>
                  <MiniBar pct={pct} color={color} />
                  <span className="w-8 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Hub nodes */}
          <SectionHeader>Top Hubs</SectionHeader>
          <div className="space-y-1">
            {metrics.topHubs.map((hub, i) => {
              const color = getNodeColor(hub.type)
              return (
                <button
                  key={hub.id}
                  className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded-md transition-colors hover:brightness-125"
                  style={{ backgroundColor: i === 0 ? hexToRgba(color, 0.08) : 'transparent' }}
                  onClick={() => onNodeFocus?.(hub.id)}
                >
                  <span className="text-xs font-mono w-4 shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {i + 1}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                    {hub.name}
                  </span>
                  <span className="text-xs font-mono shrink-0" style={{ color }}>
                    {hub.degree}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Bridge nodes */}
          {metrics.bridgeNodes.length > 0 && (
            <>
              <SectionHeader>Bridge Nodes</SectionHeader>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                Connect the most different entity types
              </p>
              <div className="space-y-1">
                {metrics.bridgeNodes.map((bridge) => {
                  const color = getNodeColor(bridge.type)
                  return (
                    <button
                      key={bridge.id}
                      className="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded-md transition-colors hover:brightness-125"
                      onClick={() => onNodeFocus?.(bridge.id)}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                        {bridge.name}
                      </span>
                      <span className="text-xs font-mono shrink-0" style={{ color: 'var(--glow-blue)' }}>
                        {bridge.typesConnected} types
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Relationship types */}
          <SectionHeader>Relationship Types</SectionHeader>
          <div className="space-y-1">
            {metrics.relationshipTypes.map(({ type, count }) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{type}</span>
                <span className="font-mono shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>{count}</span>
              </div>
            ))}
          </div>
          {links.length > 0 && (
            <div className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {metrics.autoDiscoveredPct}% auto-discovered
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
