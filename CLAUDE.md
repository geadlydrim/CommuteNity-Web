# CLAUDE.md

Guidance for agents in this repository.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000 (Turbopack)
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check without emitting files
```

No test suite yet.

## Product

This is the **web app**. Native Android/iOS are out of scope. Follow `.cursor/agents/STATUS.md` over older memory. Social feed is the live foundation. Route/stop UI is parked (tables exist; no screens). Do not create `src/app/routes/`, `stops/`, `contribute/`, `src/lib/db/`, `src/lib/sync/`, `src/hooks/`, or `src/stores/` unless an approved work plan says to.

## Architecture (as it is)

**Framework:** Next.js 15 App Router under `src/app/`. Root layout: `src/app/layout.tsx`.

**Styling:** Tailwind CSS v4 + shadcn/ui (`radix-nova`, neutral). Tokens in `src/app/globals.css`. Combine classes with `cn()` from `src/lib/utils.ts`.

**Adding shadcn:** `npx shadcn@latest add <component>` → `src/components/ui/`. Do not hand-edit those files.

**Data:** RSC and client components call Supabase via `@/lib/supabase/server` and `@/lib/supabase/client`. Zod in `src/lib/schemas/`. TanStack Query and Zustand are installed and **unused**.

**Maps:** import only from `@/components/map`. Geocode via `/api/geocode` and `/api/geocode/reverse` (`src/lib/geo`).

**Offline / PWA:** Dexie and `next-pwa` are unused. `next.config.ts` has no service worker.

**Path alias:** `@/*` → `src/*`.

### Layout that exists

```
src/
├── app/
│   ├── (auth)/              # sign-in, sign-up
│   ├── api/geocode/         # Nominatim proxy (+ reverse)
│   ├── auth/                # callback, sign-out
│   ├── onboarding/username/
│   ├── p/[id]/              # post permalink
│   ├── u/[username]/        # profile
│   ├── @modal/(.)p/[id]/    # focus overlay
│   ├── layout.tsx
│   └── page.tsx             # landing feed
├── components/
│   ├── ui/                  # shadcn (do not hand-edit)
│   ├── map/                 # MapView, builders, static maps
│   └── post-*.tsx           # feed, card, composer, modal
└── lib/
    ├── supabase/
    ├── geo/
    ├── schemas/
    ├── posts.ts
    └── transit/modes.ts
```

## Docs

- `.cursor/agents/STATUS.md` — what is true
- `docs/mvp-scope.md` — current MVP vs parked catalog
- `docs/plan.md` — modules and checkmarks (Coordinator-owned)
- `docs/data-model.md` — tables
- `docs/user-stories.md` — US-100+ live; US-001–016 parked
