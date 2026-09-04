# Data Model

Supabase (Postgres + PostGIS). Source of truth for columns is `supabase/migrations/`. JSONB shapes are enforced in the app with Zod (`src/lib/schemas/`), not CHECK constraints beyond “object or null.”

There is **no** `route_stops` table and **no** `friends` table. `posts.visibility` allows `'friends'` but nothing implements it.

There is **no** client cache. Dexie is unused. Do not describe Room or WorkManager.

---

## Live (used by the web UI)

### `users`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Supabase Auth UID |
| `username` | text? | `^[a-z0-9_]{3,20}$`, unique. Null until OAuth onboarding. Middleware requires it for app use. |
| `username_changed_at` | timestamptz? | 30-day cooldown trigger |
| `display_name` | text? | Shown publicly |
| `avatar_url` | text? | Storage |
| `reputation` | int | Default 0. Column exists; **no profile UI** |
| `created_at` | timestamptz | |

Email lives in Auth, not this table. `handle_new_user` inserts a `public.users` row on signup.

### `posts`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → users) | Default `auth.uid()` |
| `body` | text | Length 1–500 |
| `visibility` | text | `'public'` \| `'friends'`. Only public is readable today |
| `net_votes` | int | Maintained by trigger on `post_votes` |
| `map_data` | jsonb? | Pin-list envelope; null = no map |
| `created_at` | timestamptz | |

RLS: read public; insert/delete own. No update policy (no edit-post).

`map_data` (Zod `src/lib/schemas/post-map.ts`): `{ version: 1, pins: Pin[] }` with 2–10 pins. Each pin: `lat`, `lng` (PH bounds), `label`, optional `sublabel`. `pins[0]` is origin, last is destination; roles are not stored.

### `post_votes`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `post_id` | uuid (FK → posts) | |
| `user_id` | uuid (FK → users) | |
| `value` | smallint | `+1` or `-1` |
| `created_at` | timestamptz | |

Unique `(post_id, user_id)`. RLS: read all; write own.

### `comments`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `post_id` | uuid (FK → posts) | |
| `author_id` | uuid (FK → users) | |
| `body` | text | Length 1–500 |
| `map_data` | jsonb? | Guide-map envelope when present |
| `created_at` | timestamptz | |

RLS: read all; insert/delete own.

`map_data` (Zod `src/lib/schemas/guide-map.ts`): versioned `kind: "guide"` document (legs + connectors). In flight; do not treat as Coordinator-closed.

### Storage

Avatars bucket (see `20260601120000_avatar_storage.sql`).

---

## Parked catalog (SQL exists, no screens)

Do not brief UI against these tables until Coordinator approves a route/stop feature.

### `stops`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | |
| `location` | geography(Point, 4326) | |
| `mode` | text | `jeepney`, `bus`, `mrt`, `lrt`, `uv_express`, `p2p`, `tricycle`, `walking` |
| `status` | text | `pending`, `approved`, `rejected` |
| `net_votes` | int | |
| `created_by` | uuid (FK → users) | |
| `created_at` / `updated_at` | timestamptz | |

Anon RLS reads **`approved` only**.

### `routes`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | e.g. "Cubao–Divisoria via España" |
| `mode` | text | Same enum as stops |
| `status` | text | pending / approved / rejected |
| `notes` | text? | |
| `net_votes` | int | |
| `created_by` | uuid (FK → users) | |
| `created_at` / `updated_at` | timestamptz | |

### `route_segments`

Ordered stop-to-stop legs. Unique `(route_id, sequence)`. Fares in PHP. Polyline would be derived from stop points — **not used in UI**.

### `edit_proposals`

`target_type`: `route` \| `stop` \| `segment`. `change_payload` jsonb. Status pending / approved / rejected. Approval merge is **not built**.

### `votes`

Catalog votes (not `post_votes`). Unique `(user_id, target_type, target_id)`. Trigger: net ≥ 5 auto-approve, ≤ −3 auto-reject.

### `reports`

Flags on catalog targets: `wrong_fare`, `outdated`, `duplicate`, `spam`, `other`. **No UI.**

---

## Relationships

```
users ──< posts
users ──< post_votes
users ──< comments
posts ──< post_votes
posts ──< comments

users ──< routes, stops, edit_proposals, votes, reports   (parked)
routes ──< route_segments
stops ──< route_segments (from_stop_id, to_stop_id)
```

---

## Catalog moderation (parked)

```
submit → pending → approved (net votes ≥ 5 or moderator)
                 → rejected (net votes ≤ −3 or moderator)
```

Feed posts are **not** in this machine. They are public on insert.

---

## Cache

None shipped. A web PWA/Dexie cache is parked with the offline module. Do not add IndexedDB in a work plan unless that module is approved.
