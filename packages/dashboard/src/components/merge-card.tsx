import { useState } from 'react'
import { Button } from './ui/button.js'
import { cn } from '../lib/utils.js'
import type { ApprovalItem } from '../lib/api.js'

interface MergeCardProps {
  item: ApprovalItem
  onResolve: (id: string, status: 'approved' | 'rejected') => void
}

export function MergeCard({ item, onResolve }: MergeCardProps) {
  const [exiting, setExiting] = useState(false)

  if (!item.metadata) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <p className="text-sm text-slate-500">Item {item.id} — No metadata available</p>
      </div>
    )
  }

  const { fact } = item.metadata
  const entityName = fact.entity_name
  const candidateIds = item.metadata.merge_candidate_ids ?? []

  function handleAction(status: 'approved' | 'rejected') {
    setExiting(true)
    setTimeout(() => onResolve(item.id, status), 300)
  }

  return (
    <div
      className={cn(
        'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden transition-all duration-300',
        exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0',
      )}
    >
      {/* Side-by-side entity comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* Left side: Primary entity */}
        <div className="p-4 border-b border-slate-700 md:border-b-0 md:border-r md:border-slate-700">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Primary Entity</p>
          <h3 className="text-lg font-semibold text-slate-100 mb-2">{entityName}</h3>
          <p className="text-sm text-slate-100">{fact.observation}</p>
          <p className="text-xs text-slate-500 mt-2">Type: {fact.entity_type}</p>
        </div>

        {/* Right side: Merge candidates */}
        <div className="p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Will be merged</p>
          {candidateIds.length > 0 ? (
            <div className="space-y-2">
              {candidateIds.map((candidateId) => (
                <div key={candidateId}>
                  <p className="text-sm text-slate-400 font-mono truncate">{candidateId}</p>
                  <p className="text-xs text-slate-500">Merge candidate entity ID</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No candidate IDs available</p>
          )}
        </div>
      </div>

      {/* Action row spanning full width */}
      <div className="flex gap-2 p-4 border-t border-slate-700">
        <Button
          className="bg-indigo-500 hover:bg-indigo-600 text-white h-9 min-h-[44px] md:min-h-0"
          aria-label={`Merge ${entityName} into primary entity`}
          onClick={() => handleAction('approved')}
        >
          Merge Entities
        </Button>
        <Button
          variant="secondary"
          className="bg-slate-700 text-slate-200 h-9 min-h-[44px] md:min-h-0"
          aria-label={`Keep ${entityName} and merge candidates as separate entities`}
          onClick={() => handleAction('rejected')}
        >
          Keep Separate
        </Button>
      </div>
    </div>
  )
}
