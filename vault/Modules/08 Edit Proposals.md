# Module 8 — Edit Proposals

#module

**Purpose:** Field-level corrections without overwriting approved data.

← [[Home]]

---

## Status

All requirements **not started**.

| Requirement | Done? |
|-------------|-------|
| Schema: `edit_proposals` table | ❌ |
| "Suggest Edit" sheet on route detail | ❌ |
| Approved edits merge `change_payload` into target row | ❌ |
| Reputation effect (+1 approve / -1 reject) | ❌ |
| Existing approved row unchanged until edit approved | ❌ |

---

## Planned Files

```
src/app/contribute/edit/page.tsx        ← suggest edit sheet
src/components/route/SuggestEditSheet.tsx
```

---

## Data Entity

[[edit_proposals]] — stores `change_payload` as JSONB. On approval, backend merges payload into target row.

Targets: [[routes]], [[stops]], [[route_segments]]

---

## Reputation Impact

```
proposal approved  →  +1 reputation on [[users]]
proposal rejected  →  -1 reputation on [[users]]
```

---

## Open Questions

- Edit MVP scope: fare fields only, or all fields?

---

## Related

[[edit_proposals]] · [[routes]] · [[stops]] · [[route_segments]] · [[07 Voting & Moderation]] · [[03 Profile & Reputation]]
