# MVP Scope

CommuteNity is a **Next.js web app** in this repo. Native Android and iOS are out of scope.

`.cursor/agents/STATUS.md` wins if this file and the repo disagree.

## Current promise (this MVP)

Share commute knowledge for Metro Manila on a **public web feed**. Riders post tips, maps, and comments. Anyone can read without an account. Signing in lets you post, vote, and comment.

This is **not** a turn-by-turn navigator and **not** a searchable route catalog yet.

### In scope (load-bearing now)

1. **Public feed** — landing page of public posts (anon + signed-in). Composer 1–500 characters. Post cards, comments, up/down votes, share.
2. **Identity** — email + password and Google OAuth. Public username + display name. Profile at `/u/{username}`. Avatar.
3. **Maps on posts** — optional ordered pin list (origin → waypoints → destination) with static preview in the feed and an interactive map in focus.
4. **Post focus** — overlay and permalink `/p/{id}` so a post can be shared.

Guide maps on comments (`kind: "guide"`) are **in flight**. They attach to this MVP; they are not a new product.

### Geography and modes

**Metro Manila (NCR)** first.

Modes the product already names (badges, guide-map builder, parked route tables): jeepney, city bus, MRT, LRT, UV Express, P2P, tricycle, walking. E-bike / pedicab later. Grab / ride-hailing out of scope.

---

## Parked (later modules — not this MVP)

Postgres already has `routes`, `stops`, `route_segments`, `votes`, `edit_proposals`, `reports`. **Schema is not a product.** Do not treat those tables as a decision to build UI.

Parked until Coordinator approves a brief:

- Route search / multi-leg commute plans
- Browse routes and stop detail
- Submit or edit community routes and stops
- Route/stop voting and flags UI
- Offline / PWA (Dexie and `next-pwa` are installed, unused)
- Password reset, delete-own-post UI, friends visibility, feed pagination, reputation UI

---

## Out of scope

| Feature | Reason |
|---|---|
| Native Android or iOS app | This repo is the product |
| Turn-by-turn live navigation | Needs real-time GPS; different product |
| Real-time vehicle location | Needs hardware or third-party feeds |
| Payments / fare collection | Regulatory, out of lane |
| In-app chat | Feed comments are enough |
| Ride-hailing | Separate category |
| Admin dashboard UI | Supabase dashboard for now |

The sibling folder `../CommuteNity/` is a Compose Hello World scaffold. It is not a client and not a TWA.

---

## Definition of done (current MVP)

- A visitor can read the Metro Manila feed without signing in.
- A new user can sign up (email or Google), pick a username, and publish a post others can open via `/p/{id}`.
- A signed-in user can attach a pin-list map to a post and see it in the feed and in focus.

**Not** this MVP’s done-when: a beta user finding a commute by origin/destination, or submitting a route correction into `routes` / `stops`. That is the parked catalog milestone.
