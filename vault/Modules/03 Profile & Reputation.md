# Module 3 — Profile & Reputation

#module

**Purpose:** Public identity surface. Tracks contribution impact via reputation.

← [[Home]]

---

## Status

| Requirement | Done? |
|-------------|-------|
| `/u/{username}` route | ✅ |
| Case-insensitive username lookup | ✅ |
| Signed-in header links own profile | ✅ |
| Onboarding `/onboarding/username` | ✅ |
| Avatar upload (Supabase Storage) | ✅ |
| Own vs other profile UX | ✅ |
| Edit display_name / username dialog | ✅ |
| Bio field | ❌ |
| Joined date, post count, follower/following counts | ❌ |
| Reputation score | ❌ |
| Contribution breakdown (approved/pending/rejected) | ❌ |

---

## Key Files

```
src/app/u/[username]/page.tsx           ← profile page (server component)
src/app/onboarding/username/page.tsx
src/app/onboarding/username/onboarding-form.tsx
src/components/signed-in-header.tsx
src/components/profile-edit-dialog.tsx
src/components/user-avatar.tsx
src/lib/schemas/profile.ts             ← Zod: username/display_name validation
```

---

## Reputation Model

Reputation lives on [[users]].`reputation` (int, default 0).

```
+1  contribution approved
-1  contribution rejected
```

Post-MVP: reputation tiers + Senior Contributor auto-approve.

---

## Open Questions

- Reputation tiers + privileges — post-MVP

---

## Related

[[users]] · [[01 Auth & Identity]] · [[07 Voting & Moderation]] · [[08 Edit Proposals]] · [[src-components]]
