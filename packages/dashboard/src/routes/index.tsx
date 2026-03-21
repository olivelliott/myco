import { createFileRoute } from '@tanstack/react-router'
import { useDashboard } from '../hooks/use-dashboard'
import { StatCard } from '../components/stat-card'
import { ActivityFeed } from '../components/activity-feed'
import { QuickApprove } from '../components/quick-approve'

export const Route = createFileRoute('/')({ component: DashboardPage })

function DashboardPage() {
  const { data, error } = useDashboard()

  if (error) return (
    <div className="text-center py-12">
      <h2 className="text-lg font-semibold">Cannot reach API server</h2>
      <p className="text-sm text-slate-500">Start the api-server with `npm run api` and refresh.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Brain Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Pending Approvals"
          value={data?.pending ?? 0}
          valueClassName="text-amber-500"
        />
        <StatCard label="Total Entities" value={data?.entities ?? 0} />
        <StatCard
          label="Recent Episodes"
          value={data?.recentEpisodes?.length ?? 0}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Activity</h2>
          <ActivityFeed episodes={data?.recentEpisodes ?? []} />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-4">Quick Approve</h2>
          <QuickApprove />
        </div>
      </div>
    </div>
  )
}
