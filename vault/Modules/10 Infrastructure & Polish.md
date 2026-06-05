# Module 10 — Infrastructure & Polish

#module

**Purpose:** Cross-cutting quality bar. Foundational setup.

← [[Home]]

---

## Status

| Requirement | Done? |
|-------------|-------|
| Tailwind v4 + shadcn radix-nova | ✅ |
| Supabase project + `@supabase/ssr` sessions | ✅ |
| Sonner toaster wired in layout | ✅ |
| TanStack Query provider in `layout.tsx` | ❌ |
| Zustand stores in `src/stores/` | ❌ |
| Error / loading / empty states | ❌ |
| App icon, splash screen | ❌ |
| Onboarding slides for new users | ❌ |
| Testing setup | ❌ (deferred) |

---

## Key Files

```
src/app/layout.tsx                      ← root layout; add providers here
src/app/globals.css                     ← CSS variables for theme tokens
src/lib/utils.ts                        ← cn() helper
src/middleware.ts                       ← Supabase session + username gate
next.config.ts
components.json                         ← shadcn config
```

---

## State Management

| Concern | Tool |
|---------|------|
| Server/remote data | TanStack Query |
| Client UI state | Zustand (`src/stores/`) |
| Forms | react-hook-form + Zod |

---

## Adding shadcn Components

```bash
npx shadcn@latest add <component>
```
Drops into `src/components/ui/`. Do NOT hand-edit — re-generate instead.

---

## Commands

```bash
npm run dev        # http://localhost:3000 (Turbopack)
npm run build
npm run lint
npm run typecheck
```

---

## Related

[[src-app]] · [[src-components]] · [[src-lib]] · [[Tech Stack]] · [[Home]]
