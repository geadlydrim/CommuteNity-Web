# Product

## Pitch

CommuteNity is a community web app for Filipino commuters. Mainstream maps cover highways and rail; informal transit (jeepneys, tricycles, UV Express) still lives in riders' heads. CommuteNity is where riders publish what they know as posts, maps, and comments, starting with Metro Manila. Over time, that knowledge should become a searchable catalog of routes and stops.

## Problem

Philippine commuting is fragmented: many modes, few official schedules, fares that change without notice, routes that exist mainly as oral knowledge. Newcomers, provincial travelers, and balikbayans get lost, overpay, or board the wrong jeepney because there is no trusted place to read how a trip actually works.

## Riders

| Persona | Who | Needs now |
|---|---|---|
| **Daily Rider** | Regular Metro Manila commuter; knows their corridor, not every corridor | Post or comment a correction others will see |
| **New Arrival** | Student, returning OFW, provincial transplant; thin mental map | Read recent posts and maps for a place they must reach |
| **Knowledge Holder** | Long-time rider who knows shortcuts, cheap fares, seasonal changes | Easy posting and a public username to be known by |
| **Occasional Commuter** | Drives most days; takes transit when forced; jargon-averse | A simple feed and maps that need no transit expertise to read |

Riders use a browser, often on a phone. No persona assumes a native app or offline access.

## Geography and modes

Metro Manila first; provincial areas later. Modes: jeepney, bus, MRT, LRT, UV Express, P2P, tricycle, walking. E-bike and pedicab may come later. Ride-hailing is not a mode here.

## Scope

### Now

- **Feed**: public posts anyone can read without an account; signed-in riders post, comment, vote, and share.
- **Identity**: email or Google sign-in, a public username and display name, a profile page, an avatar.
- **Post maps**: a post can carry a post map.
- **Guides**: a comment can carry a guide.
- **Focus view**: any post opens in focus and has its own shareable link.

Trust comes from post votes and comments.

### Later (parked, not cancelled)

- **Catalog**: search an origin and destination, browse routes and stops, contribute and correct them, catalog votes and reports, rider reputation. Catalog tables already exist in the database; that is not a decision to build the UI.
- **Offline browsing** as a web app.
- **Friends-only posts.**

### Out

| | Why |
|---|---|
| Native Android or iOS app | The web app is the product |
| Turn-by-turn navigation, live GPS | Different product |
| Real-time vehicle locations | Needs hardware or third-party feeds |
| Fare payments | Regulatory; out of lane |
| Ride-hailing | Separate category |
| In-app chat | Comments are enough |
| In-app admin dashboard | Moderation happens in the Supabase dashboard |
