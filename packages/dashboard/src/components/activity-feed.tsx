import { format, formatDistanceToNow } from 'date-fns'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'

interface Episode {
  id: string
  session_id: string
  agent_id: string
  event_type: string
  created_at: string
}

interface ActivityFeedProps {
  episodes: Episode[]
}

export function ActivityFeed({ episodes }: ActivityFeedProps) {
  if (episodes.length === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>No activity yet</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Agent sessions will appear here once episodes are logged.
        </p>
      </div>
    )
  }

  // Group episodes by date
  const groups = episodes.reduce<Record<string, Episode[]>>((acc, ep) => {
    const dateKey = format(new Date(ep.created_at), 'MMM d, yyyy')
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(ep)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([date, items]) => (
        <div key={date}>
          <div className="flex items-center gap-3 mb-2">
            <Separator className="flex-1 bg-[var(--bg-elevated)]" />
            <span className="text-xs font-normal flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{date}</span>
            <Separator className="flex-1 bg-[var(--bg-elevated)]" />
          </div>
          <div className="space-y-2">
            {items.map((ep) => (
              <div
                key={ep.id}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                <Badge
                  className="text-xs font-normal flex-shrink-0"
                  variant="outline"
                  style={{ backgroundColor: 'var(--border-glow)', borderColor: 'var(--border-glow)', color: 'var(--text-secondary)' }}
                >
                  {ep.event_type}
                </Badge>
                <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{ep.agent_id}</span>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {formatDistanceToNow(new Date(ep.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
