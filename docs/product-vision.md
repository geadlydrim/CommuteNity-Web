# Product Vision

## Elevator Pitch

CommuteNity is a community web app for Filipino commuters. Mainstream maps cover highways and rail; informal transit — jeepneys, tricycles, UV express — still lives in riders’ heads. CommuteNity is where those riders publish what they know: a feed of tips, maps, and comments, Metro Manila first. Later, that knowledge should become a searchable route catalog. Today, people share; they do not yet look up a canned itinerary.

## Problem

Philippine commuting is fragmented: many modes, few official schedules, fares that change without notice, routes that exist mainly as oral knowledge. Newcomers, provincial travelers, and balikbayans get lost, overpay, or board the wrong jeepney because there is no trusted place to read how a trip actually works.

## Solution

A **web app** (this repo) where:

- **Riders share what they know** — public posts, comments, votes, and maps (pin lists on posts; multi-leg guides on comments when that work ships).
- **Anyone can read** — no account to browse the feed.
- **Identity is public and durable** — username, display name, profile, avatar.
- **A route catalog may come later** — tables for routes and stops exist; there is no search or contribute UI. That module is parked, not cancelled.

Trust starts as feed votes and comments. Catalog reputation and route flags are parked with the catalog.

## Target Personas

| Persona | Description | Core need now | Later (parked catalog) |
|---|---|---|---|
| **The Daily Rider** | Regular Metro Manila commuter; knows their corridor, not every corridor. | Post or comment a correction others will see. | Fast lookup of an unfamiliar O/D with current fares. |
| **The New Arrival** | Student, OFW returnee, provincial transplant. Thin mental map. | Read recent posts and maps for a place they must reach. | Step-by-step catalog legs they can follow. |
| **The Knowledge Holder** | Long-time rider who knows shortcuts, cheap fares, seasonal changes. | Easy posting and comments; a public handle. | Structured route/stop submit + credit for approvals. |
| **The Occasional Commuter** | Drives most days; transit when forced. Jargon-averse. | Simple feed and maps; no transit-expert UI required to read. | Plain “where do I board” on a route detail screen. |

Personas do **not** assume a native app or offline cache. The product is used in a browser (including phone browsers). Offline is a parked web-PWA idea, not a promise.

## Geography

**Metro Manila (NCR)** first. Provincial expansion later.

## Success metrics

**Current MVP (feed):**

- A visitor understands the homepage as a commute community, not an empty marketing page.
- Signed-up users can publish a post (with or without a map) that another person can open from a link.
- Knowledge Holders return to comment or vote, not only to lurk.

**Later catalog milestone (not current MVP):**

- Community can submit and approve structured routes.
- A lookup for a tested Metro Manila origin–destination pair returns a usable plan most of the time.
- Flag → fix on catalog data has a defined cycle.

Do not use catalog metrics to judge the feed MVP.
