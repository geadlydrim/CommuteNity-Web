# Backlog

Coordinator-owned. Planner proposes; Coordinator moves items.

## Approved (not started)

None. Route/stop modules are **documented and parked**, not approved as the next build.

## Parked (later / needs a brief)

- Password reset
- Delete own post (RLS ready)
- Friends visibility (`friends` table + RLS + composer control)
- Feed pagination / infinite scroll; realtime
- Profile: bio, joined date, counts, reputation UI
- Route module UI (schema exists; no `route_stops` table)
- Stop module UI + “stops near me”
- Edit proposals UI
- Route/stop voting + flags UI
- Offline / PWA as **web** (Dexie + SW; Next 15 vs `next-pwa` still open) — not current MVP
- Wire TanStack Query + decide first Zustand store (installed, unused)
- Geocode: personal ranking, viewport bias, keyboard dropdown, client cache
- Unify `TRANSIT_MODES` and guide `MODE_META`
- Bottom nav / PWA shell (`--nav-height` token already exists)
- Tests
- Sibling `../CommuteNity/` Android scaffold / possible future TWA — **not this repo**; do not brief here

## Rejected / out of scope (do not brief)

- Native Android client (Kotlin/Compose, Room, WorkManager, `supabase-kt`)
- Live GPS / turn-by-turn
- Fare payments
- Ride-hailing
- In-app chat
- iOS native
- Admin dashboard UI (Supabase dashboard for MVP)
