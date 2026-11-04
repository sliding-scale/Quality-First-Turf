# Decisions & Open Questions

Add new entries at the bottom of each section. Never delete a decision. Mark it **Superseded by D-xxx** instead.

## Decisions

### D-001: Frontend stack
**Decided:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
**Why:** fast route to a Jobber-style UI, good Convex support, easy hosting.

### D-002: Backend
**Decided:** Convex, as in the earlier intake forms and Jobber sync.
**Why:** already the team's backend, with reactive queries that suit dashboards and boards.

### D-003: Authentication
**Decided:** Clerk with Convex. Roles live in the Convex `users` table (synced from Clerk), not only in Clerk metadata.
**Why:** quick setup, invites and Google sign-in. Roles in Convex mean permission checks can run inside every query and mutation. It also replaces the forms app's shared sales login (an open item on its todo list).

### D-004: One central project record
**Decided:** `opportunities` is the single project record from enquiry to archive. Sales, Preplanning, Construction and Finance are `pipeline` + `stage` values on it, not separate tables. The UI calls it a **Project** (D-019).
**Why:** PRD core principle. No copy at handoff, so no drift.
**Consequence:** each pipeline's stage definitions live in code/config. Pipeline-specific data (takeoffs, punch items, invoices) hangs off the project ID.

### D-005: Ignore PRD delivery dates
**Decided:** milestone dates in the PRD (Nov 6, 13, 20, 27, 2026) are not planning constraints.
**Why:** the user's instruction. Reconsider if the client reasserts the dates.

### D-006: Access control enforced server-side
**Decided:** every Convex query/mutation calls a shared access helper (roles + module + record ownership/assignment). UI hiding is cosmetic only.
**Why:** PRD development rule 7.

### D-007: Audit trail
**Decided:** stage changes write to `stageHistory`. Significant record changes write to `activities` (actor, timestamp, entity, before/after where useful). Both are append-only.
**Why:** PRD rule 6. The forms app already keeps a similar change log (`visitRevisions`).

### D-008: Companies and Contacts are one entity (`clients`)
**Decided:** every Jobber client is one record in a `clients` table. The PRD's separate Companies and Contacts modules are merged into a single Clients module. A client has a `type` (homeowner | contractor) and optional business details. Projects reference `clientId`.
**Why:** companies and contacts are both Jobber clients, so two tables would model one concept twice and complicate the import.
**Consequence:** "contacts associated with companies" is satisfied by the client record itself. "Jobs filterable by company" becomes "filterable by client".

### D-009: Milestone 1 is already done
**Decided:** the PRD starts at Milestone 2. Milestone 1 covered the Google Workspace, DNS and email set-up and is complete, so those client inputs are closed.

### D-010: Installers do not log in
**Decided:** login roles are Admin, Sales, Office Team, Project Managers. Installers and crews are records, not users. Work packages reach them by WhatsApp as secure, expiring, tokenised links (or attachments). Progress and punch-list updates are entered by PMs/Office.

### D-011: One-time Jobber import, then a single cutover (PARTLY SUPERSEDED by D-028: Jobber and the CRM now run side by side until the CRM is complete; the import and retiring Jobber at the end still stand)
**Decided:** no ongoing sync and no parallel run. The import is run once, at the very end (D-022), and de-duplicates. After cutover Jobber is retired.
**Consequence:** what happens to quotes, jobs and invoices still open in Jobber on the switch day was not answered (the question was dropped). Default: finish them in Jobber, read-only afterwards. Revisit before cutover.

### D-012: New CRM project; the live forms app stays untouched until cutover (SUPERSEDED by D-026 on repo and backend; the rule not to modify the live app without the user's go-ahead still stands)
**Decided:** the CRM is a new Next.js app on a new Convex deployment, in its own repo. The live forms app (`../forms`, Next.js 16 + Convex + Jobber push) is not modified until cutover. Its pricing, catalogue and on-site visit logic are copied across, not shared.
**Why:** the forms app is live with the client and production changes need explicit go-ahead. Copying costs some duplication but nothing live can break.
**Consequence:** at cutover a one-time script turns forms `projects` into `clients` + projects, and the forms start writing to the CRM instead of Jobber. Until then the forms keep creating clients, requests and quotes in Jobber. The CRM must not depend on the forms backend.

