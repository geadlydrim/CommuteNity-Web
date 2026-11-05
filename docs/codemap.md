# Codemap

Where things live and how requests flow, for finding code fast. Covers what the tree can't show: which file owns a behavior, where each glossary term lives in code, and which edits must land in several places at once. For the file list itself, look at the tree.

## Glossary term → code

Code uses the glossary's terms. The one deliberate exception is a stored JSON key (below), which changes only with a new map version.

| Glossary | Code |
|---|---|
| Post map | `map_data` on `posts`; `PostMapBuilder`, `StaticPostMap`, `PostMapPreview`, `post-map-geometry.ts`, `post-map.ts` (`parsePostMap`, `mapDataSchema`, `pinSchema`, `encodedPathSchema`, `CURRENT_POST_MAP_VERSION`). Version 2 adds `paths`: one entry per consecutive pin pair, an encoded street path or `null` (straight line); a version 1 map migrates to all-`null` paths |
| Guide | `map_data` on `comments` with `kind: "guide"`; `GuideMapBuilder`, `StaticGuideMap`, `GuidePreview`, `guide-geometry.ts`, `guide-map.ts` (`parseGuide`, `guideMapDataSchema`, `legSchema`, `CURRENT_GUIDE_VERSION`), chain rule `guideChainStatus` in `guide-chain.ts`. Version 2 legs add `vias`, `expressways`, and `path`; a version 1 leg migrates to `vias: []`, `expressways` = its mode's default, `path: null` |
| Via | `Via`, `viaSchema`, `MAX_VIAS_PER_LEG` (10) in `guide-map.ts`; stored as `vias` on a guide v2 leg, inside the Philippine pin bounds. Post maps have none |
| Leg options | `legOptions` in `src/lib/schemas/leg-options.ts`: a mode (or `POST_MAP_PAIR`) → routing profile (`walk`/`car`/`rail`) and expressways default. Also the migration's source for a v1 leg's `expressways`. The profile is derived, never stored |
| Transfer | `GuideTransfer`, `transferSchema`, `transferSegments`; stored under the JSON key `connectors` in guide v1 and v2 |
| Mode | `TransportMode`, `MODE_META`, `ENABLED_MODES` in `src/lib/schemas/modes.ts`; colour via `modeColor` in `src/lib/map/colors.ts` |
| Focus view | `FocusView`; `focus` prop on `PostCard`; `FocusViewDialog` (dialog shell taking children); routes `/p/[id]` and `@modal/(.)p/[id]` |
| Post vote | `post_votes` table, `net_votes` column (catalog votes are the separate `votes` table) |
| Rider | `user`, `users` table, `currentUserId` |
| Username | `username` |

## Request flow

1. `src/middleware.ts` → `updateSession` in `src/lib/supabase/middleware.ts`: refreshes the session cookie, reads the rider's `users.username` by id, and applies `gateDecision` from `src/lib/identity.ts` (no username → `/onboarding/username`; the paths allowed without one live only there). Skips static files, `/api/geocode*`, `/api/route`, and `/api/tiles/*`.
2. Pages under `src/app/` are server components that read with `createClient` from `@/lib/supabase/server`.
3. Interactive pieces are client components that write directly with `createClient` from `@/lib/supabase/client`. Reads of posts go through `@/lib/posts`; there are no server actions, and RLS in the migrations is the only authority on who can write what.

## Feature flows

