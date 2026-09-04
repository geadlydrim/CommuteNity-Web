# Plan

Module-based roadmap for the **Next.js web app** (this repo). Native Android/iOS are out of scope.

Status tags:
- ✅ done (UI + schema in this repo)
- 📦 schema only (SQL/RLS exist; no screens — not done)
- 🚧 in progress
- blank = not started

`.cursor/agents/STATUS.md` wins when this file and the repo disagree. Stories: `docs/user-stories.md` (US-100+ live; US-001–016 parked). Schema: `docs/data-model.md`.

---

## 1. Auth & Identity

**Purpose:** Account creation, session management, public handle.

**Requirements:**
- ✅ Email + password sign-up (US-013)
- ✅ Sign-in with email
- ✅ Sign-out
- ✅ Supabase `@supabase/ssr` cookie sessions + middleware
- ✅ `username` column with regex + uniqueness, captured at sign-up
- ✅ `display_name` captured at sign-up
- ✅ `handle_new_user` trigger backfills `public.users` row
- ✅ Google OAuth sign-in (US-014)
- Password reset flow
- ✅ Edit username / display_name with conflict check (30-day username cooldown enforced by DB trigger)
- ~~Username NOT NULL migration~~ — not feasible; OAuth trigger INSERTs NULL username before onboarding. Middleware gate enforces presence instead.

**Open:**
- Reserved-username blocklist? (avoided so far via `/u/` prefix)

---

## 2. Social Feed

**Purpose:** Community-driven foundation. Every other feature attaches to identity through posts.

**Requirements:**
- ✅ `posts` table + RLS (read public, insert own, update/delete own)
- ✅ Post composer (text, 1–500 chars)
- ✅ Toast feedback on post success/fail
- ✅ Global public feed on landing (anon + auth)
- ✅ `PostCard` shared component, linked author → `/u/{username}`
- ✅ Profile feed at `/u/{username}` (own posts)
- ✅ Upvotes / downvotes (new `post_votes` table + thumb buttons on `PostCard`, toggle support)
- ✅ Comments (new `comments` table + expandable thread under each post, inline compose)
- ✅ Share post (Web Share API with clipboard fallback)
- ✅ Post focus-mode overlay (intercepting route `@modal/(.)p/[id]`, URL sync, dark backdrop, comments expanded; canonical `/p/[id]` for shared links)
- ✅ Route map on posts — `map_data` JSONB on `posts`, ordered pin list (origin→waypoints→destination); composer "Add map" builder (geocode search + click/drag + reverse-geocode labels); static tile preview in feed (no WebGL), interactive `MapView` in focus view
- 🚧 Guide maps on comments — `kind: "guide"` JSONB on `comments`, multi-leg builder (not Coordinator-closed)
- Delete-own-post button on `PostCard` (RLS already supports)
- Friends visibility — `friends` table + `posts_read_friends` RLS + composer visibility selector
- Feed pagination / infinite scroll past 50
- Realtime updates (Supabase channel subscription)

**Open:**
- Edit post or post-integrity preserved? (current: no edit, full delete)

---

## 3. Profile & Reputation

**Purpose:** Public identity surface. Tracks contribution impact.

**Requirements:**
- ✅ `/u/{username}` route — display_name + @handle + posts list
- ✅ Case-insensitive username lookup
- ✅ Signed-in header links to own profile
- ✅ Onboarding page `/onboarding/username` — OAuth users pick handle + display_name after first sign-in
- ✅ Avatar upload (Supabase Storage bucket)
- Bio field
- Joined date, post count, follower/following counts
- Reputation score (+1 approval, -1 rejection on contributions)
- Approved / pending / rejected contribution breakdown (US-015)
- ✅ Own-profile vs other-profile UX — "Edit profile" button only when viewing self
- ✅ Edit display_name / username UI (inline dialog on profile page)

**Open:**
- Reputation tiers + privileges (Senior Contributor auto-approve)? — post-MVP

---

## 4. Routes

**Purpose:** Submit and browse community-maintained transit routes.

**Requirements:**
- 📦 Schema: `routes`, `route_segments` (there is no `route_stops` table)
- 📦 RLS: anon reads `approved`; auth users insert `pending`
- Add Route wizard (name, mode, stops picker, fare entry) (US-007)
- Route detail screen (stops in order, per-segment fares, notes, last updated) (US-005)
- Browse routes by mode filter (US-004)
- Basic text route search (origin + destination) (US-001)
- Multi-mode route results (jeepney → MRT → walk) (US-002)
- Seed: ~10 Metro Manila jeepney routes
- "No routes found" empty state with contribute prompt

**Open:**
- Edit-route proposals MVP or later? (currently in Edit Proposals module)
- Route search: text match only or routing graph? (graph not in current MVP)
- Unused `routes` / `stops` tables are **not** a decision to build UI. Needs a Coordinator-approved brief.

---

## 5. Stops

**Purpose:** Geocoded transit stops as building blocks for routes.

**Requirements:**
- 📦 Schema: `stops` table (lat/lng, mode, name)
- 📦 RLS: anon reads `approved`; auth users insert `pending`
- Add Stop screen — name + map pin + mode (US-009)
- Stop detail screen — pin, mode, routes serving it (US-006)
- Geospatial "stops near me" (PostGIS `ST_DWithin`)

**Open:**
- Stop creation inline during route building vs require pre-existing?

---

## 6. Map Integration