### D-013: Single switch-over, UI/UX first (SUPERSEDED by D-027 on the single switch-over; UI-first inside each milestone still stands)
**Decided:** one switch-over from Jobber at the end of Milestone 5, not a staged handover. Phases follow the PRD milestones (Phase N is Milestone N). Inside each milestone the UI/UX is designed and built first on sample data, then wired to Convex. The Jobber import and the connection to the forms app happen at the very end (D-022).
**Why:** the user chose it. It keeps one clean cutover and lets the client see the whole product before any live data moves.
**Consequence:** the PRD rule to release usable modules early (section 8, rules 1 and 2) is relaxed. `phases.md` follows the PRD milestones, UI-first within each. Records entered in Jobber meanwhile are picked up by the final import.

### D-014: A user can hold more than one role
**Decided:** roles are additive. One person can be Sales and Project Manager, for example, and gets the union of both. Nav and permissions are computed from the set of roles.
**Why:** it is not known whether project managers are separate people from sales or office staff. This works either way.

### D-015: We pull the Jobber data ourselves
**Decided:** the Jobber export is our task, not the client's. Prefer the Jobber API (already connected in `../forms`) over CSV, falling back to a CSV export we run ourselves.
**Why:** the user's correction. It removes a client dependency.

### D-016: Three business entities
**Decided (from the client's staff list):** Quality First Turf, Quality First Turf Construction and Quality First Patios are three `businesses` in the CRM, each with its own domain, mailboxes and document branding. Users can belong to more than one. A project belongs to one business.
**Open detail:** what differs between the three on quotes and invoices, and whether one client can have projects with several (held question B1.3).

### D-017: Design consequences of the client's answers
- **United States, all states.** Sales tax and time zone vary by job. Treat tax as a per-quote/per-property setting and time zone as a property or user setting, not one global value.
- **The customer form is the source of client data.** Name, phone, email, address and the homeowner/contractor choice all come from the customer form. Required client fields follow the form's.
- **Clients list has a Homeowner/Contractor filter.**
- **Scale.** No assumed client-count limit. Use indexed, paginated queries throughout.
- **Responsive on every device.** No separate mobile app. Online-only is assumed.
- **Export.** Users (at least Admin) can export clients, projects, quotes and invoices.
- **Not needed:** extra property handling beyond the form, contractor-to-homeowner linking, multiple people per contractor, lead sources, custom retention rules. Re-open if they come back.

### D-018: No client questions now; ask only when blocked
**Decided:** no questions go to the client at this stage. When a question blocks building a specific part, ask it then. The backlog is `client-questions-later.docx`, tracked in `client-answers.md`. Held means valid but not now, not dropped.
**Why:** the user's instruction.

### D-019: UI/UX direction
**Decided:** heavily Jobber-inspired and minimalist (client requirement). Colours are sampled from the user's Jobber screenshots: shell `#eeece7`, selected/chip `#dcdad5`, white content, headings `#032b3a`, body text `#233d48`, muted `#49646f`, lines `#dadfe2`, green accent `#388523`, with small status colours (lead blue `#3b9ae8`, overdue red `#7a0c00` on `#faecea`) and four workflow colours (orange `#b36109`, burgundy `#923f4f`, green, navy `#225c8c`). Kanban board views wherever a pipeline or status list exists, with a list toggle.
- **Nav:** superseded by D-025.
- **Clients page:** Jobber's section order (contact info, properties, other contacts, lifetime value and balance, last communication, work overview, billing, schedule, notes and files). Provisional until screenshots arrive. Mobile uses three tabs: Client, Work, Notes. Reorderable sections, payment methods and a client portal are left out.
- **Project page:** tabs Overview, Visit, Quotes, Files, Activity. Overview shows customer and address, current stage with a move button, next scheduled visit, requested services. Visit is the forms app's four-step flow (property, services and areas, photos and notes, review), phone-first.
- **Phone-first:** Today/Schedule, Project Overview, Visit, Tasks, progress updates and punch list, customer sign-off. **Desktop-first:** pipeline boards, quotes, invoices, takeoff and catalogue, crews and work packages, settings and import.
**Fonts and icons:** the same as Jobber's, from its published design system (`@jobber/design`, MIT): Inter for text, Poppins for headings (Jobber Pro is proprietary; Poppins is Jobber's own documented fallback), and the Atlantis icon set.
**Why:** the client knows Jobber. The user confirmed these in conversation.

