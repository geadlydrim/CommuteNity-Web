# Entity: reports

#entity

User flags on any content. Moderator reviews via Supabase dashboard (no in-app UI for MVP).

← [[Data Model Overview]] · [[Home]]

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `reported_by` | uuid FK → [[users]] | |
| `target_type` | text enum | `route`, `stop`, `edit_proposal` |
| `target_id` | uuid | |
| `reason` | text enum | `wrong_fare`, `outdated`, `duplicate`, `spam`, `other` |
| `notes` | text? | Optional elaboration |
| `status` | text enum | `open`, `resolved`, `dismissed` |
| `created_at` | timestamptz | |

---

## Targets

- [[routes]]
- [[stops]]
- [[edit_proposals]]

---

## Related Modules

[[07 Voting & Moderation]]
