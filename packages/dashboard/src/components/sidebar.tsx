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
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-60 bg-slate-900 border-r border-slate-800 h-screen flex-shrink-0">
        <div className="p-6 text-lg font-semibold text-slate-100">Myco</div>
        <nav className="flex-1 flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active = isActive(item.to)
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-slate-800 text-slate-100 border-l-2 border-indigo-500 pl-[10px]'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
                ].join(' ')}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.label === 'Approvals' && pendingCount > 0 && (
                  <Badge className="bg-amber-500 text-white text-xs ml-auto border-0 px-1.5">
                    {pendingCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 text-xs text-slate-600 border-t border-slate-800">
          v0.1.0
        </div>
      </aside>

      {/* Mobile bottom tab bar — visible only on mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-slate-900 border-t border-slate-800 flex items-center justify-around z-50">
        {navItems.map((item) => {
          const active = isActive(item.to)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className={[
                'flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors',
                active
                  ? 'text-indigo-400 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              <div className="relative">
                <Icon size={20} />
                {item.label === 'Approvals' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-amber-500 text-white">
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
