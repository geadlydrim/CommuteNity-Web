# Status

Coordinator-owned. Last updated: 2026-09-04 (web-first docs **approved and closed**).

## What this product is

CommuteNity is a **Next.js 15 web app**. This repo is the product. Community transit knowledge for the Philippines, Metro Manila first.

**Current MVP:** a **public social feed** with identity and post maps. Comment guide maps are in flight.

**Parked catalog:** route search / browse / contribute. Tables exist in Postgres. There is no UI. Schema-only is not done.

**Platform:** native Android / iOS are out of scope. Sibling `../CommuteNity/` is Compose Hello World, not a client, not a TWA.

Living docs (`docs/mvp-scope.md` and the rest of `docs/`) match this. STATUS still wins on conflict.

## Stack (actual)

- Next.js 15 App Router, React 19, Tailwind v4, shadcn radix-nova, Geist + Space Grotesk
- Jeepney Gold tokens in `src/app/globals.css` (`--primary` amber, `--mode-*`, `--status-*`)
- Supabase Auth (email + Google) + `@supabase/ssr` cookie sessions + middleware username gate
- MapLibre via `react-map-gl`, imported only from `@/components/map`
- Nominatim proxied at `/api/geocode` and `/api/geocode/reverse` (1 req/s, PH-restricted)
- Zod in `src/lib/schemas/`; forms use react-hook-form where they exist
- Sonner toasts in root layout
- **Installed but unused:** TanStack Query (no `QueryClientProvider`), Zustand (`src/stores/` does not exist), Dexie, next-pwa (`next.config.ts` has no PWA plugin)
- **Do not create unless an approved work plan says so:** `src/hooks/`, `src/stores/`, `src/types/`, `src/lib/db/`, `src/lib/sync/`, `src/app/routes/`, `src/app/stops/`, `src/app/contribute/`, `src/components/route/`, `src/components/stop/`
- **No test suite**

## Shipped

| Area | In the repo |
|---|---|
| Auth | Email sign-up/in, Google OAuth, sign-out, username + display_name, 30-day username cooldown, OAuth onboarding at `/onboarding/username` |
| Feed | Public posts (1–500 chars), composer, `PostCard`, landing feed (anon + auth), profile feed `/u/{username}` |
| Interactions | Post up/down votes, comments, Web Share + clipboard, focus overlay `@modal/(.)p/[id]`, permalink `/p/[id]` |
| Post maps | `posts.map_data` JSONB, `RouteMapBuilder`, static tile preview in feed, interactive `MapView` in focus |
| Profile | Avatar (Storage), edit username/display_name, own vs other profile |
| Maps infra | `MapView`, OSM raster, pin drop, route polyline, PH two-line geocode labels, query-name re-rank |
| Design | Jeepney Gold, dark mode, `ModeBadge` / `StatusBadge` tokens |

## In flight

Guide maps on comments: `guide-map.ts`, `GuideMapBuilder`, `StaticGuideMap`, `guide-geometry.ts`, `LocationSearch`, `comments.map_data` migration, wiring in `post-card` / composer / modal / geocode.

Not Coordinator-closed. See [PIPELINE.md](PIPELINE.md).

## Schema vs UI

**Live tables:** `users` (incl. `username`), `posts`, `post_votes`, `comments` (+ `map_data` on posts and comments), avatars bucket. Documented in `docs/data-model.md`.

**Created in `20260521150012_initial_schema.sql`, no screens:** `stops`, `routes`, `route_segments`, `votes`, `edit_proposals`, `reports` — PostGIS + RLS (anon reads `approved` only). Vote trigger auto-approves at net ≥ 5 / rejects at ≤ −3.

There is no `route_stops` table. `posts.visibility` includes `friends` but there is no `friends` table.

## Residue (not docs)

- Unused packages: Dexie, next-pwa, TanStack Query, Zustand
- Sibling Android Hello World at `../CommuteNity/`
- Token `--nav-height` with no bottom nav

## Known smells (do not “fix” unless a work plan says so)

- Duplicate transit palettes: `src/lib/transit/modes.ts` vs `MODE_META` in `src/lib/schemas/guide-map.ts`
- Direct `supabase.from()` in client components; no query layer
- Feed capped (~50), no pagination / realtime
- No delete-post control in UI (RLS already allows own delete)
- Password reset not built
- Reputation column exists; no profile UI

## MVP coverage (honest)

| Current MVP (`docs/mvp-scope.md`) | State |
|---|---|
| Public feed | Shipped |
| Identity | Mostly shipped (password reset open) |
| Maps on posts | Shipped |
| Post focus / permalink | Shipped |
| Guide maps on comments | In flight |

| Parked catalog | State |
|---|---|
| Route search | Not built |
| Route & stop browsing | Schema only |
| Community route/stop contribution | Not built |
| Voting on routes/stops | Schema + trigger only |
| Offline browsing | Not built (not current MVP) |

A beta user **cannot** yet find a Metro Manila commute or submit a route correction. They **can** sign in and post.

Route/stop modules stay **parked** until a Planner brief is approved.
