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
        <h3 className="text-lg font-semibold text-slate-100">No activity yet</h3>
        <p className="text-sm text-slate-500 mt-1">
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
            <Separator className="flex-1 bg-slate-800" />
            <span className="text-xs font-normal text-slate-500 flex-shrink-0">{date}</span>
            <Separator className="flex-1 bg-slate-800" />
          </div>
          <div className="space-y-2">
            {items.map((ep) => (
              <div
                key={ep.id}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                <Badge
                  className="text-xs bg-slate-700 border-slate-600 text-slate-300 font-normal flex-shrink-0"
                  variant="outline"
                >
                  {ep.event_type}
                </Badge>
                <span className="text-slate-400 flex-1 truncate">{ep.agent_id}</span>
                <span className="text-xs text-slate-500 flex-shrink-0">
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
