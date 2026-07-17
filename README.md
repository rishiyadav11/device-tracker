# DeviceTracker

Track your laptop and phone's location from any browser. Register an
account, add a device from the browser you want to track, grant it location
access once, and check in on it later from the dashboard — including
on-demand with "Locate now".

**Platform note:** browsers don't allow real always-on background GPS access
(especially iOS Safari). A device reports its location when its tab/installed
app is open, on an interval while open, and can be nudged to report
immediately via "Locate now" — which it picks up next time it's open.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Auth.js (NextAuth v5) — email/password
- NeonDB (serverless Postgres) + Drizzle ORM
- Leaflet + OpenStreetMap for maps
- Deploys on Vercel

## 1. Set up NeonDB

1. Create a free project at [console.neon.tech](https://console.neon.tech).
2. Open **Connection Details** and copy the pooled connection string
   (`postgresql://...`).

## 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

- `DATABASE_URL` — the Neon connection string from step 1.
- `AUTH_SECRET` — generate with `npx auth secret`, or any random 32+ byte string.
- `NEXTAUTH_URL` — `http://localhost:3000` locally; your Vercel URL in production.

## 3. Install dependencies and push the schema

```bash
npm install
npm run db:push
```

`db:push` creates the `users`, `devices`, `locations`, and `ping_requests`
tables in your Neon database from `lib/schema.ts`. Re-run it any time the
schema changes (or use `npm run db:generate` to produce versioned migrations
instead, if you prefer that workflow).

## 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, then
add a device from the browser you want to track (it will prompt for location
permission).

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in [Vercel](https://vercel.com/new).
3. In the project's **Environment Variables**, add `DATABASE_URL`,
   `AUTH_SECRET`, and `NEXTAUTH_URL` (set to your production URL, e.g.
   `https://your-app.vercel.app`).
4. Deploy. Vercel builds and redeploys automatically on every push to `main`.
5. Run `npm run db:push` once (locally, pointed at the same `DATABASE_URL`)
   to make sure the production database has the schema.

## Icons

`public/icon.svg` is a placeholder app icon. Swap it (and update
`public/manifest.json` / the `icons` field in `app/layout.tsx`) with your own
branded icon set before shipping this for real.

## Project structure

```
app/
  (marketing) page.tsx, login/, register/
  dashboard/            device list, device detail, add-device flow
  api/auth/             Auth.js + registration
  api/devices/          device CRUD, location reporting, locate-now ping
lib/
  db.ts, schema.ts      Neon + Drizzle
  auth.ts               Auth.js config
  device-secret.ts      per-device bearer token hashing
  device-client.ts      browser-side geolocation capture/report helpers
  queries.ts            shared Drizzle queries
components/
  device-agent.tsx      background reporting + ping polling (runs on every page)
  device-map*.tsx        Leaflet map (client-only)
  device-detail.tsx      device page UI incl. "Locate now"
public/
  manifest.json, sw.js  PWA installability
```
