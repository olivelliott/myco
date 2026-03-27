import { formatDistanceToNow } from 'date-fns'
import { type ActivityCard } from '../lib/api'
import { getNodeColor } from './graph-view'

interface ActivityFeedProps {
  activities: ActivityCard[]
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>No recent activity</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          New entities will appear here as agents learn.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-center gap-3 px-3 py-2 rounded-md"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Type color dot */}
          <div
            className="flex-shrink-0 rounded-full"
            style={{
              width: 8,
              height: 8,
              backgroundColor: getNodeColor(activity.type),
            }}
          />

          {/* Entity name + type */}
          <div className="flex-1 min-w-0">
            <span
              className="text-sm font-medium block truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {activity.name}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              {activity.type}
            </span>
          </div>

          {/* Confidence */}
          <span
            className="text-xs font-mono flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {Math.round(activity.confidence * 100)}%
          </span>

          {/* Relative timestamp */}
          <span
            className="text-xs flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  )
}
