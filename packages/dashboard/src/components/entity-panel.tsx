import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X, Focus } from 'lucide-react'
import { fetchEntityDetail } from '../lib/api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'

interface EntityPanelProps {
  nodeId: string
  onClose: () => void
  onExploreNeighborhood?: (nodeId: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  person: '#06ffc8',
  agent: '#06ffc8',
  project: '#a78bfa',
  codebase: '#a78bfa',
  concept: '#fbbf24',
  topic: '#fbbf24',
  tool: '#34d399',
  library: '#34d399',
  technology: '#60a5fa',
  decision: '#f472b6',
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? '#818cf8'
}

export function EntityPanel({ nodeId, onClose, onExploreNeighborhood }: EntityPanelProps) {
  const [visible, setVisible] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['entity', nodeId],
    queryFn: () => fetchEntityDetail(nodeId),
    enabled: !!nodeId,
  })

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-10"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        className={[
          'fixed right-0 top-0 h-full w-full md:w-80 z-20 overflow-hidden',
          'transition-transform duration-300 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex flex-col h-full">
          {isLoading && (
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="animate-pulse h-6 rounded w-40" style={{ backgroundColor: 'var(--bg-elevated)' }} />
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="animate-pulse h-4 rounded w-24" style={{ backgroundColor: 'var(--bg-elevated)' }} />
              <Separator />
              <div className="animate-pulse h-4 rounded w-full" style={{ backgroundColor: 'var(--bg-elevated)' }} />
            </div>
          )}

          {data && (
            <>
              {/* Header */}
              <div className="p-4 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h2
                    className="text-lg font-semibold truncate"
                    style={{ color: getTypeColor(data.entity.type) }}
                  >
                    {data.entity.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        color: getTypeColor(data.entity.type),
                        border: `1px solid ${getTypeColor(data.entity.type)}30`,
                      }}
                    >
                      {data.entity.type}
                    </Badge>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {format(new Date(data.entity.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {onExploreNeighborhood && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onExploreNeighborhood(nodeId)}
                      className="text-xs mt-2"
                      style={{
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--glow-teal)',
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Focus size={14} className="mr-1" />
                      Explore neighborhood
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Confidence bar */}
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Confidence</span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(data.entity.confidence * 100)}%`,
                        backgroundColor: getTypeColor(data.entity.type),
                        boxShadow: `0 0 6px ${getTypeColor(data.entity.type)}60`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {Math.round(data.entity.confidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Summary */}
              {(data.entity as any).summary && (
                <div className="px-4 pb-2">
                  <p className="text-sm italic" style={{ color: 'var(--text-secondary)' }}>
                    {(data.entity as any).summary}
                  </p>
                </div>
              )}

              <Separator style={{ backgroundColor: 'var(--border-subtle)' }} />

              {/* Observations */}
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Observations
                </h3>
              </div>
              <ScrollArea className="flex-1 px-4">
                {data.observations.length === 0 ? (
                  <p className="text-sm pb-4" style={{ color: 'var(--text-muted)' }}>
                    No observations recorded.
                  </p>
                ) : (
                  <ul className="space-y-2 pb-4">
                    {data.observations.map((obs) => (
                      <li key={obs.id} className="flex gap-2">
                        <span
                          className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: getTypeColor(data.entity.type) }}
                        />
                        <div>
                          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                            {obs.content}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {Math.round(obs.confidence * 100)}% confidence
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>

              <Separator style={{ backgroundColor: 'var(--border-subtle)' }} />

              {/* Connected Entities */}
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Connected Entities
                </h3>
              </div>
              <div className="px-4 pb-4 overflow-y-auto max-h-48">
                {data.connected.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No connections.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.connected.map((conn) => (
                      <li key={conn.id} className="text-sm flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getTypeColor(conn.type) }}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>{conn.name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {conn.relation_type}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
