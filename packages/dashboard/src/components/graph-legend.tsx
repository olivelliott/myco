const TYPE_COLORS: Array<{ label: string; color: string }> = [
  { label: 'Person / Agent', color: '#06ffc8' },
  { label: 'Project / Codebase', color: '#a78bfa' },
  { label: 'Concept / Topic', color: '#fbbf24' },
  { label: 'Tool / Library', color: '#34d399' },
  { label: 'Technology', color: '#60a5fa' },
  { label: 'Decision', color: '#f472b6' },
  { label: 'Other', color: '#818cf8' },
]

export function GraphLegend() {
  return (
    <div
      className="absolute bottom-4 left-4 z-10 rounded-lg p-3 text-xs max-w-[200px]"
      style={{
        backgroundColor: 'rgba(5, 5, 16, 0.9)',
        border: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <p
        className="font-semibold mb-2 uppercase tracking-wider"
        style={{ color: 'var(--text-secondary)', fontSize: '10px' }}
      >
        Entity Types
      </p>
      <div className="space-y-1.5">
        {TYPE_COLORS.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}60`,
              }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p
          className="font-semibold mb-1.5 uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)', fontSize: '10px' }}
        >
          Links
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-0 shrink-0" style={{ borderTop: '2px solid var(--text-muted)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Explicit</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-0 shrink-0" style={{ borderTop: '2px dashed var(--text-muted)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Auto-discovered</span>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          Node size = observation count
        </p>
      </div>
    </div>
  )
}