### D-020: Working method
**Decided:** brainstorm and agree one step at a time, and build nothing until that step's design is approved. The Superpowers skills in `.claude/skills/` are used (brainstorming, then writing-plans).
**Why:** the user's instruction.

### D-021: What carries over from the forms app (by copying)
**Decided:** the visit flow and change log (`visitSnapshots`, `visitRevisions`, `workAreas`, versioned visits), the pricing engine (catalogue, 2026 price list, area-size bands, homeowner/contractor rates, quote-line builder), consultation scheduling ideas, and short project codes. The Jobber push is dropped only when Jobber is ended, at the end (D-028). Staff log in to the CRM through Clerk; the forms app keeps its own sales login until the user approves changing it.
**Why:** the forms app is production-proven and already encodes the client's pricing rules.
**Note (D-026, D-029):** the backend is now shared, so copying pricing or visit logic into the same Convex deployment would create duplicate functions. Never edit a forms function in place. If a forms function can be reused as it is, call it. If the CRM needs a different behaviour, copy it under `convex/crm/` with its own name. Decide per module when it is built and log it here.

### D-022: Jobber import deferred to the very end, done once (UNDER REVIEW: see D-027, D-028 and Q-021)
**Decided:** no import tooling or import screen is built during development. The import is built and run once, at the end, in Milestone 5. Doing it earlier would mean re-importing every client added to Jobber in the meantime, so it is done once.
**Status:** the user will confirm with their supervisor. Until then it is deferred.
**Why:** the user's reasoning: Jobber keeps receiving new clients while the CRM is built.
**Consequence:** Milestone 2's import acceptance criterion is satisfied at the end. Sample data stands in for clients until then.

### D-023: Plain HTML/CSS/JS mockups first, then Next.js
**Decided:** before any Next.js code, the Phase 2 screens are built as static HTML, CSS and plain JavaScript mockups in `mockups/`, on sample data. The user approves them, then they are converted to Next.js.
**Why:** the user's instruction. A mockup is quicker to change and review.
**Screens covered (from the Jobber screenshots):** Home, Clients list, Client page (Client information, Communication, Files and media), New/Edit client form.
**Changes from Jobber:**
- Clients list uses **pagination** (rows per page, page numbers), not infinite scroll.
- No separate mobile layout. The desktop view just gets more compact on small screens: the nav collapses to an icon rail and the right-hand column moves below the main content.
- Added a Homeowner/Contractor **Type** filter, a **Business** switcher (three businesses) and an **Export** button.
- Nav shows Projects in place of Requests, plus Tasks, Messages, Materials, Crews. No separate Payments item: payments live inside Invoices, as in the PRD.
- Anything Jobber has that the PRD does not mention was removed (see D-024).

