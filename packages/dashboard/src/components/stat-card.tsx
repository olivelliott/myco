import { Card, CardContent } from './ui/card'
import { cn } from '../lib/utils'

interface StatCardProps {
  label: string
  value: number | string
  subtext?: string
  valueClassName?: string
}

export function StatCard({ label, value, subtext, valueClassName }: StatCardProps) {
  return (
    <Card className="bg-slate-800 border-slate-800">
      <CardContent className="p-4">
        <p className="text-xs font-normal text-slate-500">{label}</p>
        <p className={cn('text-[28px] font-semibold leading-none mt-1', valueClassName)}>
          {value}
        </p>
        {subtext && (
          <p className="text-xs font-normal text-slate-500 mt-1">{subtext}</p>
        )}
      </CardContent>
    </Card>
  )
}
