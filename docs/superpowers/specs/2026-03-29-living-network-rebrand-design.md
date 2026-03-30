# Myco — "The Living Network" Full Rebrand

**Date:** 2026-03-29
**Status:** Design approved, pending implementation
**Scope:** Full rebrand — graph visualization, dashboard, approvals, navigation, brand system

## Brand Identity

**Name:** Myco
**Tagline:** "the network grows"
**Personality:** The Living Network — warm, alive, breathing. The app is a living organism you're observing and tending, not a tool that displays data.
**Mood:** Bioluminescent forest floor at midnight. Dark, damp, alive. Tending a garden in the dark.

### Brand Rules

**The brand says YES to:**
- Organic curves, soft glows, breathing animations
- Generous void — most of the screen is darkness
- Content defined by light, not lines
- Slow, continuous motion that rewards patience
- The graph as the hero — everything else supports it

**The brand says NO to:**
- Sharp corners, grid layouts, mechanical transitions
- Visible borders, boxed containers, card-based layouts
- Straight-line motion, snap transitions, elastic/bounce easing
- Decorative clutter, busy layouts, saturated colors competing for attention
- Generic "AI tool" aesthetic — this is a deliberate brand, not a theme

## Color System

All colors are used as glows (box-shadow, radial-gradient, text-shadow) rather than solid fills. The void is the canvas; color is light cast upon it.

| Token | Value | Usage |
|-------|-------|-------|
| `--void` | `#050510` | Page background. The infinite dark. Most of the screen is this. |
| `--glow-teal` | `#06ffc8` | Primary life color. Entities, active states, primary data, approved. |
| `--glow-violet` | `#a78bfa` | Secondary. Relationships, clusters, secondary data. |
| `--glow-emerald` | `#34d399` | Growth, new entities, success states. |
| `--glow-amber` | `#fbbf24` | Attention, pending approvals, warmth. Used sparingly. |
| `--glow-rose` | `#f472b6` | Conflict, rejection, errors. Rare. |
| `--glow-blue` | `#60a5fa` | Info, technology type. |
| `--glow-indigo` | `#818cf8` | Default/other entity type. |
| `--text-primary` | `#e8e8f0` | Primary text. Weight 300-400. |
| `--text-secondary` | `#8888aa` | Secondary text, descriptions. |
| `--text-muted` | `#555577` | Tertiary text, timestamps, annotations. |

### Glow Zone Pattern

Instead of bordered containers, content sections are defined by radial gradients:

```css
/* A glow zone for teal-accented content */
.glow-zone-teal {
  background: radial-gradient(ellipse at center, rgba(6, 255, 200, 0.05), transparent 70%);
  /* No border, no border-radius, no box-shadow on the container */
}

/* Hover intensifies the glow */
.glow-zone-teal:hover {
  background: radial-gradient(ellipse at center, rgba(6, 255, 200, 0.09), transparent 70%);
}
```

## Typography

- **Font family:** System sans-serif stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **No custom web fonts.** The type should be invisible — the graph is the visual voice.

| Element | Size | Weight | Letter-spacing | Notes |
|---------|------|--------|----------------|-------|
| Page headings | 24-28px | 300 | -0.5px | Lowercase preferred |
| Section labels | 9-10px | 400 | 3-4px | Uppercase, `--text-muted` |
| Stat numbers | 36-48px | 200 | 0 | Oversized, text-shadow glow in accent color |
| Body text | 13-14px | 300-400 | 0 | `--text-secondary` for descriptions |
| Node labels (graph) | 7-9px | 300 | 0.3px | 20-25% opacity, fade in on hover/zoom |
| Timestamps | 11px | 300 | 0 | `--text-muted` |

## Animation Language

All motion follows organic principles. Nothing mechanical, nothing instant.

### Timing

| Type | Duration | Easing | Notes |
|------|----------|--------|-------|
| Hover state changes | 300ms | ease-in-out | Glow intensification, text brightness |
| Panel open/close | 500-600ms | ease-in-out | Fade + subtle scale from 0.95 |
| Page transitions | 400ms | ease-in-out | Crossfade, no slides |
| Node pulse | 3-7s per cycle | sine (ease-in-out) | Each node gets a randomized period |
| Particle drift | 8-20s per cycle | bezier path | Never straight lines |
| Nutrient flow (edge particles) | 4-8s per edge | linear along path | One particle per edge |
| Entry animation (new elements) | 600-800ms | ease-out | Fade in + scale from 0.8 → 1.0 |

