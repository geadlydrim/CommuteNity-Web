# Module 4 — Routes

#module

**Purpose:** Submit and browse community-maintained transit routes.

← [[Home]]

---

## Status

All requirements **not started**.

| Requirement | Done? |
|-------------|-------|
| Schema migration: `routes`, `route_segments`, `route_stops` | ❌ |
| RLS: anon reads approved; auth inserts pending | ❌ |
| Add Route wizard | ❌ |
| Route detail screen | ❌ |
| Browse by mode filter | ❌ |
| Basic text route search | ❌ |
| Multi-mode route results | ❌ |
| Seed: ~10 Metro Manila jeepney routes | ❌ |
| Empty state with contribute prompt | ❌ |

---

## Planned Files

```
src/app/routes/page.tsx                 ← browse
src/app/routes/[id]/page.tsx            ← detail
src/components/route/RouteCard.tsx
src/components/route/SegmentList.tsx
src/app/contribute/route/page.tsx       ← Add Route wizard
```

---

## Data Entities

- [[routes]] — name, mode, status, net_votes
- [[route_segments]] — ordered stop-to-stop legs, fare, duration
- [[stops]] — boarding/alighting points

---

## Route Search (MVP)

Text match against stop names → origin + destination pair → walk `route_segments` to assemble legs.

Routing graph deferred to post-MVP (see [[MVP Scope]]).

---

## Open Questions

- Edit-route proposals in this module or [[08 Edit Proposals]]?
- Text match only or routing graph for search?

---

## Related

[[routes]] · [[route_segments]] · [[stops]] · [[05 Stops]] · [[06 Map Integration]] · [[07 Voting & Moderation]] · [[08 Edit Proposals]]
