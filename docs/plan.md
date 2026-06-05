# Plan

Module-based roadmap. Pick any module, ship requirements in any order. Status tags:
- ✅ done
- 🚧 in progress
- blank = not started

Stories reference `user-stories.md`. Schema reference `data-model.md`.

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
- Schema migration: `routes`, `route_segments`, `route_stops` tables (per `data-model.md`)
- RLS: anon reads `approved`; auth users insert `pending`
- Add Route wizard (name, mode, stops picker, fare entry) (US-007)
- Route detail screen (stops in order, per-segment fares, notes, last updated) (US-005)
- Browse routes by mode filter (US-004)
- Basic text route search (origin + destination) (US-001)
- Multi-mode route results (jeepney → MRT → walk) (US-002)
- Seed: ~10 Metro Manila jeepney routes
- "No routes found" empty state with contribute prompt

**Open:**
- Edit-route proposals MVP or later? (currently in Edit Proposals module)
- Route search: text match only or routing graph? (graph deferred per mvp-scope)

---

## 5. Stops

**Purpose:** Geocoded transit stops as building blocks for routes.

**Requirements:**
- Schema migration: `stops` table (lat/lng, mode, name) (per `data-model.md`)
- RLS: anon reads `approved`; auth users insert `pending`
- Add Stop screen — name + map pin + mode (US-009)
- Stop detail screen — pin, mode, routes serving it (US-006)
- Geospatial "stops near me" (PostGIS `ST_DWithin`)

**Open:**
- Stop creation inline during route building vs require pre-existing?

---

## 6. Map Integration

**Purpose:** Spatial UX for stops, routes, and pin-dropping.

**Requirements:**
- MapLibre GL JS + react-map-gl wrapper in `src/components/map/`
- OSM tile source (no API key)
- Map pin drop for stop submission
- Route line rendering on detail screen
- Stops layer (clustered markers)
- Geocoding proxy at `src/app/api/geocode/` (Nominatim, 1 req/s rate limit)
- "Stops near me" map UI

**Open:**
- Stop location input: MapLibre click vs lat/lng fields?

---

## 7. Voting & Moderation

**Purpose:** Crowd verification of contributions. Threshold-based auto-decisions.

**Requirements:**
- Schema: `votes` table (per-user, per-target, up/down)
- Upvote / downvote on routes (US-010)
- Vote toggle on second tap
- Postgres trigger: `net_votes >= 5` auto-approve; `<= -3` auto-reject (US-012)
- Pending badge on route/stop detail
- Flag content with reason — wrong fare / outdated / duplicate / spam (US-011)
- `reports` table
- "My Submissions" / contribution status view
- Moderator review via Supabase dashboard (no in-app UI for MVP)

**Open:**
- In-app moderator queue? — post-MVP
- Pending content visible to high-rep users only or everyone?

---

## 8. Edit Proposals

**Purpose:** Field-level corrections without overwriting approved data.

**Requirements:**
- Schema: `edit_proposals` table with `change_payload` JSON
- "Suggest Edit" sheet on route detail (US-008)
- Approved edits merge `change_payload` into target row
- Reputation effect on approval/rejection (+1 / -1)
- Existing approved row unchanged until edit approved

**Open:**
- Edit MVP scope: fare only or all fields?

---

## 9. Offline / PWA

**Purpose:** Mid-commute reliability when connection drops.

**Requirements:**
- Dexie (IndexedDB) schema in `src/lib/db/`
- Cache routes + stops on view
- Service Worker via `next-pwa` (known Next 15 friction per CLAUDE.md)
- "Cached" indicator + last-synced timestamp on offline view (US-016)
- Offline notice on search attempt with no connection (US-003)
- Background sync queue for pending writes on reconnect

**Open:**
- `next-pwa@5.6.0` vs alternative (`@serwist/next`) given Next 15 friction?

---

## 10. Infrastructure & Polish

**Purpose:** Cross-cutting quality bar.

**Requirements:**
- ✅ Tailwind v4 + shadcn radix-nova
- ✅ Supabase project + `@supabase/ssr` cookie sessions + middleware
- ✅ Sonner toaster wired in layout
- TanStack Query provider in `layout.tsx`
- Zustand stores in `src/stores/`
- Error / loading / empty states across all screens
- App icon, splash screen
- Onboarding slides for new users
- Testing setup (none yet — deferred per CLAUDE.md)
- Beta user can sign up → find route → submit correction → track status unassisted

---

## Cross-module notes

- Schema reference: `docs/data-model.md`
- User story IDs: `docs/user-stories.md`
- Scope boundary: `docs/mvp-scope.md`
- Out of scope (no module): real-time GPS tracking, in-app chat, payments, iOS, MRT/LRT live boards, accessibility tags (post-MVP)