### Principles

- **Desynchronized pulses:** Every animated node gets a random offset and period. The network should feel like many individual organisms, not a synchronized light show.
- **No teleportation:** Elements never appear instantly. They always fade/grow in from the dark.
- **Continuous motion:** Spores and particles are always drifting. The app is never fully still. But the motion is slow enough to be ambient, not distracting.
- **Deceleration, not bounce:** Elements settling into position use ease-out, never elastic or spring physics.

## The Three Layers

The entire app is built on three layers of increasing aliveness.

### Layer 1: Ambient Background

Present on every page. Creates the feeling that you're always inside the organism.

- **Implementation:** A fixed-position SVG or canvas element behind all content.
- **Content:** 3-5 thin organic paths (bezier curves, stroke-width 0.5-1px) at 5-8% opacity in teal/violet. These are decorative — they don't represent real data.
- **Spores:** 3-5 tiny particles (1-2px) drifting on 15-25s cycles. Barely perceptible.
- **Ground glow:** Faint radial gradient at bottom-center of the viewport (teal at 2-3% opacity).
- **Performance:** Static SVG paths (not force-simulated). Spore animation via CSS transforms. No per-frame JS computation.
- **Behavior on graph page:** Fades out as the real graph takes over.

### Layer 2: Floating UI

Dashboard content, approval cards, and all non-graph UI floats over Layer 1 as borderless glow zones.

- Each content section is a glow zone (radial gradient, accent color at 4-6% center fading to transparent).
- Sections grouped by proximity. Generous whitespace — the void breathes between them.
- Hover intensifies the glow (4% → 8%), brightens text. No border appears.
- Content hierarchy through glow intensity and text size, not containment.

### Layer 3: The Living Graph

Full aliveness on the graph view. This is the heart of the app.

- Full viewport with minimal chrome.
- Breathing nodes, nutrient particles, drifting spores, organic edge curves.
- Detailed specification in the Graph View section below.

## View Specifications

### Navigation

**Desktop — Slim Icon Rail (60px)**
- Collapsed by default, no text labels visible.
- Nav items are small circular icons (20-24px) with a faint glow halo in active state (accent color at 15% opacity, 12px blur radius).
- Hover: label fades in to the right of the icon (200ms). No background, no tooltip container.
- The rail has no background — icons float in the void.
- Active indicator: the icon's glow halo, not a highlight bar or background fill.

**Mobile — Bottom Tab Bar**
- Loses its solid background. Icons sit on the void.
- Active tab: faint teal underline glow (box-shadow inset, not a border).
- Approval badge: small amber dot that pulses gently (3s cycle).

### Home Dashboard

The dashboard is glow zones floating over the ambient background.

**Hero Stats (top region)**
- Three key numbers: entities, relationships, pending.
- Each rendered as oversized text (weight 200, 36-48px) with text-shadow glow matching accent color.
- Tiny uppercase label beneath each (9px, letter-spacing 3px, `--text-muted`).
- No cards. No boxes. Just luminous numbers in the dark.
- Spacing: generous (60-80px between stat clusters).

**Knowledge Growth Chart**
- Organic visualization: softly glowing dots along a timeline connected by curved (bezier) lines.
- Fill beneath the curve is a gradient fading to transparent (accent color at 8% → 0%).
- Floats in its own glow zone. No axis lines — just faint muted tick labels.

**Activity Feed**
- Vertical stream of small glowing dots (colored by entity type, 6-8px) with faint text beside each.
- No list containers, no alternating row backgrounds, no dividers.
- Each entry fades in from transparent (newest at top).
- Timestamps in `--text-muted`.
- The feed trails off into darkness at the bottom — no hard cutoff, last items fade to transparent via a CSS mask gradient.

**Health Metrics**
- Small secondary stat clusters floating near bottom-right.
- Dim, ember-like. Present but not competing with hero stats.
- Same pattern: number + tiny label, glow zone, no container.

