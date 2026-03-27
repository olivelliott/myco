import { type HealthMetrics as HealthMetricsType } from '../lib/api'
import { StatCard } from './stat-card'

interface HealthMetricsProps {
  health: HealthMetricsType | undefined
}

export function HealthMetrics({ health }: HealthMetricsProps) {
  if (!health) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[88px] rounded-lg animate-pulse"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          />
        ))}
      </div>
    )
  }

  // Compute high-confidence percentage
  const highBucket = health.confidenceDistribution.find((b) => b.bucket === 'high')
  const highCount = highBucket?.count ?? 0
  const totalEntities = health.confidenceDistribution.reduce((sum, b) => sum + b.count, 0)
  const highPct = totalEntities > 0 ? Math.round((highCount / totalEntities) * 100) : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Consolidation Backlog"
        value={health.unconsolidatedEpisodes}
        sub="episodes pending"
        glow={health.unconsolidatedEpisodes > 0}
      />
      <StatCard
        label="Embedding Coverage"
        value={`${health.embeddingCoverage}%`}
        sub="observations embedded"
        glow={health.embeddingCoverage < 80}
      />
      <StatCard
        label="Orphaned Entities"
        value={health.orphanedNodes}
        sub="no relationships"
        glow={health.orphanedNodes > 5}
      />
      <StatCard
        label="High Confidence"
        value={`${highPct}%`}
        sub={`${highCount} of ${totalEntities} entities`}
      />
    </div>
  )
}
