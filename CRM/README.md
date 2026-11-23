# Quality First Turf CRM (Launchpad)

A custom CRM that replaces Jobber for Quality First Turf. It covers the full project lifecycle: enquiry, sales, preplanning, installation, invoicing and closure, in one system built around a single central record per customer project.

## Status
Built on the **dev** Convex deployment and not in production use yet. Most of PRD Milestones 2 to 5 is in place: clients, requests, the four pipeline boards (with a list view), the project page, quotes with customer approval, the Schedule with Zoho Calendar, jobs, preplanning (materials, takeoff, purchase orders, work packages), construction (punch list, sign-off), finance (invoices, payments), automations, permissions, export and the Jobber client import. Still open: Twilio and WhatsApp going live (Messages is greyed out in the app), QuickBooks Online (D-120), the rest of the Jobber import, and the production launch. [phases.md](docs/phases.md) has the checklist; [decisions.md](docs/decisions.md) has every decision (D-xxx) behind it.

## Documents
| File | Purpose |
|------|---------|
| [prd.md](docs/prd.md) | Requirements (transcribed from the client PRD PDF) |
| [phases.md](docs/phases.md) | Ordered build plan and checklists |
| [decisions.md](docs/decisions.md) | Decisions made, open questions, client inputs |
| [architecture.md](docs/architecture.md) | Where things live, app and backend |
| [demo-data.md](docs/demo-data.md) | The demo records on the dev deployment |
| [workdrive-findings.md](docs/workdrive-findings.md) | Notes on the client's Zoho WorkDrive |
| `docs/superpowers/specs/`, `docs/superpowers/plans/` | Design documents and build plans, one per feature |
| `docs/clerk-invitation-email.*` | The Clerk invitation email template |
| `docs/data/` | Jobber's product export and images used for the catalogue import |
| [CLAUDE.md](CLAUDE.md) | Instructions for Claude Code working in this folder |

The original source is `docs/Quality First Turf – CRM Development PRD.pdf`. `client-answers.md` and `client-questions-later.docx`, which older decisions mention, are not in the repo.

## Running it
1. `npm install` once at the **repo root** (npm workspaces).
2. `npm run convex:dev` at the repo root (pushes `convex/` to the dev deployment).
3. `npm run dev` in this folder, open `/sign-in`.

### One-time sign-in setup (per deployment)
The CRM signs people in with Clerk and only answers staff who have been invited (D-046).
1. **Clerk dashboard:** create the "convex" token template (Integrations > Convex) and make sure it includes `"email": "{{user.primary_email_address}}"`. Create the first user, **admin@qualityfirstturf.com**. Further people are invited from Settings > Users (D-055), which needs `CLERK_SECRET_KEY`, `CRM_APP_URL` and, for the deletion webhook, `CLERK_WEBHOOK_SECRET` on the deployment.
2. **Convex**, from the repo root: `npx convex env set CLERK_JWT_ISSUER_DOMAIN <the Clerk instance URL>`, then push again (`npx convex dev --once`), because the auth setting is read when code is pushed.
3. `CRM/.env.local` holds the Clerk keys and `NEXT_PUBLIC_CONVEX_URL`. admin@qualityfirstturf.com becomes Admin on first sign-in.
4. Optional sample data on dev: `npx convex env set CRM_ALLOW_SAMPLE_DATA true`, `npx convex run crm/seed:run`, then `npx convex env remove CRM_ALLOW_SAMPLE_DATA`.

Production needs its own Clerk instance (new keys and DNS) and the same variables; until then it refuses every CRM call. The integrations' variables (Zoho Mail, Zoho Calendar, Twilio) are listed in [`../convex/README.md`](../convex/README.md).

