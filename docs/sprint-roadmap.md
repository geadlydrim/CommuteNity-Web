# Sprint Roadmap

High-level plan from current scaffold to a usable community-navigation MVP. Each sprint is ~2 weeks. Stories reference `user-stories.md`.

---

## Sprint 0 — Scoping (current)

**Goal:** Establish product direction, data model, tech stack, and backlog before writing any domain code.

**Deliverables:**
- `docs/product-vision.md`
- `docs/mvp-scope.md`
- `docs/user-stories.md`
- `docs/data-model.md`
- `docs/backend-decision.md`
- `docs/sprint-roadmap.md`

**Done when:** Owner reviews and approves all six documents.

---

## Sprint 1 — Foundation: Auth + Read-Only Browsing

**Goal:** A working app that lets users sign in and browse approved routes/stops. No contributions yet. Establishes all architectural patterns for subsequent sprints.

**Architecture decisions to lock in this sprint:**
- Framework: **Next.js 15 App Router** (file-based routing, Server + Client Components)
- State (server): **TanStack Query** (caches Supabase reads, handles loading/error states)
- State (client): **Zustand** (search input, UI state, draft forms)
- Auth: **Supabase Auth + `@supabase/ssr`** (HTTP-only cookie sessions, Google OAuth redirect)
- Networking: **`@supabase/supabase-js`** (PostgREST client)
- Maps: **MapLibre GL JS + react-map-gl**

**User Stories:** US-013, US-014 (auth), US-005, US-006 (route/stop detail), US-004 (browse by mode), US-001 (route search — basic text match, no multi-mode graph yet)

**Key Screens:**
- Splash / onboarding
- Sign-in / sign-up
- Home / search
- Route detail
- Stop detail
- Browse (filter by mode)

**Infra:**
- Supabase project created; schema migrated (all tables from `data-model.md`)
- Row-Level Security (RLS) policies: anyone reads `approved` rows; authenticated users write `pending` rows.
- Seed data: ~10 Metro Manila routes for testing

**Sprint 1 Done when:** A signed-in user can search for and view a Metro Manila jeepney route end-to-end in a browser via the Vercel preview URL.

---

## Sprint 2 — Community: Contributions + Voting

**Goal:** Users can submit routes/stops, propose edits, and vote. Auto-approve threshold works.

**User Stories:** US-007, US-008, US-009 (contributions), US-010, US-011, US-012 (voting), US-002 (multi-mode routes)

**Key Screens:**
- Add Route wizard (stops picker + fare entry)
- Add Stop screen (map pin drop)
- Propose Edit sheet (edit individual fields)
- Route/Stop detail: vote buttons, flag button, pending badge
- Contribution status view ("My Submissions")

**Backend:**
- Postgres trigger: auto-approve when `net_votes >= 5`; auto-reject when `net_votes <= -3`
- `edit_proposals` apply logic: on approval, merge `change_payload` into target row
- Reputation update function: +1 on approval, -1 on rejection

**Sprint 2 Done when:** A Knowledge Holder can submit a new jeepney route, two other users upvote it, it auto-approves, and it appears in search results.

---

## Sprint 3 — Polish: Offline, Profile, Moderation UX

**Goal:** Offline works, profile is visible, flagged content has a review path, and the app is beta-ready.

**User Stories:** US-003 (offline), US-015 (profile), US-016 (offline cache)

**Scope:**
- Dexie (IndexedDB) entities wired to all pages; Service Worker sync on reconnect
- Profile screen: reputation, contribution count, breakdown of approved vs pending vs rejected
- Report flow: flag → reason selection → report submitted; Supabase dashboard for manual moderator review
- Empty states, error states, loading states across all screens
- App icon, splash screen, onboarding slides

**Sprint 3 Done when:**
- App works correctly with no network connection for previously loaded content.
- A beta user (not the developer) can sign up, find a route, submit a correction, and track its status — without assistance.

---

## Post-MVP Backlog (not scheduled)

| Feature | Notes |
|---|---|
| Real-time route condition updates | Requires push infra (FCM) + contribution type for "condition" |
| Geospatial search ("stops near me") | PostGIS `ST_DWithin` already in schema; needs map-based search UI |
| Moderator role + in-app moderation queue | Currently deferred to Supabase dashboard |
| Provincial expansion | Data model supports it; needs bootstrap community in new areas |
| Reputation tiers + privileges | E.g. "Senior Contributor" can approve without vote threshold |
| iOS app | Kotlin Multiplatform Mobile (KMM) or React Native rewrite |
| MRT/LRT real-time departure boards | Requires official DOTC/LRTA API or scraping |
| Route difficulty / accessibility tags | Useful for PWD/elderly commuters |

---

## Dependency Map

```
Sprint 0 (Scoping)
    └── Sprint 1 (Foundation)
            ├── Sprint 2 (Community)
            │       └── Sprint 3 (Polish)
            └── Sprint 3 (Offline requires Room from Sprint 1)
```

Sprint 2 and Sprint 3 are mostly parallel after Sprint 1 — offline/profile work doesn't block the contribution feature.
