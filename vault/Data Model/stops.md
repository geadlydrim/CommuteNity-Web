# Entity: stops

#entity

Geocoded transit stops. Building blocks for [[routes]].

← [[Data Model Overview]] · [[Home]]

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `name` | text | Human-readable stop name |
| `location` | geography(Point, 4326) | PostGIS; lat/lng |
| `mode` | text enum | `jeepney`, `bus`, `mrt`, `lrt`, `uv_express`, `p2p`, `tricycle`, `walking` |
| `status` | text enum | `pending`, `approved`, `rejected` |
| `created_by` | uuid FK → [[users]] | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Indexes:** `location` (GIST), `mode`, `status`

---

## Relationships

```
stops ──< route_segments  (from_stop_id, to_stop_id)
stops }──< votes          (target_type='stop')
stops }──< edit_proposals (target_type='stop')
stops }──< reports
```

---

## Geospatial

"Stops near me" → `ST_DWithin(location, <user_point>, <radius_m>)`

---

## RLS

- Anon: read `approved`
- Auth: insert `pending`, update/delete own

---

## Related Modules

[[05 Stops]] · [[06 Map Integration]] · [[07 Voting & Moderation]]
