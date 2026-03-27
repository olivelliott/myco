import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { computeGraphDataKey } from '../lib/graph-types'

export type GraphNode = {
  id: string
  name: string
  type: string
  val: number
  confidence: number
  summary: string | null
  created_at: string
  color: string
  opacity: number
  x?: number
  y?: number
  fx?: number | undefined
  fy?: number | undefined
}

export type GraphLink = {
  source: string | GraphNode
  target: string | GraphNode
  type: string
  confidence: number
  source_type: string
  created_at: string
}

interface GraphViewProps {
  nodes: Array<{
    id: string; name: string; type: string; val: number
    confidence?: number; summary?: string | null; created_at?: string
  }>
  links: Array<{
    source: string; target: string; type: string
    confidence?: number; source_type?: string; created_at?: string
  }>
  onNodeClick: (node: GraphNode) => void
  onNodeHover?: (node: GraphNode | null) => void
  mini?: boolean
  highlightedPath?: Set<string> | null
  neighborhoodData?: { nodes: Array<GraphNode>; links: Array<GraphLink> } | null
}

const TYPE_COLORS: Record<string, string> = {
  person:     '#06ffc8',
  agent:      '#06ffc8',
  project:    '#a78bfa',
  codebase:   '#a78bfa',
  concept:    '#fbbf24',
  topic:      '#fbbf24',
  tool:       '#34d399',
  library:    '#34d399',
  technology: '#60a5fa',
  decision:   '#f472b6',
}
const DEFAULT_COLOR = '#818cf8'

export function getNodeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? DEFAULT_COLOR
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function getLinkNodeId(node: string | GraphNode): string {
  return typeof node === 'string' ? node : node.id
}

