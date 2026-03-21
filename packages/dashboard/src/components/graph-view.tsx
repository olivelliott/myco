import { useState, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

type GraphNode = {
  id: string
  name: string
  type: string
  val: number
  color: string
  opacity: number
}
type GraphLink = { source: string; target: string; type: string }

interface GraphViewProps {
  nodes: Array<{ id: string; name: string; type: string; val: number }>
  links: Array<{ source: string; target: string; type: string }>
  onNodeClick: (node: GraphNode) => void
}

const TYPE_COLORS: Record<string, string> = {
  person: '#06b6d4',    // cyan-500
  agent: '#06b6d4',     // cyan-500
  project: '#8b5cf6',   // violet-500
  codebase: '#8b5cf6',  // violet-500
  concept: '#f59e0b',   // amber-500
  topic: '#f59e0b',     // amber-500
  tool: '#10b981',      // emerald-500
  library: '#10b981',   // emerald-500
}
const DEFAULT_COLOR = '#6366f1' // indigo-500

function getNodeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? DEFAULT_COLOR
}

export function GraphView({ nodes, links, onNodeClick }: GraphViewProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const uniqueTypes = useMemo(
    () => [...new Set(nodes.map((n) => n.type))].sort(),
    [nodes],
  )

  const decoratedNodes = useMemo(() => {
    return nodes
      .filter((n) => typeFilter === 'all' || n.type === typeFilter)
      .map((n) => ({
        ...n,
        color: getNodeColor(n.type),
        opacity: search && !n.name.toLowerCase().includes(search.toLowerCase()) ? 0.2 : 1,
      }))
  }, [nodes, search, typeFilter])

  const filteredNodeIds = useMemo(
    () => new Set(decoratedNodes.map((n) => n.id)),
    [decoratedNodes],
  )

  const filteredLinks = useMemo(
    () =>
      links.filter(
        (l) =>
          filteredNodeIds.has(l.source as string) &&
          filteredNodeIds.has(l.target as string),
      ),
    [links, filteredNodeIds],
  )

  return (
    <div className="relative w-full h-full">
      {/* Search + filter controls, positioned absolute top-left */}
      <div className="absolute top-4 left-4 z-10 flex flex-col md:flex-row gap-2">
        <Input
          placeholder="Search entities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-[280px] bg-slate-900 border-slate-700 text-slate-100"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-[160px] bg-slate-900 border-slate-700">
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

      <ForceGraph2D
        graphData={{ nodes: decoratedNodes as GraphNode[], links: filteredLinks as GraphLink[] }}
        nodeId="id"
        nodeColor="color"
        nodeVal="val"
        nodeLabel={(node: object) => {
          const n = node as GraphNode
          return `${n.name} (${n.type}) \u2014 ${n.val} observations`
        }}
        nodeCanvasObject={(node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const n = node as GraphNode & { x?: number; y?: number }
          const size = Math.sqrt(n.val) * 2
          ctx.globalAlpha = n.opacity ?? 1
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, size, 0, 2 * Math.PI)
          ctx.fillStyle = n.color
          ctx.fill()
          if (globalScale > 1.5) {
            ctx.font = `${10 / globalScale}px ui-sans-serif, system-ui, sans-serif`
            ctx.fillStyle = '#e5e7eb'
            ctx.textAlign = 'center'
            ctx.fillText(n.name, n.x!, n.y! + size + 4)
          }
          ctx.globalAlpha = 1
        }}
        nodeCanvasObjectMode={() => 'replace'}
        onNodeClick={(node: object) => onNodeClick(node as GraphNode)}
        backgroundColor="#0f172a"
        linkColor={() => '#334155'}
        width={undefined}
        height={undefined}
      />
    </div>
  )
}
