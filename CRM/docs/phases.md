# Phases

**Phase N is PRD Milestone N.** The PRD's milestones are the phases. Milestone 1 is already done; Milestones 2 to 5 are below, with a short Setup step before Milestone 2.

Delivery dates in the PRD are ignored ([D-005](decisions.md)). The client moves off Jobber as milestones ship, so **each milestone is built to completion and released in order** ([D-027](decisions.md)): it ships only when its PRD acceptance criteria pass. Jobber keeps working in full until the whole CRM is complete, then it is ended ([D-028](decisions.md)). The repo is a monorepo with one shared Convex backend ([D-026](decisions.md), [D-029](decisions.md)).

**Method inside every milestone:** UI/UX first on sample data, then wire it to Convex. Each step is agreed with the user before it is built ([D-020](decisions.md)). Status key: `[ ]` todo, `[~]` in progress, `[x]` done.

Current position (2026-11-23): every screen is wired to Convex on the **dev** deployment; nothing of the CRM is in production use. Most of Milestones 2 to 5 is built (below). Still open: Twilio and WhatsApp going live, QuickBooks Online (D-120), the rest of the Jobber import, the end-to-end test and the production launch.

---

## Phase 1 (PRD Milestone 1): Google Workspace, DNS and email set-up
**Done** (outside this repo). Super Admin, DNS and mailboxes for the three businesses are in place. See `client-answers.md`.

---

