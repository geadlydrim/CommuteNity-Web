# Data Model Overview

#entity #doc

← [[Home]]

---

## Entity Map

```mermaid
erDiagram
    users ||--o{ routes : "created_by"
    users ||--o{ stops : "created_by"
    users ||--o{ edit_proposals : "proposed_by"
    users ||--o{ votes : "user_id"
    users ||--o{ reports : "reported_by"

    routes ||--o{ route_segments : "route_id"
    stops ||--o{ route_segments : "from_stop_id"
    stops ||--o{ route_segments : "to_stop_id"

    routes ||--o{ votes : "target_id"
    stops ||--o{ votes : "target_id"
    edit_proposals ||--o{ votes : "target_id"

    routes ||--o{ edit_proposals : "target_id"
    stops ||--o{ edit_proposals : "target_id"
    route_segments ||--o{ edit_proposals : "target_id"

    routes ||--o{ reports : "target_id"
    stops ||--o{ reports : "target_id"
    edit_proposals ||--o{ reports : "target_id"
```

---

## Entities

| Entity | Purpose |
|--------|---------|
| [[users]] | Identity, reputation |
| [[routes]] | Transit route definitions |
| [[stops]] | Geocoded transit stops |
| [[route_segments]] | Ordered legs within a route |
| [[edit_proposals]] | Pending field-level corrections |
| [[votes]] | Upvote/downvote → moderation triggers |
| [[reports]] | Flags for moderator review |

---

## Moderation State Machine

```mermaid
stateDiagram-v2
    [*] --> Pending : submit
    Pending --> Approved : net_votes ≥ 5 OR moderator
    Pending --> Rejected : net_votes ≤ -3 OR moderator
    Approved --> [*] : visible in app
    Rejected --> [*] : hidden, audit trail kept
```

Applies to: [[routes]], [[stops]], [[edit_proposals]]

---

## Offline Cacheability

| Entity | Strategy | TTL |
|--------|----------|-----|
| `routes` (approved) | Cache on view | 24h |
| `stops` | Cache on view + with route | 24h |
| `route_segments` | Always with parent route | 24h |
| `votes` | Write-through; queue offline | reconnect |
| `edit_proposals` | Read: cache recent | reconnect |
| `reports` | Write-only; queue offline | reconnect |
| `users` | Cache own; others on demand | — |

See [[09 Offline PWA]] for implementation.
