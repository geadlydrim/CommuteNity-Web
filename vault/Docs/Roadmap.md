# Roadmap

#doc

Module-based. Pick any module, ship in any order.

← [[Home]]

---

## Progress Overview

```
Module 1  Auth & Identity          ████████░░  80%  🚧
Module 2  Social Feed              ██████░░░░  60%  🚧
Module 3  Profile & Reputation     ███████░░░  70%  🚧
Module 4  Routes                   ░░░░░░░░░░   0%
Module 5  Stops                    ░░░░░░░░░░   0%
Module 6  Map Integration          ░░░░░░░░░░   0%
Module 7  Voting & Moderation      ░░░░░░░░░░   0%
Module 8  Edit Proposals           ░░░░░░░░░░   0%
Module 9  Offline / PWA            ░░░░░░░░░░   0%  (Sprint 3)
Module 10 Infrastructure & Polish  ████░░░░░░  40%  🚧
```

---

## Active Work

- [[01 Auth & Identity]] — password reset remaining
- [[02 Social Feed]] — likes, comments, delete not started
- [[03 Profile & Reputation]] — bio, counts, reputation score not started

---

## Next Up (suggested)

1. [[04 Routes]] — schema migration first, then browse + detail
2. [[05 Stops]] — unblocks route building
3. [[06 Map Integration]] — needed for stop pin-drop

---

## Blocked / Deferred

- [[09 Offline PWA]] — `next-pwa@5.6.0` friction with Next 15; deferred Sprint 3
- Testing setup — deferred (no test suite yet)

---

## Cross-Module Notes

- Schema ref: [[Data Model Overview]]
- Scope boundary: [[MVP Scope]]
- Out of scope: real-time GPS, in-app chat, payments, iOS, MRT/LRT live boards
