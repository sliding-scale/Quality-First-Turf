# Architecture

Planned layout. Nothing is scaffolded yet, so adjust this file when the real structure diverges. Stack: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Convex, Clerk. It lives in a monorepo with the forms app and one shared Convex backend (D-026). The repo root is `Quality-First-Turf/`: `forms/` (live app) and `CRM/` (docs, mockups, later the CRM app). Where `convex/` lives is open (Q-020). The tree below shows the CRM app only. The UI is built first on sample data, behind the `src/data/` layer.

## How this tree maps onto the shared backend (D-029, D-030)
There is **one** Convex backend for both apps, at `convex/` in the repo root (a sibling of `forms/` and `CRM/`). The `convex/` folder in the tree below is the CRM's *share* of it, not a second folder:
- CRM modules (`clients.ts`, `opportunities.ts`, `pipeline.ts`, `lib/`, `pricing/` and so on) live under `convex/crm/`. Function paths read `api.crm.clients.*`.
- Domain logic used by both the backend and the apps (the forms' catalogue, price list, quote lines, discovery rules) is in `convex/shared/`. The CRM's pricing work can reuse it from there (D-021).
- `schema.ts`, `http.ts`, `crons.ts` and `convex.config.ts` already exist and are shared. The CRM's tables, routes, jobs and env vars are added to them. Existing forms entries are never edited.
- `auth.config.ts` (Clerk) is new.
- Every CRM function goes through `crm/lib/access.ts`. Forms functions keep their own session check.
- Each app has its own Next.js project, `package.json` and Vercel project. Both point at the same Convex deployment.

## Directory layout

```
quality-first-turf-crm/
├── README.md  CLAUDE.md
├── package.json  tsconfig.json  next.config.ts  tailwind.config.ts  components.json
├── .env.local                      # NEXT_PUBLIC_CONVEX_URL, Clerk keys (never committed)
│
├── convex/                         # Backend: schema, data access, business rules
│   ├── schema.ts                   # All tables and indexes
│   ├── auth.config.ts              # Clerk JWT config
│   ├── http.ts                     # HTTP actions: Clerk, Twilio, WhatsApp webhooks, work-package links
│   ├── crons.ts                    # Scheduled jobs (3-month Closed Lost check, reminders)
│   ├── lib/
│   │   ├── access.ts               # Role + module + record-level checks used by EVERY function
│   │   ├── roles.ts                # Admin / Sales / Office / ProjectManager and module permissions
│   │   ├── pipelines.ts            # Pipeline and stage constants (exact PRD names), allowed transitions
│   │   ├── stageGuards.ts          # Per-stage validation (Closed Won, final construction stage, finance entry)
│   │   ├── audit.ts                # Helpers that write activities and stageHistory
│   │   └── formulas.ts             # Safe formula parser/evaluator for material takeoffs (no eval)
│   ├── users.ts                    # Clerk-synced users, role management (Admin)
│   ├── clients.ts                  # Jobber clients: homeowner | contractor (replaces companies + contacts)
│   ├── businesses.ts               # The three businesses: Quality First Turf, Construction, Patios
│   ├── opportunities.ts            # Central project record (the UI says Project), detail page queries
│   ├── visits.ts                   # On-site visits: snapshots, change log, work areas (copied from forms)
│   ├── pricing/                    # Catalogue, 2026 price list, quote-line builder (copied from forms)
│   ├── pipeline.ts                 # moveStage mutation (the only way to change stage), board queries
│   ├── activities.ts               # Notes and activity history
│   ├── tasks.ts
│   ├── calendar.ts                 # Events, double-booking checks
│   ├── quotes.ts                   # Quotes, line items, status tracking
│   ├── documents.ts                # Files, site plans, contracts (Convex storage)
│   ├── preplanning/
│   │   ├── catalogue.ts            # Products, units, suppliers
│   │   ├── takeoffs.ts             # Material takeoff forms and summaries
│   │   ├── crews.ts                # Installers and crews (records, not users)
│   │   ├── workPackages.ts         # Budgets, schedules, package generation, secure link tokens
│   │   └── purchaseOrders.ts
│   ├── construction/
│   │   ├── progress.ts             # Progress updates and photos
│   │   ├── punchList.ts
│   │   └── signoff.ts              # Customer completion approval
│   ├── finance/
│   │   ├── invoices.ts
│   │   └── payments.ts
│   ├── comms/
│   │   ├── sms.ts                  # Phone/SMS provider
│   │   ├── calls.ts
│   │   └── whatsapp.ts             # Sends work packages, logs against project
│   ├── integrations/
│   │   ├── googleCalendar.ts       # Availability lookup
│   │   └── googleDrive.ts          # If Drive storage is chosen
│   ├── imports/
│   │   └── jobber.ts               # One-time client import via the Jobber API (CSV fallback): mapping, dedupe, per-row error report
│   ├── dashboard.ts                # Metric queries computed from live records
│   ├── notifications.ts
│   └── _generated/                 # Convex codegen
│
├── src/
│   ├── middleware.ts               # Clerk route protection
│   ├── app/
│   │   ├── layout.tsx              # Providers: Clerk, Convex
│   │   ├── (auth)/sign-in/  sign-up/
│   │   ├── (app)/                  # Authenticated shell: sidebar, top bar, Quick Create
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   ├── clients/            # list, [id] detail, new
│   │   │   ├── opportunities/      # list, [id] detail (the central page)
│   │   │   ├── pipelines/
│   │   │   │   ├── sales/  preplanning/  construction/  finance/    # board views
│   │   │   ├── quotes/
│   │   │   ├── jobs/
│   │   │   ├── invoices/
│   │   │   ├── calendar/           # day / week / month
│   │   │   ├── tasks/
│   │   │   ├── materials/          # catalogue, formulas, takeoffs
│   │   │   ├── crews/
│   │   │   ├── messages/           # SMS, calls, WhatsApp log
│   │   │   ├── import/             # Jobber import wizard (Admin)
│   │   │   └── settings/
│   │   │       ├── users/  roles/  pipelines/  templates/  integrations/  export/
│   │   └── wp/[token]/             # Public secure work-package page for installers (no login)
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui primitives
│   │   ├── layout/                 # Sidebar, Topbar, QuickCreate
│   │   ├── data-table/             # Searchable, filterable table
│   │   ├── pipeline/               # Board, columns, cards, stage-move dialog
│   │   ├── opportunity/            # Detail page sections (customer, property, quotes, timeline...)
│   │   ├── calendar/
│   │   ├── forms/                  # Client, quote, takeoff, punch-item, sign-off forms
│   │   └── dashboard/              # Metric cards and lists
│   ├── hooks/                      # useCurrentUser, usePermissions, etc.
│   ├── data/                       # Data access layer: sample-data provider now, Convex provider later
│   ├── lib/
│   │   ├── utils.ts
│   │   ├── permissions.ts          # UI-only convenience; the server is the authority
│   │   └── constants.ts            # Re-exports pipeline/stage names from convex/lib
│   └── types/
│
├── public/
├── tests/
│   ├── convex/                     # Stage guards, permissions matrix, formulas, import dedupe
│   └── e2e/                        # Enquiry-to-payment flow
└── docs/                           # Project documentation
    ├── prd.md  phases.md  decisions.md  architecture.md  client-answers.md
    ├── superpowers/specs/          # Design docs from brainstorming
    └── handover/                   # User guide and admin guide delivered at launch
```

## How the pieces fit

```
Browser (Next.js)  ──Clerk JWT──>  Convex functions  ──>  Convex DB + file storage
                                        │
                                        ├── lib/access.ts   (every call checks role, module, record)
                                        ├── pipeline.ts     (single stage-change path -> stageHistory, notifications, tasks)
                                        └── actions ──> Google, SMS provider, WhatsApp
Webhooks (SMS, WhatsApp, Clerk) ──> convex/http.ts
Installer (no login) ──> /wp/[token] ──> Convex query validating an expiring token
```

## Core tables (initial)

| Table | Notes |
|-------|-------|
| `users` | Synced from Clerk. `roles` (array, a user can hold several), module permissions. Login roles only |
| `businesses` | The three businesses: name, domain, mailboxes, document branding |
| `clients` | Jobber clients. `type` homeowner or contractor (from the customer form), business details, addresses, Jobber ID for dedupe |
| `visitSnapshots`, `visitRevisions`, `workAreas` | On-site visit history, change log and measured areas (carried over from the forms app) |
| `opportunities` | The central record. `clientId`, `pipeline`, `stage`, `assignedTo`, property, services, measurements |
| `stageHistory` | Append-only: opportunity, pipeline, from, to, user, timestamp, reason |
| `activities` | Append-only audit and notes, tied to client and/or opportunity |
| `quotes`, `quoteLineItems` | Linked to opportunity and client |
| `documents` | Site plans, contracts, photos, work packages (storage ID + opportunity) |
| `calendarEvents`, `tasks` | Assigned to users, linked to opportunity |
| `products`, `materialFormulas`, `suppliers` | Admin-configured catalogue |
| `takeoffs`, `takeoffLines` | Per opportunity |
| `crews`, `installers` | Records, not users |
| `workPackages`, `workPackageLinks` | Package content and expiring access tokens |
| `purchaseOrders` | Materials ordering and delivery dates |
| `progressUpdates`, `punchItems`, `signoffs` | Construction |
| `invoices`, `payments` | Finance |
| `communications` | SMS, calls, WhatsApp, tied to client, opportunity, user |
| `importRuns`, `importErrors` | Jobber import audit: nothing is dropped silently |

## Rules this layout enforces
- One path to change a stage: `convex/pipeline.ts`. Pages never patch `stage` directly.
- No Convex function skips `lib/access.ts`.
- Pipeline and stage names exist in one place (`convex/lib/pipelines.ts`) and the UI imports them.
- The only unauthenticated route is `/wp/[token]`, and it exposes one work package only, through an expiring token.
- The UI calls the central record a Project; the table is `opportunities`.
- Screens read data through `src/data/` only. Sample-data mode and Convex mode implement the same interface.
