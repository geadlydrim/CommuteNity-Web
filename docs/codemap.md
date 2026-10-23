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
| Focus view | `FocusView`; `focus` prop on `PostCard`; `PostModal` (dialog shell taking children); routes `/p/[id]` and `@modal/(.)p/[id]` |
| Post vote | `post_votes` table, `net_votes` column (catalog votes are the separate `votes` table) |
| Rider | `user`, `users` table, `currentUserId` |
| Username | `username`; some code and UI say "handle" |

## Request flow

1. `src/middleware.ts` → `updateSession` in `src/lib/supabase/middleware.ts`: refreshes the session cookie, reads the rider's `users.username` by id, and applies `gateDecision` from `src/lib/identity.ts` (no username → `/onboarding/username`; the paths allowed without one live only there). Skips static files and `/api/geocode*`.
2. Pages under `src/app/` are server components that read with `createClient` from `@/lib/supabase/server`.
3. Interactive pieces are client components that write directly with `createClient` from `@/lib/supabase/client`. Reads of posts go through `@/lib/posts`; there are no server actions, and RLS in the migrations is the only authority on who can write what.

## Feature flows

**Feed** (`/`): `src/app/page.tsx` renders `SignedInHeader` + `PostComposer` for riders (viewer from `getViewer` in `src/lib/identity.ts`) and `PostFeed` for everyone. `PostFeed` (server) calls `listFeedPosts` from `@/lib/posts` (50 public posts with author, comment count, and the viewer's vote in one request) and renders a `PostCard` per post.

**Post card** (`src/components/post-card.tsx`, **server**): author, `<time>` from `formatPostTime` (`src/lib/format-time.ts`, always Asia/Manila), body, static post-map thumbnail, and an overlay link to `/p/{id}`. Interactive parts are client islands: `PostVoteControls` (optimistic voting; a trigger maintains `posts.net_votes`), `CommentThread` (comments on expand, guide attach; `GuideMapBuilder` loaded with `next/dynamic` only after a signed-in rider opens it), `ShareButton` (a cancelled share does nothing).

**Focus view**: client navigation to `/p/[id]` is intercepted by `src/app/@modal/(.)p/[id]/page.tsx` → `PostModal` → `FocusView`; a direct load renders `FocusView` from `src/app/p/[id]/page.tsx`, which also emits link-preview metadata. Both fetch through `getPostById` in `@/lib/posts`. The interactive map is `FocusPostMap` in `src/components/map/`, loaded lazily via `LazyFocusPostMap`.

**Posting**: `PostComposer` inserts into `posts` (`user_id` defaults to `auth.uid()` in SQL), optionally with `map_data` from `RouteMapBuilder` (loaded with `next/dynamic` on first open), then `router.refresh()`.

**Profile** (`/u/[username]`): the page reads the rider's `users` row, then their posts with `listPostsByAuthor` from `@/lib/posts` (author attached, not re-joined); `ProfileEditDialog` renders for the owner only and replaces photos through `replaceAvatar` in `src/lib/avatars.ts` (upload → update profile → on failure delete the new upload, on success delete the old own-folder photo).

**Session resilience**: both Supabase server clients use `fetchWithTimeout` (`src/lib/supabase/with-timeout.ts`, 5 s, request really cancelled). `getViewer` throws on network/timeout errors so pages can tell "couldn't confirm" from signed out; middleware then passes the request through without touching cookies. Sign-out is a 303 that ends only this device's session. The OAuth callback redirects with relative paths; its error codes live in `src/lib/auth-callback.ts`.

**Sign-in and identity**: `public.users` is the only home of username, display name, and avatar (ADR 0006). Email sign-up checks username availability, then passes `username`/`display_name` as sign-up metadata, which only the `handle_new_user` trigger reads (it lowercases, stores NULL if invalid or taken, defaults display name from the Google name). Google sign-in lands at `src/app/auth/callback/route.ts`, then `/onboarding/username` if `users.username` is NULL. `getViewer` in `src/lib/identity.ts` is the server read of the signed-in rider. Onboarding and profile edit write only `users`.

**Geocoding**: browser → `geocode` / `reverseGeocode` in `src/lib/geo/index.ts` → `/api/geocode` or `/api/geocode/reverse` → the shared `nominatim` instance from `createNominatimClient` in `src/lib/geo/nominatim.ts` (one serialized queue ≥1 s apart across both routes, max 4 waiting → 503, 8 s budget → 504, retries, LRU cache) → `label.ts` builds place labels. Request and response shapes are Zod schemas in `src/lib/schemas/geocode.ts`, shared by routes and the browser client. Builders use it through `LocationSearch` and map clicks.

**Maps**: everything goes through the `@/components/map` barrel. Feed thumbnails are `<img>` tiles + SVG (`static-*-map.tsx`); live MapLibre (`MapView`) mounts only in the focus view and the two builders. MapLibre's core library is already lazy-loaded by `react-map-gl`.

## Edits that must land in several places

- **Post reads**: one selection in `src/lib/posts/select.ts`, the UI type `Post` in `src/lib/posts/types.ts` (normalized by `toPost`), reads in `src/lib/posts/queries.ts`. A new column is a `select.ts` + `types.ts` change; regenerate row types first if it's a new database column.
- **Map editing behavior** (slot state, reverse-geocode labeling, fly-to, dialog chrome): duplicated in `route-map-builder.tsx` and `guide-map-builder.tsx`.
- **Static tile rendering and OSM attribution**: duplicated in `static-route-map.tsx` and `static-guide-map.tsx`.
- **Pin and line colors**: hex literals in the builders, static maps, and `post-card.tsx`; mode colors in `MODE_META`.
- **Username rules**: the regex lives in `src/lib/schemas/profile.ts` and the `users_username_format` CHECK, and `handle_new_user` re-checks it at sign-up.
- **Database error messages**: one mapper, `riderMessage` in `src/lib/errors.ts`, used by every form and write; add new error cases there, keyed on codes and the database's named exceptions (`username_cooldown`, `avatar_url_invalid`), never on loose message text. A new named exception raised in SQL needs a case there.
- **Limits shared with SQL**: post/comment body 500 and non-blank (`src/lib/schemas/post.ts` ↔ CHECKs), `map_data` ≤ 16 KB (CHECKs in `content_limits`; builders' pin/leg caps keep real maps far below), Philippine pin bounds (`post-map.ts` ↔ reverse-geocode schema in `geocode.ts`), avatar types and 5 MiB (`src/lib/avatars.ts` ↔ bucket settings in `20261022000000_rider_write_guards.sql`), display name ≤ 40 (`profile.ts` ↔ `profile_limits`).
- **Row types**: generated in `src/lib/supabase/database.types.ts` by `npm run db:types`; regenerate in the same change as any migration.

## Database

Each table's current shape is the sum of its migrations; later files alter earlier ones.

| Table / object | Defined and changed in |
|---|---|
| `users` | `initial_schema` → `user_identity` (username) → `username_cooldown` → `rider_write_guards` (column grants, avatar guard) → `avatar_url_exact_origin` (current avatar guard) |
| `handle_new_user` trigger | latest body in `profile_creation_trigger` |
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
