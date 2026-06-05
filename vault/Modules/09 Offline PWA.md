# Module 9 — Offline / PWA

#module

**Purpose:** Mid-commute reliability when connection drops.

← [[Home]]

---

## Status

All requirements **not started** (deferred — Sprint 3).

| Requirement | Done? |
|-------------|-------|
| Dexie (IndexedDB) schema in `src/lib/db/` | ❌ |
| Cache routes + stops on view | ❌ |
| Service Worker via `next-pwa` | ❌ |
| "Cached" indicator + last-synced timestamp | ❌ |
| Offline notice on search with no connection | ❌ |
| Background sync queue for pending writes | ❌ |

---

## Planned Files

```
src/lib/db/schema.ts                    ← Dexie table definitions
src/lib/db/index.ts                     ← Dexie db instance
src/lib/sync/queue.ts                   ← offline write queue
next.config.ts                          ← next-pwa config
```

---

## Cache Strategy

| Entity | Strategy | TTL |
|--------|----------|-----|
| `routes` (approved) | Cache on view; prefetch top-N by area | 24h |
| `stops` | Cache on view + with parent route | 24h |
| `route_segments` | Always with parent route | 24h |
| `votes` | Write-through; queue if offline | sync on reconnect |
| `edit_proposals` | Read: cache recent; Write: queue | sync on reconnect |
| `reports` | Write-only; queue if offline | sync on reconnect |

---

## Known Friction

`next-pwa@5.6.0` has known issues with Next.js 15 App Router. Alternative: `@serwist/next`. Decision deferred to Sprint 3.

---

## Related

[[routes]] · [[stops]] · [[route_segments]] · [[10 Infrastructure & Polish]] · [[MVP Scope]]
