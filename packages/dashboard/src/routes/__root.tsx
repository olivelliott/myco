import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar'

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-void)', color: 'var(--text-primary)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 pb-20 md:pb-6">
        <Outlet />
      </main>
    </div>
  ),
})
