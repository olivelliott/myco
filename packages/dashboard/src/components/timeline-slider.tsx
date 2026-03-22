import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { format } from 'date-fns'

interface TimelineSliderProps {
  minDate: string
  maxDate: string
  currentDate: string
  onDateChange: (date: string) => void
}

export function TimelineSlider({
  minDate,
  maxDate,
  currentDate,
  onDateChange,
}: TimelineSliderProps) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const intervalRef = useRef<number | null>(null)

  const minMs = new Date(minDate).getTime()
  const maxMs = new Date(maxDate).getTime()
  const currentMs = new Date(currentDate).getTime()
  const range = maxMs - minMs || 1

  const progress = ((currentMs - minMs) / range) * 100

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pct = parseFloat(e.target.value)
      const ms = minMs + (pct / 100) * range
      onDateChange(new Date(ms).toISOString())
    },
    [minMs, range, onDateChange],
  )

  useEffect(() => {
    if (playing) {
      const dayMs = 24 * 60 * 60 * 1000
      intervalRef.current = window.setInterval(() => {
        onDateChange((prev) => {
          const prevMs = new Date(prev as unknown as string).getTime()
          const nextMs = prevMs + dayMs * speed
          if (nextMs >= maxMs) {
            setPlaying(false)
            return maxDate
          }
          return new Date(nextMs).toISOString()
        })
      }, 100)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, speed, maxMs, maxDate, onDateChange])

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2.5 rounded-lg max-w-lg w-full"
      style={{
        backgroundColor: 'rgba(5, 5, 16, 0.9)',
        border: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <button
        onClick={() => setPlaying(!playing)}
        className="shrink-0 p-1 rounded transition-colors"
        style={{ color: 'var(--glow-teal)' }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={progress}
        onChange={handleSliderChange}
        className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--glow-teal) ${progress}%, var(--border-subtle) ${progress}%)`,
          accentColor: 'var(--glow-teal)',
        }}
      />

      <span
        className="text-xs font-mono shrink-0 w-20 text-right"
        style={{ color: 'var(--text-secondary)' }}
      >
        {format(new Date(currentDate), 'MMM d, yy')}
      </span>

      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="text-xs rounded px-1.5 py-0.5 shrink-0"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={5}>5x</option>
      </select>
    </div>
  )
}
