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

Next.js, Supabase (Postgres + PostGIS), MapLibre with OpenStreetMap tiles, Nominatim geocoding, and a self-hosted Valhalla router for street paths.

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

### Running the street-path router locally

Street paths come from [Valhalla](https://github.com/valhalla/valhalla), which only our server calls, through `/api/route` (ADR 0007). Without a router the app still works and draws straight lines. To run one on your machine you need Podman or Docker, about 4 GB of free memory for the build, and about 3 GB of disk. The scripts keep everything in `~/.cache/commutenity/router/` (override with `ROUTER_HOME`), never in the repo.

```bash
scripts/router/download.sh   # Philippines extract from Geofabrik, md5 checked (about 600 MB)
scripts/router/build.sh      # Valhalla tiles with the pinned ghcr.io/valhalla/valhalla:3.9.1 image, 4 GB cap
scripts/router/serve.sh      # starts the router on http://127.0.0.1:8002 (serve.sh stop ends it)
```

Then put `ROUTER_URL=http://127.0.0.1:8002` in `.env.local` and restart `npm run dev`. `CONTAINER_RUNTIME=docker` forces Docker; Podman is used when both are installed. Download and build are one-time steps; rerun them to refresh the OpenStreetMap data (bump `PBF_NAME` in `scripts/router/env.sh` when Geofabrik retires the pinned dated file).

`ROUTER_SECRET` is optional: when set, `/api/route` sends it to the router as an `X-Router-Secret` header for a front proxy to check. A stopped or unreachable router makes `/api/route` answer 502 or 504 within 5 seconds; with `ROUTER_URL` unset it answers 503.

### Rebuilding the rail file

MRT and LRT legs follow the track from `src/lib/rail/rail-lines.json`, a small committed file (about 7 KB, 4 KB gzipped) of MRT-3, LRT-1, and LRT-2 built from the same Geofabrik extract the router uses. It loads only with the guide builder and is never fetched from Overpass. Rebuild it when a station opens or a relation changes:

```bash
scripts/router/download.sh   # if you don't have the extract yet
scripts/rail/build-rail.sh   # needs python3; the first run makes a venv with pyosmium in ~/.cache/commutenity/rail/
```

The script reads the extract a few times (seconds), picks the lines' route relations by OSM ID, checks them against their `route_master`, and rewrites the file identically for the same extract. To add a line or direction, edit `LINES` in `scripts/rail/build_rail.py`. The data is © OpenStreetMap contributors under the ODbL; see `src/lib/rail/NOTICE.md`.

Other scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

### Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, build, and tests on every push and pull request. Set the repository variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (placeholders are used if unset; the build never contacts Supabase). Set the repository secret `SUPABASE_DB_URL` to run the database tests against that project inside rolled-back transactions; without it they are skipped.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. The rail lines in `src/lib/rail/rail-lines.json` are an extract of that data under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/) (see `src/lib/rail/NOTICE.md`).