### Graph View

Full viewport. The showcase.

**Chrome**
- Toolbar: floating row of small circular icon buttons (24-28px) near top edge. No background bar. Appears on mouse movement near top, fades out after 3s of inactivity. ~50% opacity idle, 100% on hover.
- Legend: small floating cluster in bottom-left. Entity type colors as tiny glowing dots (6px) with 9px labels. ~60% opacity. No background.
- Both toolbar and legend have no container — they float directly on the graph canvas.

**Nodes**
- Rendered as soft circles with an outer glow halo.
- Core: solid circle (fill at 60-80% opacity of type color). Size maps to observation count (min 4px, max 16px radius).
- Halo: radial gradient from type color at 8-12% to transparent. Extends 2-3x the core radius.
- Pulse: each node's halo oscillates between 8% and 15% opacity on a 3-7s cycle (randomized per node).
- Hover: glow intensifies to 20%, label fades in above the node (200ms, weight 300, 20-25% opacity text).
- Selected: glow intensifies to 25%, label fully visible, entity panel opens.
- Color: mapped to entity type using the glow color tokens.

**Edges**
- Cubic bezier curves between connected nodes. Never straight lines.
- Control points offset perpendicular to the direct line by 15-30% of the edge length (randomized direction).
- Stroke: 0.5-1px, colored by the source node's type color at 20-40% opacity. Opacity maps to confidence score.
- Explicit relationships: solid stroke.
- Auto-discovered relationships: dashed stroke (dash: 3px, gap: 4px).
- Nutrient particles: one 1-2px circle per edge, traveling along the bezier path over 4-8s (randomized). Color matches the edge. Opacity 40-60%.

**Spores**
- 5-10 free-floating particles drifting through the graph space.
- Size: 1.5-3px. Color: random from the glow palette. Opacity: 20-50%.
- Movement: bezier drift paths on 8-20s cycles.
- Purely atmospheric — no data representation.

**Clusters (Community Detection)**
- Louvain community hulls rendered as filled regions at 2-3% opacity of the dominant node color in that cluster.
- Soft edges — the hull shape is smoothed/rounded, not angular convex hull.
- No outline stroke. Just a faint pool of colored light on the forest floor.

**Entry Animation**
- On page load, nodes fade in from center outward over 1.5s.
- Edges draw in (stroke-dashoffset animation) after their source/target nodes appear.
- Spores begin drifting after the network settles (~2s).
- The whole sequence feels like the network growing from a seed.

**Interaction Modes**
- **Path mode:** Selected source/target nodes pulse brighter (25% glow). Discovered path edges light up to 60% opacity with faster particle flow (2s per edge). Unrelated nodes dim to 10-15% opacity.
- **Neighborhood mode:** Double-clicked node becomes the bright center. 1-2 hop neighbors maintain normal brightness. Everything else dims to 10%.
- **Timeline scrubber:** Thin horizontal line at viewport bottom. Playhead is a small glowing teal dot (8px). Scrubbing causes nodes to fade in/out based on creation time — watching the network grow from nothing.
- **Search:** Results glow brighter, non-matches dim. Camera auto-pans to the first result.

**Entity Panel (Right Side)**
- Not a traditional drawer/card. A region of concentrated glow sliding in from the right.
- Background: radial gradient tinted to the entity's type color (6-10% opacity center).
- Width: ~320px on desktop, full-width sheet on mobile.
- Entity name: 20px heading, weight 300.
- Observations: quiet list, no bullets. Each observation as a line of `--text-secondary` text with a tiny type-colored dot prefix.
- Relationships: rendered as miniature node-and-edge diagrams (the entity as a center node with connected entities as smaller satellites, curved edges). Clickable to navigate.
- Close: click the void outside the panel, or press Escape. Panel fades out (400ms).

### Approvals Page

Approval items as glow zones over the ambient background.

**Pending Approvals**
- Amber-tinted radial gradient glow zones.
- Each shows: proposed knowledge text, confidence as a thin arc (partial circle, 40px diameter, stroke-width 2px, teal color proportional to confidence).
- Approve button: small circle (32px), teal glow, checkmark icon. Reject: same, rose glow, X icon.
- Buttons pulse very faintly in their color (3s cycle) to suggest they're alive and waiting.

