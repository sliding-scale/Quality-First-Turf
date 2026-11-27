# Architecture

How the CRM is laid out as built (updated 2026-11-23 from the code). The CRM is one Next.js app in a monorepo with the live forms app and **one shared Convex backend** (D-026, D-030). Check the code when this page and the code disagree, and update this page.

```
Quality-First-Turf/                 # git root, npm workspaces (forms, CRM); one lockfile
├── convex/                         # the one Convex backend for both apps (see convex/README.md)
│   ├── schema.ts  http.ts  crons.ts  convex.config.ts  auth.config.ts   # shared files: additive edits only
│   ├── projects/  sales/  jobber/  # the forms app's functions: CRM work never edits them
│   ├── shared/                     # pure TypeScript used by the backend and both apps (@/convex/shared/...)
│   └── crm/                        # every CRM function (api.crm.*), plus crm/lib/ for rules and helpers
├── public/brand/                   # original logo files (D-112)
├── forms/                          # the live intake and on-site visit app
└── CRM/                            # this app
    ├── proxy.ts                    # Clerk middleware (Next.js 16 name): only sign-in, invitations and public links are open
    ├── app/
    │   ├── layout.tsx  globals.css  error.tsx  not-found.tsx  fonts/
    │   ├── *.css                   # per-area stylesheets: pipeline, schedule, client-page, quote-builder, invoices, construction...
    │   ├── (app)/                  # signed-in shell: sidebar, top bar; one folder per screen (see the routes in ../README.md)
    │   ├── (auth)/                 # sign-in, accept-invite (Clerk)
    │   ├── (handoff)/  (open)/     # /sales-access hand-off to the forms app and its sign-out (D-053)
    │   └── (public)/               # secret-link pages: /q quote, /i invoice, /signoff, /w work package
    ├── components/                 # one file per screen, tab or dialog (clients-page, opportunity-page, quote-builder,
    │                               # takeoff-tab, schedule-page...), shell.tsx, skeletons.tsx, ui-provider.tsx,
    │                               # tooltip-layer.tsx, use-dialog-focus.ts, intake/ (the New Request flow, D-079)
    ├── lib/                        # small client-side rules and data hooks: clients.ts, pipeline-list.ts, quote-prefill.ts,
    │                               # fields.ts (input filters), format.ts, dates.ts, store.ts (browser preferences), icons-data.ts
    ├── tests/                      # backend tests (convex-test, in memory), one file per module; helpers.ts and *Seed.ts
    ├── scripts/                    # scope-forms-css.mjs (generates app/intake.css from the forms' CSS)
    └── docs/                       # prd, phases, decisions, this file, superpowers/specs and plans
```

## How the pieces fit

```
Browser (Next.js, CRM)  ──Clerk JWT──>  convex/crm/* functions  ──>  Convex DB + file storage
                                             │
                                             ├── crm/lib/access.ts   requireModule / requireProject on every call
                                             ├── crm/pipeline.ts     moveStage: the one path that changes a stage
                                             ├── crons               automations, Zoho Mail and Calendar sync
                                             └── actions ──> Jobber, Zoho Mail, Zoho Calendar, Twilio
Webhooks (Clerk, Twilio) and OAuth callbacks (Jobber, Zoho Calendar) ──> convex/http.ts
Customer / installer (no login) ──> /q /i /signoff /w ──> crm/client*.ts, checked against a secret, expiring token
Forms app ──> projects.create ──scheduler──> crm/intake.ts (the customer form becomes a CRM request, D-045)
```

## Rules this layout enforces
- **One central record.** `opportunities` is the project for its whole life (the UI says "Project"). Preplanning, Construction and Finance are `pipeline` + `stage` on that record. Child data (quotes, takeoffs, work packages, punch items, invoices, payments, files) references its id.
- **One path to change a stage:** `crm/pipeline.ts` `moveStage` (and the hand-offs beside it), which validates the move, writes `stageHistory` and runs the stage's side effects. Stage names live in `crm/lib/stages.ts` and `crm/lib/pipelineStages.ts`.
- **No CRM function skips `crm/lib/access.ts`.** Permissions are a level per module per role, with per-person overrides and assigned-only access (D-093).
- **Forms code is not edited by CRM work.** CRM tables use new names; the shared files get additive edits only.
- **The only unauthenticated pages** are sign-in, invitations, the sales sign-out and the four secret-link pages, each of which exposes one record through its token.
- **Formulas are data.** Material formulas are evaluated by `crm/lib/formula.ts`, a safe parser (no `eval`).

## Core tables (CRM)

| Area | Tables |
|---|---|
| People | `users` (invite-only, `roles` array, `businessIds`, status), `businesses` (name, slug, phone, email, website) |
| Clients | `clients` (per business, homeowner or contractor), `clientNotes`, `activities` (append-only client history, D-113), `clientMailMessages`, `clientMailThreads`, `clientMailBodies`, `zohoMailSync`, `zohoWatchedAddresses` |
| Projects | `opportunities`, `stageHistory`, `pipelineStages`, `opportunityTasks`, `opportunityNotes`, `opportunityFiles`, `opportunityVisits` (visit notes and the work areas a quote reads, D-114), `visitSheets` (each visit's own work areas, D-133), `noteMentions` |
| Quotes | `quotes`, `quoteLineItems`, `quoteEvents`, `quoteRevisions`, `quoteAttachments`, `quoteDefaults`, `quoteNotes`, `disclaimers` |
| Jobs and catalogue | `catalogueItems`, `catalogueSettings`, `jobCounters`, `jobTimeEntries`, `jobExpenses`, `jobSignatures`, `checklistTemplates`, `jobChecklistItems` |
| Preplanning | `materials`, `materialKits`, `takeoffs`, `takeoffLines`, `serviceKits`, `stockMovements`, `purchaseOrders`, `workPackages`, `crews` |
| Construction | `progressUpdates`, `punchItems`, `signoffs` |
| Finance | `invoices`, `invoiceLines`, `invoiceEvents`, `invoiceSettings`, `billingPlans`, `paymentScheduleItems`, `payments`, `paymentAllocations` |
| Schedule | `calendarEvents`, `calendarConnections`, `calendarLinks`, `calendarPushes`, `calendarOauthStates`, `scheduleSettings` |
| Automations | `automations`, `automationSettings`, `automationRuns`, `customAutomations`, `customAutomationRuns` |
| Messages | `phoneNumbers`, `messages`, `calls` |

The forms' tables (`projects`, `visitSnapshots`, `visitRevisions`, `workAreas`, `salesSessions`, `salesHandoffs`, `jobberConnections`) are read by the CRM where needed (for example the customer form's work areas through `crm/lib/visitData.ts`) and their functions are not edited. The one CRM write to them: New Request (`crm/requestForm.ts`, D-079) inserts a `projects` row shaped like the customer form's, so a request made by staff has the same forms record as one made by a customer.

## Not built yet
- QuickBooks Online (D-120): connection, invoice push, invoice and payment pull.
- Twilio and WhatsApp going live (the code is ready; the accounts and registration are not).
- The rest of the Jobber import (projects, quotes, invoices, payments) and the migration of the forms' `projects`.
- A business-wide activity feed and handover documentation.
