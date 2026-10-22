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

`GEOCODER_USER_AGENT` in `.env.local` must identify your deployment and include a contact, as required by [Nominatim's usage policy](https://operations.osmfoundation.org/policies/nominatim/).

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