**Feed** (`/`): `src/app/page.tsx` renders `SignedInHeader` + `PostComposer` for riders (viewer from `getViewer` in `src/lib/identity.ts`) and `PostFeed` for everyone. `PostFeed` (server) calls `listFeedPosts` from `@/lib/posts` (50 public posts with author, comment count, and the viewer's vote in one request) and renders a `PostCard` per post.

**Post card** (`src/components/post-card.tsx`, **server**): author, `<time>` from `formatPostTime` (`src/lib/format-time.ts`, always Asia/Manila), body, `PostMapPreview`, and an overlay link to `/p/{id}`. Interactive parts are client islands: `PostVoteControls` (instant update via `nextVote`, then adopts the server total from `setVote` in `src/lib/posts/votes.ts`; resets to fresh server props on refresh), `CommentThread` (50 comments per page via `listComments`/`addComment` in `src/lib/posts/comments.ts`, "show more", retry, chronological insert, `GuidePreview` per comment; `GuideMapBuilder` loaded with `next/dynamic` only after a signed-in rider opens it), `ShareButton` (a cancelled share does nothing).

**Focus view**: client navigation to `/p/[id]` is intercepted by `src/app/@modal/(.)p/[id]/page.tsx` → `FocusViewDialog` → `FocusView`; a direct load renders `FocusView` from `src/app/p/[id]/page.tsx`, which also emits link-preview metadata. Both fetch through `getPostById` in `@/lib/posts`. The interactive map is `FocusPostMap` in `src/components/map/`, loaded lazily via `LazyFocusPostMap`.

**Posting**: `PostComposer` inserts into `posts` (`user_id` defaults to `auth.uid()` in SQL), optionally with `map_data` from `PostMapBuilder` (loaded with `next/dynamic` on first open), then `router.refresh()`. The builder routes each consecutive pair of placed pins (`legOptions(POST_MAP_PAIR)`: car, expressways allowed) through `usePairRouting` (`use-pair-routing.ts`): state in `pair-routing-state.ts` (pairs keyed by their two slot keys and remembering the coordinates they were routed for; `sync` re-routes only pairs whose pin moved, a result for a superseded token is ignored, `unavailable` stops all requests for the session; `routingWork` says which requests to start and abort), the live map draws routing pairs dimmed and dashed, failed pairs dashed and straight, routed or unavailable pairs solid. Save waits while any pair is routing, stores failed pairs as `null`, and runs `fitPostMap` (`too-large` → asks the rider to remove pins). Reopening a draft keeps its stored paths and routes only its `null` pairs. Not yet built: debounce, abort-on-release scheduling, session cache, concurrency cap.

**Profile** (`/u/[username]`): the page reads the rider's `users` row, then their posts with `listPostsByAuthor` from `@/lib/posts` (author attached, not re-joined); `ProfileEditDialog` renders for the owner only and replaces photos through `replaceAvatar` in `src/lib/avatars.ts` (upload → update profile → on failure delete the new upload, on success delete the old own-folder photo).

**Session resilience**: both Supabase server clients use `fetchWithTimeout` (`src/lib/supabase/with-timeout.ts`, 5 s, request really cancelled). `getViewer` throws on network/timeout errors so pages can tell "couldn't confirm" from signed out; middleware then passes the request through without touching cookies. Sign-out is a 303 that ends only this device's session. The OAuth callback redirects with relative paths; its error codes live in `src/lib/auth-callback.ts`.

**Sign-in and identity**: `public.users` is the only home of username, display name, and avatar (ADR 0006). Email sign-up checks username availability, then passes `username`/`display_name` as sign-up metadata, which only the `handle_new_user` trigger reads (it lowercases, stores NULL if invalid or taken, defaults display name from the Google name). Google sign-in lands at `src/app/auth/callback/route.ts`, then `/onboarding/username` if `users.username` is NULL. `getViewer` in `src/lib/identity.ts` is the server read of the signed-in rider. Onboarding and profile edit write only `users`.

**Geocoding**: browser → `geocode` / `reverseGeocode` in `src/lib/geo/index.ts` → `/api/geocode` or `/api/geocode/reverse` → the shared `nominatim` instance from `createNominatimClient` in `src/lib/geo/nominatim.ts` (one serialized queue ≥1 s apart across both routes, max 4 waiting → 503, 8 s budget → 504, retries, LRU cache) → `label.ts` builds place labels. Request and response shapes are Zod schemas in `src/lib/schemas/geocode.ts`, shared by routes and the browser client. Builders use it through `LocationSearch` and map clicks.

**Routing** (ADR 0007): a builder (`usePairRouting` for post maps; `fetchRoute` in `src/lib/routing/client.ts` posts the request and parses the reply with `routeResponseSchema` / `routeErrorSchema`, `unavailable` being its own outcome) → `POST /api/route` (`src/app/api/route/route.ts`) → in order: signed-in check with the server Supabase client (401; middleware skips this route), per-rider 60/min counter in `src/lib/routing/rate-limit.ts` (429, in memory per instance), `routeRequestSchema` from `src/lib/schemas/route.ts` (2–12 points inside the Philippine bounds, `car`|`walk`, `expressways`; 400), straight-line span ≤ 500 km car / 25 km walk (400), `routerConfig()` in `src/lib/env.ts` (`ROUTER_URL` unset → 503 `unavailable`) → `requestRoute` in `src/lib/routing/valhalla.ts` (Valhalla `/route`, `auto`|`pedestrian`, vias as `through`, `use_tolls`/`use_highways`, `X-Router-Secret` header when `ROUTER_SECRET` is set, 5 s abort → 504, any other failure → 502) → `src/lib/map/path.ts` decodes the precision-6 shape, simplifies at 2 m, joins the ends to the requested points, and encodes precision 5. The answer is only `{ path, distanceKm, durationMin }`; every response is `no-store`; errors carry a `code` (`routeErrorCodeSchema`). `src/lib/map/path.ts` is the one place that encodes, decodes, simplifies, and joins paths (pure, shared with the browser). The local router is run by `scripts/router/` (`download.sh`, `build.sh`, `serve.sh`; data in `~/.cache/commutenity/router/`, see the README).

**Maps**: `@/components/map` is a server-safe barrel (static previews only). Feed thumbnails are `<img>` tiles + SVG drawn by `StaticTileCanvas` (`static-*-map.tsx` are thin mappers onto it). Every tile URL comes from `src/lib/map/tiles.ts` and is served by the caching, Philippines-only proxy `src/app/api/tiles/[z]/[x]/[y]/route.ts`. Live MapLibre (`MapView`) mounts only in the focus view and the two builders, loaded with `next/dynamic`; `react-map-gl` is re-exported only by `src/components/map/primitives.ts` for use inside the folder. Reading stored maps: `parsePostMap` / `parseGuide` (unknown newer versions show a placeholder). Stored paths: the thumbnail and `FocusPostMap` take the parsed `MapData`; the pure helpers in `post-map-geometry.ts` decode each pair's path (`decodePath`) into the drawn line (`postMapLinePoints`; a `null` or undecodable pair is the straight line between its pins) and frame the view on pins plus every path point (`postMapFramingPoints`, `fitPostMapToView` over the generic `fitPointsToView`, which guides reuse). The server-rendered thumbnail imports only the pure `path.ts`, so the feed bundle stays free of MapLibre.

## Edits that must land in several places

- **Post reads**: one selection in `src/lib/posts/select.ts`, the UI type `Post` in `src/lib/posts/types.ts` (normalized by `toPost`), reads in `src/lib/posts/queries.ts`. A new column is a `select.ts` + `types.ts` change; regenerate row types first if it's a new database column.
- **Map editing**: both builders run on one core: pure slot transitions, per-slot request tokens, and the Philippines bounds check in `src/components/map/map-editor-state.ts`; the `useMapEditor` hook (`use-map-editor.ts`) for active slot, picking, placement, reverse-geocode aborts, fly-to, and fitting the first camera to the seeded pins (or the `framingPoints` a builder passes, e.g. a draft's stored paths); shared `BuilderShell` and `SlotFields`. A placement or labeling fix goes there, not in a builder. Street-path routing state is a separate pure module per builder shape, not part of the slot state: `pair-routing-state.ts` for post-map pin pairs (see Posting).
- **Routing limits**: 2–12 points, the 500 km / 25 km spans, and the response shape live in `src/lib/schemas/route.ts`; the 60/min and 5 s limits in `src/lib/routing/` (`ROUTE_LIMIT`, `ROUTER_TIMEOUT_MS`); the 2 m simplification in the route handler. Philippine bounds are `PH_LAT_RANGE`/`PH_LNG_RANGE` from `post-map.ts`, reused by the route schema. Changing the profile or option mapping touches `valhallaRequestBody` in `src/lib/routing/valhalla.ts`.
- **Colours**: one source, `src/lib/map/colors.ts` (pin roles, post-map line, `modeColor`), used by thumbnails, live maps, and builders.
- **Username rules**: the regex lives in `src/lib/schemas/profile.ts` and the `users_username_format` CHECK, and `handle_new_user` re-checks it at sign-up.
- **Database error messages**: one mapper, `riderMessage` in `src/lib/errors.ts`, used by every form and write; add new error cases there, keyed on codes and the database's named exceptions (`username_cooldown`, `avatar_url_invalid`), never on loose message text. A new named exception raised in SQL needs a case there.
- **Limits shared with SQL**: post/comment body 500 and non-blank (`src/lib/schemas/post.ts` ↔ CHECKs), `map_data` ≤ 16 KB of jsonb (CHECKs in `content_limits`) ↔ `MAP_DATA_BUDGET_BYTES`, 12 KB of UTF-8 JSON, in `src/lib/map/fit-document.ts` (jsonb stores coordinates larger than their JSON text, up to about 3 KB more for a maximal guide, hence the headroom; `fitPostMap` / `fitGuide` re-simplify the longest paths at 5, 10, then 20 m before a save and report `too-large` past that; `tests/db/content-limits.test.ts` checks the budget against the real CHECK with maximal documents), Philippine pin bounds (`post-map.ts` ↔ reverse-geocode schema in `geocode.ts`), avatar types and 5 MiB (`src/lib/avatars.ts` ↔ bucket settings in `20261022000000_rider_write_guards.sql`), display name ≤ 40 (`profile.ts` ↔ `profile_limits`).
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
- `tests/unit/`: pure modules in Node (e.g. the error mapper, the path codec in `path.test.ts`).
- `tests/api/`: call route handlers directly with a `NextRequest` and spy on `fetch`; the routing test also stubs the session (`@/lib/supabase/server`) and the router environment.
- No component tests; client components have no injection seam yet.

## Keeping this file true

Update the affected section in the same change when you move a flow's owner, add a table or migration that alters one above, remove a duplication, or rename a code name in the first table.
