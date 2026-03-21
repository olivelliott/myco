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
}

const reasonColors: Record<string, string> = {
  contradiction: 'bg-red-500 text-white border-transparent',
  low_confidence: 'bg-amber-500 text-white border-transparent',
  merge_candidate: 'bg-indigo-500 text-white border-transparent',
  cross_session: 'bg-cyan-500 text-white border-transparent',
}

export function ApprovalCard({ item, onResolve }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
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
  const confidence = Math.round(fact.confidence * 100)
  const reasonColor = item.reason ? (reasonColors[item.reason] ?? 'bg-slate-700 text-slate-200 border-transparent') : null

  function handleAction(status: 'approved' | 'rejected', edited_content?: string) {
    setExiting(true)
    setTimeout(() => onResolve(item.id, status, edited_content), 300)
  }

  function handleEditClick() {
    setEditing(true)
    setEditText(fact.observation)
  }

  function handleSaveApprove() {
    handleAction('approved', editText)
    setEditing(false)
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div
      className={cn(
        'bg-slate-800 border border-slate-700 rounded-lg p-4 transition-all duration-300',
        exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0',
      )}
    >
      {/* Top row: entity name + badges */}
      <div className="flex items-start gap-2 flex-wrap mb-2">
        <span className="text-lg font-semibold text-slate-100 flex-1 min-w-0">{entityName}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.reason && reasonColor && (
            <Badge className={reasonColor}>
              {item.reason.replace(/_/g, ' ')}
            </Badge>
          )}
          <Badge className="bg-slate-700 text-slate-200 border-transparent">
            {confidence}%
          </Badge>
        </div>
      </div>

      {/* Observation preview or edit textarea */}
      {editing ? (
        <Textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          className="mb-3 min-h-[80px]"
          autoFocus
        />
      ) : (
        <p className="text-sm text-slate-100 line-clamp-2 mb-2">{fact.observation}</p>
      )}

      {/* Evidence toggle */}
      {!editing && fact.evidence_quote && (
        <div className="mb-2">
          <button
            className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide evidence' : 'Show evidence'}
          </button>
          {expanded && (
            <blockquote className="text-sm italic text-slate-500 border-l-2 border-slate-700 pl-3 mt-2">
              {fact.evidence_quote}
            </blockquote>
          )}
        </div>
      )}

      <Separator className="my-3" />

      {/* Action buttons */}
      {editing ? (
        <div className="flex gap-2">
          <Button
            className="bg-emerald-500 hover:bg-emerald-600 text-white h-9 min-h-[44px] md:min-h-0"
            onClick={handleSaveApprove}
          >
            Save &amp; Approve
          </Button>
          <Button
            variant="secondary"
            className="bg-slate-700 text-slate-200 h-9 min-h-[44px] md:min-h-0"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            className="bg-emerald-500 hover:bg-emerald-600 text-white h-9 md:h-9 min-h-[44px] md:min-h-0"
            aria-label={`Approve observation for ${entityName}`}
            onClick={() => handleAction('approved')}
          >
            Approve
          </Button>
          <Button
            className="bg-red-500 hover:bg-red-600 text-white h-9 md:h-9 min-h-[44px] md:min-h-0"
            aria-label={`Reject observation for ${entityName}`}
            onClick={() => handleAction('rejected')}
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            className="bg-slate-700 text-slate-200 h-9 md:h-9 min-h-[44px] md:min-h-0"
            aria-label={`Edit observation for ${entityName}`}
            onClick={handleEditClick}
          >
            Edit
          </Button>
        </div>
      )}
    </div>
  )
}
