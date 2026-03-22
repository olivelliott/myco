import { useState } from 'react'
import { Badge } from './ui/badge.js'
import { Button } from './ui/button.js'
import { Separator } from './ui/separator.js'
import { Textarea } from './ui/textarea.js'
import { cn } from '../lib/utils.js'
import type { ApprovalItem } from '../lib/api.js'

interface ApprovalCardProps {
  item: ApprovalItem
  onResolve: (
    id: string,
    status: 'approved' | 'rejected',
    edited_content?: string,
  ) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

const reasonStyles: Record<string, { bg: string; color: string }> = {
  contradiction: { bg: 'rgba(244, 114, 182, 0.15)', color: 'var(--glow-rose)' },
  low_confidence: { bg: 'rgba(251, 191, 36, 0.15)', color: 'var(--glow-amber)' },
  merge_candidate: { bg: 'rgba(167, 139, 250, 0.15)', color: 'var(--glow-violet)' },
  cross_session: { bg: 'rgba(96, 165, 250, 0.15)', color: 'var(--glow-blue)' },
}

export function ApprovalCard({ item, onResolve, selectable, selected, onToggleSelect }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
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
  const confidence = Math.round(fact.confidence * 100)
  const reasonStyle = item.reason ? reasonStyles[item.reason] : null

  function handleAction(status: 'approved' | 'rejected', edited_content?: string) {
    setExiting(true)
    setTimeout(() => onResolve(item.id, status, edited_content), 300)
  }

  return (
    <div
      className={cn(
        'rounded-lg p-4 transition-all duration-300',
        exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0',
      )}
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid ${selected ? 'var(--glow-teal)' : 'var(--border-subtle)'}`,
        boxShadow: selected ? '0 0 12px rgba(6, 255, 200, 0.1)' : 'none',
      }}
    >
      <div className="flex items-start gap-2 flex-wrap mb-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1.5 shrink-0"
            style={{ accentColor: 'var(--glow-teal)' }}
          />
        )}
        <span className="text-lg font-semibold flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
          {entityName}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.reason && reasonStyle && (
            <Badge style={{ backgroundColor: reasonStyle.bg, color: reasonStyle.color, border: 'none' }}>
              {item.reason.replace(/_/g, ' ')}
            </Badge>
          )}
          <Badge style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'none' }}>
            {confidence}%
          </Badge>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="h-1 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${confidence}%`,
              backgroundColor: confidence >= 85 ? 'var(--glow-emerald)' : confidence >= 50 ? 'var(--glow-amber)' : 'var(--glow-rose)',
              boxShadow: `0 0 6px ${confidence >= 85 ? 'var(--glow-emerald)' : confidence >= 50 ? 'var(--glow-amber)' : 'var(--glow-rose)'}60`,
            }}
          />
        </div>
      </div>

      {editing ? (
        <Textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
          className="mb-3 min-h-[80px]"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          autoFocus
        />
      ) : (
        <p className="text-sm line-clamp-2 mb-2" style={{ color: 'var(--text-primary)' }}>{fact.observation}</p>
      )}

      {!editing && fact.evidence_quote && (
        <div className="mb-2">
          <button
            className="text-xs transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide evidence' : 'Show evidence'}
          </button>
          {expanded && (
            <blockquote
              className="text-sm italic pl-3 mt-2"
              style={{
                color: 'var(--text-secondary)',
                borderLeft: '2px solid var(--glow-violet)',
              }}
            >
              {fact.evidence_quote}
            </blockquote>
          )}
        </div>
      )}

      <Separator className="my-3" style={{ backgroundColor: 'var(--border-subtle)' }} />

      {editing ? (
        <div className="flex gap-2">
          <Button
            className="h-9 min-h-[44px] md:min-h-0"
            style={{ backgroundColor: 'var(--glow-emerald)', color: '#000' }}
            onClick={() => { handleAction('approved', editText); setEditing(false) }}
          >
            Save &amp; Approve
          </Button>
          <Button
            variant="secondary"
            className="h-9 min-h-[44px] md:min-h-0"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            className="h-9 min-h-[44px] md:min-h-0"
            style={{ backgroundColor: 'var(--glow-emerald)', color: '#000' }}
            onClick={() => handleAction('approved')}
          >
            Approve
          </Button>
          <Button
            className="h-9 min-h-[44px] md:min-h-0"
            style={{ backgroundColor: 'var(--glow-rose)', color: '#000' }}
            onClick={() => handleAction('rejected')}
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            className="h-9 min-h-[44px] md:min-h-0"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            onClick={() => { setEditing(true); setEditText(fact.observation) }}
          >
            Edit
          </Button>
        </div>
      )}
    </div>
  )
}
