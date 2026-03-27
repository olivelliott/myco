import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Play, Pause, SkipForward, SkipBack } from 'lucide-react'
import { format } from 'date-fns'

interface TimelineSliderProps {
  minMs: number
  maxMs: number
  cutoffRef: React.MutableRefObject<number>
  onScrub: (ms: number) => void
  /** Sorted array of unique entity creation timestamps (ms). Enables event-based stepping. */
  entityTimestamps?: number[]
  onPlayStateChange?: (playing: boolean) => void
}

/**
 * Event-based timeline: steps through entity creation events rather than
 * smooth time, so clusters of entities created seconds apart each get
 * their own visible frame. Pauses ~600ms per step at 1x speed.
 */
const MS_PER_STEP = 600

export function TimelineSlider({
  minMs,
  maxMs,
  cutoffRef,
  onScrub,
  entityTimestamps,
  onPlayStateChange,
}: TimelineSliderProps) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [displayMs, setDisplayMs] = useState<number>(minMs)

  const rafIdRef = useRef<number | null>(null)
  const prevTimestampRef = useRef<number | null>(null)
  const speedRef = useRef(speed)
  const playingRef = useRef(playing)
  const stepAccumulatorRef = useRef(0)
  const currentStepRef = useRef(0)

  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { playingRef.current = playing }, [playing])

  const range = maxMs - minMs || 1

  // Build sorted unique event steps from entity timestamps
  const steps = useMemo(() => {
    if (!entityTimestamps || entityTimestamps.length === 0) return [minMs, maxMs]
    const unique = [...new Set(entityTimestamps)].sort((a, b) => a - b)
    return unique
  }, [entityTimestamps, minMs, maxMs])

  // Node count at each step (for display)
  const nodeCountAtStep = useCallback((stepIndex: number) => {
    if (stepIndex < 0) return 0
    if (stepIndex >= steps.length) return entityTimestamps?.length ?? 0
    const cutoff = steps[stepIndex]
    return (entityTimestamps ?? []).filter(t => t <= cutoff).length
  }, [steps, entityTimestamps])

  // Find which step we're at for a given ms
  const stepForMs = useCallback((ms: number) => {
    let idx = 0
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] <= ms) idx = i
      else break
    }
    return idx
  }, [steps])

  const stopPlayback = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
    prevTimestampRef.current = null
    stepAccumulatorRef.current = 0
  }, [])

  const goToStep = useCallback((stepIndex: number) => {
    const clamped = Math.max(0, Math.min(stepIndex, steps.length - 1))
    currentStepRef.current = clamped
    const ms = steps[clamped]
    cutoffRef.current = ms
    setDisplayMs(ms)
  }, [steps, cutoffRef])

  const startPlayback = useCallback(() => {
    stopPlayback()

    // If at end, restart from beginning
    if (currentStepRef.current >= steps.length - 1) {
      currentStepRef.current = 0
      cutoffRef.current = steps[0]
      setDisplayMs(steps[0])
    }

    stepAccumulatorRef.current = 0

    const tick = (timestamp: number) => {
      if (!playingRef.current) return

      if (prevTimestampRef.current !== null) {
        const elapsed = timestamp - prevTimestampRef.current
        stepAccumulatorRef.current += elapsed * speedRef.current

        // Advance one step per MS_PER_STEP of accumulated real time
        if (stepAccumulatorRef.current >= MS_PER_STEP) {
          stepAccumulatorRef.current -= MS_PER_STEP
          currentStepRef.current++

          if (currentStepRef.current >= steps.length) {
            // Reached the end
            currentStepRef.current = steps.length - 1
            cutoffRef.current = steps[steps.length - 1]
            setDisplayMs(steps[steps.length - 1])
            setPlaying(false)
            onPlayStateChange?.(false)
            onScrub(steps[steps.length - 1])
            return
          }

          cutoffRef.current = steps[currentStepRef.current]
          setDisplayMs(steps[currentStepRef.current])
        }
      }

      prevTimestampRef.current = timestamp
      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)
  }, [stopPlayback, cutoffRef, steps, onScrub, onPlayStateChange])

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

  const handleStepForward = useCallback(() => {
    if (playing) {
      setPlaying(false)
      onPlayStateChange?.(false)
      stopPlayback()
    }
    goToStep(currentStepRef.current + 1)
  }, [playing, stopPlayback, goToStep, onPlayStateChange])

  const handleStepBack = useCallback(() => {
    if (playing) {
      setPlaying(false)
      onPlayStateChange?.(false)
      stopPlayback()
    }
    goToStep(currentStepRef.current - 1)
  }, [playing, stopPlayback, goToStep, onPlayStateChange])

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (playingRef.current) {
        setPlaying(false)
        onPlayStateChange?.(false)
        stopPlayback()
      }

      const pct = parseFloat(e.target.value)
      const ms = minMs + (pct / 100) * range
      cutoffRef.current = ms
      setDisplayMs(ms)
      currentStepRef.current = stepForMs(ms)
      onScrub(ms)
    },
    [minMs, range, cutoffRef, onScrub, onPlayStateChange, stopPlayback, stepForMs],
  )

  // Sync currentStepRef when minMs changes (timeline re-enabled)
  useEffect(() => {
    currentStepRef.current = 0
    setDisplayMs(minMs)
  }, [minMs])

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    }
  }, [])

  const progress = ((displayMs - minMs) / range) * 100
  const displayDate = new Date(displayMs)
  const currentNodes = nodeCountAtStep(currentStepRef.current)
  const totalNodes = entityTimestamps?.length ?? 0

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2.5 rounded-lg max-w-xl w-full"
      style={{
        backgroundColor: 'rgba(5, 5, 16, 0.9)',
        border: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Step back */}
      <button
        onClick={handleStepBack}
        className="shrink-0 p-1 rounded transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <SkipBack size={14} />
      </button>

      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        className="shrink-0 p-1 rounded transition-colors"
        style={{ color: 'var(--glow-teal)' }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      {/* Step forward */}
      <button
        onClick={handleStepForward}
        className="shrink-0 p-1 rounded transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <SkipForward size={14} />
      </button>

      {/* Slider */}
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

      {/* Date + time display */}
      <span
        className="text-xs font-mono shrink-0 w-28 text-right"
        style={{ color: 'var(--text-secondary)' }}
      >
        {format(displayDate, 'MMM d, h:mm a')}
      </span>

      {/* Node count */}
      <span
        className="text-xs font-mono shrink-0"
        style={{ color: 'var(--glow-teal)' }}
      >
        {currentNodes}/{totalNodes}
      </span>

      {/* Speed */}
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
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={5}>5x</option>
      </select>
    </div>
  )
}
