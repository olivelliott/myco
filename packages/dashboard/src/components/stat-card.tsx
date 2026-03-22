import { Card, CardContent } from './ui/card'

interface StatCardProps {
  label: string
  value: number | string
  sub?: string
  glow?: boolean
  valueClassName?: string
  // Keep backward compat
  subtext?: string
}

export function StatCard({ label, value, sub, glow, subtext, valueClassName }: StatCardProps) {
  const displaySub = sub ?? subtext
  return (
    <Card
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: glow ? 'var(--glow-amber)' : 'var(--border-subtle)',
        boxShadow: glow ? '0 0 16px rgba(251, 191, 36, 0.15)' : 'none',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      <CardContent className="p-4">
        <p
          className="text-xs font-normal uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </p>
        <p
          className={`text-[28px] font-semibold leading-none mt-1 ${valueClassName ?? ''}`}
          style={{
            color: glow ? 'var(--glow-amber)' : 'var(--text-primary)',
          }}
        >
          {value}
        </p>
        {displaySub && (
          <p
            className="text-xs font-normal mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            {displaySub}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
