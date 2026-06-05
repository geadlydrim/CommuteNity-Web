# Module 5 — Stops

#module

**Purpose:** Geocoded transit stops as building blocks for routes.

← [[Home]]

---

## Status

All requirements **not started**.

| Requirement | Done? |
|-------------|-------|
| Schema migration: `stops` table | ❌ |
| RLS: anon reads approved; auth inserts pending | ❌ |
| Add Stop screen (name + map pin + mode) | ❌ |
| Stop detail screen (pin, mode, routes serving it) | ❌ |
| Geospatial "stops near me" (PostGIS `ST_DWithin`) | ❌ |

---

## Planned Files

```
src/app/stops/[id]/page.tsx             ← stop detail
src/app/contribute/stop/page.tsx        ← add stop
src/components/stop/StopPin.tsx
```

---

## Data Entity

[[stops]] — PostGIS `geography(Point, 4326)`, mode enum, status enum.

---

## Geospatial

Uses PostGIS `ST_DWithin` for radius queries. Index: GIST on `location`.

---

## Open Questions

- Stop creation inline during route building vs require pre-existing?

---

## Related

[[stops]] · [[04 Routes]] · [[06 Map Integration]] · [[07 Voting & Moderation]]
