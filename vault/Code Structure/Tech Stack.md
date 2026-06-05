# Tech Stack

#code #doc

← [[Home]]

---

## Core

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | Next.js 15 (App Router) | Turbopack in dev |
| Language | TypeScript 5.7 | strict mode |
| Styling | Tailwind CSS v4 + shadcn/ui (radix-nova) | |
| UI Components | shadcn/ui | generated into `src/components/ui/` |
| Backend | Supabase (Postgres + PostGIS) | |
| Auth | Supabase Auth + `@supabase/ssr` | cookie sessions |

---

## State & Data

| Concern | Library |
|---------|---------|
| Server/remote data | TanStack Query v5 |
| Client UI state | Zustand v5 |
| Forms | react-hook-form + Zod v4 |
| Form resolvers | `@hookform/resolvers` |

---

## Maps & Geo

| Concern | Library |
|---------|---------|
| Map rendering | MapLibre GL JS + react-map-gl |
| Tiles | OSM (no API key) |
| Geocoding | Nominatim proxied via Next.js API route |
| Spatial DB | PostGIS |

---

## Offline

| Concern | Library |
|---------|---------|
| IndexedDB cache | Dexie.js + dexie-react-hooks |
| Service Worker | next-pwa 5.6.0 (known Next 15 friction) |

---

## UI Utilities

| Library | Purpose |
|---------|---------|
| lucide-react | Icons |
| sonner | Toast notifications |
| next-themes | Dark/light mode |
| class-variance-authority | Component variant classes |
| clsx + tailwind-merge → `cn()` | Safe class merging |

---

## Dev

```bash
npm run dev        # Turbopack dev server → localhost:3000
npm run build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

Path alias: `@/*` → `src/*`

---

## Related

[[src-app]] · [[src-components]] · [[src-lib]] · [[10 Infrastructure & Polish]] · [[09 Offline PWA]]
