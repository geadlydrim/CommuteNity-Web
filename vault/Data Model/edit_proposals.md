# Entity: edit_proposals

#entity

Field-level corrections to existing approved content. Applied only after approval.

← [[Data Model Overview]] · [[Home]]

---

## Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | |
| `target_type` | text enum | `route`, `stop`, `segment` |
| `target_id` | uuid | FK to target table |
| `proposed_by` | uuid FK → [[users]] | |
| `change_payload` | jsonb | Partial object of proposed changes |
| `status` | text enum | `pending`, `approved`, `rejected` |
| `reviewed_by` | uuid? FK → [[users]] | null = auto-approved by votes |
| `net_votes` | int | Denormalized |
| `created_at` | timestamptz | |
| `resolved_at` | timestamptz? | |

---

## On Approval

Backend merges `change_payload` into target row. `resolved_at` set. `proposed_by` gets `+1` reputation.

---

## Relationships

```
edit_proposals >── users            (proposed_by, reviewed_by)
edit_proposals }──< votes          (target_type='edit_proposal')
edit_proposals → routes            (target_type='route')
edit_proposals → stops             (target_type='stop')
edit_proposals → route_segments    (target_type='segment')
```

---

## Related Modules

[[08 Edit Proposals]] · [[07 Voting & Moderation]] · [[03 Profile & Reputation]]
