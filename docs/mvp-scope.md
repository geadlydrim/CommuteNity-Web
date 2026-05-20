# MVP Scope

## In Scope

These are the minimum features that make CommuteNity useful and differentiated. Each is load-bearing — removing any breaks the core community-navigation promise.

### 1. Route Search
- User enters origin and destination (text search against known stops).
- App returns one or more commute plans composed of transit legs.
- Each leg shows: transit mode, boarding stop, alighting stop, approximate fare, estimated travel time.
- Supports mixed-mode routes (e.g. tricycle → jeepney → MRT → walking).

### 2. Route & Stop Browsing
- Browse all approved routes by mode or geographic area.
- View route detail: full stop sequence, fares per segment, community notes, last updated.
- View stop detail: name, coordinates, routes that serve it, community tips.
- Anonymous access allowed — no account required to read.

### 3. Community Contribution
- Authenticated users can:
  - Submit a new route (name, mode, stop sequence, per-segment fares).
  - Submit a new stop (name, map pin, mode).
  - Propose an edit to an existing route or stop.
- Submissions enter a **pending** state until approved by community vote or a moderator.

### 4. Voting & Trust Signals
- Authenticated users can upvote or downvote any route, stop, or edit proposal.
- Contributions above a vote threshold auto-approve; below a threshold auto-reject.
- Users can flag content for moderator review (wrong fare, duplicate, spam, outdated).

### 5. User Accounts
- Sign-up / sign-in via email+password and Google OAuth.
- Profile page: display name, contribution count, reputation score.
- Reputation grows with approved contributions and shrinks with rejected ones.
- Reputation gate: minimum score required to submit (prevents anonymous spam).

### 6. Offline-Ready Browsing
- Recently viewed routes and stops are cached locally (Room).
- User can browse cached content without an internet connection.
- Sync on reconnect.

---

## Transit Modes Supported at MVP

> **ASSUMPTION — confirm with owner.** Proposed MVP-required modes:

| Mode | MVP? | Notes |
|---|---|---|
| Jeepney | Yes | Highest volume informal transit |
| Bus (city) | Yes | EDSA and major corridors |
| MRT/LRT | Yes | Fixed routes, easily verified |
| UV Express / FX | Yes | Major origin-destination routes |
| P2P Bus | Yes | Increasingly popular |
| Tricycle | Yes | Last-mile — common but hyperlocal |
| Walking leg | Yes | Required to connect modes |
| E-bike / pedicab | Nice-to-have | Defer to later sprint |
| Grab / ride-hailing | Out of scope | Separate product category |

---

## Explicitly Out of Scope for MVP

| Feature | Reason |
|---|---|
| Turn-by-turn live navigation | Requires real-time GPS tracking, far more complex, higher infra cost |
| Real-time bus/jeepney location | Requires vehicle GPS hardware or integrations; not feasible at startup |
| Payments / fare collection | Regulatory complexity, out of product lane |
| In-app chat or social feed | Community focus is on route data, not social networking |
| iOS app | Kotlin/Android-first; iOS is post-MVP |
| Web app | Same; mobile-first |
| Admin dashboard UI | Manual moderation via Supabase dashboard in MVP |

---

## Definition of Done for MVP

- All five In-Scope feature areas have at least one happy-path user story with passing acceptance criteria.
- A beta user can find a valid Metro Manila commute route without speaking to the developer.
- A beta user can submit a route correction and see it reflected after community approval.
