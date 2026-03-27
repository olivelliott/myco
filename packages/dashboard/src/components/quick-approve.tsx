import { Check, X } from 'lucide-react'
import { useApprovals, useResolveApproval } from '../hooks/use-approvals'
import { Button } from './ui/button'

export function QuickApprove() {
  const { data, isLoading } = useApprovals()
  const { mutate: resolve } = useResolveApproval()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse h-10 rounded" style={{ backgroundColor: 'var(--bg-elevated)' }} />
        ))}
      </div>
    )
  }

  const items = data?.items.slice(0, 5) ?? []

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>All caught up</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          No pending items. The next consolidation run will populate this queue.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const entityName = item.metadata?.fact.entity_name ?? item.item_id
        const observation = item.metadata?.fact.observation ?? ''
        return (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {entityName}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{observation}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-500 hover:text-emerald-400"
                aria-label={`Approve observation for ${entityName}`}
                onClick={() => resolve({ id: item.id, status: 'approved' })}
              >
                <Check size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-400"
                aria-label={`Reject observation for ${entityName}`}
                onClick={() => resolve({ id: item.id, status: 'rejected' })}
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
