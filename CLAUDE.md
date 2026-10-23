# CLAUDE.md

Guidance for agents in this repository. Code is the source of truth; docs carry context the code can't.

## Commands

```bash
npm run dev          # dev server on http://localhost:3000 (Turbopack)
npm run build        # production build (fetches Google Fonts; needs network)
npm run lint         # ESLint
npm run typecheck    # TypeScript check without emitting files
npm test             # Vitest: unit, route-handler, and database tests (see docs/codemap.md → Tests)
npm run db:types     # regenerate src/lib/supabase/database.types.ts from SUPABASE_DB_URL; run after every migration
```

`database.types.ts` is generated; never hand-edit it.

## Read first

- `docs/product.md`: what the product is, who it's for, scope (now / later / out)
- `GLOSSARY.md`: domain language; use these terms in code, issues, and UI copy
- `docs/adr/`: decisions that look odd without context; don't "fix" them silently
- `docs/codemap.md`: before locating code for a feature, tracing a flow, or editing something duplicated; maps glossary terms to code names and lists edits that must land in several files. Update it in the same change when those move.

## Conventions

- **Stack:** Next.js 15 App Router (`src/app/`), React 19, Tailwind v4 + shadcn/ui (`radix-nova`), Supabase via `@/lib/supabase/server` and `@/lib/supabase/client`. Path alias `@/*` → `src/*`. Combine classes with `cn()` from `@/lib/utils`.
- **shadcn:** add primitives with `npx shadcn@4 add <component>`; never hand-edit `src/components/ui/`. The `shadcn` package is also a build input (its stylesheet is imported by `globals.css`), so keep it in dependencies.
- **Maps:** `react-map-gl` is imported only inside `src/components/map/` (through `./primitives`). Outside that folder, import the server-safe barrel `@/components/map` (static previews) and load interactive maps and builders by path with `next/dynamic`, so the feed ships no MapLibre code. Feed cards use static tile thumbnails; live MapLibre maps only in the focus view and the builders (ADR 0005). Every tile goes through `/api/tiles` (`src/lib/map/tiles.ts`); colours come from `src/lib/map/colors.ts` (ADR 0003).
- **Geocoding:** browsers call `/api/geocode` and `/api/geocode/reverse` through `@/lib/geo`; never call Nominatim or any other public geo service from the browser (ADR 0003).
- **Map data:** `posts.map_data` and `comments.map_data` are versioned JSON documents. The shape lives in Zod (`src/lib/schemas/`): read with `parsePostMap` / `parseGuide` (they handle every version ever written and report newer ones), write the `CURRENT_*_VERSION`, and to change the shape add a version plus a migrate step (ADR 0004). Pin bounds are the Philippines; don't silently widen them.
- **Migrations:** add a new file under `supabase/migrations/`; never edit an applied one. Keep the `handle_new_user` and username-cooldown triggers intact.
- **Styling tokens:** brand, mode, and status colors are CSS variables in `src/app/globals.css`. Vote green/red is not a brand color.

## Guardrails

- The catalog (routes, stops, segments, edit proposals, reports, catalog votes) and offline browsing are parked. Catalog tables exist in the database; don't build UI on them or add client caching/state/offline libraries without asking.
- `posts.visibility = 'friends'` has no backing table or policy; don't write it.
- Native Android/iOS work is out of scope (ADR 0001).

## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/<feature>/` (gitignored). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
