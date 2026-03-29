# "The Living Network" Full Rebrand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Myco dashboard from a conventional dark-theme card-based UI into a living, breathing bioluminescent organism — borderless glow zones, ambient mycelium background, organic graph animations, and a slim navigation rail.

**Architecture:** The rebrand works in layers — first the CSS foundation and shared primitives (glow-zone, ambient-background), then the navigation shell, then each view (dashboard, graph, approvals) one at a time. Each task produces a working build.

**Tech Stack:** React 19, Tailwind CSS 4, react-force-graph-2d, recharts, Canvas 2D API, CSS animations, Lucide icons. All files in `packages/dashboard/src/`.

**Design spec:** `docs/superpowers/specs/2026-03-29-living-network-rebrand-design.md`

---

## File Structure

### New files
- `packages/dashboard/src/components/ambient-background.tsx` — SVG mycelium paths + CSS-animated spore particles. Fixed-position layer behind all content.
- `packages/dashboard/src/components/glow-zone.tsx` — Reusable borderless container. Radial gradient that intensifies on hover. Replaces Card usage.
- `packages/dashboard/src/components/luminous-stat.tsx` — Oversized glowing number + tiny label. Replaces StatCard.

### Modified files
- `packages/dashboard/src/app.css` — New CSS variables, animation keyframes, remove card/border defaults
- `packages/dashboard/src/routes/__root.tsx` — Add AmbientBackground, slim layout
- `packages/dashboard/src/components/sidebar.tsx` — Slim icon rail + transparent mobile bar
- `packages/dashboard/src/routes/index.tsx` — Glow zone layout, luminous stats, organic feed
- `packages/dashboard/src/components/activity-feed.tsx` — Dot-stream with fade-to-dark
- `packages/dashboard/src/components/knowledge-growth-chart.tsx` — Organic curve chart in glow zone
- `packages/dashboard/src/components/health-metrics.tsx` — Dim ember stats using LuminousStat
- `packages/dashboard/src/components/quick-approve.tsx` — Glow zone treatment
- `packages/dashboard/src/components/graph-view.tsx` — Breathing nodes, bezier edges, particle system, spores
- `packages/dashboard/src/components/graph-toolbar.tsx` — Floating auto-hide circular buttons
- `packages/dashboard/src/components/graph-legend.tsx` — Minimal floating dots, no container
- `packages/dashboard/src/components/entity-panel.tsx` — Glow region panel, mini node-graph
- `packages/dashboard/src/components/graph-analytics.tsx` — Glow zone treatment
- `packages/dashboard/src/routes/graph.tsx` — Full-viewport, fade ambient on mount
- `packages/dashboard/src/routes/approvals.tsx` — Glow zone layout, organic empty state
- `packages/dashboard/src/components/approval-card.tsx` — Amber glow zone, arc confidence, circular buttons
- `packages/dashboard/src/components/merge-card.tsx` — Node-pair visualization with curved dashed line
- `packages/dashboard/src/components/timeline-slider.tsx` — Thin line with glowing dot playhead

---

## Task 1: CSS Foundation & Animation Keyframes

**Files:**
- Modify: `packages/dashboard/src/app.css` (full rewrite)

- [ ] **Step 1: Rewrite app.css with new variables and keyframes**

```css
@import "tailwindcss";

@layer base {
  :root {
    /* Living Network palette */
    --void: #050510;
    --bg-void: #050510;
    --bg-surface: #0a0a1f;
    --bg-elevated: #111133;
    --border-subtle: #1a1a3a;
    --border-glow: #2a2a5a;

    --text-primary: #e8e8f0;
    --text-secondary: #8888aa;
    --text-muted: #555577;

    --glow-teal: #06ffc8;
    --glow-violet: #a78bfa;
    --glow-amber: #fbbf24;
    --glow-emerald: #34d399;
    --glow-rose: #f472b6;
    --glow-blue: #60a5fa;
    --glow-indigo: #818cf8;

    /* shadcn/ui compatibility */
    --background: 240 100% 3%;
    --foreground: 240 20% 93%;
    --card: 240 100% 5%;
    --card-foreground: 240 20% 93%;
    --popover: 240 100% 5%;
    --popover-foreground: 240 20% 93%;
    --primary: 240 20% 93%;
    --primary-foreground: 240 100% 8%;
    --secondary: 240 40% 12%;
    --secondary-foreground: 240 20% 93%;
    --muted: 240 40% 12%;
    --muted-foreground: 240 15% 55%;
    --accent: 240 40% 12%;
    --accent-foreground: 240 20% 93%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 240 20% 93%;
    --border: 240 40% 12%;
    --input: 240 40% 12%;
    --ring: 166 100% 51%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    border-color: var(--border-subtle);
    box-sizing: border-box;
  }

  body {
    background-color: var(--void);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    font-weight: 300;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}

/* Organic animation keyframes */
@keyframes spore-drift-1 {
  0%, 100% { transform: translate(0, 0); opacity: 0.4; }
  25% { transform: translate(8px, -15px); opacity: 0.6; }
  50% { transform: translate(-5px, -28px); opacity: 0.3; }
  75% { transform: translate(10px, -12px); opacity: 0.5; }
}

@keyframes spore-drift-2 {
  0%, 100% { transform: translate(0, 0); opacity: 0.3; }
  33% { transform: translate(-10px, -20px); opacity: 0.5; }
  66% { transform: translate(6px, -35px); opacity: 0.25; }
}

@keyframes spore-drift-3 {
  0%, 100% { transform: translate(0, 0); opacity: 0.35; }
  20% { transform: translate(12px, -8px); opacity: 0.5; }
  40% { transform: translate(-3px, -22px); opacity: 0.3; }
  60% { transform: translate(7px, -30px); opacity: 0.45; }
  80% { transform: translate(-8px, -15px); opacity: 0.25; }
}

@keyframes gentle-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes fade-grow-in {
  0% { opacity: 0; transform: scale(0.8); }
  100% { opacity: 1; transform: scale(1); }
}

/* Reduced motion: disable all organic animations */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Feed fade-to-dark mask */
.feed-fade-mask {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}
```

- [ ] **Step 2: Verify the dashboard still builds**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (CSS changes only — no component breakage)

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/app.css
git commit -m "style: rewrite CSS foundation for Living Network rebrand

Add --void token, organic animation keyframes (spore-drift, gentle-pulse,
fade-grow-in), reduced-motion support, feed-fade-mask, and default
font-weight 300."
```

---

## Task 2: Ambient Background Component

**Files:**
- Create: `packages/dashboard/src/components/ambient-background.tsx`

- [ ] **Step 1: Create the ambient background component**

```tsx
import { memo } from 'react'

/**
 * Layer 1: Ambient mycelium background.
 * Fixed-position SVG with decorative organic paths + CSS-animated spore particles.
 * Always visible behind all content. No JS computation per frame.
 */
export const AmbientBackground = memo(function AmbientBackground({
  fade = false,
}: {
  /** When true, fades to transparent (used when graph view takes over) */
  fade?: boolean
}) {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        opacity: fade ? 0 : 1,
        transition: 'opacity 800ms ease-in-out',
      }}
      aria-hidden="true"
    >
      {/* Decorative mycelium paths */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ opacity: 0.06 }}
      >
        <path
          d="M-20,750 Q120,680 280,700 Q440,680 600,640 Q760,600 920,580 Q1080,560 1240,520 Q1400,480 1460,450"
          stroke="var(--glow-teal)"
          fill="none"
          strokeWidth="1"
        />
        <path
          d="M-10,800 Q150,740 320,760 Q490,740 660,700 Q830,670 1000,650 Q1170,630 1340,590 Q1460,560 1480,540"
          stroke="var(--glow-violet)"
          fill="none"
          strokeWidth="0.7"
        />
        <path
          d="M60,850 Q200,810 380,800 Q560,780 740,750 Q920,730 1100,710 Q1280,690 1460,660"
          stroke="var(--glow-emerald)"
          fill="none"
          strokeWidth="0.5"
        />
        {/* Junction nodes */}
        <circle cx="280" cy="700" r="2" fill="var(--glow-teal)" opacity="0.4" />
        <circle cx="600" cy="640" r="1.5" fill="var(--glow-teal)" opacity="0.3" />
        <circle cx="920" cy="580" r="1.5" fill="var(--glow-violet)" opacity="0.3" />
        <circle cx="320" cy="760" r="1" fill="var(--glow-violet)" opacity="0.25" />
        <circle cx="740" cy="750" r="1" fill="var(--glow-emerald)" opacity="0.2" />
      </svg>

      {/* Drifting spore particles — CSS-only animation */}
      <div
        className="absolute rounded-full"
        style={{
          width: 2, height: 2,
          background: 'var(--glow-teal)',
          top: '65%', left: '20%',
          boxShadow: '0 0 6px 2px rgba(6,255,200,0.15)',
          animation: 'spore-drift-1 18s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 1.5, height: 1.5,
          background: 'var(--glow-violet)',
          top: '45%', left: '70%',
          boxShadow: '0 0 5px 2px rgba(167,139,250,0.12)',
          animation: 'spore-drift-2 22s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 1.5, height: 1.5,
          background: 'var(--glow-emerald)',
          top: '75%', left: '55%',
          boxShadow: '0 0 5px 2px rgba(52,211,153,0.1)',
          animation: 'spore-drift-3 25s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 1, height: 1,
          background: 'var(--glow-teal)',
          top: '30%', left: '40%',
          boxShadow: '0 0 4px 2px rgba(6,255,200,0.1)',
          animation: 'spore-drift-1 20s ease-in-out infinite 5s',
        }}
      />

      {/* Ground glow */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: '30%',
          background: 'radial-gradient(ellipse at 50% 100%, rgba(6,255,200,0.025), transparent 70%)',
        }}
      />
    </div>
  )
})
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/ambient-background.tsx
git commit -m "feat: add AmbientBackground component — Layer 1 of Living Network

