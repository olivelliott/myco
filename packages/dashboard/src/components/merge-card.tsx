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
      <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Item {item.id} — No metadata available</p>
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
        'rounded-lg overflow-hidden transition-all duration-300',
        exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0',
      )}
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <div className="p-4" style={{ borderRight: '1px solid var(--border-subtle)' }}>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Primary Entity
          </p>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            {entityName}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{fact.observation}</p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Type: {fact.entity_type}</p>
        </div>

        <div className="p-4">
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Will be merged
          </p>
          {candidateIds.length > 0 ? (
            <div className="space-y-2">
              {candidateIds.map((candidateId) => (
                <div key={candidateId}>
                  <p className="text-sm font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                    {candidateId}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No candidate IDs</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <Button
          className="h-9 min-h-[44px] md:min-h-0"
          style={{ backgroundColor: 'var(--glow-violet)', color: '#000' }}
          onClick={() => handleAction('approved')}
        >
          Merge Entities
        </Button>
        <Button
          variant="secondary"
          className="h-9 min-h-[44px] md:min-h-0"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          onClick={() => handleAction('rejected')}
        >
          Keep Separate
        </Button>
      </div>
    </div>
  )
}
