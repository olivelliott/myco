import { Route, X, Clock, Info, BarChart3, MousePointer2, Focus, Search } from 'lucide-react'
import { type GraphInteractionMode } from '../lib/graph-types'

interface GraphToolbarProps {
  activeMode: GraphInteractionMode
  onModeChange: (mode: GraphInteractionMode) => void
  pathInfo?: string | null
  onClearPath: () => void
  timelineEnabled: boolean
  onToggleTimeline: () => void
  legendOpen: boolean
  onToggleLegend: () => void
  analyticsOpen: boolean
  onToggleAnalytics: () => void
}

export function GraphToolbar({
  activeMode,
  onModeChange,
  pathInfo,
  onClearPath,
  timelineEnabled,
  onToggleTimeline,
  legendOpen,
  onToggleLegend,
  analyticsOpen,
  onToggleAnalytics,
}: GraphToolbarProps) {
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
      {/* Mode chips — only one active at a time */}
      <div className="flex flex-col gap-1">
        <ModeChip
          mode="explore"
          activeMode={activeMode}
          icon={<MousePointer2 size={16} />}
          label="Explore"
          onModeChange={onModeChange}
        />
        <ModeChip
          mode="path"
          activeMode={activeMode}
          icon={<Route size={16} />}
          label={activeMode === 'path' ? 'Tracing...' : 'Trace Path'}
          onModeChange={onModeChange}
        />
        <ModeChip
          mode="neighborhood"
          activeMode={activeMode}
          icon={<Focus size={16} />}
          label="Neighborhood"
          onModeChange={onModeChange}
        />
        <ModeChip
          mode="search"
          activeMode={activeMode}
          icon={<Search size={16} />}
          label="Search"
          onModeChange={onModeChange}
        />
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2px 0' }} />

      {/* Panel toggles */}
      <ToolbarButton
        active={analyticsOpen}
        icon={<BarChart3 size={16} />}
        label="Analytics"
        onClick={onToggleAnalytics}
      />

      <ToolbarButton
        active={timelineEnabled}
        icon={<Clock size={16} />}
        label="Timeline"
        onClick={onToggleTimeline}
      />

      <ToolbarButton
        active={legendOpen}
        icon={<Info size={16} />}
        label="Legend"
        onClick={onToggleLegend}
      />

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

function ModeChip({
  mode,
  activeMode,
  icon,
  label,
  onModeChange,
}: {
  mode: GraphInteractionMode
  activeMode: GraphInteractionMode
  icon: React.ReactNode
  label: string
  onModeChange: (mode: GraphInteractionMode) => void
}) {
  const isActive = mode === activeMode
  return (
    <button
      onClick={() => onModeChange(mode)}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all"
      style={{
        backgroundColor: isActive
          ? 'rgba(6, 255, 200, 0.15)'
          : 'var(--bg-surface)',
        border: `1px solid ${isActive ? 'var(--glow-teal)' : 'var(--border-subtle)'}`,
        color: isActive ? 'var(--glow-teal)' : 'var(--text-secondary)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function ToolbarButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all"
      style={{
        backgroundColor: active
          ? 'rgba(6, 255, 200, 0.15)'
          : 'var(--bg-surface)',
        border: `1px solid ${active ? 'var(--glow-teal)' : 'var(--border-subtle)'}`,
        color: active ? 'var(--glow-teal)' : 'var(--text-secondary)',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
