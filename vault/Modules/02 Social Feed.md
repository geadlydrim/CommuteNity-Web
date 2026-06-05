# Module 2 — Social Feed

#module

**Purpose:** Community foundation. Identity attaches to posts.

← [[Home]]

---

## Status

| Requirement | Done? |
|-------------|-------|
| `posts` table + RLS | ✅ |
| Post composer (1–500 chars) | ✅ |
| Toast on success/fail | ✅ |
| Global public feed (anon + auth) | ✅ |
| `PostCard` → `/u/{username}` | ✅ |
| Profile feed at `/u/{username}` | ✅ |
| Likes (`likes` table + heart) | ❌ |
| Comments / replies | ❌ |
| Delete-own-post button | ❌ |
| Friends visibility | ❌ |
| Feed pagination / infinite scroll | ❌ |
| Realtime updates (Supabase channel) | ❌ |

---

## Key Files

```
src/app/page.tsx                        ← landing + global feed
src/components/post-feed.tsx
src/components/post-card.tsx
src/components/post-composer.tsx
src/app/u/[username]/page.tsx           ← profile feed
```

---

## Data Flow

```mermaid
flowchart LR
    Composer --> |INSERT posts| Supabase
    Supabase --> |SELECT posts| Feed
    Feed --> PostCard
    PostCard --> |link| UserProfile[/u/username]
```

---

## RLS Rules

- **Read:** public (anon allowed)
- **Insert:** auth users only, own row
- **Update/Delete:** own rows only

---

## Open Questions

- Edit post or preserve post integrity? (current: no edit, full delete only)

---

## Related

[[users]] · [[03 Profile & Reputation]] · [[src-components]] · [[10 Infrastructure & Polish]]
