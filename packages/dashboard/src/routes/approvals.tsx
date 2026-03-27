import { createFileRoute } from '@tanstack/react-router'
import { useApprovals, useResolveApproval } from '../hooks/use-approvals.js'
import { ApprovalCard } from '../components/approval-card.js'
import { MergeCard } from '../components/merge-card.js'

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPage,
})

function ApprovalsPage() {
  const { data, isLoading, error } = useApprovals()
  const resolve = useResolveApproval()

  const handleResolve = (
    id: string,
    status: 'approved' | 'rejected',
    edited_content?: string,
  ) => {
    resolve.mutate({ id, status, edited_content })
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Cannot reach API server</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          Start the api-server with <code className="font-mono">npm run api</code> and refresh.
        </p>
      </div>
    )
  }

  const items = data?.items ?? []

  if (!isLoading && items.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>All caught up</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          No pending items. The next consolidation run will populate this queue.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Approval Queue</h1>
      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />
          ))}
        {items.map((item) => {
          const isMerge =
            item.metadata?.merge_candidate_ids &&
            item.metadata.merge_candidate_ids.length > 0
          return isMerge ? (
            <MergeCard key={item.id} item={item} onResolve={handleResolve} />
          ) : (
            <ApprovalCard key={item.id} item={item} onResolve={handleResolve} />
          )
        })}
      </div>
    </div>
  )
}
