import { Route, X, Clock, Info } from 'lucide-react'

interface GraphToolbarProps {
  pathMode: boolean
  onTogglePathMode: () => void
  pathInfo?: string | null
  onClearPath: () => void
  timelineEnabled: boolean
  onToggleTimeline: () => void
  legendOpen: boolean
  onToggleLegend: () => void
}

export function GraphToolbar({
  pathMode,
  onTogglePathMode,
  pathInfo,
  onClearPath,
  timelineEnabled,
  onToggleTimeline,
  legendOpen,
  onToggleLegend,
}: GraphToolbarProps) {
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
      <button
        onClick={onTogglePathMode}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all"
        style={{
          backgroundColor: pathMode
            ? 'rgba(6, 255, 200, 0.15)'
            : 'var(--bg-surface)',
          border: `1px solid ${pathMode ? 'var(--glow-teal)' : 'var(--border-subtle)'}`,
          color: pathMode ? 'var(--glow-teal)' : 'var(--text-secondary)',
        }}
      >
        <Route size={16} />
        {pathMode ? 'Tracing...' : 'Trace Path'}
      </button>

      <button
        onClick={onToggleTimeline}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all"
        style={{
          backgroundColor: timelineEnabled
            ? 'rgba(6, 255, 200, 0.15)'
            : 'var(--bg-surface)',
          border: `1px solid ${timelineEnabled ? 'var(--glow-teal)' : 'var(--border-subtle)'}`,
          color: timelineEnabled ? 'var(--glow-teal)' : 'var(--text-secondary)',
        }}
      >
        <Clock size={16} />
        Timeline
      </button>

      <button
        onClick={onToggleLegend}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all"
        style={{
          backgroundColor: legendOpen
            ? 'rgba(6, 255, 200, 0.15)'
            : 'var(--bg-surface)',
          border: `1px solid ${legendOpen ? 'var(--glow-teal)' : 'var(--border-subtle)'}`,
          color: legendOpen ? 'var(--glow-teal)' : 'var(--text-secondary)',
        }}
      >
        <Info size={16} />
        Legend
      </button>

      {pathInfo && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs max-w-[220px]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <span className="flex-1 truncate">{pathInfo}</span>
          <button
            onClick={onClearPath}
            className="opacity-60 hover:opacity-100 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
