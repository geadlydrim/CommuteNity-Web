# Backend Decision

## Constraint

Free or near-zero cost at startup stage. Must handle: user auth, geospatial route/stop data, community contribution workflow (CRUD + moderation), and offline sync from an Android client.

---

## Candidates

### Option A: Firebase (Firestore + Auth + Storage + Crashlytics)

| Factor | Detail |
|---|---|
| **Free tier** | Spark plan: 1 GB Firestore storage, 50K reads/day, 20K writes/day, 10 GB/month transfer. No credit card required. |
| **Auth** | Firebase Auth — email/password + Google OAuth out of the box. Best-in-class Android SDK. |
| **Geo queries** | Firestore has no native geo query. Workaround: store a **Geohash** string on each stop/route and range-query on it. GeoFlutterFire / GeoFirestore-style patterns needed. Imprecise at geohash boundaries. |
| **Data model fit** | Document model works for routes/stops but `route_segments` as sub-collections is awkward; complex queries (e.g. "all routes passing through stop X") require denormalization. |
| **Moderation triggers** | Cloud Functions (free tier: 2M invocations/month) can run vote-threshold logic. |
| **Offline** | First-class Firestore offline persistence — automatic. |
| **Lock-in** | High. Firestore API is proprietary; migration to another DB is a full rewrite. |
| **Cost at scale** | Spark free tier is tight. Paid (Blaze) is pay-per-use — can spike unexpectedly on write-heavy community activity. |

**Verdict:** Great for quick-start, great offline story, bad geo queries, high lock-in, unpredictable scaling costs.

---

### Option B: Supabase (Postgres + PostGIS + Auth + Storage + Edge Functions)

| Factor | Detail |
|---|---|
| **Free tier** | 500 MB Postgres, 1 GB file storage, 50K MAU auth, 500K Edge Function invocations/month. **Pauses after 1 week of inactivity** on free tier — can be worked around with a scheduled ping. |
| **Auth** | Supabase Auth — email/password + Google OAuth. JWT-based. Android client via `supabase-kt` (official Kotlin SDK, actively maintained). |
| **Geo queries** | Full **PostGIS** support. Native `ST_DWithin`, `ST_Distance`, `ST_Intersects`. Geo queries are first-class SQL. |
| **Data model fit** | Relational Postgres is a natural fit for the route → segments → stops model with FK constraints and joins. |
| **Moderation triggers** | Postgres functions + triggers handle auto-approve logic server-side. Edge Functions for complex workflows. |
| **Offline** | No first-party offline cache. Must implement with Room + WorkManager on Android side. Supabase Realtime can push updates when back online. |
| **Lock-in** | Low. Standard Postgres — export your data and run elsewhere anytime. |
| **Cost at scale** | Pro plan ($25/month) removes inactivity pause and increases limits. Very predictable. |

**Verdict:** Best fit for geospatial data model and relational schema. Low lock-in. Offline requires more Android-side work but is doable with Room.

---

### Option C: Cloudflare (Workers + D1 + R2 + KV)

| Factor | Detail |
|---|---|
| **Free tier** | 100K Worker requests/day, 5 GB D1 storage, 10 GB R2 storage — very generous. |
| **Auth** | No native auth service. Would need to build JWT-based auth or bolt on a third-party (e.g. Clerk free tier). Extra setup. |
| **Geo queries** | D1 is SQLite — no PostGIS, no native geo extensions. Would need to precompute geohashes or store bounding boxes. Awkward. |
| **Data model fit** | SQLite is fine for the schema but lacks Postgres features (e.g. `ON CONFLICT DO UPDATE`, some window functions). |
| **Offline** | No SDK. Full custom implementation. |
| **Lock-in** | Medium. Workers/D1 are proprietary but SQLite data is portable. |

**Verdict:** Cheapest infra but too much glue code for auth and geo. Not the right tradeoff for an early-stage app.

---

### Option D: Offline-First (Room only, sync deferred)

| Factor | Detail |
|---|---|
| **Cost** | Zero. No backend. |
| **Community loop** | Cannot work — community features (contributions, votes, shared routes) require a shared backend. |

**Verdict:** Not viable for a community-driven app. Ruled out.

---

## Recommendation: Supabase

**Supabase is the best fit for CommuteNity at MVP stage.**

Reasons:
1. **PostGIS** makes geospatial queries (nearby stops, routes within a bounding box) trivial and correct. This is a core need for a navigation app.
2. **Relational model** maps directly to the `routes → route_segments → stops` schema without denormalization workarounds.
3. **Low lock-in** — standard Postgres; migrate anytime.
4. **`supabase-kt`** is an official, actively-maintained Kotlin SDK for Android.
5. **Free tier** is sufficient for early beta. Inactivity pause is a minor operational nuisance (set up a GitHub Action or cron to ping the health endpoint weekly).
6. **Predictable cost** — $25/month Pro plan when ready to remove the pause.

**Accepted tradeoff:** Offline mode requires more work on the Android side (Room + WorkManager). This is a known, bounded engineering problem.

---

## Map Provider Decision

> **ASSUMPTION — confirm with owner.** Mapping is needed for stop pins, route polylines, and origin/destination search.

| Provider | Free tier | Notes |
|---|---|---|
| **Google Maps SDK** | $200/month credit; ~28K map loads/month free | Usage-based after free credit; can surprise on viral growth |
| **MapLibre + OpenStreetMap** | Free (OSM tiles from public servers; or self-host) | Open-source, no API key, no quota. Slightly less polished UX. **Recommended for MVP.** |
| **Mapbox** | 50K free map loads/month | Generous free tier; commercial license required above threshold |

**Recommendation for MVP: MapLibre GL JS with OSM tile source.** Zero cost, no quota surprise, full feature set for drawing polylines and markers. Switch to Google Maps or Mapbox later if UX requires it.

> Note: Geocoding (text → coordinates for origin/destination search) still needs a provider. **Nominatim** (free OSM geocoder, rate-limited to 1 req/s) works for MVP; move to Photon or a paid geocoder under load.

---

## Summary Decision Table

| Concern | Decision |
|---|---|
| Backend | Supabase (Postgres + PostGIS) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Client SDK | `@supabase/supabase-js` + `@supabase/ssr` |
| Maps | MapLibre GL JS + OSM tiles |
| Geocoding | Nominatim via Next.js API route proxy (free, rate-limited) |
| Offline storage | IndexedDB via Dexie.js |
| Background sync | Service Worker + Background Sync API (foreground fallback for Safari) |
| Hosting | Vercel (free tier, preview deploys per PR) |
| Analytics / crash | Sentry (free tier, 5k errors/month) + Vercel Web Analytics |
