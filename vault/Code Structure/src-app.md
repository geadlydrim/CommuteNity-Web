# Code: src/app/

#code

Next.js 15 App Router pages. File-based routing.

← [[Home]] · [[Tech Stack]]

---

## Current Structure

```
src/app/
├── layout.tsx                  ← root layout; global providers go here
├── page.tsx                    ← landing page + global feed
├── globals.css                 ← CSS vars for Tailwind theme tokens
├── (auth)/
│   ├── sign-in/page.tsx
│   └── sign-up/page.tsx
├── auth/
│   ├── callback/route.ts       ← OAuth callback (Google)
│   └── sign-out/route.ts
├── onboarding/
│   └── username/
│       ├── page.tsx
│       └── onboarding-form.tsx
└── u/
    └── [username]/page.tsx     ← public profile page
```

---

## Planned Routes

```
src/app/
├── routes/
│   ├── page.tsx                ← browse routes
│   └── [id]/page.tsx           ← route detail
├── stops/
│   └── [id]/page.tsx           ← stop detail
├── contribute/
│   ├── route/page.tsx          ← Add Route wizard
│   ├── stop/page.tsx           ← Add Stop
│   └── edit/page.tsx           ← Suggest Edit sheet
└── api/
    └── geocode/route.ts        ← Nominatim proxy
```

---

## Key Conventions

- Route groups `(auth)` — grouped for layout, no URL segment
- Server Components by default; add `"use client"` only when needed
- API routes: `route.ts` files under `api/`

---

## Related

[[src-components]] · [[src-lib]] · [[01 Auth & Identity]] · [[02 Social Feed]] · [[03 Profile & Reputation]] · [[06 Map Integration]]
