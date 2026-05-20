# Data Model

Entities, fields, relationships, and notes on moderation state and cacheability. Targets Supabase (Postgres + PostGIS) but is backend-agnostic until the backend decision is confirmed.

---

## Entities

### `users`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Supabase Auth UID |
| `display_name` | text | Shown publicly |
| `avatar_url` | text? | Optional profile photo |
| `reputation` | int | Default 0; increases on approval, decreases on rejection |
| `created_at` | timestamptz | |

**Notes:**
- Email and auth credentials live in Supabase Auth, not this table.
- `reputation` gates contribution access (minimum threshold TBD, e.g. 0 for MVP).

---

### `stops`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | Human-readable stop name |
| `location` | geography(Point, 4326) | PostGIS point; lat/lng |
| `mode` | text (enum) | `jeepney`, `bus`, `mrt`, `lrt`, `uv_express`, `p2p`, `tricycle`, `walking` |
| `status` | text (enum) | `pending`, `approved`, `rejected` |
| `created_by` | uuid (FK → users) | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Indexes:** `location` (GIST), `mode`, `status`.

---

### `routes`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | e.g. "Cubao–Divisoria via España" |
| `mode` | text (enum) | Primary mode for the route |
| `status` | text (enum) | `pending`, `approved`, `rejected` |
| `notes` | text? | Community notes on the route overall |
| `net_votes` | int | Denormalized; updated by trigger on `votes` table |
| `created_by` | uuid (FK → users) | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `route_segments`

Ordered list of stop-to-stop legs within a route.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `route_id` | uuid (FK → routes) | |
| `sequence` | int | Order of this segment in the route (0-indexed) |
| `from_stop_id` | uuid (FK → stops) | Boarding stop |
| `to_stop_id` | uuid (FK → stops) | Alighting stop |
| `fare` | numeric(8,2)? | In PHP; null if unknown |
| `duration_minutes` | int? | Estimated travel time |
| `notes` | text? | Segment-specific tips |

**Constraint:** `(route_id, sequence)` unique.

**Derived:** The full polyline of a route is assembled by walking `route_segments` in `sequence` order and resolving `from_stop.location` / `to_stop.location`.

---

### `edit_proposals`

Tracks community edits to existing routes/stops before they're applied.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `target_type` | text (enum) | `route`, `stop`, `segment` |
| `target_id` | uuid | FK to the target table |
| `proposed_by` | uuid (FK → users) | |
| `change_payload` | jsonb | Partial object of the proposed field changes |
| `status` | text (enum) | `pending`, `approved`, `rejected` |
| `reviewed_by` | uuid? (FK → users) | Null = auto-approved by votes |
| `net_votes` | int | Denormalized |
| `created_at` | timestamptz | |
| `resolved_at` | timestamptz? | |

**On approval:** The backend applies `change_payload` to the target row. `resolved_at` is set.

---

### `votes`

One row per user per target. Supports both route/stop votes and edit-proposal votes.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → users) | |
| `target_type` | text (enum) | `route`, `stop`, `edit_proposal` |
| `target_id` | uuid | FK to the target table |
| `value` | smallint | `+1` (upvote) or `-1` (downvote) |
| `created_at` | timestamptz | |

**Constraint:** `(user_id, target_type, target_id)` unique — one vote per user per target.
**Trigger:** After insert/update/delete, recalculate `net_votes` on the target row and check auto-approve threshold.

---

### `reports`

User flags on any content.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `reported_by` | uuid (FK → users) | |
| `target_type` | text (enum) | `route`, `stop`, `edit_proposal` |
| `target_id` | uuid | |
| `reason` | text (enum) | `wrong_fare`, `outdated`, `duplicate`, `spam`, `other` |
| `notes` | text? | Optional elaboration |
| `status` | text (enum) | `open`, `resolved`, `dismissed` |
| `created_at` | timestamptz | |

---

## Entity Relationships

```
users ──< routes (created_by)
users ──< stops (created_by)
users ──< edit_proposals (proposed_by, reviewed_by)
users ──< votes (user_id)
users ──< reports (reported_by)

routes ──< route_segments (route_id)
stops ──< route_segments (from_stop_id, to_stop_id)

routes }──< votes (target_type='route')
stops }──< votes (target_type='stop')
edit_proposals }──< votes (target_type='edit_proposal')

routes }──< edit_proposals (target_type='route')
stops }──< edit_proposals (target_type='stop')
route_segments }──< edit_proposals (target_type='segment')

routes }──< reports
stops }──< reports
edit_proposals }──< reports
```

---

## Moderation State Machine

```
              submit
[Draft] ──────────────> [Pending]
                            │
              vote threshold │ +5 net votes
              OR moderator  ▼
              approval ──> [Approved]  ──> visible in app
                            │
              vote threshold │ –3 net votes
              OR moderator  ▼
              rejection ──> [Rejected]  ──> hidden, stays for audit
```

Thresholds are app config, not hardcoded. Start conservative (e.g. 5 upvotes to approve, 3 net-negative to reject).

---

## Offline Cacheability

| Entity | Cache strategy | Notes |
|---|---|---|
| `routes` (approved) | Cache on view; prefetch top-N by area | TTL: 24h |
| `stops` | Cache on view and as part of route | TTL: 24h |
| `route_segments` | Always cached with parent route | |
| `votes` | Write-through; queue vote if offline | Sync on reconnect |
| `edit_proposals` | Read: cache recent; Write: queue offline | |
| `reports` | Write-only; queue if offline | |
| `users` | Cache own profile; read-others on demand | |

Local storage: **Room** with entities mirroring the above schema. Sync via **WorkManager** periodic sync + foreground sync on app open.
