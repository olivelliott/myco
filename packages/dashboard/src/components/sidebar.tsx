import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, CheckSquare, Network } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../lib/api'
import { Badge } from './ui/badge'

interface NavItem {
  label: string
  to: string
  icon: React.ComponentType<{ className?: string; size?: number }>
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Approvals', to: '/approvals', icon: CheckSquare },
  { label: 'Graph', to: '/graph', icon: Network },
]

export function Sidebar() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30_000,
  })
  const pendingCount = data?.pending ?? 0
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  function isActive(to: string) {
    if (to === '/') return currentPath === '/'
    return currentPath.startsWith(to)
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex md:flex-col md:w-60 h-screen flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        <div
          className="p-6 text-lg font-semibold"
          style={{
            color: 'var(--glow-teal)',
            textShadow: '0 0 20px rgba(6, 255, 200, 0.4)',
          }}
        >
          Myco
        </div>
        <nav className="flex-1 flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = isActive(item.to)
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200"
                style={{
                  backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: active
                    ? '2px solid var(--glow-teal)'
                    : '2px solid transparent',
                  paddingLeft: active ? '10px' : '12px',
                  boxShadow: active
                    ? '0 0 12px rgba(6, 255, 200, 0.08)'
                    : 'none',
                }}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.label === 'Approvals' && pendingCount > 0 && (
                  <Badge
                    className="text-xs ml-auto border-0 px-1.5"
                    style={{
                      backgroundColor: 'rgba(251, 191, 36, 0.2)',
                      color: 'var(--glow-amber)',
                    }}
                  >
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>
        <div
          className="p-4 text-xs border-t"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          v0.1.0
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around z-50"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        {navItems.map((item) => {
          const active = isActive(item.to)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors"
              style={{
                color: active ? 'var(--glow-teal)' : 'var(--text-muted)',
                borderBottom: active
                  ? '2px solid var(--glow-teal)'
                  : '2px solid transparent',
              }}
            >
              <div className="relative">
                <Icon size={20} />
                {item.label === 'Approvals' && pendingCount > 0 && (
                  <span
                    className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: 'var(--glow-amber)',
                      color: '#000',
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </div>
              <span className="font-normal">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
