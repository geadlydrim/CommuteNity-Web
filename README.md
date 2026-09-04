# CommuteNity Web

Community web app for sharing commute knowledge in the Philippines (Metro Manila first). This repo **is** the product. Native Android/iOS are out of scope.

## Prerequisites

- Node 20 LTS (`fnm install 20 && fnm use 20`)
- npm 10+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your Supabase credentials
cp .env.example .env.local

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with Turbopack (fast rebuild) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript check without emitting files |

## Key dependencies

| Package | Purpose |
|---|---|
| `next` | Framework — App Router, SSR, API routes |
| `react` + `react-dom` | UI rendering |
| `@supabase/supabase-js` + `@supabase/ssr` | Database, auth, storage client |
| `react-hook-form` + `zod` | Forms and validation |
| `@hookform/resolvers` | Zod adapter for react-hook-form |
| `sonner` | Toast notifications |
| `radix-ui` | Headless UI primitives (via shadcn radix-nova style) |
| `next-themes` | Dark/light theme switching |
| `maplibre-gl` + `react-map-gl` | Maps (OpenStreetMap tiles, free) |
| `lucide-react` | Icons |
| `tailwind-merge` + `clsx` + `class-variance-authority` | Tailwind class utilities |

Installed but unused (do not treat as architecture): `@tanstack/react-query`, `zustand`, `dexie`, `dexie-react-hooks`, `next-pwa`.

## Deployment

Deployed on [Vercel](https://vercel.com). Every push to `main` triggers a production deploy.
Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings.

## Docs

Product docs live in `./docs/`. Project truth for agents: `.cursor/agents/STATUS.md`.