export function GraphView({
  nodes, links, onNodeClick, onNodeHover, mini = false, highlightedPath, neighborhoodData,
}: GraphViewProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasZoomedRef = useRef(false)

  const uniqueTypes = useMemo(
    () => [...new Set(nodes.map((n) => n.type))].sort(),
    [nodes],
  )

  const decoratedNodes = useMemo(() => {
    return nodes
      .filter((n) => typeFilter === 'all' || n.type === typeFilter)
      .map((n) => ({
        ...n,
        confidence: n.confidence ?? 1,
        summary: n.summary ?? null,
        created_at: n.created_at ?? '',
        color: getNodeColor(n.type),
        opacity: search && !n.name.toLowerCase().includes(search.toLowerCase()) ? 0.15 : 1,
      }))
  }, [nodes, search, typeFilter])

  const filteredNodeIds = useMemo(
    () => new Set(decoratedNodes.map((n) => n.id)),
    [decoratedNodes],
  )

  const filteredLinks = useMemo(
    () =>
      links
        .filter(
          (l) =>
            filteredNodeIds.has(l.source as string) &&
            filteredNodeIds.has(l.target as string),
        )
        .map((l) => ({
          ...l,
          confidence: l.confidence ?? 1,
          source_type: l.source_type ?? 'agent_session',
          created_at: l.created_at ?? '',
        })),
    [links, filteredNodeIds],
  )

  // When in neighborhood mode, use the neighborhood subgraph instead of full graph
  const activeNodes = neighborhoodData ? neighborhoodData.nodes : decoratedNodes
  const activeLinks = neighborhoodData ? neighborhoodData.links : filteredLinks

  // Stable graphData: only changes when node/link ID set changes (Pitfall 1 fix)
  const graphDataKey = useMemo(() => {
    const nodeIds = activeNodes.map((n: GraphNode) => n.id)
    const linkPairs = activeLinks.map((l: GraphLink) => ({
      source: typeof l.source === 'string' ? l.source : (l.source as GraphNode).id,
      target: typeof l.target === 'string' ? l.target : (l.target as GraphNode).id,
    }))
    return computeGraphDataKey(nodeIds, linkPairs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNodes, activeLinks])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableGraphData = useMemo(() => ({
    nodes: activeNodes as GraphNode[],
    links: activeLinks as GraphLink[],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [graphDataKey])

  // Build neighbor set for hover illumination (uses activeLinks for neighborhood mode correctness)
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const link of activeLinks) {
      const srcId = getLinkNodeId(link.source)
      const tgtId = getLinkNodeId(link.target)
      if (!map.has(srcId)) map.set(srcId, new Set())
      if (!map.has(tgtId)) map.set(tgtId, new Set())
      map.get(srcId)!.add(tgtId)
      map.get(tgtId)!.add(srcId)
    }
    return map
  }, [activeLinks])

  const isHighlighted = useCallback(
    (nodeId: string) => {
      if (highlightedPath?.has(nodeId)) return true
      if (!hoveredNodeId) return true
      if (nodeId === hoveredNodeId) return true
      return neighborMap.get(hoveredNodeId)?.has(nodeId) ?? false
    },
    [hoveredNodeId, neighborMap, highlightedPath],
  )

  const isLinkHighlighted = useCallback(
    (link: GraphLink) => {
      if (highlightedPath) {
        const srcId = getLinkNodeId(link.source)
        const tgtId = getLinkNodeId(link.target)
        return highlightedPath.has(srcId) && highlightedPath.has(tgtId)
      }
      if (!hoveredNodeId) return true
      const srcId = getLinkNodeId(link.source)
      const tgtId = getLinkNodeId(link.target)
      return srcId === hoveredNodeId || tgtId === hoveredNodeId
    },
    [hoveredNodeId, highlightedPath],
  )

  // Zoom to fit after engine stabilizes, then freeze simulation (GRPH-01)
  const handleEngineStop = useCallback(() => {
    if (!hasZoomedRef.current && fgRef.current && !mini) {
      hasZoomedRef.current = true
      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 80)
      }, 100)
    }
    // Freeze simulation after initial layout — prevents hover drift (GRPH-01)
    if (fgRef.current) {
      fgRef.current.cooldownTicks(0)
    }
  }, [mini])

  // Reset zoom flag when data changes significantly
  useEffect(() => {
    hasZoomedRef.current = false
  }, [nodes.length])

  // Reset zoom flag when entering/exiting neighborhood mode so view re-zooms to fit subgraph
  useEffect(() => {
    hasZoomedRef.current = false
  }, [neighborhoodData != null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Configure forces after mount
  useEffect(() => {
    if (!fgRef.current || mini) return
    const fg = fgRef.current

    // Weaker charge so nodes don't fly apart, with max distance cap
    fg.d3Force('charge')?.strength(-120).distanceMax(300)

    // Stronger center gravity to keep the graph cohesive
    fg.d3Force('center')?.strength(0.05)

    // Link distance and strength for readable spacing
    fg.d3Force('link')?.distance(60).strength(0.3)
  }, [mini, decoratedNodes.length])

  // Set cursor style on the canvas element
  useEffect(() => {
    if (mini) return
    const canvas = containerRef.current?.querySelector('canvas')
    if (canvas) {
      canvas.style.cursor = hoveredNodeId ? 'pointer' : 'grab'
    }
  }, [hoveredNodeId, mini])

  // Search auto-zoom: animate camera to first match after 300ms debounce (GRPH-05)
  const searchZoomTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (searchZoomTimerRef.current) {
      clearTimeout(searchZoomTimerRef.current)
      searchZoomTimerRef.current = null
    }

    if (!search || mini) return

    searchZoomTimerRef.current = window.setTimeout(() => {
      // Find first matching node with valid position
      const match = decoratedNodes.find(
        (n) => n.name.toLowerCase().includes(search.toLowerCase()) && n.x !== undefined && n.y !== undefined,
      )
      if (match && fgRef.current) {
        fgRef.current.centerAt(match.x, match.y, 400)
        fgRef.current.zoom(3, 400)
      }
    }, 300)

    return () => {
      if (searchZoomTimerRef.current) clearTimeout(searchZoomTimerRef.current)
    }
  }, [search, mini, decoratedNodes])

  // Keep pulse animation running when simulation is cooled
  useEffect(() => {
    if (!search || mini) return
    const interval = window.setInterval(() => {
      fgRef.current?.refresh()
    }, 50) // ~20fps for pulse animation
    return () => clearInterval(interval)
  }, [search, mini])

  // Stats
  const stats = useMemo(() => ({
    nodes: decoratedNodes.length,
    links: filteredLinks.length,
    types: uniqueTypes.length,
  }), [decoratedNodes.length, filteredLinks.length, uniqueTypes.length])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Search + filter controls */}
      {!mini && (
        <div className="absolute top-4 left-4 z-10 flex flex-col md:flex-row gap-2">
          <Input
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-[280px]"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger
              className="w-full md:w-[160px]"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {uniqueTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Stats bar */}
      {!mini && (
        <div
          className="absolute bottom-4 right-4 z-10 flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-mono"
          style={{
            backgroundColor: 'rgba(5, 5, 16, 0.8)',
            border: '1px solid var(--border-subtle)',
            backdropFilter: 'blur(8px)',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            <span style={{ color: 'var(--glow-teal)' }}>{stats.nodes}</span> nodes
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span>
            <span style={{ color: 'var(--glow-violet)' }}>{stats.links}</span> edges
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>|</span>
          <span>
            <span style={{ color: 'var(--glow-amber)' }}>{stats.types}</span> types
          </span>
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        graphData={stableGraphData}
        nodeId="id"
        nodeVal="val"
        nodeLabel=""
        // Use high velocity decay to dampen node motion quickly.
        // The original bug (nodes flying away on hover) was caused by
        // overly strong default charge force + simulation reheat from drag.
        // Our force config in useEffect fixes the root cause; this adds extra stability.
        d3VelocityDecay={0.4}
        d3AlphaDecay={0.03}
        warmupTicks={mini ? 0 : 60}
        cooldownTicks={mini ? Infinity : 200}
        cooldownTime={2000}
        onEngineStop={handleEngineStop}
        // Node dragging pins the node in place
        onNodeDrag={(node: any) => {
          node.fx = node.x
          node.fy = node.y
        }}
        onNodeDragEnd={(node: any) => {
          node.fx = node.x
          node.fy = node.y
        }}
        onBackgroundClick={() => {
          setHoveredNodeId(null)
        }}
        nodeCanvasObject={(
          node: object,
          ctx: CanvasRenderingContext2D,
          globalScale: number,
        ) => {
          const n = node as GraphNode
          if (n.x === undefined || n.y === undefined) return

          // LOD: skip expensive operations when zoomed out far (GRPH-08, Pitfall 5)
          const isLOD = globalScale < 0.5
          const highlighted = isHighlighted(n.id)
          const alpha = highlighted ? (n.opacity ?? 1) : 0.06

          if (isLOD) {
            // LOD mode: solid circle only, no gradients, no labels, no specular
            const baseSize = Math.sqrt(n.val) * 2.5 + 1.5
            ctx.beginPath()
            ctx.arc(n.x, n.y, baseSize, 0, 2 * Math.PI)
            ctx.fillStyle = hexToRgba(n.color, 0.8 * alpha)
            ctx.fill()
            return // Skip all gradient/label/ring rendering
          }

          const baseSize = Math.sqrt(n.val) * 2.5 + 1.5
          const isHovered = n.id === hoveredNodeId
          const isNeighbor = hoveredNodeId ? (neighborMap.get(hoveredNodeId)?.has(n.id) ?? false) : false
          const onPath = highlightedPath?.has(n.id)

          // Static size boost for hovered node (no animation needed)
          const size = isHovered ? baseSize * 1.2 : baseSize

          // Outer glow — larger and more vivid for interactive states
          const glowRadius = onPath
            ? size * 7
            : isHovered
              ? size * 6
              : isNeighbor
                ? size * 4
                : size * 2.5

          const glowAlpha = onPath
            ? 0.4
            : isHovered
              ? 0.35
              : isNeighbor
                ? 0.2
                : 0.12

          const gradient = ctx.createRadialGradient(
            n.x, n.y, 0,
            n.x, n.y, glowRadius,
          )
          gradient.addColorStop(0, hexToRgba(n.color, glowAlpha * alpha))
          gradient.addColorStop(0.4, hexToRgba(n.color, glowAlpha * 0.4 * alpha))
          gradient.addColorStop(1, hexToRgba(n.color, 0))
          ctx.beginPath()
          ctx.arc(n.x, n.y, glowRadius, 0, 2 * Math.PI)
          ctx.fillStyle = gradient
          ctx.fill()

          // Core circle with 3D-ish gradient
          const coreGradient = ctx.createRadialGradient(
            n.x - size * 0.3, n.y - size * 0.3, 0,
            n.x, n.y, size,
          )
          coreGradient.addColorStop(0, hexToRgba('#ffffff', 0.25 * alpha))
          coreGradient.addColorStop(0.5, hexToRgba(n.color, 0.9 * alpha))
          coreGradient.addColorStop(1, hexToRgba(n.color, 0.7 * alpha))

          ctx.beginPath()
          ctx.arc(n.x, n.y, size, 0, 2 * Math.PI)
          ctx.fillStyle = coreGradient
          ctx.fill()

          // Inner specular highlight for depth
          ctx.beginPath()
          ctx.arc(n.x - size * 0.2, n.y - size * 0.2, size * 0.3, 0, 2 * Math.PI)
          ctx.fillStyle = hexToRgba('#ffffff', 0.35 * alpha)
          ctx.fill()

          // Hover rings
          if (isHovered) {
            ctx.beginPath()
            ctx.arc(n.x, n.y, size + 3 / globalScale, 0, 2 * Math.PI)
            ctx.strokeStyle = hexToRgba(n.color, 0.8)
            ctx.lineWidth = 2 / globalScale
            ctx.stroke()

            ctx.beginPath()
            ctx.arc(n.x, n.y, size + 7 / globalScale, 0, 2 * Math.PI)
            ctx.strokeStyle = hexToRgba(n.color, 0.2)
            ctx.lineWidth = 1 / globalScale
            ctx.stroke()
          }

          // Path tracing ring
          if (onPath && !isHovered) {
            ctx.beginPath()
            ctx.arc(n.x, n.y, size + 3 / globalScale, 0, 2 * Math.PI)
            ctx.strokeStyle = hexToRgba(n.color, 0.9)
            ctx.lineWidth = 1.5 / globalScale
            ctx.stroke()
          }

          // Search match pulse ring
          const isSearchMatch = search && n.name.toLowerCase().includes(search.toLowerCase())
          if (isSearchMatch && !isLOD) {
            const pulseScale = 1 + 0.3 * Math.sin(Date.now() / 300)
            const pulseRadius = (size + 5 / globalScale) * pulseScale
            ctx.beginPath()
            ctx.arc(n.x, n.y, pulseRadius, 0, 2 * Math.PI)
            ctx.strokeStyle = hexToRgba(n.color, 0.6)
            ctx.lineWidth = 1.5 / globalScale
            ctx.stroke()
          }

          // Pin indicator (amber dot at top-right if node is pinned)
          if (n.fx !== undefined && n.fx !== null) {
            ctx.beginPath()
            ctx.arc(n.x + size * 0.7, n.y - size * 0.7, 2 / globalScale, 0, 2 * Math.PI)
            ctx.fillStyle = hexToRgba('#fbbf24', 0.8 * alpha)
            ctx.fill()
          }

          // Labels — always show for hovered/neighbors/path, zoom-dependent otherwise
          const showLabel = isHovered || isNeighbor || onPath || globalScale > 1.2 || !hoveredNodeId
          if (showLabel && (!mini || globalScale > 2)) {
            const fontSize = isHovered
              ? Math.max(12 / globalScale, 4)
              : Math.max(10 / globalScale, 3)
            const fontWeight = isHovered || onPath ? '600' : '400'
            ctx.font = `${fontWeight} ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'

            const labelY = n.y + size + 3 / globalScale
            const labelAlpha = isHovered ? 1 : isNeighbor ? 0.9 : 0.7

            // Text background pill for readability
            const textWidth = ctx.measureText(n.name).width
            const padX = 3 / globalScale
            const padY = 1.5 / globalScale
            ctx.fillStyle = hexToRgba('#050510', 0.7 * alpha * labelAlpha)
            ctx.beginPath()
            ctx.roundRect(
              n.x - textWidth / 2 - padX,
              labelY - padY,
              textWidth + padX * 2,
              fontSize + padY * 2,
              2 / globalScale,
            )
            ctx.fill()

            ctx.fillStyle = hexToRgba(n.color, labelAlpha * alpha)
            ctx.fillText(n.name, n.x, labelY)

            // Show type badge under hovered node
            if (isHovered) {
              const typeLabel = n.type
              const typeFontSize = Math.max(8 / globalScale, 2.5)
              ctx.font = `400 ${typeFontSize}px ui-sans-serif, system-ui, sans-serif`
              const typeLabelY = labelY + fontSize + padY * 2 + 2 / globalScale
              const typeWidth = ctx.measureText(typeLabel).width

              ctx.fillStyle = hexToRgba(n.color, 0.15)
              ctx.beginPath()
              ctx.roundRect(
                n.x - typeWidth / 2 - padX,
                typeLabelY - padY,
                typeWidth + padX * 2,
                typeFontSize + padY * 2,
                2 / globalScale,
              )
              ctx.fill()
              ctx.strokeStyle = hexToRgba(n.color, 0.3)
              ctx.lineWidth = 0.5 / globalScale
              ctx.stroke()

              ctx.fillStyle = hexToRgba(n.color, 0.7)
              ctx.fillText(typeLabel, n.x, typeLabelY)
            }
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
        // Paint a generous invisible hit area so hover detection is smooth.
        // Without this, the hit area is smaller than the visual node (glow + size boost),
        // causing flicker as you hover near edges.
        nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D) => {
          const n = node as GraphNode
          if (n.x === undefined || n.y === undefined) return
          const hitRadius = Math.sqrt(n.val) * 2.5 + 8
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(n.x, n.y, hitRadius, 0, 2 * Math.PI)
          ctx.fill()
        }}
        linkCanvasObject={(
          link: object,
          ctx: CanvasRenderingContext2D,
          globalScale: number,
        ) => {
          const l = link as GraphLink & {
            source: GraphNode
            target: GraphNode
          }
          if (!l.source.x || !l.target.x) return

          const srcId = getLinkNodeId(l.source)
          const tgtId = getLinkNodeId(l.target)
          const highlighted = isLinkHighlighted(l)
          const isHoveredLink = hoveredNodeId != null && (srcId === hoveredNodeId || tgtId === hoveredNodeId)

          const alpha = isHoveredLink ? 0.7 : highlighted ? 0.35 : 0.04
          const srcColor = getNodeColor(l.source.type ?? '')
          const tgtColor = getNodeColor(l.target.type ?? '')
          const width = isHoveredLink
            ? (2 + (l.confidence ?? 1) * 2) / globalScale
            : (0.8 + (l.confidence ?? 1) * 1) / globalScale

          // Curved link via quadratic bezier
          const midX = (l.source.x + l.target.x) / 2
          const midY = (l.source.y! + l.target.y!) / 2
          const dx = l.target.x - l.source.x
          const dy = l.target.y! - l.source.y!
          const cpX = midX - dy * 0.1
          const cpY = midY + dx * 0.1

          // Color gradient along link when hovered and connecting different types
          if (isHoveredLink && srcColor !== tgtColor) {
            const linkGrad = ctx.createLinearGradient(
              l.source.x, l.source.y!, l.target.x, l.target.y!,
            )
            linkGrad.addColorStop(0, hexToRgba(srcColor, alpha))
            linkGrad.addColorStop(1, hexToRgba(tgtColor, alpha))
            ctx.strokeStyle = linkGrad
          } else {
            ctx.strokeStyle = hexToRgba(srcColor, alpha)
          }

          ctx.beginPath()
          ctx.moveTo(l.source.x, l.source.y!)
          ctx.quadraticCurveTo(cpX, cpY, l.target.x, l.target.y!)
          ctx.lineWidth = width

          if (l.source_type === 'auto_discovery') {
            ctx.setLineDash([4 / globalScale, 4 / globalScale])
          } else {
            ctx.setLineDash([])
          }
          ctx.stroke()
          ctx.setLineDash([])

          // Relationship label on hover or deep zoom
          const showLabel =
            (isHoveredLink && globalScale > 0.8) ||
            globalScale > 2.5
          if (showLabel && l.type) {
            const fontSize = Math.max(9 / globalScale, 2)
            ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const label = l.type
            const textWidth = ctx.measureText(label).width
            const pad = 3 / globalScale

            // Background pill with subtle border
            ctx.fillStyle = hexToRgba('#0a0a1e', 0.9)
            ctx.beginPath()
            ctx.roundRect(
              cpX - textWidth / 2 - pad,
              cpY - fontSize / 2 - pad / 2,
              textWidth + pad * 2,
              fontSize + pad,
              4 / globalScale,
            )
            ctx.fill()

            ctx.strokeStyle = hexToRgba(srcColor, 0.3)
            ctx.lineWidth = 0.5 / globalScale
            ctx.stroke()

            ctx.fillStyle = hexToRgba(srcColor, 0.9)
            ctx.fillText(label, cpX, cpY)
          }
        }}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={(node: object) => onNodeClick(node as GraphNode)}
        onNodeHover={(node: object | null) => {
          const graphNode = node ? (node as GraphNode) : null
          setHoveredNodeId(graphNode?.id ?? null)
          onNodeHover?.(graphNode)
        }}
        // Right-click unpins a pinned node
        onNodeRightClick={(node: object) => {
          const n = node as GraphNode
          n.fx = undefined
          n.fy = undefined
        }}
        backgroundColor="#050510"
        width={undefined}
        height={undefined}
        enablePointerInteraction={!mini}
        minZoom={0.3}
        maxZoom={12}
      />
    </div>
  )
}
