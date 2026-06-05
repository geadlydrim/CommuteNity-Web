# Entity: routes

#entity

Community-maintained transit routes.

← [[Data Model Overview]] · [[Home]]

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `name` | text | e.g. "Cubao–Divisoria via España" |
| `mode` | text enum | `jeepney`, `bus`, `mrt`, `lrt`, `uv_express`, `p2p`, `tricycle`, `walking` |
| `status` | text enum | `pending`, `approved`, `rejected` |
| `notes` | text? | Community notes |
| `net_votes` | int | Denormalized; updated by trigger on [[votes]] |
| `created_by` | uuid FK → [[users]] | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## Relationships

```
routes ──< route_segments  (route_id)
routes }──< votes          (target_type='route')
routes }──< edit_proposals (target_type='route')
routes }──< reports
```

---

## Moderation

Follows [[Data Model Overview#Moderation State Machine]].

`net_votes` trigger:
- `>= 5` → auto-approve
- `<= -3` → auto-reject

---

## RLS

- Anon: read `approved` rows
- Auth: insert `pending`, update/delete own

---

## Related Modules

[[04 Routes]] · [[07 Voting & Moderation]] · [[08 Edit Proposals]]
