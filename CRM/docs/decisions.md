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

### D-011: One-time Jobber import, then a single cutover
**Decided:** no ongoing sync and no parallel run. The import is run once, at the very end (D-022), and de-duplicates. After cutover Jobber is retired.
**Consequence:** what happens to quotes, jobs and invoices still open in Jobber on the switch day was not answered (the question was dropped). Default: finish them in Jobber, read-only afterwards. Revisit before cutover.

### D-012: New CRM project; the live forms app stays untouched until cutover
**Decided:** the CRM is a new Next.js app on a new Convex deployment, in its own repo. The live forms app (`../forms`, Next.js 16 + Convex + Jobber push) is not modified until cutover. Its pricing, catalogue and on-site visit logic are copied across, not shared.
**Why:** the forms app is live with the client and production changes need explicit go-ahead. Copying costs some duplication but nothing live can break.
**Consequence:** at cutover a one-time script turns forms `projects` into `clients` + projects, and the forms start writing to the CRM instead of Jobber. Until then the forms keep creating clients, requests and quotes in Jobber. The CRM must not depend on the forms backend.

### D-013: Single switch-over, UI/UX first
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
**Decided:** the visit flow and change log (`visitSnapshots`, `visitRevisions`, `workAreas`, versioned visits), the pricing engine (catalogue, 2026 price list, area-size bands, homeowner/contractor rates, quote-line builder), consultation scheduling ideas, and short project codes. The Jobber push is dropped at cutover. The shared sales login is replaced by Clerk.
**Why:** the forms app is production-proven and already encodes the client's pricing rules.

### D-022: Jobber import deferred to the very end, done once
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

## Open Questions

| ID | Question | Blocks | Owner |
|----|----------|--------|-------|
| Q-004 | Hosting for the Next.js app (Vercel assumed)? | Setup | Sarim |
| Q-005 | Contract signing and completion sign-off: in-app e-signature or an external service? Client undecided. | Phase 3 contract flow, Phase 4 sign-off | Client (ask when blocked) |
| Q-006 | Phone/SMS provider (Twilio assumed). WhatsApp Business account status and verification. | Phase 5 | Client (ask when blocked) |
| Q-009 | Document generation: how quotes, work packages, invoices and sign-offs are produced (PDF from templates). | Phases 3 to 5 | Client |
| Q-010 | Google integration depth: Calendar read-only or two-way? Drive for files, or Convex storage? Drive is being merged into office@ in Workspace. | Phase 3 | Client |
| Q-014 | Roles of Sal, May and Robert (guess: Sal Admin and Sales, May Office Team, Robert Project Manager). Not asked yet. | Phase 2 roles | Client |
| Q-015 | What differs between the three businesses on quotes and invoices; can a client have projects with several? (B1.3) | Phase 2 schema | Client |
| Q-016 | Duplicate client rule (same email, phone, name + address). (B2.6) | Phase 5 import | Client |
| ~~Q-017~~ | Resolved: colours sampled from the screenshots (D-019) | | |
| Q-018 | The logo file. | Setup | User |
| Q-019 | Supervisor to confirm that the Jobber import is deferred to the very end (D-022). | Phase 5 | User |

Resolved: Q-001 (D-009), Q-002 (D-008, D-016), Q-003 (D-012), Q-007 (D-011), Q-008 (D-015), Q-011 (D-010), Q-012 (D-017), Q-013 (dropped, see D-011).

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
