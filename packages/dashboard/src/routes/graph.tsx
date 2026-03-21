import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useGraph } from '../hooks/use-graph'
import { GraphView } from '../components/graph-view'
import { EntityPanel } from '../components/entity-panel'

export const Route = createFileRoute('/graph')({ component: GraphPage })

function GraphPage() {
  const { data, isLoading, error } = useGraph()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  if (error)
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Cannot reach API server</h2>
        <p className="text-sm text-slate-500">
          Start the api-server with `npm run api` and refresh.
        </p>
      </div>
    )

  if (!isLoading && (!data?.nodes || data.nodes.length === 0))
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold">Graph is empty</h2>
        <p className="text-sm text-slate-500">
          Run a consolidation cycle to populate the knowledge graph.
        </p>
      </div>
    )

  return (
    <div className="relative h-[calc(100vh-theme(spacing.12))]">
      {data && (
        <GraphView
          nodes={data.nodes}
          links={data.links}
          onNodeClick={(node) => setSelectedNodeId(node.id)}
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
