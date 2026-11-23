# Quality First Turf — intake & on-site visit app

The **live** Next.js + Convex app, used by the client. Two audiences:

- **Customers** fill in a discovery form (`/`): their details and project, then either pick services and answer the questions for each, or ask for a professional to reach out (D-105). On submit a project is saved, a Jobber **request** is created, and the submission becomes a request in the CRM (D-045).
- **Sales staff** sign in (`/visit`), open a project, verify and measure on site (property, services and areas, photos and notes), and draft the quote in Jobber.

It is one app in a monorepo: the Convex backend is the repo root's `convex/`, shared with the CRM (`../CRM`). Read the repo root `CLAUDE.md` and this folder's `CLAUDE.md` before changing anything: a change here reaches the client.

## Stack

Next.js 16 (App Router, `cacheComponents`, Turbopack), React 19, Tailwind 4 (plus a large hand-written `app/globals.css`), Convex backend, `lucide-react` icons, GSAP. Jobber GraphQL API for clients, requests and quotes.

> Next.js 16 has breaking changes versus older versions. Read `node_modules/next/dist/docs/` (at the repo root) before changing framework-level code (see `AGENTS.md`).

## Routes

| Route | Purpose |
|---|---|
| `/` | Customer discovery form, services, review, confirmation (`components/discovery-form.tsx`) |
| `/visit` | Sales sign-in, then a project sidebar (search and list) with the visit pane on the right (`components/visit-shell.tsx`) |
| `/visit/[projectId]` | On-site visit. Takes the 6-character project code (like `K7M3PQ`) or the long database id: property, services, photos and notes, review (`components/on-site-visit.tsx`) |
| `GET <CONVEX_SITE_URL>/jobber/connect?key=…` | Starts the Jobber OAuth connection (Convex HTTP action) |
| `GET <CONVEX_SITE_URL>/jobber/callback` | Jobber OAuth redirect target |

## Getting started

```bash
npm install            # once, at the repo root (npm workspaces)
npm run convex:dev     # at the repo root: pushes convex/ to the dev deployment and watches it
npm run dev            # in this folder → http://localhost:3000
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `forms/.env.local` | Convex client URL (required) |
| `NEXT_PUBLIC_CRM_URL` | `forms/.env.local` | The CRM's address, where sales staff sign in (D-053). Without it the sign-in button has nowhere to go |
| `CONVEX_DEPLOYMENT` | repo-root `.env.local` | Written by `npx convex dev`, run from the repo root |
| `SALES_EMAIL`, `SALES_PASSWORD`, `SALES_NAME`, `SALES_ACCOUNTS` | Convex deployment | The salespeople's logins and display names (`convex/sales/accounts.ts`); `SALES_ACCOUNTS` is a JSON list of `{email, password, name}` |
| `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET` | Convex deployment | Jobber OAuth app credentials |
| `JOBBER_CONNECT_KEY` | Convex deployment | Secret required in `/jobber/connect?key=…` so only you can (re)connect Jobber |

Set Convex variables with `npx convex env set NAME value` from the repo root. Production (`--prod`) only with the user's go-ahead.

## Connecting Jobber

1. Create a Jobber developer app. Set its redirect URI to `https://<deployment>.convex.site/jobber/callback`.
2. Set `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET` and `JOBBER_CONNECT_KEY` on the Convex deployment.
3. Open `https://<deployment>.convex.site/jobber/connect?key=<JOBBER_CONNECT_KEY>` once and approve access. Tokens are stored in the `jobberConnections` table and refreshed automatically.

Quote lines are built in `convex/shared/quoteLines.ts` from `convex/shared/catalogue.ts`. Retail items covered by the 2026 price list (grass, putting green, demolition, underground, lighting) use real names (`RP - …`) and prices from `convex/shared/priceList.ts`; run `npx convex run jobber/sync:plan` to compare with Jobber and `jobber/sync:apply` to create, reprice or hide items (Jobber cannot delete, so replaced items are hidden). Contractor (`DUMMY CP - …`) items and the 12 services the list does not price are still placeholders. A missing item makes the quote report a missing mapping (project status `needs attention`).

The customer form creates a Jobber **request** only. The quote is drafted when the salesperson saves the on-site visit, and is linked to that request. The **Consultation** button in the visit header books, moves or cancels the request's appointment (`convex/projects/consultation.ts`) in the connected Jobber user's time zone; a cron syncs consultations from Jobber every 10 minutes.

## Sales sign-in model

Staff sign in with Clerk **on the CRM** (D-053, deployed to production; user, 2026-11-23): the sign-in button goes to the CRM's `/sales-access`, which checks for an active user with the Sales or Admin role and sends them back with a one-time code; `convex/sales/clerk.ts` swaps it for a sales session token. Only a hash of the token is stored in `salesSessions` (14 days). The browser keeps it under `qft-sales-session` and passes it as `sessionToken` to every sales query and mutation. All signed-in staff see every project (latest 200).

It replaced the older shared password login, which no longer exists. The `SALES_*` variables are now only read for salespeople's display names (`convex/sales/accounts.ts`), so ask the user before removing them.

## Project status lifecycle

`discovery saved` → `on-site saved` → `quote drafted` (or `needs attention` when Jobber mapping or the API fails; see `missingMapping` / `integrationError`).

## Layout

```
app/            routes, layout, error and not-found pages, global CSS (app/globals.css), design notes (app/design.md)
components/     discovery-form, intake-property, project-step, work-areas, area-planner, on-site-*, consultation-button,
                sales-login, visit-shell, confirmation-*, sales-skeleton, ui/
lib/            drafts (discovery-draft), visit checks and areas, project-changes, sales-session, crm-url
public/brand/   QFT-logo.png, QFT-favicon.png (D-112)
../convex/      the shared backend: projects/, sales/, jobber/, shared/ (see ../convex/README.md)
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run convex:dev` / `convex:deploy` | Root scripts: run them from the repo root, not here |

## Deployment

Vercel project with Root Directory `forms` and "Include source files outside of the Root Directory" on, `NEXT_PUBLIC_CONVEX_URL` pointing at the production deployment. The backend goes out with `npx convex deploy` from the repo root, which also publishes the CRM's backend: only with the user's go-ahead.
