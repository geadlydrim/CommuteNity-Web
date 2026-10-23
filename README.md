# CommuteNity

A community web app where Filipino commuters share how trips actually work, starting with Metro Manila.

Mainstream maps cover highways and rail. Jeepneys, tricycles, and UV Express still live in riders' heads: which corner to stand on, which signboard to look for, what the fare is this month. CommuteNity is a place to write that down, so the next rider doesn't have to ask strangers.

> **Status: in active development.** Expect frequent changes.

## What you can do

- **Read without an account.** The feed of commute posts is public.
- **Sign up** with email or Google and pick a public username.
- **Post a tip** of up to 500 characters, optionally with a map: drop an origin, a destination, and stops in between.
- **Comment with a guide.** Lay out a trip leg by leg (walk, then jeepney, then bus), with transfers between legs.
- **Vote and share.** Upvote what's useful, and send anyone a direct link to a post.
- **Keep a profile** with your display name, avatar, and posts.

## What's coming

Maps whose lines follow the streets, then a searchable catalog of routes and stops that the community builds and verifies together.

## Built with

Next.js, Supabase (Postgres + PostGIS), MapLibre with OpenStreetMap tiles, and Nominatim geocoding.

## Run it locally

You need Node 20+, npm 10+, and a Supabase project.

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and anon key
npx supabase link --project-ref <your-project-ref>
npx supabase db push         # apply supabase/migrations to your project
npm run dev                  # http://localhost:3000
```

`GEOCODER_USER_AGENT` must identify your deployment and include a contact (`Name/version (https://… or email)`), as required by [Nominatim's](https://operations.osmfoundation.org/policies/nominatim/) and [OpenStreetMap's tile](https://operations.osmfoundation.org/policies/tiles/) usage policies. Geocoding and map tiles go through the app's own server routes with this agent; in production they fail with 502 until it's set.

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

### Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, build, and tests on every push and pull request. Set the repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (placeholders are used if unset; the build never contacts Supabase). Set the repository secret `SUPABASE_DB_URL` to run the database tests against that project inside rolled-back transactions; without it they are skipped.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
