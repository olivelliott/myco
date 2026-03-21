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
          <div key={i} className="animate-pulse bg-slate-800 h-10 rounded" />
        ))}
      </div>
    )
  }

  const items = data?.items.slice(0, 5) ?? []

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold text-slate-100">All caught up</h3>
        <p className="text-sm text-slate-500 mt-1">
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
            className="flex items-center gap-3 p-3 rounded-lg bg-slate-800 border border-slate-700"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 truncate">
                {entityName}
              </p>
              <p className="text-xs text-slate-400 truncate">{observation}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-slate-700"
                aria-label={`Approve observation for ${entityName}`}
                onClick={() => resolve({ id: item.id, status: 'approved' })}
              >
                <Check size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-slate-700"
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
