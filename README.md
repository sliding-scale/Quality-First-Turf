# Quality First Turf — intake & on-site visit app

A Next.js + Convex app with two audiences:

- **Customers** fill in a discovery form (`/`): contact details, property address, services wanted, and per-service questions. On submit a project is saved and a draft quote is pushed to Jobber.
- **Sales staff** sign in (`/visit`), open a project, verify and measure on site (property, services/areas, photos & notes), and re-draft the quote in Jobber.

## Stack

Next.js 16 (App Router, `cacheComponents`, Turbopack), React 19, Tailwind 4 (plus a large hand-written `app/globals.css`), Convex backend, `lucide-react` icons. Jobber GraphQL API for clients/quotes.

> Next.js 16 has breaking changes versus older versions. Read `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

## Routes

| Route | Purpose |
|---|---|
| `/` | Customer discovery form, services, review, confirmation (`components/discovery-form.tsx`) |
| `/visit` | Sales sign-in, then a project sidebar (search + list) with the visit pane on the right (`components/visit-shell.tsx`) |
| `/visit/[code]` | On-site visit (`code` is the 6-character project code like `K7M3PQ`; the long database id also works): property → services → photos & notes → review (`components/on-site-visit.tsx`) |
| `GET <CONVEX_SITE_URL>/jobber/connect?key=…` | Starts the Jobber OAuth connection (Convex HTTP action) |
| `GET <CONVEX_SITE_URL>/jobber/callback` | Jobber OAuth redirect target |

## Getting started

```bash
npm install
npx convex dev      # creates/links a deployment, writes .env.local, watches convex/
npm run dev         # in a second terminal → http://localhost:3000
```

Copy `.env.example` to `.env.local` if you are not using `npx convex dev` to generate it.

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Convex client URL (required) |
| `CONVEX_DEPLOYMENT` | `.env.local` | Written by `npx convex dev` |
| `SALES_EMAIL`, `SALES_PASSWORD` | Convex deployment | The one login every salesperson shares. If unset, nobody can sign in |
| `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET` | Convex deployment | Jobber OAuth app credentials |
| `JOBBER_CONNECT_KEY` | Convex deployment | Secret required in `/jobber/connect?key=…` so only you can (re)connect Jobber |

Set Convex variables with `npx convex env set NAME value` (add `--prod` for production).

## Connecting Jobber

1. Create a Jobber developer app. Set its redirect URI to `https://<deployment>.convex.site/jobber/callback`.
2. Set `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, and `JOBBER_CONNECT_KEY` on the Convex deployment.
3. Open `https://<deployment>.convex.site/jobber/connect?key=<JOBBER_CONNECT_KEY>` once and approve access. Tokens are stored in the `jobberConnections` table and refreshed automatically.

Quote lines are built in `lib/quote-lines.ts` from `lib/catalogue.ts`. Retail items covered by the 2026 price list (grass, putting green, demolition, underground, lighting) use real names (`RP - …`) and prices from `lib/price-list.ts`; run `npx convex run jobber/sync:plan` to compare with Jobber and `jobber/sync:apply` to create, reprice or hide items (Jobber cannot delete, so replaced items are hidden). Contractor (`DUMMY CP - …`) items and the 12 services the list does not price are still placeholders. A missing item makes the quote report a missing mapping (project status `needs attention`).

The customer form creates a Jobber **Request** only. The quote is drafted when the salesperson saves the on-site visit, and is linked to that Request. The **Consultation** button in the visit header books, moves or cancels the Request's appointment (`convex/projects/consultation.ts`); it uses the connected Jobber user's time zone.

## Sales sign-in model

One shared email/password (`SALES_EMAIL` / `SALES_PASSWORD`) is checked in `convex/sales/login.ts`, which issues a random token whose hash is stored in `salesSessions` (14 days). The browser keeps it in storage under `qft-sales-session` and passes it as `sessionToken` to every sales query/mutation. All signed-in staff see every project (latest 200). Per-person accounts would be a follow-up.

## Project status lifecycle

`discovery saved` → `on-site saved` → `quote drafted` (or `needs attention` when Jobber mapping/API fails; see `missingMapping` / `integrationError`).

## Layout

```
app/            routes, layout, global CSS (app/globals.css), design notes (app/design.md)
components/     discovery-form, intake-property, work-areas, on-site-*, confirmation-*, sales-skeleton, ui/
lib/            form rules & validation (discovery.ts), drafts, quote-lines, catalogue, sales-session
convex/         schema, projects/ sales/ jobber/ modules, http routes (see convex/README.md)
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run convex:dev` / `convex:deploy` | Convex dev watcher / deploy functions |

## Deployment

Deploy the Next.js app (e.g. Vercel) with `NEXT_PUBLIC_CONVEX_URL` pointing at the production deployment, and run `npm run convex:deploy` for the backend. Set the Convex variables above on the production deployment.
