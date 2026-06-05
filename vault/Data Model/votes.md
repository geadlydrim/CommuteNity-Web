# Entity: votes

#entity

One vote per user per target. Powers the moderation threshold system.

← [[Data Model Overview]] · [[Home]]

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → [[users]] | |
| `target_type` | text enum | `route`, `stop`, `edit_proposal` |
| `target_id` | uuid | FK to target |
| `value` | smallint | `+1` upvote or `-1` downvote |
| `created_at` | timestamptz | |

**Unique constraint:** `(user_id, target_type, target_id)` — one vote per user per target

---

## Trigger Behavior

After INSERT/UPDATE/DELETE:
1. Recalculate `net_votes` on target row
2. Check threshold:
   - `net_votes >= 5` → auto-approve target
   - `net_votes <= -3` → auto-reject target

---

## Targets

- [[routes]]
- [[stops]]
- [[edit_proposals]]

---

## Related Modules

[[07 Voting & Moderation]] · [[04 Routes]] · [[05 Stops]] · [[08 Edit Proposals]]
