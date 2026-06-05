# Module 1 — Auth & Identity

#module

**Purpose:** Account creation, session management, public handle.

← [[Home]]

---

## Status

| Requirement | Done? |
|-------------|-------|
| Email + password sign-up | ✅ |
| Sign-in with email | ✅ |
| Sign-out | ✅ |
| `@supabase/ssr` cookie sessions + middleware | ✅ |
| `username` column (regex + uniqueness) | ✅ |
| `display_name` at sign-up | ✅ |
| `handle_new_user` DB trigger | ✅ |
| Google OAuth sign-in | ✅ |
| Edit username / display_name (30-day cooldown) | ✅ |
| Password reset flow | ❌ |

---

## Key Files

```
src/app/(auth)/sign-in/page.tsx
src/app/(auth)/sign-up/page.tsx
src/app/auth/callback/route.ts          ← OAuth callback handler
src/app/auth/sign-out/route.ts
src/app/onboarding/username/page.tsx    ← OAuth users pick handle here
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/middleware.ts
src/middleware.ts                        ← gate: username required
src/lib/schemas/profile.ts              ← Zod schema for edit form
src/components/google-sign-in-button.tsx
```

---

## Auth Flow

```mermaid
flowchart TD
    A[User visits app] --> B{Has session?}
    B -- No --> C[Sign-in / Sign-up page]
    C --> D{Method}
    D -- Email/Password --> E[Supabase Auth]
    D -- Google OAuth --> F[Google → callback/route.ts]
    E --> G{Has username?}
    F --> G
    G -- No --> H[/onboarding/username]
    H --> I[App]
    G -- Yes --> I
```

---

## DB Side

- `public.users` row created by `handle_new_user` Postgres trigger on `auth.users` insert
- Username 30-day cooldown enforced by DB trigger (not app logic)
- Email / credentials live in Supabase Auth — NOT in `public.users`

---

## Open Questions

- Reserved-username blocklist? (avoided via `/u/` prefix for now)

---

## Related

[[users]] · [[03 Profile & Reputation]] · [[src-lib]] · [[src-app]]
