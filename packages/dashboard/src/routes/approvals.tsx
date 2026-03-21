import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPage,
})

function ApprovalsPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-100">Approval Queue</h1>
      <p className="text-slate-500 mt-2">Approval queue — coming in plan 04</p>
    </div>
  )
}
