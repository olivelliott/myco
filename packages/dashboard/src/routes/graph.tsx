import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/graph')({
  component: GraphPage,
})

function GraphPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-100">Knowledge Graph</h1>
      <p className="text-slate-500 mt-2">
        Graph explorer — coming in plan 05
      </p>
    </div>
  )
}
