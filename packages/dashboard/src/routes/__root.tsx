import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar'

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 pb-20 md:pb-6">
        <Outlet />
      </main>
    </div>
  ),
})
