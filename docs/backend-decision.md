# Backend Decision

Historical comparison. **Accepted stack is in the summary table.** Client and offline rows were written for an Android app; that plan is dead. This repo is a Next.js web app.

## Constraint

Free or near-zero cost at startup. Must handle: user auth, a social feed, geospatial data (now as post/comment maps; later as routes/stops if that module is approved), and community writes with RLS.

Native Android sync is not a constraint.

---

## Candidates (historical)

### Option A: Firebase (Firestore + Auth + Storage + Crashlytics)

| Factor | Detail |
|---|---|
| **Free tier** | Spark plan: 1 GB Firestore storage, 50K reads/day, 20K writes/day, 10 GB/month transfer. No credit card required. |
| **Auth** | Firebase Auth — email/password + Google OAuth. |
| **Geo queries** | No native geo query. Geohash workarounds. Imprecise at cell boundaries. |
| **Data model fit** | Awkward for `route_segments` and “routes through stop X.” |
| **Moderation triggers** | Cloud Functions. |
| **Offline** | First-class Firestore persistence (was attractive for a native client). |
| **Lock-in** | High. |
| **Cost at scale** | Blaze can spike on write-heavy community traffic. |

**Verdict:** Rejected. Geo and relational fit are poor for this domain.

### Option B: Supabase (Postgres + PostGIS + Auth + Storage + Edge Functions)

| Factor | Detail |
|---|---|
| **Free tier** | Postgres + file storage + auth. Free tier may pause after inactivity. |
| **Auth** | Supabase Auth — email/password + Google OAuth. JWT. **Shipped client:** `@supabase/supabase-js` + `@supabase/ssr` (cookies). |
| **Geo queries** | PostGIS (`ST_DWithin`, etc.). |
| **Data model fit** | Relational model fits feed tables and the parked `routes → route_segments → stops` graph. |
| **Moderation triggers** | Postgres functions + triggers (catalog vote thresholds already exist in SQL). |
| **Offline** | No first-party cache. A web PWA (Dexie / service worker) was discussed and **not built**. |
| **Lock-in** | Low. Standard Postgres. |
| **Cost at scale** | Predictable Pro plan when needed. |

**Verdict:** Accepted. Reasons 4–6 in older drafts cited `supabase-kt` and Room; ignore those. The web client is the only client.

### Option C: Cloudflare (Workers + D1 + R2 + KV)

Rejected: no native auth, no PostGIS, too much glue.

### Option D: Local-only (no backend)

Rejected: a community product needs a shared database. (The old name for this option was “Room only.”)

---

## Recommendation: Supabase (unchanged)

1. **PostGIS** for anything spatial.
2. **Relational Postgres** for posts, comments, and the parked route graph.
3. **Low lock-in.**
4. **JS/SSR client** matches this repo.
5. Free tier is enough for early use; ping or Pro if pause becomes a problem.

**Not accepted:** Android Room + WorkManager, `supabase-kt`, Dexie, or `next-pwa` as current architecture. Dexie and `next-pwa` remain unused dependencies.

---

## Map Provider Decision

| Provider | Notes |
|---|---|
| **Google Maps SDK** | Usage-based after credit; can surprise. |
| **MapLibre + OpenStreetMap** | Free OSM tiles, no API key. **Shipped.** |
| **Mapbox** | Free tier then commercial license. |

**Geocoding:** Nominatim via Next.js `/api/geocode` and `/api/geocode/reverse` (1 req/s, PH-restricted). Move to Photon or a paid geocoder under load.

---

## Summary Decision Table

| Concern | Decision | Shipped? |
|---|---|---|
| Backend | Supabase (Postgres + PostGIS) | Yes |
| Auth | Supabase Auth (email/password + Google) | Yes |
| Client SDK | `@supabase/supabase-js` + `@supabase/ssr` | Yes |
| Maps | MapLibre GL JS + OSM tiles, imported from `@/components/map` | Yes |
| Geocoding | Nominatim via Next.js API proxy | Yes |
| Hosting | Vercel | Intended |
| Offline / PWA | Parked. Dexie and `next-pwa` unused. Do not plan as infra. | No |
| Analytics / crash | Not wired | No |
| Native Android / iOS | Out of scope | — |
