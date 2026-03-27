import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from './ui/chart'
import { useGrowthStats } from '../hooks/use-dashboard'

const chartConfig: ChartConfig = {
  entities: { label: 'Entities', color: '#06ffc8' },
  observations: { label: 'Observations', color: '#a78bfa' },
  relationships: { label: 'Relationships', color: '#fbbf24' },
}

export function KnowledgeGrowthChart() {
  const { data, isLoading } = useGrowthStats()
  const points = data?.points ?? []

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <h2
        className="text-sm font-semibold mb-4 uppercase tracking-wider"
        style={{ color: 'var(--text-secondary)' }}
      >
        Knowledge Growth
      </h2>
      {isLoading || points.length === 0 ? (
        <div
          className="h-[280px] w-full rounded-md animate-pulse"
          style={{ backgroundColor: 'var(--bg-elevated)' }}
        />
      ) : (
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <AreaChart data={points}>
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="day"
              tickFormatter={(value: string) => {
                try {
                  return format(parseISO(value), 'MMM d')
                } catch {
                  return value
                }
              }}
              stroke="var(--text-muted)"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            />
            <YAxis
              stroke="var(--text-muted)"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="entities"
              stroke="#06ffc8"
              fill="#06ffc8"
              fillOpacity={0.1}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="observations"
              stroke="#a78bfa"
              fill="#a78bfa"
              fillOpacity={0.1}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="relationships"
              stroke="#fbbf24"
              fill="#fbbf24"
              fillOpacity={0.1}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  )
}
