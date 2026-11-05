# Phases

**Phase N is PRD Milestone N.** The PRD's milestones are the phases. Milestone 1 is already done; Milestones 2 to 5 are below, with a short Setup step before Milestone 2.

Delivery dates in the PRD are ignored ([D-005](decisions.md)). The client moves off Jobber as milestones ship, so **each milestone is built to completion and released in order** ([D-027](decisions.md)): it ships only when its PRD acceptance criteria pass. Jobber keeps working in full until the whole CRM is complete, then it is ended ([D-028](decisions.md)). The repo is a monorepo with one shared Convex backend ([D-026](decisions.md), [D-029](decisions.md)).

**Method inside every milestone:** UI/UX first on sample data, then wire it to Convex. Each step is agreed with the user before it is built ([D-020](decisions.md)). Status key: `[ ]` todo, `[~]` in progress, `[x]` done.

Current position: **Milestone 2 UI** is built in Next.js on sample data (D-033), converted from the approved mockups, which are removed. Next: wire it to Convex (backend wiring below).

---

## Phase 1 (PRD Milestone 1): Google Workspace, DNS and email set-up
**Done** (outside this repo). Super Admin, DNS and mailboxes for the three businesses are in place. See `client-answers.md`.

---

## Setup (before Milestone 2)
Not a PRD milestone, but everything depends on it.
- [x] Jobber screenshots received (Home, Clients, Client page, New client); colours sampled (D-019)
- [ ] Receive the Quality First Turf logo from the user
- [x] Monorepo created: `forms/` moved in unchanged, `CRM/` added (D-026)
- [x] Shared `convex/` moved to the repo root, beside `forms/` and `CRM/` (D-030)
- [ ] Confirm the Convex CLI from `forms/` on the dev deployment, and the Vercel settings (root directory, include files outside it) on a preview build of the `monorepo` branch
- [ ] Scaffold the CRM Next.js app (TypeScript, Tailwind, shadcn/ui) inside the repo
- [ ] Design tokens: white, off-white, gray, black, one Jobber-green accent (D-019)
- [ ] Data access layer with a sample-data provider, so screens switch to Convex later without rewrites
- [ ] Realistic sample data, reusing the real catalogue and 2026 price list from `../forms` where useful
- [ ] Shared Convex backend extended with additive CRM tables (no edits to the forms' tables); Clerk set up (users, multi-role)
- [ ] Environments and env var documentation; production deploys only with the user's go-ahead
- [ ] Decide hosting (Q-004)

**Exit:** the empty shell runs locally on sample data.

---

## Phase 2 (PRD Milestone 2): CRM Foundation: Clients
PRD goal: Sales can begin transitioning away from Jobber. Companies and Contacts are one Clients module (D-008).

**UI/UX (sample data), step 2.1.** Built first as HTML/CSS/JS mockups (D-023), then converted to Next.js (D-033): Home, Clients list with pagination, Client page, New/Edit client.
- [ ] App shell: sidebar (Create, Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices, Payments, Messages, Pipeline; D-025), top bar with search
- [ ] Clients list: search, Homeowner/Contractor filter, scoped to the selected business (D-031)
- [ ] Client page in Jobber's section order (provisional until screenshots); mobile tabs Client, Work, Notes
- [ ] Add/edit client form (fields follow the customer form, D-017)
- [ ] Settings: users, roles (multi-role), the three businesses

**Backend wiring**
- [ ] Schema: `businesses`, `users` (roles array), `clients`, `activities`, `notes`
- [ ] Clerk to Convex auth, user sync; Admin manages users and roles
- [ ] Access helper: roles + module + record assignment enforced in every function (D-006, D-014)
- [ ] Clients: create/edit/view, search, filter, notes, activity history; indexed and paginated (no client-count limit)
- [ ] Swap the Clients screens from sample data to Convex

**Exit:** PRD Milestone 2 acceptance criteria met: Clients fully usable and access restricted by permission. The Jobber import criterion follows D-022 and Q-021 (timing under review).

---

## Phase 3 (PRD Milestone 3): Sales CRM & Pipeline
PRD goal: the complete sales workflow, from enquiry to approved contract.

**UI/UX (sample data), steps 3.1 to 3.3**
- [ ] 3.1 Projects: Sales pipeline board (9 stages) with list toggle; project page tabs Overview, Visit (four-step on-site flow, phone-first), Quotes, Files, Activity
- [ ] Customer form to CRM (D-040): a submitted form creates a new client only if the person is unique (rule in Q-016), and always creates a request, i.e. a project at New Request. Needs the user's go-ahead before the live forms app is changed (D-028)
- [ ] 3.2 Quotes: overview cards, quote builder (desktop-first), statuses, change requests and resubmissions
- [ ] 3.3 Home, Schedule and Tasks: dashboard widgets, day/week/month calendar, Today view, personal tasks, Quick Create
- [ ] Customer-facing: quote approval and contract signing (method undecided, Q-005)

**Backend wiring**
- [ ] Schema: `opportunities` (the central project record), `stageHistory`, `visitSnapshots`, `visitRevisions`, `workAreas`, `quotes`, `quoteLineItems`, `calendarEvents`, `tasks`, `documents`
- [ ] One `moveStage` mutation that validates, writes history and triggers notifications and tasks
- [ ] Guards: Closed Won needs signed contract + deposit (if applicable); Closed Lost incl. the three-month rule
- [ ] Visit flow and change log from the forms app, reused or copied under `convex/crm/` (D-021, D-029)
- [ ] Pricing engine from the forms app, reused or copied under `convex/crm/`: catalogue, 2026 price list, area-size bands, homeowner/contractor rates
- [ ] Quotes with line items, scope of work, statuses, change requests
- [ ] Calendar, tasks, double-booking prevention; Google Calendar availability lookup
- [ ] Dashboard widgets computed from real records
- [ ] File uploads (photos, site plans, contracts)
- [ ] Swap the Phase 3 screens to Convex

**Needs:** contract template; price gaps (contractor rates, 12 unpriced services). Ask only if blocked (D-018).
**Exit:** PRD Milestone 3 acceptance criteria met. Closed Won produces a handoff trigger for Phase 4.

---

## Phase 4 (PRD Milestone 4): Preplanning & Construction
PRD goal: from sales handoff through materials, installation and customer sign-off, on the same record.

**UI/UX (sample data), steps 4.1 to 4.2**
- [ ] 4.1 Preplanning: board (8 stages), material takeoff form, catalogue and units, crews and installers, installer budgets, work package. Formulas are placeholders
- [ ] 4.2 Construction: board (9 stages), progress updates with photos, punch list, reinspection, completion sign-off (phone-first)
- [ ] Customer and installer pages: work-package page `/wp/[token]`, completion sign-off page

**Backend wiring**
- [ ] Schema: `products`, `materialFormulas`, `takeoffs`, `takeoffLines`, `suppliers`, `crews`, `installers`, `workPackages`, `workPackageLinks`, `purchaseOrders`, `punchItems`, `progressUpdates`, `signoffs`
- [ ] Closed Won activates Preplanning on the same record, notifies the Office Team, carries forward contract, quote, site plan and customer details
- [ ] Formula engine: safe expression evaluation (no `eval`), wastage rules, unit-tested
- [ ] Material takeoff, supplier, stock and lead times, requirements summary
- [ ] Installer budgets, labour costs, schedules; crews and installers are records, not users (D-010)
- [ ] Work packages shared by secure expiring link
- [ ] Final stage blocked until required punch items are resolved and customer sign-off is recorded
- [ ] Digital completion sign-off
- [ ] Swap the Phase 4 screens to Convex

**Needs:** product catalogue and units, formulas and wastage, suppliers, installer budget structure, sign-off template. This phase is blocked on them, so ask when it starts (D-018).
**Exit:** PRD Milestone 4 acceptance criteria met.

---

## Phase 5 (PRD Milestone 5): Finance, Integrations & Launch
PRD goal: the final workflow, communication integrations and production deployment.

**UI/UX (sample data), steps 5.1 to 5.2**
- [ ] 5.1 Finance: board (6 stages), invoices, payments, outstanding balances
- [ ] 5.2 Messages and export: communication log, export screen

**Backend wiring**
- [ ] Schema: `invoices`, `invoiceLines`, `payments`, `communications`, `integrationCredentials` (server-side only)
- [ ] Finance pipeline entered from construction sign-off; invoices, deposits, final payments, dashboard pending payments
- [ ] Phone and SMS: multiple numbers, calls, texts, communication log against client, project and user (provider: Q-006)
- [ ] WhatsApp Business: send work packages, log against the project
- [ ] Permissions hardening across Admin, Sales, Office Team, Project Managers (multi-role)
- [ ] Export for clients, projects, quotes and invoices

**Launch and ending Jobber**
- [ ] Migration script from forms `projects` to clients and projects, tested against a copy
- [ ] Jobber import (timing under review: D-022, Q-021): pull via the API already connected in the forms app (CSV fallback, D-015), field mapping, de-duplication, per-row error report, dry run. A final top-up run before Jobber is ended picks up every client added to Jobber meanwhile
- [ ] Repoint the forms app to the CRM and remove its Jobber push, sync and crons. This touches live systems, happens only when the CRM is complete (D-028) and needs the user's explicit go-ahead
- [ ] End-to-end test from enquiry to payment; stage transitions; data integrity; permission matrix; integrations
- [ ] Critical bug fixes
- [ ] Production deployment; end the Jobber connection (D-028); Jobber retired
- [ ] Basic documentation and handover

**Needs:** invoice template, phone/SMS provider, WhatsApp Business access. Ask when this phase starts.
**Exit:** PRD Milestone 5 acceptance criteria met: CRM deployed, used by the team, and Jobber retired.

---

## Rules that apply to every phase
- One central project record across all pipelines. Never copy it.
- Stage changes, ownership and activity are audited.
- Access control is enforced in Convex functions, not by hiding UI.
- API and migration failures are surfaced, not swallowed.
- Test each phase before moving on. Report blockers as soon as they are found.
- Never change the live forms app, its Convex deployment or Jobber without the user's explicit go-ahead.
