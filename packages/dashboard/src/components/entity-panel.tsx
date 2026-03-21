import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { fetchEntityDetail } from '../lib/api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'

interface EntityPanelProps {
  nodeId: string
  onClose: () => void
}

export function EntityPanel({ nodeId, onClose }: EntityPanelProps) {
  const [visible, setVisible] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['entity', nodeId],
    queryFn: () => fetchEntityDetail(nodeId),
    enabled: !!nodeId,
  })

  // Animate in after mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 z-10"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Side panel */}
      <div
        className={[
          'fixed right-0 top-0 h-full w-full md:w-80 bg-slate-900 border-l border-slate-800 z-20 overflow-hidden',
          'transition-transform duration-300 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex flex-col h-full">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="animate-pulse bg-slate-800 h-6 rounded w-40" />
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="animate-pulse bg-slate-800 h-4 rounded w-24" />
              <Separator />
              <div className="animate-pulse bg-slate-800 h-4 rounded w-full" />
            </div>
          )}

          {/* Content */}
          {data && (
            <>
              {/* Header */}
              <div className="p-4 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-slate-100 truncate">
                    {data.entity.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary">{data.entity.type}</Badge>
                    <span className="text-sm text-slate-500">
                      {format(new Date(data.entity.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <Separator />

              {/* Observations */}
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-lg font-semibold text-slate-100">
                  Observations
                </h3>
              </div>
              <ScrollArea className="flex-1 px-4">
                {data.observations.length === 0 ? (
                  <p className="text-sm text-slate-500 pb-4">
                    No observations recorded.
                  </p>
                ) : (
                  <ul className="space-y-2 pb-4">
                    {data.observations.map((obs) => (
                      <li key={obs.id} className="flex gap-2">
                        <span className="text-slate-500 mt-0.5 shrink-0">
                          &bull;
                        </span>
                        <div>
                          <p className="text-sm text-slate-200">{obs.content}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {Math.round(obs.confidence * 100)}% confidence
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>

              <Separator />

              {/* Connected Entities */}
              <div className="px-4 pt-4 pb-2">
                <h3 className="text-lg font-semibold text-slate-100">
                  Connected Entities
                </h3>
              </div>
              <div className="px-4 pb-4 overflow-y-auto max-h-48">
                {data.connected.length === 0 ? (
                  <p className="text-sm text-slate-500">No connections.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.connected.map((conn) => (
                      <li key={conn.id} className="text-sm text-slate-300">
                        <span className="font-medium">{data.entity.name}</span>
                        <span className="text-slate-500">
                          {' '}
                          &mdash; {conn.relation_type} &mdash;{' '}
                        </span>
                        <span className="font-medium">{conn.name}</span>
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
