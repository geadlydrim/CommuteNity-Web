# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000 (Turbopack)
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check without emitting files
```

No test suite yet — testing setup is a future sprint task.

## Architecture

**Framework:** Next.js 15 App Router. All pages live under `src/app/` using file-based routing. `src/app/layout.tsx` is the root layout — add global providers (QueryClient, Supabase session) here.

**Styling:** Tailwind CSS v4 + shadcn/ui (style: `radix-nova`, base color: `neutral`). Theme tokens are CSS variables defined in `src/app/globals.css` under `:root` / `.dark`. The `cn()` helper at `src/lib/utils.ts` merges Tailwind classes safely — always use it when combining conditional classes.

**Adding shadcn components:** `npx shadcn@latest add <component>` — drops generated source into `src/components/ui/`. Do not hand-edit those files; re-generate instead.

**Planned directory structure** (not yet built — guides where new code goes):

```
src/
├── app/
│   ├── (auth)/         # sign-in, sign-up routes
│   ├── routes/         # browse + route detail pages
│   ├── stops/          # stop detail pages
│   ├── contribute/     # contribution submission flows
│   ├── profile/        # user profile page
│   └── api/            # API route handlers (geocoding proxy, etc.)
├── components/
│   ├── ui/             # shadcn/ui generated components (do not hand-edit)
│   ├── map/            # MapLibre GL JS wrappers
│   ├── route/          # route-specific components (RouteCard, SegmentList, etc.)
│   └── stop/           # stop-specific components
├── lib/
│   ├── supabase/       # Supabase client helpers (browser client, server client, middleware)
│   ├── db/             # Dexie schema for offline IndexedDB cache
│   ├── sync/           # background sync queue
│   └── geo/            # geocoding wrapper (proxied Nominatim calls)
├── hooks/              # custom React hooks
├── stores/             # Zustand stores
└── types/              # shared TypeScript types mirroring the DB schema
```

**State management split:**
- Server/remote data → TanStack Query (`@tanstack/react-query`). Wrap the app in `QueryClientProvider` in `layout.tsx`.
- Client UI state → Zustand stores in `src/stores/`.
- Forms → `react-hook-form` + Zod schemas. Resolvers via `@hookform/resolvers/zod`.

**Backend:** Supabase (Postgres + PostGIS). Use `@supabase/supabase-js` for client-side calls and `@supabase/ssr` for server components and middleware (cookie-based sessions). See `docs/data-model.md` for the full DB schema and `docs/backend-decision.md` for all backend/tooling decisions.

**Maps:** MapLibre GL JS via `react-map-gl`. Uses free OSM tiles — no API key needed. Geocoding (text → coordinates) goes through a Next.js API route (`src/app/api/geocode/`) that proxies Nominatim to respect the 1 req/s rate limit.

**Offline:** IndexedDB via Dexie.js (`src/lib/db/`). Service worker via `next-pwa` (configured in `next.config.ts`). `next-pwa@5.6.0` has known friction with Next.js 15 App Router — treat PWA config as a Sprint 3 task.

**Path alias:** `@/*` maps to `src/*` (defined in `tsconfig.json`).

## Product context

See `docs/` for living product decisions:
- `docs/mvp-scope.md` — what is and isn't in MVP
- `docs/data-model.md` — DB entities, fields, relationships, moderation state machine
- `docs/sprint-roadmap.md` — Sprint 1–3 plan
- `docs/user-stories.md` — acceptance criteria per feature