**Merge Candidates**
- Two small node circles (12-16px, colored by entity type) with a faint dashed curved line between them.
- Below: the proposed merged entity as a slightly brighter node.
- Accept/reject pattern matches approvals.

**State Transitions**
- Approved: amber glow transitions to teal (800ms ease-in-out), then the item slowly fades to 30% opacity and drifts down in the list.
- Rejected: amber transitions to dim rose (600ms), then fades out entirely over 1.5s.
- Empty state: just the ambient background with centered text — "nothing pending" in `--text-muted`. No illustration, no icon. Silence communicates.

## Performance Considerations

- **Ambient background:** Static SVG + CSS-animated spores. No JS computation per frame.
- **Graph nodes/edges:** Rendered on canvas via react-force-graph-2d custom painters. The breathing pulse and particle flow use requestAnimationFrame but are lightweight (updating opacity/position on ~20 elements).
- **Glow zones:** Pure CSS radial gradients. No runtime cost beyond paint.
- **Particle budget:** Cap at 10 spores + 1 particle per visible edge. For graphs with >100 visible edges, only animate particles on the 30 highest-confidence edges.
- **Reduce motion:** Respect `prefers-reduced-motion`. When active: disable all pulse/drift/particle animations, keep static glows and the graph layout.

## What Changes vs. Current

| Area | Current | New |
|------|---------|-----|
| Containers | Bordered cards (`rounded-xl`, `border-subtle`) | Borderless radial gradient glow zones |
| Navigation | 240px sidebar with text labels, solid background | 60px icon rail, no background, glow active states |
| Dashboard stats | Card-based stat-cards with headers | Oversized luminous numbers floating in void |
| Activity feed | List with containers | Dot-stream fading into darkness |
| Graph nodes | Uniform circles, type-colored | Breathing circles with glow halos, desynchronized pulses |
| Graph edges | Straight lines, solid/dashed | Organic bezier curves with flowing nutrient particles |
| Graph chrome | Persistent toolbar bar | Auto-hiding floating icon circles |
| Entity panel | Card-style drawer | Concentrated glow region, mini node-graph for relationships |
| Approval cards | Bordered cards | Amber glow zones with arc confidence indicators |
| Backgrounds | Flat `--bg-void` | Ambient mycelium SVG + drifting spores everywhere |
| Transitions | Standard CSS transitions | Organic: fade-grow-settle, no snapping |
| Empty states | Standard placeholder text | Silence — minimal text, ambient background continues |

## Files to Modify

Based on the current codebase structure:

- `src/app.css` — Complete rewrite of CSS variables and global styles
- `src/components/sidebar.tsx` — Slim icon rail redesign
- `src/components/graph-view.tsx` — Custom node/edge painters, particle system, entry animation
- `src/components/graph-toolbar.tsx` — Floating auto-hide circular buttons
- `src/components/graph-legend.tsx` — Minimal floating dot-label clusters
- `src/components/graph-analytics.tsx` — Glow zone treatment
- `src/components/entity-panel.tsx` — Glow region with mini node-graph
- `src/components/stat-card.tsx` — Replace with luminous number component
- `src/components/knowledge-growth-chart.tsx` — Organic dot-curve chart
- `src/components/activity-feed.tsx` — Dot-stream with fade-to-dark
- `src/components/health-metrics.tsx` — Dim ember-like stat clusters
- `src/components/approval-card.tsx` — Amber glow zone with arc confidence
- `src/components/merge-card.tsx` — Node-pair with dashed curve
- `src/components/quick-approve.tsx` — Circular glow buttons
- `src/components/timeline-slider.tsx` — Thin line with glowing dot playhead
- `src/routes/index.tsx` — Dashboard layout restructure
- `src/routes/graph.tsx` — Full-viewport graph, chrome behavior
- `src/routes/approvals.tsx` — Glow zone layout
- **New:** `src/components/ambient-background.tsx` — SVG mycelium + spore system
- **New:** `src/components/glow-zone.tsx` — Reusable borderless container primitive