## Setup (before Milestone 2)
Not a PRD milestone, but everything depends on it.
- [x] Jobber screenshots received (Home, Clients, Client page, New client); colours sampled (D-019)
- [x] Receive the Quality First Turf logo from the user (and the Patios logo; D-112)
- [x] Monorepo created: `forms/` moved in unchanged, `CRM/` added (D-026)
- [x] Shared `convex/` moved to the repo root, beside `forms/` and `CRM/` (D-030)
- [x] Convex CLI: works from the repo root on the dev deployment (used for all CRM work). The `monorepo` branch is merged into `master`, and the Vercel settings (root directory, include files outside it) are in place (user, 2026-11-23)
- [x] Scaffold the CRM Next.js app inside the repo (TypeScript, plain CSS; Tailwind and shadcn/ui were not used, D-033)
- [x] Design tokens: white, off-white, gray, black, one Jobber-green accent (D-019; `app/globals.css`, D-117)
- [x] Data access layer with a sample-data provider, so screens switch to Convex later without rewrites (D-033; since replaced by Convex)
- [x] Realistic sample data, reusing the real catalogue and 2026 price list from `../forms` where useful (`crm/seed`, dev only)
- [x] Shared Convex backend extended with additive CRM tables (no edits to the forms' tables); Clerk set up (users, multi-role) (D-042, D-046)
- [x] Environments and env var documentation (`convex/README.md`, `CRM/README.md`); production deploys only with the user's go-ahead
- [x] Decide hosting (Q-004: Vercel, one project per app)

**Exit:** the empty shell runs locally on sample data. Done.

---

## Phase 2 (PRD Milestone 2): CRM Foundation: Clients
PRD goal: Sales can begin transitioning away from Jobber. Companies and Contacts are one Clients module (D-008).

**UI/UX (sample data), step 2.1.** Built first as HTML/CSS/JS mockups (D-023), then converted to Next.js (D-033): Home, Clients list with pagination, Client page, New/Edit client.
- [x] App shell: sidebar (Create, Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices, Payments, Messages, Pipeline; D-025), top bar with search
- [x] Clients list: search, Homeowner/Contractor filter, scoped to the selected business (D-031)
- [x] Client page in Jobber's section order; an Activity history tab (D-113)
- [x] Add/edit client form (fields follow the customer form, D-017)
- [x] Settings: users and roles (multi-role) done (D-046); the businesses' own settings screen (phone, email, website, logo) built on dev (D-112)

**Backend wiring**
- [x] Schema: `businesses`, `clients`, `opportunities`, `clientNotes` done (D-042); `users` (roles array) done; `activities` done (D-113)
- [x] Clerk to Convex auth, invite-only users, first Admin, Admin manages users and roles, the CRM sign-in screen, its own seed switch (D-046, built on dev; needs the Clerk dashboard step and the Convex variable, see the CRM README; production needs its own Clerk instance)
- [x] Access helper: signed in, active, role and business checked in every CRM function (D-046). Module permissions beyond edit versus view and record assignment come later (D-006)
- [x] Clients: create, edit, view, search, filters, notes, Related projects done; activity history done (D-113); paging is server-side over a bounded read (5,000 per business), see D-042
- [x] Swap the Clients and Requests screens from sample data to Convex (dev deployment; first look at live data pending, D-042)

**Exit:** PRD Milestone 2 acceptance criteria met: Clients fully usable and access restricted by permission. The Jobber import criterion follows D-022 and Q-021 (timing under review).

---

## Phase 3 (PRD Milestone 3): Sales CRM & Pipeline
PRD goal: the complete sales workflow, from enquiry to approved contract.

**UI/UX (sample data), steps 3.1 to 3.3**
- [x] 3.1 Projects: Sales pipeline board **built on dev (D-061)**: board, drag and drop, stage history, Tasks and Sales Outcomes tabs, Edit Stages; the project page (Overview, Visit, Quotes, Files, Activity) is built (D-077) and its Visit tab records work areas and photos (D-114); the list toggle on every pipeline board is built (D-115). Original line: Sales pipeline board (9 stages) with list toggle; project page tabs Overview, Visit (four-step on-site flow, phone-first), Quotes, Files, Activity
- [x] Customer form to CRM (D-040, built on dev in D-045; not yet deployed to production): a submitted form creates a new client only if the person is unique (rule in Q-016), and always creates a request, i.e. a project at New Request. Needs the user's go-ahead before the live forms app is changed (D-028)
- [x] 3.2 Quotes (**builder, sending (link), client approval and signature, revisions, deposit, Closed Won rule built on dev, D-063**; email and text delivery wait for the Zoho connection, Convert to Job for Jobs). Original line: overview cards, quote builder (desktop-first), statuses, change requests and resubmissions. **Done so far (D-056, dev):** list with the four figure cards and Status, Date and Salesperson filters, the read-only quote page, quote #1 added as data. The builder, sending and revisions followed in D-063
- [x] 3.3 Home, Schedule and Tasks (**Schedule built on dev, D-062**; Home dashboard figures built (D-076) and the Tasks PRD items built (D-116); Zoho Calendar link built, D-069): dashboard widgets, day/week/month calendar, Today view, personal tasks, Quick Create
- [x] Customer-facing: quote approval and signature on the customer's link `/q/[token]`; the on-screen signature is the approval method (D-063, answers Q-005)

**Backend wiring**
- [x] Schema: `opportunities` (the central project record), `stageHistory`, `quotes`, `quoteLineItems` with their events and revisions, `calendarEvents`, `opportunityTasks` (the plan's `tasks`), `opportunityFiles` (the plan's `documents`), `opportunityVisits` (D-114); the forms' `visitSnapshots`, `visitRevisions` and `workAreas` are read, not copied
- [x] One `moveStage` mutation that validates, writes history and triggers notifications and tasks (`crm/pipeline.ts`, D-061)
- [x] Guards: Closed Won needs the signed quote + deposit (if applicable) (D-063); Closed Lost incl. the three-month rule (automation, D-065)
- [~] Visit: work areas and photos are recorded in the CRM (D-114); the forms' follow-up questions, measured-pieces planner and change log are not ported (the forms keep doing them, D-028)
- [x] Pricing engine from the forms app, reused from `convex/shared/` (catalogue, 2026 price list, quote lines) by `crm/quotePrices.ts` for the price picker and the quote pre-fill (D-063, D-105)
- [x] Quotes with line items, scope of work, statuses, change requests (D-056, D-063)
- [x] Calendar, tasks, double-booking prevention (D-062); Zoho Calendar instead of Google (D-069)
- [x] Dashboard widgets computed from real records (D-076, D-116)
- [x] File uploads (photos, site plans, contracts): the project's Files tab and note photos (D-077)
- [x] Swap the Phase 3 screens to Convex

**Needs:** contract template; price gaps (contractor rates, 12 unpriced services). Ask only if blocked (D-018).
**Exit:** PRD Milestone 3 acceptance criteria met. Closed Won produces a handoff trigger for Phase 4.

---

## Phase 4 (PRD Milestone 4): Preplanning & Construction
PRD goal: from sales handoff through materials, installation and customer sign-off, on the same record.

**UI/UX (sample data), steps 4.1 to 4.2**
- [x] 4.1 Preplanning (built on dev; the client's catalogue, units, formulas and wastage rules are integrated, user 2026-11-23): board (8 stages) **built on dev (D-080)**; material takeoff (Materials with formulas, the Takeoff tab and the requirements summary) **built on dev (D-098)**; installer work packages (budget, schedule, site access, files, a secret expiring link) and crew rates and availability **built on dev (D-099)**; purchase orders, delivery dates and material readiness **built on dev (D-100)**. The client's catalogue and formulas are to be entered as data
- [x] 4.2 Construction: board (9 stages) (D-080), and the project's Construction tab (D-081, built on dev): project manager and crews, job walks, installation days and reinspections on the Schedule, progress updates with photos, punch list, reinspection, completion sign-off. The last stage needs every required punch item verified and the customer's signature, and signing moves the project there.
- [x] Customer and installer pages: completion sign-off page `/signoff/[token]` built (D-081); the installer work-package page is built at `/w/<secret link>` (D-099; the plan said `/wp/`, the built path is `/w/`)

**Backend wiring**
- [~] Schema (as built): `materials` and `materialKits` (products with formulas), `takeoffs`, `takeoffLines`, `crews`, `workPackages` (the secret link is kept on the package), `purchaseOrders`, `punchItems`, `progressUpdates`, `signoffs`. No `suppliers` or `installers` tables yet: the supplier list has not arrived
- [x] Closed Won sends the project to Preplanning by itself, on the same record (D-080), and the Office team is told. Contract, quote, site plan and customer details stay on that record. Takeoff, crews and work packages followed (D-098, D-099).
- [x] Formula engine: safe expression evaluation (no `eval`), wastage rules, unit-tested (D-098, `tests/formula.test.ts`)
- [x] Material takeoff, supplier, stock and lead times, requirements summary (D-098, D-100; the client's catalogue, units, formulas and wastage are integrated, D-104, D-107)
- [x] Installer budgets, labour costs, schedules; crews and installers are records, not users (D-010, D-099; installers also log in, D-090)
- [x] Work packages shared by secure expiring link (D-099)
- [x] Final stage blocked until required punch items are resolved and customer sign-off is recorded (D-081, backend)
- [x] Digital completion sign-off (D-081): on a device or through the customer's link, kept with the punch list as it was; printable
- [x] Swap the Phase 4 screens to Convex (the Preplanning, Takeoff, Work package and Construction screens read and write `convex/crm/` already)

**Needs (received 2026-11-23):** the product catalogue and units, and the formulas and wastage. **Still open:** a sample installer work package and how installers are paid (running on editable placeholders, D-091), and the real supplier list (to be loaded, no placeholders). The sign-off template is not asked for now: ours stays until the client sends theirs.
**Exit:** PRD Milestone 4 acceptance criteria met.

---

## Phase 5 (PRD Milestone 5): Finance, Integrations & Launch
PRD goal: the final workflow, communication integrations and production deployment.

**UI/UX (sample data), steps 5.1 to 5.2**
- [x] 5.1 Finance: board (6 stages), invoices, payments, outstanding balances **built on dev (D-092)**; not clicked through in a browser yet
- [x] Jobs (list, job page, Close Job, Convert to Job, New Job by hand) and the Products & Services list **built on dev (D-094)**; costs on a job, Labor and Expenses **built on dev (D-095)**; checklists, recurring jobs, emails, signature and Delete **built on dev (D-096)**
- [~] 5.2 Messages and export: the text log, inbox, Message Center and a Twilio-ready sender are **built on dev (D-097)**; the export page is **built on dev (D-101)**; calls (logged by hand) and WhatsApp work packages (sent by hand) are **built on dev (D-102)**; Twilio voice and the WhatsApp Business sender remain

**Backend wiring**
- [x] Schema: `invoices`, `invoiceLines`, `payments` (+ allocations, schedule, plans, settings) done (D-092); communications are `messages` and `calls` (D-097, D-102); integration tokens stay server-side per integration (`jobberConnections`, `calendarConnections`, env vars)
- [x] Finance pipeline entered from construction sign-off; invoices, deposits, final payments, dashboard pending payments (D-092)
- [~] Phone and SMS: multiple numbers (Settings > Phone numbers), texts through Twilio and calls logged by hand, logged against client, project and user (D-097, D-102); not live until the Twilio account and texting registration exist (provider: Q-006)
- [x] Zoho Mail, read-only, into the client Communication tab: `office@qualityfirstturf.com`, Inbox and Sent, no sending or mailbox changes (D-064)
- [~] WhatsApp Business: send work packages, log against the project (sent by hand and logged, D-102; the WhatsApp Business sender remains)
- [ ] QuickBooks Online: a Connect QuickBooks button in Settings (Admin, one connection per business); create invoices in QuickBooks from the CRM and read invoices and payments back, with an account-mapping settings screen and a "sync from" date (D-120). Start the Intuit production-keys review early
- [x] Permissions: levels per module, Installer role, assigned-only, Manage Team Permissions form (PRD 5.5, D-093); to check in a browser as an Installer
- [x] Export for clients, projects, quotes, invoices and payments **built on dev (D-101)**

**Launch and ending Jobber**
- [ ] Migration script from forms `projects` to clients and projects, tested against a copy
- [~] Jobber import: **clients from a CSV, with a dry run, de-duplication and a per-row report, built on dev (D-103)**; projects, quotes, invoices, payments and the API pull remain (timing under review: D-022, Q-021): pull via the API already connected in the forms app (CSV fallback, D-015), field mapping, de-duplication, per-row error report, dry run. A final top-up run before Jobber is ended picks up every client added to Jobber meanwhile
- [ ] Repoint the forms app to the CRM and remove its Jobber push, sync and crons. This touches live systems, happens only when the CRM is complete (D-028) and needs the user's explicit go-ahead
- [ ] End-to-end test from enquiry to payment; stage transitions; data integrity; permission matrix; integrations
- [ ] Critical bug fixes
- [ ] Production deployment; end the Jobber connection (D-028); Jobber retired
- [ ] Basic documentation and handover

**Needs:** the legal business details and phone number(s) for texting and WhatsApp (we create the Twilio and Meta Business accounts ourselves; see `CLAUDE.md`). Ask early: business-texting registration takes days to weeks. The invoice template is not asked for now; ours stays until the client sends theirs.
**Exit:** PRD Milestone 5 acceptance criteria met: CRM deployed, used by the team, and Jobber retired.

---

## Rules that apply to every phase
- One central project record across all pipelines. Never copy it.
- Stage changes, ownership and activity are audited.
- Access control is enforced in Convex functions, not by hiding UI.
- API and migration failures are surfaced, not swallowed.
- Test each phase before moving on. Report blockers as soon as they are found.
- Never change the live forms app, its Convex deployment or Jobber without the user's explicit go-ahead.