**Purpose:** Spatial UX for stops, routes, and pin-dropping.

**Requirements:**
- ✅ MapLibre GL JS + react-map-gl wrapper (`MapView`, barrel, OSM raster style, Metro Manila defaults) in `src/components/map/`
- ✅ OSM tile source (no API key)
- ✅ Map pin drop (click/drag) — built in `RouteMapBuilder`; reusable for stop submission
- ✅ Route line rendering (`lineStringFromPins` + Source/Layer; also static SVG polyline)
- ✅ Static no-WebGL tile preview (`StaticRouteMap`) — Web Mercator tile stitch for feed thumbnails
- Stops layer (clustered markers)
- ✅ Geocoding proxy at `src/app/api/geocode/` (Nominatim, 1 req/s throttle + 5-min cache, PH-restricted)
- ✅ Reverse geocoding `src/app/api/geocode/reverse/` (shared throttle via `src/lib/geo/nominatim.ts`)
- ✅ Typed browser wrapper `src/lib/geo/index.ts` — `geocode(q, opts?)`, `reverseGeocode(lat, lon, opts?)`
- ✅ PH-aware two-line geocode labels — POI primary + simplified barangay/city/province sublabel (`buildLabelParts` in `src/lib/geo/nominatim.ts`); persisted as `label` + `sublabel` on each pin (`src/lib/schemas/post-map.ts`)
- ✅ Query-name similarity re-rank — `src/app/api/geocode/route.ts` reorders Nominatim hits by fraction of query words matched in the POI name, importance as tiebreaker (fixes "wrong terminal ranks first")
- "Stops near me" map UI

**Search quality & performance (roadmap):**
- Personalized result ranking — boost the user's previously-picked / frequently-used places. Needs a per-user recent-places store (Supabase table or local Dexie cache) keyed by place coords; blend a recency/frequency score into the existing `route.ts` re-rank.
- Activity-based suggestion ordering — surface recent searches and saved home/work locations in the dropdown *before* the user types; weight live results by these.
- Viewport / proximity bias — pass Nominatim `viewbox` + `bounded` (or sort by distance) from the current map center / GPS so nearby matches outrank far ones with the same name.
- Dropdown UX — keyboard navigation (↑/↓/Enter), bold matched query substring in results, recent-searches list on empty focus, explicit loading / empty / error states, "Use my location" button.
- Loading-time optimization — client-side query cache + stale-while-revalidate via TanStack Query (server already caches 5 min); tune the 350 ms debounce; prefetch on focus; trim default `limit`.

**Open:**
- Stop location input: MapLibre click vs lat/lng fields?
- Where to store per-user place history — Supabase table (cross-device, needs RLS + migration) vs Dexie local cache (offline-friendly, single-device)?
- Personalized ranking server-side (in `route.ts`, shared cache leaks across users) vs client-side re-rank after fetch (per-user, no cache contamination)?

---

## 7. Voting & Moderation

**Purpose:** Crowd verification of contributions. Threshold-based auto-decisions.

**Requirements:**
- 📦 Schema: `votes` table (per-user, per-target, up/down)
- Upvote / downvote on routes (US-010)
- Vote toggle on second tap
- 📦 Postgres trigger: `net_votes >= 5` auto-approve; `<= -3` auto-reject (US-012)
- Pending badge on route/stop detail
- Flag content with reason — wrong fare / outdated / duplicate / spam (US-011)
- 📦 `reports` table
- "My Submissions" / contribution status view
- Moderator review via Supabase dashboard (no in-app UI for MVP)

**Open:**
- In-app moderator queue? — post-MVP
- Pending content visible to high-rep users only or everyone?

---

## 8. Edit Proposals

**Purpose:** Field-level corrections without overwriting approved data.

**Requirements:**
- 📦 Schema: `edit_proposals` table with `change_payload` JSON
- "Suggest Edit" sheet on route detail (US-008)
- Approved edits merge `change_payload` into target row
- Reputation effect on approval/rejection (+1 / -1)
- Existing approved row unchanged until edit approved

**Open:**
- Edit MVP scope: fare only or all fields?

---

## 9. Offline / PWA

**Parked.** Not current MVP. Web-only if ever approved. Android Room / WorkManager is dead.

**Requirements (if unparked):**
- Dexie (IndexedDB) — package installed, unused
- Service Worker — `next-pwa` installed, **not** wired in `next.config.ts`
- Cache and offline notice stories: US-003, US-016

**Open:**
- `next-pwa@5.6.0` vs `@serwist/next` (Next 15 friction) — only if this module is approved

---

## 10. Infrastructure & Polish

**Purpose:** Cross-cutting quality bar.

**Requirements:**
- ✅ Tailwind v4 + shadcn radix-nova
- ✅ Supabase project + `@supabase/ssr` cookie sessions + middleware
- ✅ Sonner toaster wired in layout
- TanStack Query / Zustand — installed, unused; do not add unless a work plan says why
- Error / loading / empty states across screens that exist
- Testing setup (none yet)
- Catalog milestone (later, not this module’s done-when): sign up → find route → submit correction

---

## Cross-module notes

- Schema reference: `docs/data-model.md`
- User story IDs: `docs/user-stories.md` (US-100+ live feed; US-001–016 parked catalog)
- Scope boundary: `docs/mvp-scope.md`
- Out of scope (no module): real-time GPS, in-app chat, payments, native Android, native iOS, ride-hailing, MRT/LRT live boards