Fixed-position SVG mycelium paths at 6% opacity, 4 CSS-animated spore
particles on 18-25s drift cycles, radial ground glow. Supports fade
prop for graph view takeover. Zero JS per-frame computation."
```

---

## Task 3: GlowZone and LuminousStat Primitives

**Files:**
- Create: `packages/dashboard/src/components/glow-zone.tsx`
- Create: `packages/dashboard/src/components/luminous-stat.tsx`

- [ ] **Step 1: Create GlowZone component**

```tsx
import type { ReactNode, CSSProperties } from 'react'

const GLOW_COLORS: Record<string, string> = {
  teal: '6,255,200',
  violet: '167,139,250',
  amber: '251,191,36',
  emerald: '52,211,153',
  rose: '244,114,182',
  blue: '96,165,250',
  indigo: '129,140,248',
}

interface GlowZoneProps {
  children: ReactNode
  color?: keyof typeof GLOW_COLORS | string
  intensity?: number // 0-1, default 0.05
  hoverIntensity?: number // 0-1, default 0.09
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export function GlowZone({
  children,
  color = 'teal',
  intensity = 0.05,
  hoverIntensity = 0.09,
  className = '',
  style,
  onClick,
}: GlowZoneProps) {
  const rgb = GLOW_COLORS[color] ?? GLOW_COLORS.teal

  return (
    <div
      className={`group transition-all duration-300 ease-in-out ${className}`}
      style={{
        background: `radial-gradient(ellipse at center, rgba(${rgb},${intensity}), transparent 70%)`,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          `radial-gradient(ellipse at center, rgba(${rgb},${hoverIntensity}), transparent 70%)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          `radial-gradient(ellipse at center, rgba(${rgb},${intensity}), transparent 70%)`
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create LuminousStat component**

```tsx
interface LuminousStatProps {
  label: string
  value: number | string
  sub?: string
  color?: string // CSS color value, e.g. 'var(--glow-teal)'
  dim?: boolean // For secondary stats — smaller, dimmer
}

export function LuminousStat({ label, value, sub, color = 'var(--glow-teal)', dim = false }: LuminousStatProps) {
  const numSize = dim ? 'text-[24px]' : 'text-[42px]'
  const numWeight = 'font-extralight'

  return (
    <div className="text-center py-4 px-6">
      <p
        className={`${numSize} ${numWeight} leading-none`}
        style={{
          color,
          textShadow: `0 0 20px ${color.replace('var(', '').replace(')', '')}40`,
        }}
      >
        {value}
      </p>
      <p
        className="text-[9px] font-normal uppercase tracking-[3px] mt-2"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      {sub && (
        <p
          className="text-[11px] font-light mt-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/glow-zone.tsx packages/dashboard/src/components/luminous-stat.tsx
git commit -m "feat: add GlowZone and LuminousStat primitives

GlowZone: borderless radial gradient container with hover intensification.
LuminousStat: oversized glowing number with tiny label, replaces StatCard.
Both support Living Network color palette."
```

---

## Task 4: Root Layout + Ambient Background Integration

**Files:**
- Modify: `packages/dashboard/src/routes/__root.tsx`

- [ ] **Step 1: Add AmbientBackground to root layout**

Replace the entire file content:

```tsx
import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { Sidebar } from '../components/sidebar'
import { AmbientBackground } from '../components/ambient-background'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const routerState = useRouterState()
  const isGraphPage = routerState.location.pathname === '/graph'

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--void)', color: 'var(--text-primary)' }}>
      <AmbientBackground fade={isGraphPage} />
      <Sidebar />
      <main
        className="flex-1 overflow-auto pb-20 md:pb-6"
        style={{
          position: 'relative',
          zIndex: 1,
          padding: isGraphPage ? 0 : '1.5rem',
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verify build and check the ambient background renders**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/routes/__root.tsx
git commit -m "feat: integrate AmbientBackground into root layout

Ambient mycelium visible on all pages, fades on graph page.
Graph page gets zero-padding for full viewport. Root layout
detects current route to toggle ambient fade."
```

---

## Task 5: Sidebar — Slim Icon Rail

**Files:**
- Modify: `packages/dashboard/src/components/sidebar.tsx`

- [ ] **Step 1: Rewrite sidebar as slim icon rail**

Replace the entire file content:

```tsx
import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, CheckSquare, Network } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../lib/api'

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
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  function isActive(to: string) {
    if (to === '/') return currentPath === '/'
    return currentPath.startsWith(to)
  }

  return (
    <>
      {/* Desktop: slim icon rail — 60px, no background */}
      <aside
        className="hidden md:flex md:flex-col md:items-center md:w-[60px] h-screen flex-shrink-0 py-6 gap-6"
        style={{ position: 'relative', zIndex: 2 }}
      >
        {/* Logo mark */}
        <div
          className="text-xs font-light tracking-[3px] uppercase mb-4"
          style={{
            color: 'var(--glow-teal)',
            textShadow: '0 0 12px rgba(6,255,200,0.3)',
          }}
        >
          M
        </div>

        {/* Nav icons */}
        <nav className="flex flex-col gap-4 items-center">
          {navItems.map((item) => {
            const active = isActive(item.to)
            const hovered = hoveredItem === item.to
            const Icon = item.icon

            return (
              <div key={item.to} className="relative">
                <Link
                  to={item.to}
                  className="relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300"
                  style={{
                    color: active ? 'var(--glow-teal)' : 'var(--text-muted)',
                    boxShadow: active
                      ? '0 0 12px rgba(6,255,200,0.15)'
                      : 'none',
                    background: active
                      ? 'radial-gradient(circle, rgba(6,255,200,0.08), transparent 70%)'
                      : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredItem(item.to)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <Icon size={20} />
                  {/* Approval badge */}
                  {item.label === 'Approvals' && pendingCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--glow-amber)',
                        boxShadow: '0 0 6px rgba(251,191,36,0.4)',
                        animation: 'gentle-pulse 3s ease-in-out infinite',
                      }}
                    />
                  )}
                </Link>

                {/* Hover label — fades in to the right */}
                {hovered && (
                  <div
                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-light"
                    style={{
                      color: active ? 'var(--glow-teal)' : 'var(--text-secondary)',
                      animation: 'fade-grow-in 200ms ease-out',
                    }}
                  >
                    {item.label}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* Mobile: bottom tab bar — transparent background */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 h-14 flex items-center justify-around"
        style={{ zIndex: 50 }}
      >
        {navItems.map((item) => {
          const active = isActive(item.to)
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-all duration-300"
              style={{
                color: active ? 'var(--glow-teal)' : 'var(--text-muted)',
                boxShadow: active
                  ? 'inset 0 -2px 8px rgba(6,255,200,0.15)'
                  : 'none',
              }}
            >
              <div className="relative">
                <Icon size={20} />
                {item.label === 'Approvals' && pendingCount > 0 && (
                  <span
                    className="absolute -top-1 -right-2 w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: 'var(--glow-amber)',
                      boxShadow: '0 0 4px rgba(251,191,36,0.4)',
                      animation: 'gentle-pulse 3s ease-in-out infinite',
                    }}
                  />
                )}
              </div>
              <span className="font-light">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/sidebar.tsx
git commit -m "style: redesign sidebar as slim 60px icon rail

Desktop: icon-only rail with glow halo active states, hover labels that
fade in, pulsing amber approval badge. No background — icons float in void.
Mobile: transparent bottom bar with inset glow for active tab."
```

---

## Task 6: Dashboard — Luminous Stats & Glow Zone Layout

**Files:**
- Modify: `packages/dashboard/src/routes/index.tsx`
- Modify: `packages/dashboard/src/components/health-metrics.tsx`

- [ ] **Step 1: Rewrite the dashboard page**

Replace the entire file content of `packages/dashboard/src/routes/index.tsx`:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDashboard } from '../hooks/use-dashboard'
import { useGraph } from '../hooks/use-graph'
import { LuminousStat } from '../components/luminous-stat'
import { GlowZone } from '../components/glow-zone'
import { ActivityFeed } from '../components/activity-feed'
import { QuickApprove } from '../components/quick-approve'
import { GraphView } from '../components/graph-view'
import { KnowledgeGrowthChart } from '../components/knowledge-growth-chart'
import { HealthMetrics } from '../components/health-metrics'

export const Route = createFileRoute('/')({ component: DashboardPage })

function DashboardPage() {
  const { data, error } = useDashboard()
  const { data: graphData } = useGraph()
  const navigate = useNavigate()

  if (error)
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>
          cannot reach api server
        </p>
      </div>
    )

  const density =
    data && data.entities > 0
      ? Math.round(((data.relationships ?? 0) / data.entities) * 10) / 10
      : 0

  // Top 30 most connected nodes for mini graph
  const miniNodes =
    graphData?.nodes?.sort((a, b) => b.val - a.val).slice(0, 30) ?? []
  const miniNodeIds = new Set(miniNodes.map((n) => n.id))
  const miniLinks =
    graphData?.links?.filter(
      (l) =>
        miniNodeIds.has(l.source as string) &&
        miniNodeIds.has(l.target as string),
    ) ?? []

  return (
    <div className="space-y-12 max-w-6xl mx-auto">
      {/* Hero stats — luminous numbers floating in void */}
      <div className="flex flex-wrap justify-center gap-16 pt-6">
        <LuminousStat
          label="Entities"
          value={data?.entities ?? 0}
          color="var(--glow-teal)"
          sub={data?.growthStats ? `+${data.growthStats.entitiesLast7d} this week` : undefined}
        />
        <LuminousStat
          label="Relationships"
          value={data?.relationships ?? 0}
          color="var(--glow-violet)"
          sub={`${density}x density`}
        />
        <LuminousStat
          label="Observations"
          value={data?.observations ?? 0}
          color="var(--glow-emerald)"
          sub={data?.growthStats ? `+${data.growthStats.observationsLast7d} this week` : undefined}
        />
        <LuminousStat
          label="Pending"
          value={data?.pending ?? 0}
          color={(data?.pending ?? 0) > 0 ? 'var(--glow-amber)' : 'var(--glow-teal)'}
        />
      </div>

      {/* Knowledge growth chart */}
      <KnowledgeGrowthChart />

      {/* Health metrics — dim embers */}
      <HealthMetrics health={data?.health} />

      {/* Graph preview + Most Connected */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <GlowZone
          color="teal"
          className="rounded-2xl overflow-hidden cursor-pointer"
          style={{ height: 400 }}
          onClick={() => navigate({ to: '/graph' })}
        >
          {miniNodes.length > 0 ? (
            <GraphView
              nodes={miniNodes}
              links={miniLinks}
              onNodeClick={() => navigate({ to: '/graph' })}
              mini
            />
          ) : (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: 'var(--text-muted)' }}
            >
              <p className="text-sm font-light">knowledge web preview</p>
            </div>
          )}
        </GlowZone>

        <div className="space-y-3">
          <p
            className="text-[9px] font-normal uppercase tracking-[3px]"
            style={{ color: 'var(--text-muted)' }}
          >
            most connected
          </p>
          {(data?.topConnected ?? []).map((entity) => (
            <GlowZone key={entity.id} color="violet" className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>
                  {entity.name}
                </span>
                <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                  {entity.type}
                </span>
              </div>
              <span className="text-xs font-light" style={{ color: 'var(--glow-teal)' }}>
                {entity.connection_count}
              </span>
            </GlowZone>
          ))}
          {(data?.topConnected ?? []).length === 0 && (
            <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>
              no connections yet
            </p>
          )}
        </div>
      </div>

      {/* Activity feed + Quick Approve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div>
          <p
            className="text-[9px] font-normal uppercase tracking-[3px] mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            activity
          </p>
          <ActivityFeed activities={data?.recentActivity ?? []} />
        </div>
        <div>
          <p
            className="text-[9px] font-normal uppercase tracking-[3px] mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            quick approve
          </p>
          <QuickApprove />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite HealthMetrics to use LuminousStat**

Replace the entire file content of `packages/dashboard/src/components/health-metrics.tsx`:

```tsx
import { type HealthMetrics as HealthMetricsType } from '../lib/api'
import { LuminousStat } from './luminous-stat'

interface HealthMetricsProps {
  health: HealthMetricsType | undefined
}

export function HealthMetrics({ health }: HealthMetricsProps) {
  if (!health) return null

  const highBucket = health.confidenceDistribution.find((b) => b.bucket === 'high')
  const highCount = highBucket?.count ?? 0
  const totalEntities = health.confidenceDistribution.reduce((sum, b) => sum + b.count, 0)
  const highPct = totalEntities > 0 ? Math.round((highCount / totalEntities) * 100) : 0

  return (
    <div className="flex flex-wrap justify-center gap-10">
      <LuminousStat
        label="Consolidation Backlog"
        value={health.unconsolidatedEpisodes}
        sub="episodes pending"
        color={health.unconsolidatedEpisodes > 0 ? 'var(--glow-amber)' : 'var(--glow-teal)'}
        dim
      />
      <LuminousStat
        label="Embedding Coverage"
        value={`${health.embeddingCoverage}%`}
        sub="observations embedded"
        color={health.embeddingCoverage < 80 ? 'var(--glow-amber)' : 'var(--glow-teal)'}
        dim
      />
      <LuminousStat
        label="Orphaned Entities"
        value={health.orphanedNodes}
        sub="no relationships"
        color={health.orphanedNodes > 5 ? 'var(--glow-amber)' : 'var(--glow-teal)'}
        dim
      />
      <LuminousStat
        label="High Confidence"
        value={`${highPct}%`}
        sub={`${highCount} of ${totalEntities}`}
        color="var(--glow-emerald)"
        dim
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/routes/index.tsx packages/dashboard/src/components/health-metrics.tsx
git commit -m "style: redesign dashboard with luminous stats and glow zones

Replace card-based layout with floating luminous numbers, glow zone
containers, lowercase headings. Health metrics use dim LuminousStat.
Generous spacing (gap-12, gap-16) for void breathing."
```

---

## Task 7: Activity Feed — Dot Stream with Fade-to-Dark

**Files:**
- Modify: `packages/dashboard/src/components/activity-feed.tsx`

- [ ] **Step 1: Rewrite activity feed as organic dot stream**

Replace the entire file content:

```tsx
import { formatDistanceToNow } from 'date-fns'
import { type ActivityCard } from '../lib/api'
import { getNodeColor } from './graph-view'

interface ActivityFeedProps {
  activities: ActivityCard[]
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>
        new entities will appear here as agents learn
      </p>
    )
  }

  return (
    <div className="feed-fade-mask space-y-1 max-h-[400px] overflow-hidden">
      {activities.map((activity, i) => {
        const color = getNodeColor(activity.type)
        return (
          <div
            key={activity.id}
            className="flex items-center gap-3 py-2 px-1"
            style={{
              animation: `fade-grow-in ${400 + i * 80}ms ease-out`,
            }}
          >
            {/* Glowing type dot */}
            <div
              className="flex-shrink-0 rounded-full"
              style={{
                width: 7,
                height: 7,
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}50`,
              }}
            />

            {/* Name */}
            <span
              className="text-sm font-light flex-1 min-w-0 truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {activity.name}
            </span>

            {/* Timestamp */}
            <span
              className="text-[11px] font-light flex-shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/activity-feed.tsx
git commit -m "style: redesign activity feed as dot stream with fade-to-dark

Borderless dot stream — type-colored dots with glow, light text, staggered
fade-grow-in entry animations. CSS mask gradient fades items into darkness
at the bottom. No containers, no dividers."
```

---

## Task 8: Knowledge Growth Chart — Organic Glow Zone

**Files:**
- Modify: `packages/dashboard/src/components/knowledge-growth-chart.tsx`

- [ ] **Step 1: Restyle chart in glow zone, remove container borders**

Replace the entire file content:

```tsx
import { Area, AreaChart, XAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from './ui/chart'
import { useGrowthStats } from '../hooks/use-dashboard'
import { GlowZone } from './glow-zone'

const chartConfig: ChartConfig = {
  entities: { label: 'Entities', color: '#06ffc8' },
  observations: { label: 'Observations', color: '#a78bfa' },
  relationships: { label: 'Relationships', color: '#fbbf24' },
}

export function KnowledgeGrowthChart() {
  const { data, isLoading } = useGrowthStats()
  const points = data?.points ?? []

  if (isLoading || points.length === 0) return null

  return (
    <GlowZone color="teal" intensity={0.03} className="py-6 px-4">
      <p
        className="text-[9px] font-normal uppercase tracking-[3px] mb-4"
        style={{ color: 'var(--text-muted)' }}
      >
        knowledge growth
      </p>
      <ChartContainer config={chartConfig} className="h-[200px] w-full">
        <AreaChart data={points}>
          <XAxis
            dataKey="day"
            tickFormatter={(value: string) => {
              try {
                return format(parseISO(value), 'MMM d')
              } catch {
                return value
              }
            }}
            stroke="var(--text-muted)"
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey="entities"
            stroke="#06ffc8"
            fill="#06ffc8"
            fillOpacity={0.06}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="observations"
            stroke="#a78bfa"
            fill="#a78bfa"
            fillOpacity={0.04}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="relationships"
            stroke="#fbbf24"
            fill="#fbbf24"
            fillOpacity={0.04}
            strokeWidth={1.5}
          />
        </AreaChart>
      </ChartContainer>
    </GlowZone>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/knowledge-growth-chart.tsx
git commit -m "style: restyle growth chart in glow zone, remove grid and borders

Monotone curves with 4-6% fill opacity, no CartesianGrid, no Y axis,
no legend (colors speak for themselves). Wrapped in teal glow zone.
Lowercase label, reduced chart height to 200px."
```

---

## Task 9: Graph View — Breathing Nodes, Bezier Edges, Particle System

**Files:**
- Modify: `packages/dashboard/src/components/graph-view.tsx`

This is the largest task — the heart of the rebrand. The changes are:
1. Add breathing pulse to node painter (desynchronized per-node period)
2. Change edges from quadratic to cubic bezier with randomized control point offset
3. Add nutrient particle system flowing along edges
4. Add free-floating spore particles
5. Remove bordered search/filter controls, replace with minimal floating inputs
6. Remove stats bar

- [ ] **Step 1: Add utility constants and particle state refs after existing imports**

After the `DEFAULT_COLOR` line (line 76), add:

```tsx
/** Stable per-node random seed for desynchronized pulse */
function hashNodeId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Particle state for edge nutrient flow */
interface EdgeParticle {
  progress: number // 0-1 along the edge path
  speed: number    // progress per ms
  color: string
}
```

- [ ] **Step 2: Add particle refs inside the GraphView component**

Inside `GraphView`, after the `prevCutoffRef` line (around line 108), add:

```tsx
  // Edge nutrient particles: map link key -> particle state
  const edgeParticlesRef = useRef<Map<string, EdgeParticle>>(new Map())
  // Free-floating spore particles
  const sporesRef = useRef<Array<{
    x: number; y: number; vx: number; vy: number
    color: string; size: number; opacity: number; phase: number
  }>>([])
  const sporesInitRef = useRef(false)
  // Timestamp tracking for animation delta
  const lastFrameRef = useRef(Date.now())
```

- [ ] **Step 3: Add a useEffect for continuous canvas refresh (breathing + particles)**

After the existing timeline rAF effect (around line 319), add:

```tsx
  // Continuous low-fps refresh for breathing nodes + particles (when not in timeline mode)
  useEffect(() => {
    if (timelineActive || mini) return
    let rafId: number
    const loop = () => {
      fgRef.current?.refresh()
      rafId = requestAnimationFrame(loop)
    }
    // Delay start until initial layout settles
    const timeout = setTimeout(() => {
      rafId = requestAnimationFrame(loop)
    }, 2500)
    return () => {
      clearTimeout(timeout)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [timelineActive, mini])
```

- [ ] **Step 4: Modify nodeCanvasObject to add breathing pulse**

In the non-LOD path of `nodeCanvasObject`, replace the outer glow section (roughly lines 469-496). The key change is making `glowAlpha` oscillate using a sine wave with a per-node period:

Find this block in the node painter (the outer glow gradient section):
```tsx
          const glowAlpha = onPath
            ? 0.4
            : isHovered
              ? 0.35
              : isNeighbor
                ? 0.2
                : 0.12
```

Replace with:
```tsx
          // Breathing pulse: desynchronized sine wave per node
          const pulseHash = hashNodeId(n.id)
          const pulsePeriod = 3000 + (pulseHash % 4000) // 3-7s
          const pulsePhase = (pulseHash % 1000) / 1000 * Math.PI * 2
          const breathe = 0.5 + 0.5 * Math.sin((Date.now() / pulsePeriod) * Math.PI * 2 + pulsePhase)

          const baseGlowAlpha = onPath
            ? 0.4
            : isHovered
              ? 0.35
              : isNeighbor
                ? 0.2
                : 0.08 + breathe * 0.07 // oscillates 0.08 - 0.15
          const glowAlpha = baseGlowAlpha
```

- [ ] **Step 5: Modify linkCanvasObject for cubic bezier + nutrient particles**

Replace the edge curve section. Find the control point calculation (around lines 684-690):
```tsx
          const midX = (l.source.x + l.target.x) / 2
          const midY = (l.source.y! + l.target.y!) / 2
          const dx = l.target.x - l.source.x
          const dy = l.target.y! - l.source.y!
          const cpX = midX - dy * 0.1
          const cpY = midY + dx * 0.1
```

Replace with:
```tsx
          const dx = l.target.x - l.source.x
          const dy = l.target.y! - l.source.y!
          const len = Math.sqrt(dx * dx + dy * dy) || 1
          // Perpendicular offset — randomized direction per edge
          const edgeHash = hashNodeId(srcId + tgtId)
          const offsetDir = (edgeHash % 2 === 0) ? 1 : -1
          const offsetMag = 0.15 + (edgeHash % 15) / 100 // 0.15-0.30
          const perpX = -dy / len * offsetMag * len * offsetDir
          const perpY = dx / len * offsetMag * len * offsetDir
          // Two control points for cubic bezier
          const cp1x = l.source.x + dx * 0.33 + perpX * 0.6
          const cp1y = l.source.y! + dy * 0.33 + perpY * 0.6
          const cp2x = l.source.x + dx * 0.66 + perpX
          const cp2y = l.source.y! + dy * 0.66 + perpY
```

Then replace the bezier drawing call:
```tsx
          ctx.moveTo(l.source.x, l.source.y!)
          ctx.quadraticCurveTo(cpX, cpY, l.target.x, l.target.y!)
```

With:
```tsx
          ctx.moveTo(l.source.x, l.source.y!)
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, l.target.x, l.target.y!)
```

After the edge stroke, add nutrient particle drawing (before the label section):
```tsx
          // Nutrient particle flowing along edge
          if (!mini) {
            const linkKey = srcId + ':' + tgtId
            let particle = edgeParticlesRef.current.get(linkKey)
            if (!particle) {
              const speed = 1 / (4000 + (edgeHash % 4000)) // 4-8s per traversal
              particle = { progress: (edgeHash % 100) / 100, speed, color: srcColor }
              edgeParticlesRef.current.set(linkKey, particle)
            }
            const now = Date.now()
            const dt = now - lastFrameRef.current
            particle.progress = (particle.progress + particle.speed * dt) % 1
            const t = particle.progress
            // Position along cubic bezier
            const mt = 1 - t
            const px = mt*mt*mt*l.source.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*l.target.x
            const py = mt*mt*mt*l.source.y! + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*l.target.y!
            ctx.beginPath()
            ctx.arc(px, py, 1.2 / globalScale, 0, 2 * Math.PI)
            ctx.fillStyle = hexToRgba(srcColor, 0.5 * alpha * 3)
            ctx.fill()
          }
```

Also update the label positioning to use the midpoint of the cubic bezier:
```tsx
          // Replace cpX, cpY references in label drawing with cubic midpoint
          const labelX = (l.source.x + 3*cp1x + 3*cp2x + l.target.x) / 8
          const labelY = (l.source.y! + 3*cp1y + 3*cp2y + l.target.y!) / 8
```

And use `labelX`, `labelY` instead of `cpX`, `cpY` in the label rendering section.

- [ ] **Step 6: Add spore particles in onRenderFramePost**

At the end of `onRenderFramePost` (after the cluster drawing), add spore rendering:

```tsx
          // Update frame timestamp for particle delta
          lastFrameRef.current = Date.now()

          // Free-floating spore particles
          if (!mini) {
            if (!sporesInitRef.current) {
              sporesInitRef.current = true
              const colors = ['#06ffc8', '#a78bfa', '#34d399', '#818cf8', '#fbbf24']
              for (let i = 0; i < 8; i++) {
                sporesRef.current.push({
                  x: (Math.random() - 0.5) * 800,
                  y: (Math.random() - 0.5) * 600,
                  vx: (Math.random() - 0.5) * 0.02,
                  vy: (Math.random() - 0.5) * 0.02,
                  color: colors[i % colors.length],
                  size: 1 + Math.random() * 1.5,
                  opacity: 0.2 + Math.random() * 0.3,
                  phase: Math.random() * Math.PI * 2,
                })
              }
            }

            const dt = 16 // approximate ms per frame
            for (const spore of sporesRef.current) {
              spore.x += spore.vx * dt
              spore.y += spore.vy * dt
              // Gentle drift direction changes
              spore.vx += (Math.random() - 0.5) * 0.001
              spore.vy += (Math.random() - 0.5) * 0.001
              // Clamp velocity
              spore.vx = Math.max(-0.05, Math.min(0.05, spore.vx))
              spore.vy = Math.max(-0.05, Math.min(0.05, spore.vy))
              // Opacity breathe
              const o = spore.opacity * (0.7 + 0.3 * Math.sin(Date.now() / 3000 + spore.phase))

              ctx.beginPath()
              ctx.arc(spore.x, spore.y, spore.size / globalScale, 0, 2 * Math.PI)
              ctx.fillStyle = hexToRgba(spore.color, o)
              ctx.fill()
            }
          }
```

- [ ] **Step 7: Remove the bordered search/filter controls and stats bar**

Remove the search + filter `<div>` block (the one with `absolute top-4 left-4`) and the stats bar (`absolute bottom-4 right-4`). The graph toolbar handles mode controls; search can be integrated into the toolbar later if needed.

Delete the search state and related effects (`search`, `setSearch`, `searchZoomTimerRef`, the search auto-zoom effect, and the search pulse refresh effect).

Remove the `typeFilter` state and `Select` import. Type filtering moves to the toolbar.

Remove the `Input` and `Select` imports.

- [ ] **Step 8: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add packages/dashboard/src/components/graph-view.tsx
git commit -m "feat: add breathing nodes, cubic bezier edges, and particle system

Nodes: desynchronized breathing pulse (3-7s per node, sine wave on glow alpha).
Edges: cubic bezier curves with randomized perpendicular offset (15-30%).
Nutrient particles: one per edge flowing along bezier path (4-8s).
Spores: 8 free-floating particles with gentle drift and opacity breathe.
Remove inline search/filter/stats controls for clean viewport."
```

---

## Task 10: Graph Toolbar — Floating Circular Buttons with Auto-Hide

**Files:**
- Modify: `packages/dashboard/src/components/graph-toolbar.tsx`

- [ ] **Step 1: Redesign toolbar as floating circular icon buttons**

Replace the entire `ToolbarButton` component and the toolbar layout. The toolbar should:
- Use circular buttons (w-9 h-9 rounded-full) with glow halos
- No background bar — buttons float directly on the canvas
- Auto-hide: 50% opacity idle, 100% on hover. Fade out after 3s of inactivity.

Replace the entire file content:

```tsx
import { useState, useEffect, useRef } from 'react'
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
  const [visible, setVisible] = useState(true)
  const hideTimerRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-hide after 3s of inactivity
  useEffect(() => {
    const resetTimer = () => {
      setVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = window.setTimeout(() => setVisible(false), 3000)
    }

    resetTimer()
    window.addEventListener('mousemove', resetTimer)
    return () => {
      window.removeEventListener('mousemove', resetTimer)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  return (
    <>
      {/* Back pill in special modes */}
      {inSpecialMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={onExitMode}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-light transition-all duration-300"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(6,255,200,0.1), transparent 80%)',
              color: 'var(--glow-teal)',
            }}
          >
            <ArrowLeft size={14} />
            {activeMode === 'neighborhood' && neighborhoodCenter
              ? `exit "${neighborhoodCenter}"`
              : activeMode === 'path'
                ? 'exit path tracing'
                : 'back to full graph'}
          </button>
        </div>
      )}

      {/* Floating toolbar */}
      <div
        ref={containerRef}
        className="absolute top-4 right-4 z-10 flex flex-col gap-2 transition-opacity duration-500"
        style={{ opacity: visible ? 0.7 : 0 }}
        onMouseEnter={() => {
          setVisible(true)
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        }}
        onMouseLeave={() => {
          hideTimerRef.current = window.setTimeout(() => setVisible(false), 3000)
        }}
      >
        <FloatingButton
          active={activeMode === 'path'}
          icon={<Route size={15} />}
          onClick={onTogglePathMode}
          color="teal"
        />
        <FloatingButton
          active={analyticsOpen}
          icon={<BarChart3 size={15} />}
          onClick={onToggleAnalytics}
          color="violet"
        />
        <FloatingButton
          active={timelineEnabled}
          icon={<Clock size={15} />}
          onClick={onToggleTimeline}
          color="teal"
        />
        <FloatingButton
          active={legendOpen}
          icon={<Info size={15} />}
          onClick={onToggleLegend}
          color="indigo"
        />
        <FloatingButton
          active={clustersEnabled}
          icon={<Hexagon size={15} />}
          onClick={onToggleClusters}
          color="emerald"
        />

        {/* Confidence slider */}
        <div className="flex flex-col items-center gap-1 py-2 px-1">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={confidenceThreshold}
            onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
            className="w-1 h-16 appearance-none rounded-full cursor-pointer"
            style={{
              writingMode: 'vertical-lr',
              direction: 'rtl',
              background: `linear-gradient(to top, var(--glow-teal) ${confidenceThreshold * 100}%, var(--border-subtle) ${confidenceThreshold * 100}%)`,
              accentColor: 'var(--glow-teal)',
            }}
          />
          <span className="text-[9px] font-light" style={{ color: 'var(--text-muted)' }}>
            {Math.round(confidenceThreshold * 100)}%
          </span>
        </div>

        {/* Path info */}
        {pathInfo && (
          <div className="flex items-center gap-1 text-[10px] font-light max-w-[140px]" style={{ color: 'var(--glow-teal)' }}>
            <span className="truncate">{pathInfo}</span>
            <button onClick={onClearPath} className="opacity-60 hover:opacity-100 shrink-0">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Neighborhood info */}
        {neighborhoodCenter && (
          <div className="flex items-center gap-1 text-[10px] font-light max-w-[140px]" style={{ color: 'var(--glow-teal)' }}>
            <span className="truncate">{neighborhoodCenter}</span>
            <button
              onClick={() => onNeighborhoodDepthChange?.(neighborhoodDepth === 1 ? 2 : 1)}
              className="text-[9px] px-1 rounded-full shrink-0"
              style={{ color: 'var(--glow-teal)', background: 'rgba(6,255,200,0.08)' }}
            >
              {neighborhoodDepth ?? 1}h
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function FloatingButton({
  active,
  icon,
  onClick,
  color = 'teal',
}: {
  active: boolean
  icon: React.ReactNode
  onClick: () => void
  color?: string
}) {
  const colorMap: Record<string, string> = {
    teal: '6,255,200',
    violet: '167,139,250',
    emerald: '52,211,153',
    indigo: '129,140,248',
  }
  const rgb = colorMap[color] ?? colorMap.teal

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300"
      style={{
        color: active ? `rgb(${rgb})` : 'var(--text-muted)',
        background: active
          ? `radial-gradient(circle, rgba(${rgb},0.12), transparent 70%)`
          : 'transparent',
        boxShadow: active ? `0 0 10px rgba(${rgb},0.15)` : 'none',
      }}
    >
      {icon}
    </button>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/graph-toolbar.tsx
git commit -m "style: redesign graph toolbar as floating circular buttons with auto-hide

Circular icon buttons with glow halos, no background bar. Auto-hides
at 0 opacity after 3s of inactivity, 70% on mouse movement. Vertical
confidence slider. Lowercase labels. All chrome floats on the void."
```

---

## Task 11: Graph Legend — Minimal Floating Dots

**Files:**
- Modify: `packages/dashboard/src/components/graph-legend.tsx`

- [ ] **Step 1: Rewrite legend as minimal floating dot-label cluster**

Replace the entire file content:

```tsx
const TYPE_COLORS: Array<{ label: string; color: string }> = [
  { label: 'person', color: '#06ffc8' },
  { label: 'project', color: '#a78bfa' },
  { label: 'concept', color: '#fbbf24' },
  { label: 'tool', color: '#34d399' },
  { label: 'technology', color: '#60a5fa' },
  { label: 'decision', color: '#f472b6' },
  { label: 'other', color: '#818cf8' },
]

export function GraphLegend() {
  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5"
      style={{ opacity: 0.6 }}
    >
      {TYPE_COLORS.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className="rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: color,
              boxShadow: `0 0 5px ${color}50`,
            }}
          />
          <span className="text-[9px] font-light" style={{ color: 'var(--text-secondary)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/graph-legend.tsx
git commit -m "style: redesign graph legend as minimal floating dot-labels

6px glowing dots with 9px labels at 60% opacity. No container, no background,
no sections. Lowercase type names. Floats directly on the graph canvas."
```

---

## Task 12: Entity Panel — Glow Region

**Files:**
- Modify: `packages/dashboard/src/components/entity-panel.tsx`

- [ ] **Step 1: Redesign entity panel as concentrated glow region**

Replace the panel container styling. Instead of `backgroundColor: 'var(--bg-surface)'` and `borderLeft`, use a radial gradient tinted to the entity type:

In the panel's outer `<div>` (the one with `fixed right-0`), change the style:

Replace:
```tsx
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
        }}
```

With:
```tsx
        style={{
          background: `radial-gradient(ellipse at right center, ${getTypeColor(data?.entity.type ?? '')}0D, var(--void) 80%)`,
        }}
```

Also update the header: change font-semibold to font-light on the entity name, make it text-xl. Remove the Badge for type — show type as a tiny label. Remove the Separator components. Make observations use font-light text. Change "Connected Entities" section to show type-colored dots without the bullet list style.

The full rewrite of entity-panel.tsx:

```tsx
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Focus } from 'lucide-react'
import { fetchEntityDetail } from '../lib/api'
import { ScrollArea } from './ui/scroll-area'

interface EntityPanelProps {
  nodeId: string
  onClose: () => void
  onExploreNeighborhood?: (nodeId: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  person: '#06ffc8', agent: '#06ffc8',
  project: '#a78bfa', codebase: '#a78bfa',
  concept: '#fbbf24', topic: '#fbbf24',
  tool: '#34d399', library: '#34d399',
  technology: '#60a5fa', decision: '#f472b6',
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? '#818cf8'
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function EntityPanel({ nodeId, onClose, onExploreNeighborhood }: EntityPanelProps) {
  const [visible, setVisible] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['entity', nodeId],
    queryFn: () => fetchEntityDetail(nodeId),
    enabled: !!nodeId,
  })

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const typeColor = getTypeColor(data?.entity.type ?? '')

  return (
    <>
      {/* Click-to-close backdrop */}
      <div
        className="fixed inset-0 z-10"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        className={[
          'fixed right-0 top-0 h-full w-full md:w-80 z-20 overflow-hidden',
          'transition-all duration-500 ease-in-out',
          visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0',
        ].join(' ')}
        style={{
          background: data
            ? `radial-gradient(ellipse at 80% 30%, ${hexToRgba(typeColor, 0.08)}, var(--void) 70%)`
            : 'var(--void)',
        }}
      >
        <div className="flex flex-col h-full">
          {isLoading && (
            <div className="p-6">
              <div className="animate-pulse h-6 rounded w-40 mb-3" style={{ backgroundColor: 'var(--bg-elevated)' }} />
              <div className="animate-pulse h-3 rounded w-24" style={{ backgroundColor: 'var(--bg-elevated)' }} />
            </div>
          )}

          {data && (
            <>
              {/* Header */}
              <div className="p-6">
                <h2
                  className="text-xl font-light truncate"
                  style={{ color: typeColor }}
                >
                  {data.entity.name}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--text-muted)' }}>
                    {data.entity.type}
                  </span>
                  <span className="text-[11px] font-light" style={{ color: 'var(--text-muted)' }}>
                    {format(new Date(data.entity.created_at), 'MMM d, yyyy')}
                  </span>
                </div>

                {/* Confidence arc */}
                <div className="flex items-center gap-2 mt-3">
                  <svg width="24" height="24" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="var(--border-subtle)" strokeWidth="2" />
                    <circle
                      cx="12" cy="12" r="10" fill="none"
                      stroke={typeColor}
                      strokeWidth="2"
                      strokeDasharray={`${data.entity.confidence * 62.8} 62.8`}
                      strokeLinecap="round"
                      transform="rotate(-90 12 12)"
                      style={{ filter: `drop-shadow(0 0 3px ${typeColor})` }}
                    />
                  </svg>
                  <span className="text-xs font-light" style={{ color: 'var(--text-secondary)' }}>
                    {Math.round(data.entity.confidence * 100)}%
                  </span>
                </div>

                {onExploreNeighborhood && (
                  <button
                    onClick={() => onExploreNeighborhood(nodeId)}
                    className="flex items-center gap-1.5 text-xs font-light mt-3 transition-colors duration-300"
                    style={{ color: 'var(--glow-teal)' }}
                  >
                    <Focus size={13} />
                    explore neighborhood
                  </button>
                )}
              </div>

              {/* Summary */}
              {(data.entity as any).summary && (
                <div className="px-6 pb-3">
                  <p className="text-sm font-light italic" style={{ color: 'var(--text-secondary)' }}>
                    {(data.entity as any).summary}
                  </p>
                </div>
              )}

              {/* Observations */}
              <div className="px-6 pt-4 pb-2">
                <p className="text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--text-muted)' }}>
                  observations
                </p>
              </div>
              <ScrollArea className="flex-1 px-6">
                {data.observations.length === 0 ? (
                  <p className="text-sm font-light pb-4" style={{ color: 'var(--text-muted)' }}>
                    no observations recorded
                  </p>
                ) : (
                  <div className="space-y-3 pb-4">
                    {data.observations.map((obs) => (
                      <div key={obs.id} className="flex gap-2">
                        <span
                          className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: typeColor,
                            boxShadow: `0 0 4px ${typeColor}40`,
                          }}
                        />
                        <div>
                          <p className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>
                            {obs.content}
                          </p>
                          <p className="text-[10px] font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {Math.round(obs.confidence * 100)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Connected */}
              <div className="px-6 pt-4 pb-2">
                <p className="text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--text-muted)' }}>
                  connected
                </p>
              </div>
              <div className="px-6 pb-6 overflow-y-auto max-h-48">
                {data.connected.length === 0 ? (
                  <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>no connections</p>
                ) : (
                  <div className="space-y-2">
                    {data.connected.map((conn) => (
                      <div key={conn.id} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: getTypeColor(conn.type),
                            boxShadow: `0 0 4px ${getTypeColor(conn.type)}40`,
                          }}
                        />
                        <span className="text-sm font-light" style={{ color: 'var(--text-primary)' }}>
                          {conn.name}
                        </span>
                        <span className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>
                          {conn.relation_type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/entity-panel.tsx
git commit -m "style: redesign entity panel as concentrated glow region

Radial gradient tinted to entity type color instead of solid background.
SVG confidence arc replaces linear bar. Font-light throughout, lowercase
section labels, no separators or badges. 500ms ease-in-out transition."
```

---

## Task 13: Approvals Page — Amber Glow Zones

**Files:**
- Modify: `packages/dashboard/src/routes/approvals.tsx`
- Modify: `packages/dashboard/src/components/approval-card.tsx`
- Modify: `packages/dashboard/src/components/merge-card.tsx`

- [ ] **Step 1: Restyle approvals page with organic empty state**

Replace `packages/dashboard/src/routes/approvals.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useApprovals, useResolveApproval } from '../hooks/use-approvals.js'
import { ApprovalCard } from '../components/approval-card.js'
import { MergeCard } from '../components/merge-card.js'

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPage,
})

function ApprovalsPage() {
  const { data, isLoading, error } = useApprovals()
  const resolve = useResolveApproval()

  const handleResolve = (
    id: string,
    status: 'approved' | 'rejected',
    edited_content?: string,
  ) => {
    resolve.mutate({ id, status, edited_content })
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>
          cannot reach api server
        </p>
      </div>
    )
  }

  const items = data?.items ?? []

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>
          nothing pending
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <p
        className="text-[9px] font-normal uppercase tracking-[3px]"
        style={{ color: 'var(--text-muted)' }}
      >
        approval queue
      </p>
      <div className="space-y-6">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-2xl animate-pulse"
              style={{ backgroundColor: 'var(--bg-elevated)', opacity: 0.3 }}
            />
          ))}
        {items.map((item) => {
          const isMerge =
            item.metadata?.merge_candidate_ids &&
            item.metadata.merge_candidate_ids.length > 0
          return isMerge ? (
            <MergeCard key={item.id} item={item} onResolve={handleResolve} />
          ) : (
            <ApprovalCard key={item.id} item={item} onResolve={handleResolve} />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Redesign ApprovalCard as amber glow zone with arc confidence**

Replace `packages/dashboard/src/components/approval-card.tsx`:

```tsx
import { useState } from 'react'
import { Check, X, Pencil } from 'lucide-react'
import { Textarea } from './ui/textarea.js'
import { cn } from '../lib/utils.js'
import type { ApprovalItem } from '../lib/api.js'
import { GlowZone } from './glow-zone.js'

interface ApprovalCardProps {
  item: ApprovalItem
  onResolve: (id: string, status: 'approved' | 'rejected', edited_content?: string) => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

export function ApprovalCard({ item, onResolve, selectable, selected, onToggleSelect }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [exiting, setExiting] = useState(false)
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null)

  if (!item.metadata) return null

  const { fact } = item.metadata
  const confidence = Math.round(fact.confidence * 100)
  const glowColor = resolved === 'approved' ? 'teal' : resolved === 'rejected' ? 'rose' : 'amber'

  function handleAction(status: 'approved' | 'rejected', edited_content?: string) {
    setResolved(status)
    setTimeout(() => {
      setExiting(true)
      setTimeout(() => onResolve(item.id, status, edited_content), 500)
    }, 800)
  }

  return (
    <GlowZone
      color={glowColor}
      intensity={0.06}
      className={cn(
        'p-5 transition-all duration-500',
        exiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              style={{ accentColor: 'var(--glow-teal)' }}
            />
          )}
          {/* Confidence arc */}
          <svg width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="17" fill="none" stroke="var(--border-subtle)" strokeWidth="2" />
            <circle
              cx="20" cy="20" r="17" fill="none"
              stroke="var(--glow-teal)"
              strokeWidth="2"
              strokeDasharray={`${(confidence / 100) * 106.8} 106.8`}
              strokeLinecap="round"
              transform="rotate(-90 20 20)"
              style={{ filter: 'drop-shadow(0 0 3px var(--glow-teal))' }}
            />
            <text x="20" y="22" textAnchor="middle" dominantBaseline="middle"
              fill="var(--text-secondary)" fontSize="10" fontWeight="300">
              {confidence}
            </text>
          </svg>
          <div>
            <p className="text-base font-light" style={{ color: 'var(--text-primary)' }}>
              {fact.entity_name}
            </p>
            {item.reason && (
              <span className="text-[10px] font-light" style={{ color: 'var(--text-muted)' }}>
                {item.reason.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <Textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
          className="mb-3 min-h-[80px] font-light"
          style={{ backgroundColor: 'transparent', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          autoFocus
        />
      ) : (
        <p className="text-sm font-light mb-2" style={{ color: 'var(--text-primary)' }}>
          {fact.observation}
        </p>
      )}

      {!editing && fact.evidence_quote && (
        <div className="mb-3">
          <button
            className="text-[10px] font-light transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'hide evidence' : 'show evidence'}
          </button>
          {expanded && (
            <p
              className="text-sm font-light italic pl-3 mt-2"
              style={{
                color: 'var(--text-secondary)',
                borderLeft: '1px solid var(--glow-violet)',
              }}
            >
              {fact.evidence_quote}
            </p>
          )}
        </div>
      )}

      {/* Action buttons — circular glow */}
      <div className="flex gap-3 mt-4">
        {editing ? (
          <>
            <CircleButton color="teal" icon={<Check size={14} />} onClick={() => { handleAction('approved', editText); setEditing(false) }} />
            <CircleButton color="rose" icon={<X size={14} />} onClick={() => setEditing(false)} />
          </>
        ) : (
          <>
            <CircleButton color="teal" icon={<Check size={14} />} onClick={() => handleAction('approved')} />
            <CircleButton color="rose" icon={<X size={14} />} onClick={() => handleAction('rejected')} />
            <CircleButton color="violet" icon={<Pencil size={13} />} onClick={() => { setEditing(true); setEditText(fact.observation) }} />
          </>
        )}
      </div>
    </GlowZone>
  )
}

function CircleButton({ color, icon, onClick }: { color: string; icon: React.ReactNode; onClick: () => void }) {
  const colorMap: Record<string, string> = {
    teal: 'var(--glow-teal)',
    rose: 'var(--glow-rose)',
    violet: 'var(--glow-violet)',
  }
  const c = colorMap[color] ?? colorMap.teal

  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300"
      style={{
        color: c,
        boxShadow: `0 0 8px ${c}30`,
        background: `radial-gradient(circle, ${c}15, transparent 70%)`,
        animation: 'gentle-pulse 3s ease-in-out infinite',
      }}
    >
      {icon}
    </button>
  )
}
```

- [ ] **Step 3: Redesign MergeCard with node-pair visualization**

Replace `packages/dashboard/src/components/merge-card.tsx`:

```tsx
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { cn } from '../lib/utils.js'
import type { ApprovalItem } from '../lib/api.js'
import { GlowZone } from './glow-zone.js'

interface MergeCardProps {
  item: ApprovalItem
  onResolve: (id: string, status: 'approved' | 'rejected') => void
}

export function MergeCard({ item, onResolve }: MergeCardProps) {
  const [exiting, setExiting] = useState(false)

  if (!item.metadata) return null

  const { fact } = item.metadata
  const candidateIds = item.metadata.merge_candidate_ids ?? []

  function handleAction(status: 'approved' | 'rejected') {
    setExiting(true)
    setTimeout(() => onResolve(item.id, status), 500)
  }

  return (
    <GlowZone
      color="violet"
      intensity={0.05}
      className={cn(
        'p-5 transition-all duration-500',
        exiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
      )}
    >
      {/* Node pair visualization */}
      <div className="flex items-center justify-center gap-6 mb-4">
        <div className="text-center">
          <div
            className="w-4 h-4 rounded-full mx-auto mb-1"
            style={{
              backgroundColor: 'var(--glow-violet)',
              boxShadow: '0 0 10px rgba(167,139,250,0.3)',
            }}
          />
          <p className="text-xs font-light" style={{ color: 'var(--text-primary)' }}>
            {fact.entity_name}
          </p>
        </div>

        {/* Curved dashed connector */}
        <svg width="60" height="20" viewBox="0 0 60 20" style={{ opacity: 0.4 }}>
          <path
            d="M0,10 Q30,0 60,10"
            stroke="var(--glow-violet)"
            fill="none"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        </svg>

        <div className="text-center">
          {candidateIds.map((id) => (
            <div key={id}>
              <div
                className="w-4 h-4 rounded-full mx-auto mb-1"
                style={{
                  backgroundColor: 'var(--glow-indigo)',
                  boxShadow: '0 0 10px rgba(129,140,248,0.3)',
                }}
              />
              <p className="text-[10px] font-light truncate max-w-[100px]" style={{ color: 'var(--text-secondary)' }}>
                {id.slice(0, 12)}...
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm font-light mb-1" style={{ color: 'var(--text-primary)' }}>
        {fact.observation}
      </p>
      <p className="text-[10px] font-light mb-4" style={{ color: 'var(--text-muted)' }}>
        {fact.entity_type}
      </p>

      <div className="flex gap-3">
        <button
          onClick={() => handleAction('approved')}
          className="flex items-center gap-1.5 text-xs font-light px-3 py-1.5 rounded-full transition-all duration-300"
          style={{
            color: 'var(--glow-violet)',
            background: 'radial-gradient(circle, rgba(167,139,250,0.1), transparent 70%)',
            boxShadow: '0 0 8px rgba(167,139,250,0.15)',
          }}
        >
          <Check size={13} /> merge
        </button>
        <button
          onClick={() => handleAction('rejected')}
          className="flex items-center gap-1.5 text-xs font-light px-3 py-1.5 rounded-full transition-all duration-300"
          style={{
            color: 'var(--text-muted)',
          }}
        >
          <X size={13} /> keep separate
        </button>
      </div>
    </GlowZone>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/routes/approvals.tsx packages/dashboard/src/components/approval-card.tsx packages/dashboard/src/components/merge-card.tsx
git commit -m "style: redesign approvals page with amber glow zones and arc confidence

Approval cards: amber glow zone, SVG confidence arc, circular action buttons
with gentle pulse. State transitions: amber→teal on approve, amber→rose on
reject, then fade-scale-out. Merge cards: node-pair visualization with curved
dashed connector. Empty state: centered 'nothing pending' in void."
```

---

## Task 14: Quick Approve, Timeline Slider, Graph Analytics — Glow Zone Treatment

**Files:**
- Modify: `packages/dashboard/src/components/quick-approve.tsx`
- Modify: `packages/dashboard/src/components/timeline-slider.tsx`
- Modify: `packages/dashboard/src/components/graph-analytics.tsx`

These components keep their existing logic but get restyled to match the Living Network brand.

- [ ] **Step 1: Restyle QuickApprove**

Replace the entire file content of `packages/dashboard/src/components/quick-approve.tsx`:

```tsx
import { Check, X } from 'lucide-react'
import { useApprovals, useResolveApproval } from '../hooks/use-approvals'
import { GlowZone } from './glow-zone'

export function QuickApprove() {
  const { data, isLoading } = useApprovals()
  const { mutate: resolve } = useResolveApproval()

  if (isLoading) return null

  const items = data?.items.slice(0, 5) ?? []

  if (items.length === 0) {
    return (
      <p className="text-sm font-light" style={{ color: 'var(--text-muted)' }}>
        all caught up
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const entityName = item.metadata?.fact.entity_name ?? item.item_id
        const observation = item.metadata?.fact.observation ?? ''
        return (
          <GlowZone key={item.id} color="amber" intensity={0.04} className="flex items-center gap-3 py-3 px-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-light truncate" style={{ color: 'var(--text-primary)' }}>
                {entityName}
              </p>
              <p className="text-xs font-light truncate" style={{ color: 'var(--text-muted)' }}>
                {observation}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300"
                style={{
                  color: 'var(--glow-teal)',
                  background: 'radial-gradient(circle, rgba(6,255,200,0.1), transparent 70%)',
                }}
                aria-label={`Approve observation for ${entityName}`}
                onClick={() => resolve({ id: item.id, status: 'approved' })}
              >
                <Check size={14} />
              </button>
              <button
                className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300"
                style={{
                  color: 'var(--glow-rose)',
                  background: 'radial-gradient(circle, rgba(244,114,182,0.08), transparent 70%)',
                }}
                aria-label={`Reject observation for ${entityName}`}
                onClick={() => resolve({ id: item.id, status: 'rejected' })}
              >
                <X size={14} />
              </button>
            </div>
          </GlowZone>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Restyle TimelineSlider — thin line with glowing dot playhead**

In `packages/dashboard/src/components/timeline-slider.tsx`, replace the container styling. Change the outer `<div>` (line 202-209) from:

```tsx
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2.5 rounded-lg max-w-xl w-full"
      style={{
        backgroundColor: 'rgba(5, 5, 16, 0.9)',
        border: '1px solid var(--border-subtle)',
        backdropFilter: 'blur(8px)',
      }}
```

To:

```tsx
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 max-w-xl w-full"
      style={{ opacity: 0.7 }}
```

Change all button styles from `style={{ color: 'var(--text-muted)' }}` to include glow:

```tsx
      style={{ color: 'var(--text-muted)', transition: 'color 300ms' }}
```

Change the play button to use a glow effect:

```tsx
      style={{
        color: 'var(--glow-teal)',
        filter: 'drop-shadow(0 0 4px rgba(6,255,200,0.3))',
      }}
```

Change the speed `<select>` background from `var(--bg-elevated)` to `transparent`.

Change the `font-mono` classes to `font-light` throughout.

- [ ] **Step 3: Restyle GraphAnalytics with glow zone treatment**

In `packages/dashboard/src/components/graph-analytics.tsx`, the component is large (479 lines) — make targeted styling changes:

1. Replace any `backgroundColor: 'var(--bg-surface)'` with `background: 'radial-gradient(ellipse at center, rgba(6,255,200,0.03), transparent 70%)'`
2. Replace `border: '1px solid var(--border-subtle)'` with empty string (remove borders)
3. Change `font-semibold` to `font-light` on headings
4. Change section headers to `text-[9px] uppercase tracking-[2px]` style with `color: 'var(--text-muted)'`
5. Remove `rounded-lg` and add `rounded-2xl` where containers remain

- [ ] **Step 4: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/quick-approve.tsx packages/dashboard/src/components/timeline-slider.tsx packages/dashboard/src/components/graph-analytics.tsx
git commit -m "style: restyle quick-approve, timeline slider, and analytics panel

Quick approve: amber glow zones with circular approve/reject buttons.
Timeline: borderless, 70% opacity, glowing playhead. Analytics: glow
zone treatment, font-light headings, no borders."
```

---

## Task 15: Graph Route — Full Viewport

**Files:**
- Modify: `packages/dashboard/src/routes/graph.tsx`

- [ ] **Step 1: Ensure graph page uses full viewport**

The root layout already sets `padding: 0` for the graph page. Verify the graph route's container fills the viewport. The main change: remove any wrapper padding or margins, ensure `h-full` on the graph container.

Read the current graph.tsx to find any padding/margin that needs removal, and verify the GraphView gets full height. The route should already mostly work since we removed padding in the root layout. If there are internal wrappers with padding, strip them.

No additional file changes should be needed beyond what was done in Task 4 (root layout) — but verify by reading the file and confirming the graph fills the viewport.

- [ ] **Step 2: Verify build**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit (if changes were needed)**

```bash
git add packages/dashboard/src/routes/graph.tsx
git commit -m "style: ensure graph route fills full viewport without chrome padding"
```

---

## Task 16: Final Cleanup — Remove Unused Imports & StatCard

**Files:**
- Modify: `packages/dashboard/src/components/stat-card.tsx` (can be deleted if no other consumers)
- Check: any remaining imports of Card component in modified files

- [ ] **Step 1: Check if StatCard is still used anywhere**

Run: `grep -r "StatCard\|stat-card" packages/dashboard/src/ --include="*.tsx" --include="*.ts"`

If only `stat-card.tsx` itself and the now-unused import in `health-metrics.tsx` remain, the component is dead code.

- [ ] **Step 2: Remove StatCard if unused**

Delete `packages/dashboard/src/components/stat-card.tsx` if no consumers remain.

- [ ] **Step 3: Check for stale Card imports**

Run: `grep -r "from.*ui/card" packages/dashboard/src/ --include="*.tsx"`

Remove any Card imports from files that no longer use Card.

- [ ] **Step 4: Full build verification**

Run: `cd packages/dashboard && npx vite build 2>&1 | tail -10`
Expected: Clean build, no warnings about unused imports

- [ ] **Step 5: Commit**

```bash
git add -A packages/dashboard/src/
git commit -m "chore: remove unused StatCard and stale Card imports

StatCard replaced by LuminousStat across all views. Clean up dead imports
from the pre-rebrand component system."
```

---

## Task 17: Visual Smoke Test

- [ ] **Step 1: Start the dev server and verify each page**

Run: `cd packages/dashboard && npx vite dev`

Manually check:
- **Dashboard (/)**: Luminous stats floating in void, ambient mycelium visible behind, growth chart in glow zone, activity feed as dot stream fading to dark, health metrics as dim embers
- **Graph (/graph)**: Full viewport, ambient fades out, nodes breathing with desynchronized pulses, edges as organic curves, nutrient particles flowing along edges, spore particles drifting, toolbar auto-hides, legend as minimal dots
- **Approvals (/approvals)**: Amber glow zones, arc confidence indicators, circular approve/reject buttons with pulse, clean empty state
- **Navigation**: Slim icon rail on desktop, transparent bottom bar on mobile
- **Reduced motion**: Check `prefers-reduced-motion` disables animations

- [ ] **Step 2: Fix any build or visual issues found**

Address any issues discovered during the smoke test.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A packages/dashboard/src/
git commit -m "fix: visual smoke test fixes for Living Network rebrand"
```
