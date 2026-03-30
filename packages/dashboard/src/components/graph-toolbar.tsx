import { Route, X, Clock, Info, BarChart3, Hexagon, ArrowLeft } from 'lucide-react'

interface GraphToolbarProps {
  activeMode: string
  onExitMode: () => void
  pathInfo?: string | null
  onClearPath: () => void
  onTogglePathMode: () => void
  neighborhoodCenter?: string | null
  neighborhoodDepth?: 1 | 2
  onNeighborhoodDepthChange?: (depth: 1 | 2) => void
  timelineEnabled: boolean
  onToggleTimeline: () => void
  legendOpen: boolean
  onToggleLegend: () => void
  analyticsOpen: boolean
  onToggleAnalytics: () => void
  confidenceThreshold: number
  onConfidenceChange: (value: number) => void
  clustersEnabled: boolean
  onToggleClusters: () => void
}

export function GraphToolbar({
  activeMode,
  onExitMode,
  pathInfo,
  onClearPath,
  onTogglePathMode,
  neighborhoodCenter,
  neighborhoodDepth,
  onNeighborhoodDepthChange,
  timelineEnabled,
  onToggleTimeline,
  legendOpen,
  onToggleLegend,
  analyticsOpen,
  onToggleAnalytics,
  confidenceThreshold,
  onConfidenceChange,
  clustersEnabled,
  onToggleClusters,
}: GraphToolbarProps) {
  const inSpecialMode = activeMode !== 'explore'

  return (
    <>
      {/* Floating "Back to full graph" pill when in any non-explore mode */}
      {inSpecialMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={onExitMode}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm transition-all"
            style={{
              backgroundColor: 'rgba(6, 255, 200, 0.12)',
              border: '1px solid var(--glow-teal)',
              color: 'var(--glow-teal)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <ArrowLeft size={14} />
            {activeMode === 'neighborhood' && neighborhoodCenter
              ? `Exit "${neighborhoodCenter}" neighborhood`
              : activeMode === 'path'
                ? 'Exit path tracing'
                : 'Back to full graph'}
          </button>
        </div>
      )}

      {/* Right toolbar */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {/* Trace Path toggle */}
        <ToolbarButton
          active={activeMode === 'path'}
          icon={<Route size={16} />}
          label={activeMode === 'path' ? 'Tracing...' : 'Trace Path'}
          onClick={onTogglePathMode}
        />

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

        <ToolbarButton
          active={clustersEnabled}
          icon={<Hexagon size={16} />}
          label="Clusters"
          onClick={onToggleClusters}
        />

        {/* Confidence threshold slider */}
        <div
          className="flex flex-col gap-1 px-3 py-2 rounded-md"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Confidence</span>
            <span className="text-xs font-mono" style={{ color: 'var(--glow-teal)' }}>
              {Math.round(confidenceThreshold * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidenceThreshold}
            onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
            className="w-full h-1 appearance-none rounded-full cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--glow-teal) ${confidenceThreshold * 100}%, var(--border-subtle) ${confidenceThreshold * 100}%)`,
              accentColor: 'var(--glow-teal)',
            }}
          />
        </div>

        {/* Path info display */}
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

        {/* Neighborhood info when active */}
        {neighborhoodCenter && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs max-w-[220px]"
            style={{
              backgroundColor: 'rgba(6, 255, 200, 0.08)',
              border: '1px solid var(--glow-teal)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="flex-1 truncate" style={{ color: 'var(--glow-teal)' }}>
              {neighborhoodCenter}
            </span>
            <button
              onClick={() => onNeighborhoodDepthChange?.(neighborhoodDepth === 1 ? 2 : 1)}
              className="text-xs px-1.5 py-0.5 rounded shrink-0"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--glow-teal)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {neighborhoodDepth ?? 1}h
            </button>
          </div>
        )}
      </div>
    </>
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
