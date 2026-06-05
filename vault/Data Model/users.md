# Entity: users

#entity

`public.users` — mirrored from `auth.users` via DB trigger.

← [[Data Model Overview]] · [[Home]]

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | Supabase Auth UID |
| `username` | text | Unique, regex-validated, 30-day cooldown on change |
| `display_name` | text | Shown publicly |
| `avatar_url` | text? | Supabase Storage URL |
| `reputation` | int | Default 0 |
| `created_at` | timestamptz | |

Email + credentials live in `auth.users` — NOT here.

---

## Created By

`handle_new_user` Postgres trigger fires on `auth.users` INSERT → creates row here.

---

## Relationships

```
users ──< routes          (created_by)
users ──< stops           (created_by)
users ──< edit_proposals  (proposed_by, reviewed_by)
users ──< votes           (user_id)
users ──< reports         (reported_by)
```

---

## Reputation

- `+1` per approved [[edit_proposals]]
- `-1` per rejected [[edit_proposals]]
- Threshold gates: minimum score to submit (TBD for MVP)

---

## Related Modules

[[01 Auth & Identity]] · [[03 Profile & Reputation]] · [[07 Voting & Moderation]]
