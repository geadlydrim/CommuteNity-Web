# Codemap

Where things live and how requests flow, for finding code fast. Covers what the tree can't show: which file owns a behavior, which names differ from `GLOSSARY.md`, and which edits must land in several places at once. For the file list itself, look at the tree.

## Glossary term → code name

The code predates `GLOSSARY.md` and uses older names in places. Search for the code name.

| Glossary | Code |
|---|---|
| Post map | `map_data` on `posts`; `RouteMapBuilder`, `StaticRouteMap`, `route-geometry.ts`, `post-map.ts` (`mapDataSchema`, `pinSchema`) |
| Guide | `map_data` on `comments` with `kind: "guide"`; `GuideMapBuilder`, `StaticGuideMap`, `guide-geometry.ts`, `guide-map.ts` (`guideMapDataSchema`) |
| Transfer | `connector` / `connectors` (TS and stored JSON key) |
| Mode | `TransportMode`, `MODE_META`, `ENABLED_MODES` in `guide-map.ts` (`src/lib/transit/modes.ts` is an unused duplicate) |
| Focus view | `focusMode` prop on `PostCard`; `PostModal`; routes `/p/[id]` and `@modal/(.)p/[id]` |
| Post vote | `post_votes` table, `net_votes` column (catalog votes are the separate `votes` table) |
| Rider | `user`, `users` table, `currentUserId` |
| Username | `username`; some code and UI say "handle" |

## Request flow

1. `src/middleware.ts` → `updateSession` in `src/lib/supabase/middleware.ts`: refreshes the session cookie, then sends a signed-in rider with no username to `/onboarding/username`. Skips static files and `/api/geocode*`.
2. Pages under `src/app/` are server components that read with `createClient` from `@/lib/supabase/server`.
3. Interactive pieces are client components that write directly with `createClient` from `@/lib/supabase/client`. There are no server actions and no query layer; RLS in the migrations is the only authority on who can write what.

## Feature flows

**Feed** (`/`): `src/app/page.tsx` renders `SignedInHeader` + `PostComposer` for riders and `PostFeed` for everyone. `PostFeed` (server) selects 50 public posts with author and comment count, then the viewer's `post_votes`, and renders a `PostCard` per post.

**Post card** (`src/components/post-card.tsx`, client): one component owns the whole card: optimistic voting (writes `post_votes`; a trigger maintains `posts.net_votes`), share, the static post-map thumbnail, comments (loaded on expand, inserted with an optional guide), and in focus mode the interactive `FocusMapView`.

**Focus view**: client navigation to `/p/[id]` is intercepted by `src/app/@modal/(.)p/[id]/page.tsx` → `PostModal` → `PostCard focusMode`. A direct load renders `src/app/p/[id]/page.tsx`. Both fetch through `getPostById` in `src/lib/posts.ts`.

**Posting**: `PostComposer` inserts into `posts` (`user_id` defaults to `auth.uid()` in SQL), optionally with `map_data` from `RouteMapBuilder`, then `router.refresh()`.

**Profile** (`/u/[username]`): the page reads `users` and the rider's posts itself (not through `lib/posts.ts`); `ProfileEditDialog` renders for the owner only and uploads to the `avatars` bucket, then updates `users`.

**Sign-in and identity**: email sign-up passes `username`/`display_name` as auth metadata; the `handle_new_user` trigger copies them into `public.users`. Google sign-in lands at `src/app/auth/callback/route.ts`, then `/onboarding/username` if no username. The username lives in **two places**: auth `user_metadata` (read by the middleware gate, the callback, and the onboarding page) and `public.users.username` (read by every page). Onboarding and profile edit write both.

**Geocoding**: browser → `geocode` / `reverseGeocode` in `src/lib/geo/index.ts` → `/api/geocode` or `/api/geocode/reverse` → `src/lib/geo/nominatim.ts` (throttle, cache, retry, place labels). Builders use it through `LocationSearch` and map clicks.

**Maps**: everything goes through the `@/components/map` barrel. Feed thumbnails are `<img>` tiles + SVG (`static-*-map.tsx`); live MapLibre (`MapView`) mounts only in the focus view and the two builders. MapLibre's core library is already lazy-loaded by `react-map-gl`.

## Edits that must land in several places

- **Post select string and vote hydration**: copied in `src/components/post-feed.tsx`, `src/lib/posts.ts`, and `src/app/u/[username]/page.tsx`. `PostCardData` (the row type, defined in `post-card.tsx`) must match all three.
- **Map editing behavior** (slot state, reverse-geocode labeling, fly-to, dialog chrome): duplicated in `route-map-builder.tsx` and `guide-map-builder.tsx`.
- **Static tile rendering and OSM attribution**: duplicated in `static-route-map.tsx` and `static-guide-map.tsx`.
- **Pin and line colors**: hex literals in the builders, static maps, and `post-card.tsx`; mode colors in `MODE_META`.
- **Username writes**: `onboarding-form.tsx` and `profile-edit-dialog.tsx` (auth metadata and `users`); the regex lives in `src/lib/schemas/profile.ts` and the `users_username_format` CHECK.
- **Database error messages**: mapped by matching error text separately in `sign-up/page.tsx`, `onboarding-form.tsx`, and `profile-edit-dialog.tsx` (sentinels: `23505`, `username_cooldown`, `avatar_url_invalid`).
- **Limits shared with SQL**: post/comment body 500 (`src/lib/schemas/post.ts` ↔ CHECKs), Philippine pin bounds (`post-map.ts` ↔ reverse-geocode schema in `geocode.ts`), avatar types and 5 MiB (`profile-edit-dialog.tsx` ↔ bucket settings in `20261022000000_rider_write_guards.sql`).

## Database

Each table's current shape is the sum of its migrations; later files alter earlier ones.

| Table / object | Defined and changed in |
|---|---|
| `users` | `initial_schema` → `user_identity` (username) → `username_cooldown` → `rider_write_guards` (column grants, avatar guard) → `avatar_url_exact_origin` (current avatar guard) |
| `handle_new_user` trigger | latest body in `avatar_storage` |
| `posts` | `posts_table` → `post_interactions` (`net_votes`) → `post_map_data` |
| `post_votes`, `comments` | `post_interactions`; `comments.map_data` in `comment_map_data` |
| `sync_post_net_votes` | `post_interactions`; search path pinned in `rider_write_guards` |
| `avatars` bucket and policies | `avatar_storage` → `rider_write_guards` (limits, delete policy) |
| Catalog tables (parked) | `initial_schema`; insert policies replaced in `rider_write_guards` |

`supabase db advisors --db-url "$SUPABASE_DB_URL"` lists current security and performance warnings against the linked project.

## Tests

`npm test` runs Vitest over `tests/**/*.test.ts` in Node.

- `tests/db/`: act as a rider against the database in `SUPABASE_DB_URL` (the linked, live project) inside transactions that always roll back; `tests/db/rider.ts` is the harness (`withRollback`, `createRider`, `actAs`, `run`). `DB_TEST_MIGRATION=<file.sql>` applies an unpushed migration inside each test first, so a new migration can go red → green before `supabase db push`. These suites skip when `SUPABASE_DB_URL` is unset.
- `tests/api/`: call route handlers directly with a `NextRequest` and spy on `fetch`.
- No component tests; client components have no injection seam yet.

## Keeping this file true

Update the affected section in the same change when you move a flow's owner, add a table or migration that alters one above, remove a duplication, or rename a code name in the first table.
