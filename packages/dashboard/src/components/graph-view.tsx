import { useState, useMemo, useCallback, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

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
  mini?: boolean
  highlightedPath?: Set<string> | null
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

function getNodeColor(type: string): string {
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

export function GraphView({ nodes, links, onNodeClick, mini = false, highlightedPath }: GraphViewProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const fgRef = useRef<any>(null)

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

  // Build neighbor set for hover illumination
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const link of filteredLinks) {
      const srcId = getLinkNodeId(link.source)
      const tgtId = getLinkNodeId(link.target)
      if (!map.has(srcId)) map.set(srcId, new Set())
      if (!map.has(tgtId)) map.set(tgtId, new Set())
      map.get(srcId)!.add(tgtId)
      map.get(tgtId)!.add(srcId)
    }
    return map
  }, [filteredLinks])

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

  return (
    <div className="relative w-full h-full">
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

      <ForceGraph2D
        ref={fgRef}
        graphData={{
          nodes: decoratedNodes as GraphNode[],
          links: filteredLinks as GraphLink[],
        }}
        nodeId="id"
        nodeVal="val"
        nodeLabel={(node: object) => {
          const n = node as GraphNode
          return `${n.name} (${n.type}) — ${n.val} observations`
        }}
        nodeCanvasObject={(
          node: object,
          ctx: CanvasRenderingContext2D,
          globalScale: number,
        ) => {
          const n = node as GraphNode
          if (n.x === undefined || n.y === undefined) return
          const size = Math.sqrt(n.val) * 2.5
          const highlighted = isHighlighted(n.id)
          const onPath = highlightedPath?.has(n.id)
          const alpha = highlighted ? (n.opacity ?? 1) : 0.08

          // Outer glow
          const glowRadius =
            onPath
              ? size * 6
              : highlighted && n.id === hoveredNodeId
                ? size * 5
                : size * 3
          const gradient = ctx.createRadialGradient(
            n.x,
            n.y,
            0,
            n.x,
            n.y,
            glowRadius,
          )
          gradient.addColorStop(0, hexToRgba(n.color, 0.3 * alpha))
          gradient.addColorStop(0.5, hexToRgba(n.color, 0.1 * alpha))
          gradient.addColorStop(1, hexToRgba(n.color, 0))
          ctx.beginPath()
          ctx.arc(n.x, n.y, glowRadius, 0, 2 * Math.PI)
          ctx.fillStyle = gradient
          ctx.fill()

          // Core circle
          ctx.beginPath()
          ctx.arc(n.x, n.y, size, 0, 2 * Math.PI)
          ctx.fillStyle = hexToRgba(n.color, alpha)
          ctx.fill()

          // Inner highlight
          ctx.beginPath()
          ctx.arc(n.x, n.y, size * 0.4, 0, 2 * Math.PI)
          ctx.fillStyle = hexToRgba('#ffffff', 0.3 * alpha)
          ctx.fill()

          // Path tracing ring
          if (onPath) {
            ctx.beginPath()
            ctx.arc(n.x, n.y, size + 2, 0, 2 * Math.PI)
            ctx.strokeStyle = hexToRgba(n.color, 0.9)
            ctx.lineWidth = 1.5 / globalScale
            ctx.stroke()
          }

          // Labels
          if (!mini || globalScale > 2) {
            const fontSize = Math.max(10 / globalScale, 3)
            ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            // Text shadow
            ctx.fillStyle = hexToRgba('#000000', 0.5 * alpha)
            ctx.fillText(n.name, n.x + 0.5, n.y + size + 2.5)
            // Label
            ctx.fillStyle = hexToRgba(n.color, 0.8 * alpha)
            ctx.fillText(n.name, n.x, n.y + size + 2)
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
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
          const highlighted = isLinkHighlighted(l)
          const alpha = highlighted ? 0.5 : 0.06
          const srcColor = getNodeColor(l.source.type ?? '')
          const width = (1 + (l.confidence ?? 1) * 1.5) / globalScale

          // Curved link
          const midX = (l.source.x + l.target.x) / 2
          const midY = (l.source.y! + l.target.y!) / 2
          const dx = l.target.x - l.source.x
          const dy = l.target.y! - l.source.y!
          const cpX = midX - dy * 0.08
          const cpY = midY + dx * 0.08

          ctx.beginPath()
          ctx.moveTo(l.source.x, l.source.y!)
          ctx.quadraticCurveTo(cpX, cpY, l.target.x, l.target.y!)
          ctx.strokeStyle = hexToRgba(srcColor, alpha)
          ctx.lineWidth = width

          if (l.source_type === 'auto_discovery') {
            ctx.setLineDash([4 / globalScale, 4 / globalScale])
          } else {
            ctx.setLineDash([])
          }
          ctx.stroke()
          ctx.setLineDash([])

          // Relationship label on hover or zoom
          const showLabel =
            (highlighted && hoveredNodeId && globalScale > 1) ||
            globalScale > 2.5
          if (showLabel && l.type) {
            const fontSize = Math.max(9 / globalScale, 2)
            ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const label = l.type
            const textWidth = ctx.measureText(label).width
            const pad = 3 / globalScale
            ctx.fillStyle = hexToRgba('#050510', 0.8)
            ctx.beginPath()
            ctx.roundRect(
              cpX - textWidth / 2 - pad,
              cpY - fontSize / 2 - pad / 2,
              textWidth + pad * 2,
              fontSize + pad,
              3 / globalScale,
            )
            ctx.fill()
            ctx.fillStyle = hexToRgba(srcColor, 0.9)
            ctx.fillText(label, cpX, cpY)
          }
        }}
        linkCanvasObjectMode={() => 'replace'}
        onNodeClick={(node: object) => onNodeClick(node as GraphNode)}
        onNodeHover={(node: object | null) => {
          setHoveredNodeId(node ? (node as GraphNode).id : null)
        }}
        backgroundColor="#050510"
        width={undefined}
        height={undefined}
        cooldownTicks={mini ? Infinity : 100}
        enableNavigationControls={!mini}
        enablePointerInteraction={!mini}
      />
    </div>
  )
}
