import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-100">Brain Dashboard</h1>
      <p className="text-slate-500 mt-2">Dashboard view — coming in plan 03</p>
    </div>
  )
}
