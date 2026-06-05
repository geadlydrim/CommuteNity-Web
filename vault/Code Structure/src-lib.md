# Code: src/lib/

#code

Shared utilities, Supabase clients, schemas, offline DB.

← [[Home]] · [[Tech Stack]]

---

## Current Files

```
src/lib/
├── utils.ts                    ← cn() helper (clsx + tailwind-merge)
├── schemas/
│   └── profile.ts              ← Zod: username + display_name validation
└── supabase/
    ├── client.ts               ← browser Supabase client
    ├── server.ts               ← server component Supabase client
    ├── middleware.ts            ← session refresh + cookie handling
    └── with-timeout.ts         ← fetch wrapper with timeout
```

---

## Planned

```
src/lib/
├── db/
│   ├── schema.ts               ← Dexie table definitions
│   └── index.ts                ← Dexie db instance
├── sync/
│   └── queue.ts                ← offline write queue
└── geo/
    └── geocode.ts              ← Nominatim wrapper
```

---

## Supabase Client Usage

| Context | Import from |
|---------|------------|
| Browser / Client Component | `src/lib/supabase/client.ts` |
| Server Component / Route Handler | `src/lib/supabase/server.ts` |
| Middleware | `src/lib/supabase/middleware.ts` |

---

## cn() Helper

```ts
import { cn } from "@/lib/utils"
// merge conditional Tailwind classes safely
```

---

## Related

[[src-app]] · [[src-components]] · [[Tech Stack]] · [[09 Offline PWA]] · [[01 Auth & Identity]]
