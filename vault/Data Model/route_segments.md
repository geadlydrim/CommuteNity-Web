# Entity: route_segments

#entity

Ordered stop-to-stop legs within a [[routes|route]].

← [[Data Model Overview]] · [[Home]]

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `route_id` | uuid FK → [[routes]] | |
| `sequence` | int | 0-indexed order |
| `from_stop_id` | uuid FK → [[stops]] | Boarding |
| `to_stop_id` | uuid FK → [[stops]] | Alighting |
| `fare` | numeric(8,2)? | PHP; null if unknown |
| `duration_minutes` | int? | Estimated travel time |
| `notes` | text? | Segment-specific tips |

**Unique constraint:** `(route_id, sequence)`

---

## Derived Data

Route polyline = walk segments in `sequence` order, chain `from_stop.location` → `to_stop.location`.

---

## Relationships

```
route_segments }──< edit_proposals  (target_type='segment')
route_segments >── routes           (route_id)
route_segments >── stops            (from_stop_id)
route_segments >── stops            (to_stop_id)
```

---

## Related Modules

[[04 Routes]] · [[06 Map Integration]] · [[08 Edit Proposals]]
