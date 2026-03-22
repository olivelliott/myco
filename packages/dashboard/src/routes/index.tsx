import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDashboard } from '../hooks/use-dashboard'
import { useGraph } from '../hooks/use-graph'
import { StatCard } from '../components/stat-card'
import { ActivityFeed } from '../components/activity-feed'
import { QuickApprove } from '../components/quick-approve'
import { GraphView } from '../components/graph-view'

export const Route = createFileRoute('/')({ component: DashboardPage })

function DashboardPage() {
  const { data, error } = useDashboard()
  const { data: graphData } = useGraph()
  const navigate = useNavigate()

  if (error)
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Cannot reach API server
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Start the api-server with `npm run api` and refresh.
        </p>
      </div>
    )

  const density =
    data && data.entities > 0
      ? Math.round(((data.relationships ?? 0) / data.entities) * 10) / 10
      : 0

  // Get top 20 most connected nodes for mini graph
  const miniNodes =
    graphData?.nodes?.sort((a, b) => b.val - a.val).slice(0, 20) ?? []
  const miniNodeIds = new Set(miniNodes.map((n) => n.id))
  const miniLinks =
    graphData?.links?.filter(
      (l) =>
        miniNodeIds.has(l.source as string) &&
        miniNodeIds.has(l.target as string),
    ) ?? []

  return (
    <div className="space-y-6">
      <h1
        className="text-lg font-semibold"
        style={{
          color: 'var(--glow-teal)',
          textShadow: '0 0 12px rgba(6, 255, 200, 0.2)',
        }}
      >
        Myco Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Entities"
          value={data?.entities ?? 0}
          sub={
            data?.growthStats
              ? `+${data.growthStats.entitiesLast7d} this week`
              : undefined
          }
        />
        <StatCard
          label="Observations"
          value={data?.observations ?? 0}
          sub={
            data?.growthStats
              ? `+${data.growthStats.observationsLast7d} this week`
              : undefined
          }
        />
        <StatCard
          label="Relationships"
          value={data?.relationships ?? 0}
          sub={`${density}x web density`}
        />
        <StatCard
          label="Pending Approvals"
          value={data?.pending ?? 0}
          glow={(data?.pending ?? 0) > 0}
        />
      </div>

      {/* Mini graph + top connected */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div
          className="rounded-lg overflow-hidden cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            height: '280px',
          }}
          onClick={() => navigate({ to: '/graph' })}
        >
          {miniNodes.length > 0 ? (
            <GraphView
              nodes={miniNodes}
              links={miniLinks}
              onNodeClick={() => navigate({ to: '/graph' })}
              mini
            />
          ) : (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: 'var(--text-muted)' }}
            >
              Knowledge web preview — add some knowledge first
            </div>
          )}
        </div>

        <div>
          <h2
            className="text-sm font-semibold mb-3 uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            Most Connected
          </h2>
          <div className="space-y-2">
            {(data?.topConnected ?? []).map((entity) => (
              <div
                key={entity.id}
                className="flex items-center justify-between px-3 py-2 rounded-md"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {entity.name}
                  </span>
                  <span
                    className="text-xs ml-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {entity.type}
                  </span>
                </div>
                <span
                  className="text-xs font-mono"
                  style={{ color: 'var(--glow-teal)' }}
                >
                  {entity.connection_count} links
                </span>
              </div>
            ))}
            {(data?.topConnected ?? []).length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No connections yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2
            className="text-sm font-semibold mb-3 uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            Activity
          </h2>
          <ActivityFeed episodes={data?.recentEpisodes ?? []} />
        </div>
        <div>
          <h2
            className="text-sm font-semibold mb-3 uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            Quick Approve
          </h2>
          <QuickApprove />
        </div>
      </div>
    </div>
  )
}
