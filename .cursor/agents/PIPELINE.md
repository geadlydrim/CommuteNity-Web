# Pipeline

One active feature at a time unless Coordinator says otherwise.

## Active

**Guide maps on comments** — `in-progress` (implementation, not Coordinator-closed)

- Intent: commenters attach a multi-leg, multi-modal guide map (`kind: "guide"`), distinct from post pin-lists.
- Touches: `src/lib/schemas/guide-map.ts`, `src/components/map/guide-*`, `location-search.tsx`, `static-guide-map.tsx`, `post-card.tsx`, `post-composer.tsx`, `post-modal.tsx`, `supabase/migrations/20260609000000_comment_map_data.sql`, geocode route.
- Next: finish wiring → Verifier → Coordinator updates STATUS + `docs/plan.md`.
- Inbox: none yet (work started before this board).

## Queued

Empty. New work needs a Planner brief and Coordinator approval.

## Recently closed

**Web-first living docs** — `done` (2026-09-04)

- Reason: Planner rewrite matches STATUS. Feed is current MVP; catalog parked; native out. No Design, no Schema, no further role.
- Close packet: [2026-09-04-web-first-docs.coordinator-to-user.md](inbox/2026-09-04-web-first-docs.coordinator-to-user.md)