### Scripts
| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` for the app |
| `npm test` | Backend tests in memory (`convex-test`, `tests/*.test.ts`, about 680 tests) |
| `npm run typecheck:tests` | Typecheck of the tests |

## Routes
| Route | Screen |
|-------|--------|
| `/home` | Home: figures, today's appointments, my tasks |
| `/schedule` | Schedule (day, week, month) |
| `/clients`, `/clients/new`, `/clients/[id]`, `/clients/[id]/edit` | Clients list, new client, client page (with Activity history), edit |
| `/requests`, `/requests/new`, `/requests/[id]` | Requests |
| `/pipeline`, `/pipeline/preplanning`, `/pipeline/construction`, `/pipeline/finance` | Pipeline boards (Board or List, `?view=list`); `/pipeline/edit` edits stages |
| `/opportunities/[id]` | Project page: Overview, Visit, Quotes, Files, Activity, and Takeoff, Work package, Construction, Billing where they apply |
| `/quotes`, `/quotes/new`, `/quotes/[id]`, `/quotes/[id]/edit` | Quotes |
| `/jobs`, `/jobs/new`, `/jobs/[id]` | Jobs |
| `/invoices`, `/invoices/new`, `/invoices/[id]`, `/invoices/[id]/edit` | Invoices |
| `/payments`, `/payments/new` | Payments |
| `/tasks` | Tasks |
| `/messages` | Message Center (currently redirects to Home, D-119) |
| `/settings/users`, `businesses`, `products`, `materials`, `checklists`, `disclaimers`, `invoices`, `automations`, `calendar`, `phone-numbers`, `import`, `export` | Settings |
| `/sign-in`, `/accept-invite` | Clerk sign-in and invitations |
| `/sales-access` | Hands a signed-in salesperson over to the forms app's visit page (D-053) |
| `/q/[token]`, `/i/[token]`, `/signoff/[token]`, `/w/[token]` | Public pages by secret link: quote approval, invoice, completion sign-off, installer work package |

## How it is being built
- **Monorepo.** The git root is the folder above this one: `forms/` (the live intake and on-site visit app) and `CRM/` (this folder), sharing one Convex backend at `../convex/` (D-026, D-030). CRM backend code is in `../convex/crm/`. The forms app is not changed without the user's go-ahead.
- **Replicate Jobber.** Each screen copies Jobber's, with the PRD's mandatory features on top (D-068).
- **Ship per milestone, Jobber stays until the end.** Each PRD milestone is completed and released in order (D-027). Jobber keeps working in full until the whole CRM is complete, then it is ended (D-028).
- **Hosting.** Vercel, one project per app. The CRM is served at `launchpad.qualityfirstturf.com`.

## Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript. Plain CSS (`app/globals.css` with design tokens, plus per-area stylesheets); no Tailwind or shadcn/ui. Inter and Figtree fonts, Jobber's Atlantis icons (`lib/icons-data.ts`).
- **Backend / DB:** Convex (`../convex/crm/`), file storage in Convex.
- **Auth:** Clerk; roles and per-module permissions are stored and enforced in Convex (D-046, D-093).
- **Integrations:** Jobber (consultations, D-085), Zoho Mail (read, and the automations' emails), Zoho Calendar (D-069), Twilio (texting, ready but not live), WhatsApp (sent by hand for now). QuickBooks Online is decided, not built (D-120).

## Design
Jobber's look, minimalist: white, off-white, gray and black with Jobber's green `#388523` as the accent. Kanban boards with a list toggle for every pipeline. Responsive, with a phone layout under 700 px. The rules (tokens, skeletons, hover, fixed table columns, red-on-submit validation, motion) are in [CLAUDE.md](CLAUDE.md).

## Core idea
Every project is one record (`opportunities`). Sales, Preplanning, Construction and Finance are pipelines it moves through, not separate records. Quotes, takeoffs, work packages, punch items, invoices and payments all attach to it.

```
Business (Quality First Turf Landscape / Construction / Quality First Patios)
   |
Client (homeowner or contractor)
   |
Project  (one record, whole lifecycle)
   |-- Sales pipeline        New Request ... Closed Won / Lost
   |-- Preplanning pipeline  Ready for Preplanning ... Installs Scheduled
   |-- Construction pipeline Ready to Start ... 100% Completed & Sign-off
   '-- Finance pipeline      Send Final Invoice ... Archive
```

## Roles
Admin, Sales, Office Team, Project Managers and Installers log in, and one person can hold several roles (D-014, D-090). What each role may do is a level per module, with per-person overrides set by an Admin, and a person can be limited to records assigned to them (D-093). Installers also receive work packages by secure link. Access is enforced in Convex functions.
