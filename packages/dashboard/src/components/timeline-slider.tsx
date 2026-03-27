import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { format } from 'date-fns'

interface TimelineSliderProps {
  minMs: number                                         // earliest entity timestamp (ms)
  maxMs: number                                         // latest entity timestamp (ms)
  cutoffRef: React.MutableRefObject<number>             // shared ref: the current cutoff timestamp in ms
  onScrub: (ms: number) => void                         // called ONLY on manual slider scrub
  onPlayStateChange?: (playing: boolean) => void        // optional callback when play/pause toggles
}

// 1 real second = 1 day of timeline (86400000 ms / 1000 ms = 86400 ms of timeline per real ms)
const TIMELINE_MS_PER_REAL_MS = 86_400_000 / 1000

export function TimelineSlider({
  minMs,
  maxMs,
  cutoffRef,
  onScrub,
  onPlayStateChange,
}: TimelineSliderProps) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  // displayMs is for slider position + date label only — NOT the source of truth for canvas
  const [displayMs, setDisplayMs] = useState<number>(minMs)

  const rafIdRef = useRef<number | null>(null)
  const prevTimestampRef = useRef<number | null>(null)
  const lastDisplayUpdateRef = useRef<number>(0)
  const speedRef = useRef(speed)
  const playingRef = useRef(playing)

  // Keep refs in sync with state so rAF callback reads current values
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { playingRef.current = playing }, [playing])

  const range = maxMs - minMs || 1

  const stopPlayback = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    prevTimestampRef.current = null
  }, [])

  const startPlayback = useCallback(() => {
    stopPlayback()

    // If at end, restart from beginning
    if (cutoffRef.current >= maxMs) {
      cutoffRef.current = minMs
      setDisplayMs(minMs)
    }

    const tick = (timestamp: number) => {
      if (!playingRef.current) return

      if (prevTimestampRef.current !== null) {
        const elapsed = timestamp - prevTimestampRef.current
        const timelineAdvance = elapsed * TIMELINE_MS_PER_REAL_MS * speedRef.current
        cutoffRef.current = Math.min(cutoffRef.current + timelineAdvance, maxMs)

        // Throttle display updates to ~4fps to avoid re-renders during playback
        const now = Date.now()
        if (now - lastDisplayUpdateRef.current > 250) {
          lastDisplayUpdateRef.current = now
          setDisplayMs(cutoffRef.current)
        }

        // Stop when we reach the end
        if (cutoffRef.current >= maxMs) {
          setDisplayMs(maxMs)
          setPlaying(false)
          onPlayStateChange?.(false)
          onScrub(maxMs) // sync final state
          return
        }
      }

      prevTimestampRef.current = timestamp
      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)
  }, [stopPlayback, cutoffRef, minMs, maxMs, onScrub, onPlayStateChange])

  const handlePlayPause = useCallback(() => {
    const nextPlaying = !playing
    setPlaying(nextPlaying)
    onPlayStateChange?.(nextPlaying)
    if (nextPlaying) {
      playingRef.current = true
      startPlayback()
    } else {
      stopPlayback()
    }
  }, [playing, startPlayback, stopPlayback, onPlayStateChange])

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Pause if currently playing
      if (playingRef.current) {
        setPlaying(false)
        onPlayStateChange?.(false)
        stopPlayback()
      }

      const pct = parseFloat(e.target.value)
      const ms = minMs + (pct / 100) * range
      cutoffRef.current = ms
      setDisplayMs(ms)
      onScrub(ms)
    },
    [minMs, range, cutoffRef, onScrub, onPlayStateChange, stopPlayback],
  )

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  const progress = ((displayMs - minMs) / range) * 100
  const displayDate = new Date(displayMs)

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
        onClick={handlePlayPause}
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
        {format(displayDate, 'MMM d, yy')}
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
