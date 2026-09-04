# Claude Design Prompt — CommuteNity UI Baseline

> **Historical (executed).** Jeepney Gold tokens and heading font shipped. Bottom-nav / PWA shell is **parked**; `--nav-height` exists. Do not treat this prompt as current scope. Product: web feed, not native.

**Project:** CommuteNity — community-driven transit navigation app for Metro Manila (Philippines). Built with Next.js 15 App Router, Tailwind CSS v4, shadcn/ui (radix-nova, neutral base). Font: Geist (sans). Backend: Supabase + PostGIS.

**Your task:** Design the baseline UI system — color tokens, typography scale, layout shell, and component primitives. Output as concrete CSS variable overrides for `globals.css` (`:root` and `.dark` blocks) plus any new Tailwind utility patterns needed. Do not redesign components — only establish the token layer and layout shell that components inherit.

---

## Theme direction

**Name:** Jeepney Gold — warm, high-energy, distinctly Filipino.

**Primary accent:** Warm amber-orange (`oklch ~0.72 0.17 55`). Evokes the iconic jeepney livery, Philippine flag gold, and street-level energy. Must read clearly over map tiles (OSM raster — light beige/tan background) and not clash with the green/red vote indicators already in use.

**Base:** Keep neutral grays as the structural layer. The accent is the only chroma — everything else stays achromatic. This makes maps and geographic UI legible.

**Dark mode:** Already defined as pure dark neutral. Adjust so the amber primary still pops at the same oklch lightness in dark mode — don't just invert.

**Token requirements to define or override:**
- `--primary` / `--primary-foreground` — replace neutral black with amber-orange CTA
- `--accent` / `--accent-foreground` — secondary interactive surfaces (hover states, selected tabs)
- `--ring` — focus ring should use primary amber, not neutral gray
- Transit mode palette (add as custom CSS vars, not shadcn tokens):
  - `--mode-jeepney`: amber/gold
  - `--mode-bus`: blue
  - `--mode-mrt`: purple
  - `--mode-lrt`: red-orange
  - `--mode-uv`: teal
  - `--mode-p2p`: green
  - `--mode-tricycle`: yellow
  - `--mode-walking`: gray
- Status palette (add as custom CSS vars):
  - `--status-pending`: amber (reuse `--mode-jeepney` range)
  - `--status-approved`: green (oklch ~0.65 0.18 145)
  - `--status-rejected`: red (already `--destructive`)
- `--radius`: bump to `0.75rem` for a slightly more modern feel

---

## Typography

- Keep Geist as `--font-sans`.
- Set `--font-heading` to a distinct Google Font — recommend **Space Grotesk** or **Plus Jakarta Sans** — geometric, contemporary, good for route names and display headings. Bold weights only. Load via `next/font/google`.
- Apply `--font-heading` to `h1–h3` in the `@layer base` block.
- No decorative body text changes — Geist stays for all UI copy.

---

## Layout shell (define structure, don't implement yet)

The app is mobile-first (PWA target). Future screens will include: route search, route browse, stop detail, map views, contribution flow. Design the token layer to support:

1. **Bottom navigation bar** (mobile) — 4 tabs: Home (feed), Search/Routes, Map, Profile. Reserve `--nav-height: 56px` as a CSS var. Body should have `padding-bottom: var(--nav-height)` when nav is present.
2. **Floating map controls** — map screens will have floating bottom sheets and FABs. No action needed now, but don't use `overflow: hidden` on `<body>`.
3. **Content width tokens** — replace hardcoded `w-[40vw]` with:
   - `--content-sm: min(40rem, 100%)` — feed/form content
   - `--content-md: min(56rem, 100%)` — route lists, wider layouts
   - Apply via `max-w-[--content-sm]` pattern in Tailwind.

---

## Forward-compatibility constraints

The following features ship in later sprints — design tokens must not block them:

| Future feature | Token implication |
|---|---|
| Transit mode filter tabs | `--mode-*` vars must be defined now; Badge + Tab components will consume them |
| Route line rendering on map | `--mode-*` colors will be used as MapLibre line-color values — must pass contrast on OSM tiles |
| Pending/approved/rejected badges | `--status-*` vars consumed by a `<StatusBadge>` component |
| Dark mode toggle | All new vars need `.dark` counterparts |
| Offline cached indicator | Needs a `--status-cached` var (distinct from pending/approved) |
| Reputation tiers | May need 3–5 tier colors — leave `--tier-*` namespace empty for now |
| Bottom nav PWA shell | `--nav-height` var must exist before nav is built |

---

## Deliverables

1. Updated `:root` block in `globals.css` — override `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--ring`, `--radius`. Add all `--mode-*`, `--status-*`, `--content-*`, `--nav-height` vars.
2. Updated `.dark` block — counterparts for every new var.
3. Updated `@layer base` — heading font applied to `h1, h2, h3`.
4. `next/font/google` addition in `src/app/layout.tsx` — load heading font, wire `--font-heading` variable.
5. Brief comment block at the top of the new vars section: `/* CommuteNity brand tokens */` so they're easy to find.

Do not touch component files. Do not add new shadcn components. Token layer only.

---

## Codebase context

**Files to edit:**
- `src/app/globals.css` — primary target, all token changes go here
- `src/app/layout.tsx` — add heading font only

**Current token state (globals.css):**
- `:root --primary`: `oklch(0.205 0 0)` — near-black, no chroma
- `:root --ring`: `oklch(0.708 0 0)` — mid-gray
- `:root --radius`: `0.625rem`
- All tokens chroma 0 — no brand color exists yet

**Existing color usage to preserve:**
- `text-green-500` — upvote active state
- `text-red-500` — downvote active state
- `--destructive`: `oklch(0.577 0.245 27.325)` — keep as-is

**Layout patterns in existing components:**
- Feed/composer width: `w-[40vw]` — migrate to `max-w-[--content-sm]`
- Auth cards: `max-w-sm` — keep, this is already responsive
- Profile header: `w-[40vw]` — migrate to `max-w-[--content-sm]`
