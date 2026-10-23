# Codemap

Where things live and how requests flow, for finding code fast. Covers what the tree can't show: which file owns a behavior, which names differ from `GLOSSARY.md`, and which edits must land in several places at once. For the file list itself, look at the tree.

## Glossary term → code name

The code predates `GLOSSARY.md` and uses older names in places. Search for the code name.

| Glossary | Code |
|---|---|
| Post map | `map_data` on `posts`; `RouteMapBuilder`, `StaticRouteMap`, `route-geometry.ts`, `post-map.ts` (`mapDataSchema`, `pinSchema`) |
| Guide | `map_data` on `comments` with `kind: "guide"`; `GuideMapBuilder`, `StaticGuideMap`, `guide-geometry.ts`, `guide-map.ts` (`guideMapDataSchema`) |
| Transfer | `connector` / `connectors` (TS and stored JSON key) |
| Mode | `TransportMode`, `MODE_META`, `ENABLED_MODES` in `guide-map.ts` |
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

**Geocoding**: browser → `geocode` / `reverseGeocode` in `src/lib/geo/index.ts` → `/api/geocode` or `/api/geocode/reverse` → the shared `nominatim` instance from `createNominatimClient` in `src/lib/geo/nominatim.ts` (one serialized queue ≥1 s apart across both routes, max 4 waiting → 503, 8 s budget → 504, retries, LRU cache) → `label.ts` builds place labels. Request and response shapes are Zod schemas in `src/lib/schemas/geocode.ts`, shared by routes and the browser client. Builders use it through `LocationSearch` and map clicks.

**Maps**: everything goes through the `@/components/map` barrel. Feed thumbnails are `<img>` tiles + SVG (`static-*-map.tsx`); live MapLibre (`MapView`) mounts only in the focus view and the two builders. MapLibre's core library is already lazy-loaded by `react-map-gl`.

## Edits that must land in several places

- **Post select string and vote hydration**: copied in `src/components/post-feed.tsx`, `src/lib/posts.ts`, and `src/app/u/[username]/page.tsx`. `PostCardData` (the row type, defined in `post-card.tsx`) must match all three.
- **Map editing behavior** (slot state, reverse-geocode labeling, fly-to, dialog chrome): duplicated in `route-map-builder.tsx` and `guide-map-builder.tsx`.
- **Static tile rendering and OSM attribution**: duplicated in `static-route-map.tsx` and `static-guide-map.tsx`.
- **Pin and line colors**: hex literals in the builders, static maps, and `post-card.tsx`; mode colors in `MODE_META`.
- **Username writes**: `onboarding-form.tsx` and `profile-edit-dialog.tsx` (auth metadata and `users`); the regex lives in `src/lib/schemas/profile.ts` and the `users_username_format` CHECK.
- **Database error messages**: one mapper, `riderMessage` in `src/lib/errors.ts`, used by every form and write; add new error cases there, keyed on codes and the database's named exceptions (`username_cooldown`, `avatar_url_invalid`), never on loose message text. A new named exception raised in SQL needs a case there.
- **Limits shared with SQL**: post/comment body 500 and non-blank (`src/lib/schemas/post.ts` ↔ CHECKs), `map_data` ≤ 16 KB (CHECKs in `content_limits`; builders' pin/leg caps keep real maps far below), Philippine pin bounds (`post-map.ts` ↔ reverse-geocode schema in `geocode.ts`), avatar types and 5 MiB (`profile-edit-dialog.tsx` ↔ bucket settings in `20261022000000_rider_write_guards.sql`).
- **Row types**: generated in `src/lib/supabase/database.types.ts` by `npm run db:types`; regenerate in the same change as any migration.

## Database

Each table's current shape is the sum of its migrations; later files alter earlier ones.

| Table / object | Defined and changed in |
|---|---|
| `users` | `initial_schema` → `user_identity` (username) → `username_cooldown` → `rider_write_guards` (column grants, avatar guard) → `avatar_url_exact_origin` (current avatar guard) |
| `handle_new_user` trigger | latest body in `avatar_storage` |
| `posts` | `posts_table` → `post_interactions` (`net_votes`) → `post_map_data` |
| `post_votes`, `comments` | `post_interactions`; `comments.map_data` in `comment_map_data` |
| `sync_post_net_votes` | `post_interactions`; made incremental (exact under concurrent votes) in `exact_post_vote_totals` |
| Policy style | every policy calling `auth.uid()` uses `(select auth.uid())` since `advisor_cleanup`; follow that in new policies. The catalog vote trigger was dropped there too |
| `avatars` bucket and policies | `avatar_storage` → `rider_write_guards` (limits, delete policy) |
| Catalog tables (parked) | `initial_schema`; insert policies replaced in `rider_write_guards` |

`supabase db advisors --db-url "$SUPABASE_DB_URL"` lists current security and performance warnings against the linked project.

## Tests

`npm test` runs Vitest over `tests/**/*.test.ts` in Node.

- `tests/db/`: act as a rider against the database in `SUPABASE_DB_URL` (the linked, live project) inside transactions that always roll back; `tests/db/rider.ts` is the harness (`withRollback`, `createRider`, `actAs`, `run`). `DB_TEST_MIGRATION=<file.sql>` applies an unpushed migration inside each test first, so a new migration can go red → green before `supabase db push`. These suites skip when `SUPABASE_DB_URL` is unset.
- Concurrency tests need real commits: `withCommittedFixtures` in the same harness opens separate sessions and always deletes the riders it created (cascading to their posts and votes). `DB_TEST_MIGRATION` can't apply to these, so they go red before the push and green after.
- `tests/unit/`: pure modules in Node (e.g. the error mapper).
- `tests/api/`: call route handlers directly with a `NextRequest` and spy on `fetch`.
- No component tests; client components have no injection seam yet.

## Keeping this file true

Update the affected section in the same change when you move a flow's owner, add a table or migration that alters one above, remove a duplication, or rename a code name in the first table.