### D-024: Build only what the PRD describes
**Decided:** screens and features that Jobber has but the PRD does not mention are not built, in the mockups or later. Removed from the mockups: Clients stat cards, client status and tags, lead source, payment terms, lifetime value and balance, properties/extra contacts, billing and payment-methods panels, recent pricing, Files tab, merge clients, archive, email button, help icon, Task/Project in the Create menu, Visit/Employee toggle and appointment stats, "Save and Create Another", tax-rate and billing-address options.
**Kept (all in the PRD):** contact profile (name, email, phone, address, type, company, related projects, activity history, notes), search and filters, dashboard figures (new and approved leads, pending quotes, jobs awaiting invoicing, outstanding payments, today's jobs, upcoming consultations, my tasks), Quick Create (client, quote, job, invoice, intake form), calendar, notifications, messages, export.
**Why:** the user's instruction. Re-check any proposed screen against `prd.md` before adding it.

### D-025: Sidebar and some Jobber items restored (user's call)
**Decided:** the sidebar is exactly: Create, Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices, Payments, Messages, Pipeline. Tasks, Materials, Crews and Settings are not in the sidebar (Settings stays reachable from the top bar). The Clients page stat cards (new leads, new clients, total clients), the client page Overview card (lifetime value, current balance) and the Home content removed earlier (appointment stats, Visit/Employee toggle, grouped appointments, status pills, View Schedule, the extra workflow lines) are back. On Home, the My tasks card was then replaced by My messages (texts and WhatsApp, which the PRD logs against the client and user). The Create button opens Jobber's icon-row popover (Client, Request, Quote, Job, Invoice, each in its workflow colour), plus an Intake form item because the PRD's Quick Create lists it. This relaxes D-024 for those items only; everything else Jobber-only stays out.
**Fonts and lines:** text is Inter (open source; the files the user supplied from Jobber's CDN). Headings use **Figtree** (open source, SIL OFL) because it matched Jobber Pro's proportions and weight best in a side-by-side test against the user's screenshot. Jobber Pro itself is proprietary and is not used or modified. Divider and border lines are darker (`#b8c2c7`). Main content side padding is 12px.
**Open:** "Requests" and "Pipeline" are Jobber's names. How they map to the PRD's central project record (D-004) is for the next design step. Tasks, Materials and Crews screens will need another way in.

### D-026: One repo (monorepo), one shared Convex backend
**Decided:** the CRM and the forms app live in one git repo. The repo root is `Quality-First-Turf/` and holds `forms/` (the live app, moved in unchanged), `CRM/` (docs, mockups and, later, the Next.js app) and a root README. The two apps share one Convex backend so enquiries from the forms can create clients and projects in the CRM without a bridge.
**Why:** the client is shifting from Jobber as milestones ship (D-027), so forms and CRM must exchange data from the first release.
**Rules that follow:**
- Schema changes are additive. Existing tables used by the forms (`projects`, `visitSnapshots`, `visitRevisions`, `workAreas`, `salesSessions`, `jobberConnections`) are not edited. CRM tables are new.
- One `convex deploy` publishes everything, so a CRM change can break the live forms. Every production deploy needs the user's explicit go-ahead, per the forms app's own handoff rules.
- The forms app and its Jobber push stay as they are until the user approves changing them.
- Each app keeps its own `package.json` and tooling.
**Open:** where the shared `convex/` folder lives (Q-020).

### D-027: Ship per PRD milestone, replacing the single switch-over
**Decided:** the client starts moving off Jobber as milestones are released, so each PRD milestone (Phase N = Milestone N) is built to completion on the real backend and shipped, in order: Milestone 2 (clients, import, user access), then 3, 4 and 5. "To completion" means a milestone is not shipped until its acceptance criteria in `docs/prd.md` pass.
**Why:** the client's request, relayed by the user. It matches the PRD's own rules to release usable modules early.
**Consequences:**
- The mockups are for review only. Each milestone needs real Next.js, Convex, Clerk and production hosting before release.
- Clients must be imported from Jobber for the Milestone 2 release (D-022 under review), then topped up by a final import for anything added to Jobber meanwhile.
- Jobber stays in use for the modules not yet released, so for a while the same customer exists in both systems. Which system is the source of truth for each module must be stated at each release.
- Enquiries from the forms must reach the CRM, which means changing the live forms app. That needs the user's explicit go-ahead.

### D-028: Jobber keeps working in full until the CRM is complete
**Decided:** Jobber, and everything connected to it (the forms app's Jobber push, the 10-minute consultation sync, the OAuth connection and its env vars), keeps working exactly as it does today until the CRM is finished. The CRM is built beside it on the same Convex deployment, and the team moves onto the CRM gradually. Only when the CRM is complete is the Jobber connection ended and the team fully on the CRM. No Jobber functionality is removed, disabled or repointed before then.
**Why:** the user's plan (2026-11-04). The client always has a working system, and nothing is half-migrated.
**Refines D-027:** milestones are still built to completion and released in order, but a release only adds CRM capability. It never removes anything from Jobber. "Complete" means all of Milestones 2 to 5 pass their acceptance criteria; confirm with the user when that point is near.
**Consequences:**
- The same customer can exist in both systems for a long time. Each release states which system is the source of truth for each module (D-027).
- CRM work must not edit the forms app's Jobber code (`convex/jobber/`, `convex/projects/consultation.ts`, the Jobber crons and env vars).
- Ending Jobber (disconnect, remove the push, sync and crons, retire the `JOBBER_*` env vars, point the forms at the CRM) is its own final task and needs the user's explicit go-ahead.
- Import timing is still open (Q-021).

### D-029: One shared Convex backend; CRM code in `convex/crm/` (location SUPERSEDED by D-030; the rules below still stand)
**Decided:** one Convex backend serves both apps. It was first left inside `forms/` as a cautious default; the user then asked for it to sit beside the apps (D-030). CRM code goes in new subfolders, `convex/crm/` and below, with new table names, so function paths read `api.crm.clients.*`.
**Rules:**
- The single-file entry points are shared: `schema.ts` (all tables), `http.ts` (all routes), `crons.ts` (all jobs) and `convex.config.ts` (it lists the allowed env vars and installs components). CRM changes to them are additive only, never edits to existing forms entries.
- `auth.config.ts` is new, for Clerk. The forms' sales login uses its own session tokens (`salesSessions`), not Convex auth, so adding Clerk doesn't change it. Check that again before adding it.
- Day-to-day work runs against the **dev** deployment only. Before proposing any production deploy: typecheck and build both apps, and get the user's explicit go-ahead.
- Both Vercel projects use the same `NEXT_PUBLIC_CONVEX_URL` (dev for local work, production for the live sites).

### D-030: The shared `convex/` lives at the repo root, beside `forms/` and `CRM/`
**Decided:** the user's idea (2026-11-04), implemented on branch `monorepo` as one revertible commit (`29ce591`). The layout is `Quality-First-Turf/{forms, CRM, convex}`.
**Why:** neither app should own the shared backend, and the CRM should not import types from inside the forms app.
**What changed:**
- `forms/convex/` moved to `convex/`. No function, schema or behaviour changed.
- The backend imported nine pure-TypeScript files from `forms/lib/` (`catalogue`, `discovery`, `errors`, `jobber-names`, `price-list`, `quote-lines`, `visits`, `zoned-time`, `us-states`). They moved to `convex/shared/` and the imports were rewritten (apps use `@/convex/shared/...`). Anything in `convex/shared/` must stay free of React, Next and browser-only code, and a change there affects the live forms app.
- npm workspaces at the root (`forms` now, `CRM` when scaffolded). The lockfile is at the root; the backend's packages (`convex`, `@convex-dev/rate-limiter`) are root dependencies. Resolved versions of next, react, convex, the rate limiter and typescript are unchanged.
- `forms/convex.json` points the Convex CLI at `../convex/`. `forms/tsconfig.json` maps `@/convex/*` to `../convex/*`. `forms/next.config.ts` sets `turbopack.root` and `outputFileTracingRoot` to the repo root.
**Consequences:**
- Vercel needs, per project, Root Directory set to the app folder and "Include source files outside of the Root Directory" enabled, with the install run from the repo root. The user does this in the dashboard.
- The CRM app must be wired the same way when scaffolded (see the root `CLAUDE.md`).
**Verified locally:** typecheck of `forms/` and `convex/`, lint, a production `next build`, and esbuild bundling of all 31 backend modules. **Not verified:** the Convex CLI (`npx convex dev` was refused on the machine used, "You don't have access to the selected project", so the user should run it once on the dev deployment) and any Vercel build. To undo: revert `29ce591` and run `npm install` inside `forms/`.

## Open Questions

| ID | Question | Blocks | Owner |
|----|----------|--------|-------|
| ~~Q-004~~ | Resolved: Vercel, one project per app. Subdomains: `forms.qualityfirstturf.com` (forms app), `launchpad.qualityfirstturf.com` (CRM). | | |
| Q-005 | Contract signing and completion sign-off: in-app e-signature or an external service? Client undecided. | Phase 3 contract flow, Phase 4 sign-off | Client (ask when blocked) |
| Q-006 | Phone/SMS provider (Twilio assumed). WhatsApp Business account status and verification. | Phase 5 | Client (ask when blocked) |
| Q-009 | Document generation: how quotes, work packages, invoices and sign-offs are produced (PDF from templates). | Phases 3 to 5 | Client |
| Q-010 | Google integration depth: Calendar read-only or two-way? Drive for files, or Convex storage? Drive is being merged into office@ in Workspace. | Phase 3 | Client |
| Q-014 | Roles of Sal, May and Robert (guess: Sal Admin and Sales, May Office Team, Robert Project Manager). Not asked yet. | Phase 2 roles | Client |
| Q-015 | What differs between the three businesses on quotes and invoices; can a client have projects with several? (B1.3) | Phase 2 schema | Client |
| Q-016 | Duplicate client rule (same email, phone, name + address). (B2.6) | Phase 5 import | Client |
| ~~Q-017~~ | Resolved: colours sampled from the screenshots (D-019) | | |
| Q-018 | The logo file. | Setup | User |
| Q-019 | Supervisor to confirm that the Jobber import is deferred to the very end (D-022). See also Q-021. | Phase 5 | User |
| ~~Q-020~~ | Resolved: the shared `convex/` is at the repo root (D-030). Still to confirm: the Convex CLI on the dev deployment and the Vercel settings. | | |
| Q-021 | Which Jobber data must be in the CRM at the Milestone 2 release, and which system owns clients until Jobber is ended (D-028)? Supervisor to confirm the import timing (Q-019). | Milestone 2 release | User |

Resolved: Q-001 (D-009), Q-002 (D-008, D-016), Q-003 (D-012, later reversed by D-026), Q-004 (Vercel), Q-007 (D-011), Q-008 (D-015), Q-011 (D-010), Q-012 (D-017), Q-013 (dropped, see D-011).

## Client inputs (PRD section 7)
The question backlog is `client-questions-later.docx`. Status:

- [x] 1. Jobber exports: our task (D-015)
- [x] 2. Google Workspace Super Admin and DNS access (Milestone 1)
- [x] 3. Email accounts, aliases, shared mailboxes (Milestone 1; see `client-answers.md`)
- [ ] 4. Google Drive access and storage details (Drive moving to office@)
- [ ] 5. Product catalogue and measurement units (Phase 4)
- [ ] 6. Material calculation formulas and wastage rules (Phase 4)
- [ ] 7. Supplier details and availability (Phase 4)
- [ ] 8. Installer budget structure and work package requirements (Phase 4)
- [ ] 9. Contract, invoice and completion sign-off templates (Phases 3 to 5)
- [ ] 10. Phone/SMS provider and WhatsApp Business access (Phase 5)
