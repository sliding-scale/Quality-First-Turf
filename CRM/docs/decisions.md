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
**Consequence:** "contacts associated with companies" is satisfied by the client record itself. "Jobs filterable by company" becomes "filterable by client". `prd.md` now carries one Clients Module section instead of two (D-031). Clients are listed per business (D-031).

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

### D-023: Plain HTML/CSS/JS mockups first, then Next.js (DONE: converted in D-033, mockups removed)
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
**Open:** "Pipeline" is Jobber's name and still needs mapping to the PRD's central project record (D-004). Requests is answered in D-039. Tasks, Materials and Crews screens will need another way in.

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
**Correction (2026-11-05):** the first `npx convex dev` run on the dev deployment failed with `InvalidConfig: Invalid module path 'shared/quote-lines.js'`. Convex only allows letters, digits, underscores and periods in file names under `convex/`, and five of the moved files had hyphens. They are now `jobberNames`, `priceList`, `quoteLines`, `usStates` and `zonedTime` (`.ts`), renamed with `git mv`, and every import was updated (backend, `forms/`, `CRM/`). Nothing was pushed by the failed run. The rule is now in the root `CLAUDE.md` (rule 6). Typecheck, lint, build and esbuild do not check this, so only a real `convex dev` push proves it.
**Verified locally:** typecheck of `forms/` and `convex/`, lint, a production `next build`, and esbuild bundling of all 31 backend modules. **Not verified:** the Convex CLI (`npx convex dev` was refused on the machine used, "You don't have access to the selected project", so the user should run it once on the dev deployment) and any Vercel build. To undo: revert `29ce591` and run `npm install` inside `forms/`.

### D-031: Each business has its own client list
**Decided (user, 2026-11-04):** a client belongs to exactly one of the three businesses, and the Clients tab shows only the clients of the business selected in the top-bar switcher. Switching business changes the list, the stat cards and the CSV export. A new client starts in the selected business. The PRD's Companies and Contacts modules, already merged by D-008, are now written as one "Clients Module" (section 2.1) in `prd.md`, with the data-import and user-access sections renumbered 2.2 and 2.3.
**Why:** the three businesses are run separately (D-016), so their customers should not mix.
**Consequence:** `clients` carries `businessId` with an index on it, and every client query filters by it (and by the caller's business access, D-014). A person who is a customer of two businesses is two client records, one per business. This closes the "can a client have projects with several" half of Q-015 for clients. Projects follow their client's business, which still fits "a project belongs to one business" (D-016). The Jobber import (D-022) must place each client in a business, so a business-assignment rule is needed there.
**Implementation:** `useBusinessClients()` in `lib/clients.ts` scopes the list and stat cards; the switcher updates the list without a reload.

### D-032: "Intake form" removed from the Create menu
**Decided (user, 2026-11-04):** the Create menu is Client, Request, Quote, Job, Invoice. The "Intake form" item (added in D-025 because the PDF's Quick Create lists "open customer intake forms") is removed from the Create menu. The forms app stays a separate live app (D-026); the CRM does not link to it from Create for now.
**Why:** the user did not know what it was for and asked for it to go.

### D-033: Milestone 2 screens converted from the mockups to Next.js
**Decided (user, 2026-11-04):** the approved mockups were recreated as the CRM's Next.js app, to look and behave exactly the same, and the `mockups/` folder was deleted (it stays in git history).
**What was built:** the CRM is an npm workspace (`CRM` added to the root `workspaces`, `convex.json`, the `@/convex/*` alias, `turbopack.root` and `outputFileTracingRoot` set as in the root CLAUDE.md). Screens: Home, Clients list, New client, Client page, Edit client. The stylesheet is the mockup CSS unchanged (`app/globals.css`). All client data goes through `lib/clients.ts`, so Convex can replace it (D-013).
**Differences from the mockups:** clean routes instead of `client.html?id=` (`/clients/[id]`, `/clients/new`, `/clients/[id]/edit`); the business switcher updates the list in place instead of reloading; "X is not built yet." replaces "X is not part of this mockup yet."; the sort state is on the column header (`aria-sort`) instead of the button; Inter and Figtree load through `next/font`.
**Not wired yet:** Convex, Clerk, access control, `.env.local` (not needed until data moves to Convex; it must point at the dev deployment). Sample data, new clients and notes live in the browser's localStorage.
**Verified:** typecheck, lint and `next build` pass; headless-Chrome screenshots of the four screens against the mockups differ by 8 to 77 pixels out of 1.44 million (anti-aliasing); scripted checks passed for the business switch, Create popover, filter, sort, search, pagination controls, notes, edit prefill, form validation and save, sidebar collapse, and the top-bar search. No browser-console errors.

### D-034: Skeleton loaders everywhere (rule)
**Decided (user, 2026-11-05):** every screen, list, table, card, panel and form that waits for data, a route or the browser shows a skeleton loader shaped like the real content. This is a standing rule for all CRM UI, including every screen built later.
**What was built:** components/skeletons.tsx with a Sk block and one skeleton each for Home, Clients, Client page and the client form; they are the fallback while a page hydrates and the loading.tsx for /clients, /clients/new, /clients/[id] and /clients/[id]/edit. The animation is a soft pulse (no gradients, D-019) and stops under prefers-reduced-motion.
**How to apply:** a new screen is not done until its skeleton exists. When data moves to Convex, show the skeleton while a query is loading (undefined). The forms app is not covered; it is live and is not edited without the user's go-ahead.
### D-035: Three UI rules: hover feedback, fixed table columns, red invalid fields
**Decided (user, 2026-11-05):** standing rules for all CRM UI, current and future screens (full wording in `CRM/CLAUDE.md`).
1. **Hover feedback on buttons.** Everything clickable changes on hover and on press; disabled controls do not.
2. **Fixed table column widths.** `table-layout: fixed` plus a `<colgroup>` on every table; columns do not resize with content, search or filters.
3. **Invalid fields turn red when the user tries to submit,** with a message, focus on the first one, and clearing as each is corrected.
**What was changed to meet them:** hover and press styles added for chips, tabs, toggles, sort headers, radio options, the primary and link buttons, inputs and the current page button; the pencil (edit) button's hover was being overridden and is fixed. The clients list, the related-projects table, the visits table and the Clients skeleton now have a `<colgroup>`; the clients list is single-line with ellipsis and full text in `title`. The client form now flags every invalid field (first name, last name and company together for the "enter a name" rule, phone, email) only after the first submit attempt, and clears each as it is fixed.
**Not changed:** which fields are validated. ZIP and state are still unchecked; add rules there when the client's data requirements are known.
### D-036: "More Actions" menu on Clients (Import, Export, Merge); 10 rows per page
**Decided (user, 2026-11-05, from a Jobber screenshot):** the Clients header is the green **New Client** button and an outlined **More Actions** button (dots icon) that opens a menu: **Import Clients**, **Export Clients**, **Merge Clients**. The separate Export button is gone; Export Clients does the CSV export as before. The Clients list now defaults to **10 rows per page** (10, 25, 50, 100 remain choices).
**Conflicts with earlier decisions, resolved by the user's request:** D-024 removed "merge clients" because the PRD does not mention it, and D-022 defers the Jobber import to the end. The menu entries exist now, but **Import and Merge are not built**: they show "not built yet." until their own steps are designed. Export works. Merge is not in the PRD, so its behaviour (which record wins, how history and projects move) needs a design step before it is built.
**Details:** `Import` and `Merge` icons are drawn in `lib/icons-extra.ts` (Atlantis has no equivalents in our icon table); the menu uses the `actions` variant of the dropdown.

### D-037: Smooth animations everywhere things change (rule)
**Decided (user, 2026-11-05):** state changes and anything displayed, collapsed or expanded animates; this is a standing rule (`CRM/CLAUDE.md`).
**Built:** the sidebar collapse eases the column from 188px to 64px in about 260 ms while the labels fade and the arrow turns; the Create popover and dropdown menus pop in and out, with the Create icons staggering in; toasts slide in and out; pages, tab panels, table rows, notes and error messages fade or rise in; hover, press and focus colours ease. Exit animations keep the element mounted for 140 ms before it unmounts. Reduced-motion users get none.
**Verified:** the sidebar width, the popover opacity while opening and closing, and the toast removal were sampled frame by frame in headless Chrome.

### D-038: Input rules and the state dropdown
**Decided (user, 2026-11-05):** fields stop wrong characters instead of only complaining afterwards. Phone: digits only, auto-formatted as `(951) 555-0178` (a leading 1 or +1 is dropped; pasted text is cleaned). ZIP: digits only, five maximum, must be five on submit. First name, last name and city: letters, spaces, apostrophes, periods and hyphens only. Email: no spaces. State: a dropdown of all states and DC from the shared `US_STATES` list (the value stored is the two-letter code).
**Where:** `lib/fields.ts` and `components/client-form.tsx`. Red-on-submit (D-035) is unchanged and now also covers ZIP; the phone message reads "Enter a 10-digit phone number."
**Not done:** the client list and client page do not reformat old data; sample phone numbers are already in this format.
### D-039: Requests screen, built on trial (answers the open question in D-025)
**Decided (user, 2026-11-05, from a Jobber screenshot):** build a Requests screen now. The user had no specific need for it beyond being able to look at "all the requests and only the requests", and chose to build it and **remove it later if the client does not like it**. The user opted out of the design questions.
**Design (my calls, each correctable):**
- **A request is not a record.** It is a Sales-pipeline project seen through its early stages (rule 1 of `CRM/CLAUDE.md` holds: one central project record). The Requests status is derived from the project's stage: New Request is **New** (or **Overdue** after 21 days, my assumption, the PRD gives no number); Schedule Onsite Consultation and Onsite Consultation are **Consultation**; Quote Draft onward is **Converted**; Closed Lost is **Lost**. Moving the project moves the request. "Converted" is therefore not an action, only a stage the project reaches.
- **Layout follows Jobber's:** Overview card (counts by status), New requests (past 30 days) and Conversion rate cards with a change against the previous 30 days (computed, not typed in), All requests table (Client, Title, Property, Contact, Requested, Status) with Status and Date filters, search, sorting, pagination (10 rows), and a More Actions menu with Export Requests.
- **Left out, not in the PRD (D-024):** the promo card, Customize Form, Share or Embed.
- **Row click** opens the client page (the project page belongs to Milestone 3). **New Request** and Create > Request show "not built yet."; a request is created by the customer form or by adding a project, both later.
**Overlap to watch:** the Pipeline tab (Milestone 3) will show the same early-stage projects as a board. If the client sees Requests as redundant, delete it.
**To remove it:** delete `app/requests/`, `components/requests-page.tsx`, `lib/requests.ts`, `RequestsSkeleton` in `components/skeletons.tsx`, the `/requests` link on the Requests item in `components/shell.tsx` (it goes back to "not built yet", or drop the item), and the `requests (D-039)` block at the end of `app/globals.css`. Nothing else depends on it.
**Sample data:** one sample project per client, using the same stage rule as the client page, so a request and the client's Related projects table always agree. Sample project ages were moved from 8 to 2 days so recent requests exist.
### D-040: What happens when a customer fills in the form
**Decided (user, 2026-11-05):** a submitted customer form does two things.
1. **The client.** If the person is a unique client, a new client is created. If they are already a client, no second client is made.
2. **The request.** A request is created either way.
**How this fits the model (my reading, correctable):** "a request is created" means a new project is created in the Sales pipeline at the first stage, **New Request** (D-004, D-039), linked to the client by `clientId`. It then shows up on the Requests screen as **New**. A returning client gets a new project, not a new client. The form's requested services, measurements and photos go on that project, and the activity log records "Project created from the customer form".
**Where it lives:** the Milestone 3 enquiry flow. The forms app still creates clients, requests and quotes in Jobber, untouched, until the CRM is complete (D-028). Changing the live forms app to write to the CRM needs the user's explicit go-ahead, and the CRM must not depend on the forms backend (D-011). Nothing is built for this yet; the Requests screen and the client list run on sample data.
**Still open, needed before it is built (Q-016):** what makes a client "unique". My proposal: the same email, or the same phone number (digits only), **within the same business** (clients are per business, D-031), and otherwise a new client. The form belongs to Quality First Turf today, so it creates clients and requests in that business. A name and address match on its own would only be flagged for staff, not merged automatically, because merging wrongly is worse than a duplicate.
### D-041: Filter dropdowns (searchable status, date range), client status, clickable Overview
**Decided (user, 2026-11-05, from Jobber screenshots):**
- **Requests, Status filter:** a search box ("Search statuses"), then All and the five statuses (Consultation, Converted, Lost, New, Overdue), each with a coloured dot and a count, a tick on the selected one, in a scrolling list.
- **Requests, Date filter:** a "Date range" field over the list All, Last week, Last 30 days, Last month, This month, This year, Last 12 months, Custom range. Custom range expands (animated) into From and To dates and an Apply button; Apply turns both red if both are empty or the start is after the end (D-035).
- **Clients, Status filter:** a search box ("Search status"), then All, **Leads and Active** (the default, ticked), Leads, Active, Archived.
- **Requests Overview card:** every status in it (all five, from the same list as the filter) is a button. Clicking one sets the Status filter to it and scrolls to the table. The stat cards on Requests are more compact.
**Relaxes D-024:** D-024 removed client status. Client status is back, as a filter and a pill on the client page. **Lead** = no work won yet; **Active** = a won sales project or a project in Preplanning or later; **Archived** = hidden by staff. Lead and Active are derived from the client's projects, so they will change on their own as projects move. **Archived is a flag with no Archive button yet** (not built); a few sample clients are archived so the filter has data. The Clients stat cards leave out archived clients, and "New leads" now counts real leads.
**My calls:** "Last week" means the previous calendar week, Sunday to Saturday; "Last month" the previous calendar month; "Last 30 days" and "Last 12 months" are rolling. Date ranges are tested against how long ago the request came in.
**Built as:** a general `popover` in the UI provider (animated in and out like the other menus) with `FilterMenu` and `DateRangeMenu` in `components/filter-menus.tsx` and the range rules in `lib/dates.ts`. Open one with `useUI().popover(anchor, render, { className })`.
### D-042: Clients and Requests are connected to the Convex backend (dev deployment)
**Decided (user, 2026-11-05):** the Clients and Requests screens read and write the shared Convex backend instead of browser sample data. Dev deployment only; nothing was deployed to production.
**Backend (`convex/crm/`, schema edits additive):** new tables `businesses`, `clients`, `opportunities` (the central project record, rule 1) and `clientNotes`. A request is **not** a table: it is an `opportunities` row in the Sales pipeline, and its status (New, Overdue, Consultation, Converted, Lost) is worked out from the stage and age on the server (D-039). A client's `status` (lead, active, archived) is stored and has to be kept in step with its projects by the stage-change mutation when that exists (Milestone 3); today only the seed sets it. Stage names, statuses and the field rules are single files (`crm/lib/stages.ts`, `crm/lib/fields.ts`) that the app imports too, so the two sides cannot drift. Server functions: `businesses.list`; `clients` list, stats, get, exportRows, create, update, notes, addNote; `projects.byClient`; `requests` list, stats, exportRows.
**Access (rule 3):** every function starts with `requireStaff`. Clerk is not wired, so it **fails closed**: it only lets a call through when the deployment's `CRM_ALLOW_ANONYMOUS_DEV` is `"true"`, which is for the dev deployment only. A production deploy without that variable rejects every CRM call, so deploying this code to production does not expose any data. The variable is declared in `convex.config.ts`. Roles and per-business access (D-014) go into `requireStaff` when Clerk arrives. The app shows an explanation (not a crash) when the backend says no.
**Paging (my call):** the screens keep their page numbers and "1–10 of N", so the server filters, sorts, counts and cuts the page out of a bounded read: at most 5,000 clients or 2,000 requests per business per call, and the result says `capped` if that is hit. This is deliberately simpler than cursor paging plus `@convex-dev/aggregate` (which the Convex guidelines prefer for large counts); revisit when a business approaches those numbers. A text search comes back in relevance order, so the Clients sort is ignored while searching. Dates and "today" are passed in by the caller, because queries must not read the clock.
**Sample data:** the generator moved to `convex/crm/sampleData.ts`. Load it on dev with `npx convex run crm/seed:run` (98 clients, their projects, three businesses) and clear it with `crm/seed:reset`. Both refuse to run unless the dev switch is on.
**Still sample content on the client page:** scheduled visits, the activity history and the two overview figures (lifetime value, balance). Their tables come with the visit, activity and invoice work. The Related projects table and the notes are real.
**Behaviour changes:** a client that does not exist shows "Client not found" (the mockup fell back to the first client); the business switcher lists the real businesses and remembers the choice by id in this browser; "Last Activity" now sorts newest first by default; the Clients stat cards compare against the previous 30 days using real data.
**Tests:** `CRM/tests/crm-backend.test.ts` runs 19 backend tests in memory with convex-test and vitest (`npm test` in `CRM/`): the gate, the seed, per-business lists, filters, search, sorting, paging, stats, server-side validation, moving a client between businesses, notes, and requests agreeing with the client page. They live outside `convex/`, so deploys never bundle them. Test tooling is a root devDependency: vitest 5 (vitest 3 had critical advisories), convex-test, `@edge-runtime/vm`, and `@types/node` 22 at the root for the backend (the apps keep 20; adding vitest had silently dropped the backend's Node types until that was declared).
**(Superseded by D-046: the anonymous dev switch no longer exists; see the CRM README for how to use dev.)** ~~To use it on dev (the user runs these, from the repo root): `npx convex env set CRM_ALLOW_ANONYMOUS_DEV true`, then `npx convex run crm/seed:run`, then `npm run dev` in `CRM/` (it needs `CRM/.env.local` with `NEXT_PUBLIC_CONVEX_URL`, which points at the dev deployment).~~
**Not verified:** the screens against live data. The CLI would not let me set the dev variable, so the front end was checked against the types, the build and the in-memory backend tests, and the "backend says no" screen was checked in a browser. The first look at real data is the user's.

### D-043: The Convex deployment setting moves to the repo root
**Decided (user, 2026-11-05):** the Convex backend is the root `convex/` folder, so the Convex CLI is run from the repo root and the deployment name lives in the root `.env.local`, not in `forms/`. `CONVEX_DEPLOYMENT` was removed from `forms/.env.local` (the root file already had the same dev deployment) and from `forms/.env.example`. The scripts `convex:dev` and `convex:deploy` moved from `forms/package.json` to the root `package.json`.
**What did not move, and why:** `forms/.env.local` still holds `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` and the Clerk keys, because Next.js only loads env files from the app's own folder. `CRM/.env.local` likewise keeps its `NEXT_PUBLIC_CONVEX_URL`. `forms/convex.json` and `CRM/convex.json` were left in place in case a host or tool runs inside an app folder.
**Consequence:** a Convex command run inside `forms/` or `CRM/` now has no deployment set and would offer to create a new project. Run them from the root.

### D-044: Clerk sign-in comes next; the dev shortcut will not be used
**Decided (user, 2026-11-05):** the next step is Clerk, with real users and sign-in, so `CRM_ALLOW_ANONYMOUS_DEV` is **not** being set on the dev deployment. Until sign-in exists, the Clients and Requests screens show "Sign-in is needed to see this page" because the backend rejects every call (D-042, fails closed). That is the intended state, not a fault.
**What this means for the Clerk step:**
- `requireStaff` (`convex/crm/lib/access.ts`) already returns the identity when there is one; it gains the user lookup, roles and per-business access (D-006, D-014). `convex/auth.config.ts` and the Clerk provider on the app side (`ConvexProviderWithAuth`) are what is missing.
- The seed command is still gated by the same dev variable, so it cannot be run without it. When Clerk lands, give seeding its own dev-only switch (for example `CRM_ALLOW_SAMPLE_DATA`) so sample data can be loaded without opening anonymous access, and add a first-admin bootstrap.
- `forms/.env.local` already holds a Clerk application's keys. Whether the CRM uses that same Clerk application or its own is a question for the start of the Clerk step.
**Not changed:** the code is finished and tested (D-042); it is simply behind the gate. The in-memory tests still run and pass.

### D-045: The customer form now also feeds the CRM (D-040 built, on dev)
**Decided (user, 2026-11-05):** a customer-form submission creates a client in the CRM if the person is new, and a request either way. This is the go-ahead D-028 and rule 3 required for touching the live forms backend. It is built and tested on the dev deployment only; nothing is deployed to production.
**How it works:**
- **One line in the forms code.** `convex/projects/mutations.ts`, in `create`, after the submission and its work areas are saved: `await ctx.scheduler.runAfter(0, internal.crm.intake.recordSubmission, { projectId })`. Nothing else in the forms or Jobber code changed. The Convex save and the Jobber push behave exactly as before.
- **A separate step, on purpose.** The CRM work runs after the form's own save has committed, so a problem in it cannot stop the form, undo the submission or block the Jobber push. A test proves the submission exists before the CRM step has run.
- **Who is "already a client" (proposed from Q-016, confirmed by the user 2026-11-05):** the same email (compared without regard to case) **or** the same phone number, within the business. The customer form belongs to Quality First Turf, so that is the business; the row is created on first use if a deployment does not have it yet. A match is reused: their details are left as staff have them, their last activity is bumped, and an archived client becomes a lead again. A name or address match alone does not merge anyone.
- **The request:** a project in the Sales pipeline at **New Request**, linked to the client, titled from the services asked for, carrying the form's short code and the time the form was sent, owner "Unassigned". It shows on the Requests screen as New. Customer type comes from the form's "Customer type" answer.
- **Safe to repeat.** Each project remembers which submission it came from (`sourceProjectId`), so running the step twice never makes two requests.
**Catch-up for earlier submissions:** `npx convex run crm/intake:backfill` (from the repo root) gives every existing forms project its client and request, oldest first, in small batches, and can be run again safely. It is meant to be run once, when this first goes live. Whether to run it is the user's call.
**Not synced yet:** later changes made in the forms (a salesperson claiming a lead, editing details, moving to a visit) do not update the CRM record. The stage-change work in Milestone 3 and the Clerk step will decide how assignment and stages flow.
**Tests:** `CRM/tests/intake.test.ts` (9 tests, run through the real `projects.create`): a new person becomes a client plus a request; the same email or phone is not a second client but is a second request; a different person is a new client; contractors are recorded as contractors; an archived client comes back as a lead with details unchanged; repeating the step adds nothing; the form's save comes before the CRM step; a vanished submission is ignored; the catch-up works once and only once.
**To put it live (all the user's steps, in this order):** 1. `npx convex deploy` to production (adds the CRM tables and this step; with no sign-in the CRM screens stay closed, D-044). 2. Optional: `npx convex run crm/intake:backfill --prod`. 3. Fill the live customer form once and check the new rows in the production dashboard's `clients` and `opportunities` tables.
**To try it on dev now:** fill the forms app's customer form while it points at the dev deployment, then look at the `clients` and `opportunities` tables in the dev dashboard (the CRM screens themselves stay closed until sign-in exists).

### D-046: Clerk sign-in, invite-only access, roles and the Users screen (built on dev)
**Decided (user, 2026-11-05):** Clerk, the **same Clerk application as the forms**; access is **invite-only**; **admin@qualityfirstturf.com** is the first Admin; the CRM's sign-in screen looks like Jobber's login, and the forms' own sign-in is left alone (it does not use Clerk).
**How it works**
- **Sign-in:** every page needs a Clerk session (`proxy.ts`, Next 16's middleware) except `/sign-in` and `/sign-up`. Convex checks the Clerk token (`convex/auth.config.ts`, reading `CLERK_JWT_ISSUER_DOMAIN`; with it unset there is no provider, nobody can sign in, every CRM call is rejected and a deploy still works). The token template must be named "convex".
- **Access is a row in a `users` table, not a Clerk account.** An Admin adds a person (email, name, roles, businesses) in Settings > Users; they log in; the app calls `users.claim`, which links their Clerk identity to the row with their **verified** email. A Clerk account with no row sees "You do not have access yet". A different Clerk account cannot take over a claimed row. Deactivating someone shuts them out on their next call.
- **First Admin:** `admin@qualityfirstturf.com` (in code, `convex/crm/users.ts`) always works, with every business; `CRM_BOOTSTRAP_ADMIN_EMAILS` can add more. Only a person who controls that mailbox and has a Clerk login for it can use it.
- **Roles (my calls, correctable):** Admin (everything, all businesses, manages users); Sales and Office Team (view and edit clients, requests, notes in their businesses); Project Manager (view only for now). A person can hold several roles and gets the most any allows. Installers do not log in (D-010). Business access is per user (D-016, D-031): the switcher lists only theirs, and every function checks it, including a client's notes and projects, and moving a client between businesses needs the editor role in both.
- **Every CRM function** starts with a check in `convex/crm/lib/access.ts` (signed in, active, role, business). Rules 3 and 6 hold: the UI also hides edit buttons for view-only roles, but that is for tidiness; the backend refuses.
- **Users screen:** Settings (top bar) > Users, Admins only: list, invite, edit roles and businesses, turn access off. It cannot remove the last active Admin or the signed-in Admin's own access.
- **Removed:** `CRM_ALLOW_ANONYMOUS_DEV`. Seed data now has its own dev-only switch `CRM_ALLOW_SAMPLE_DATA`.
**Sign-in screen:** Clerk's own components (so passwords, resets, new-device checks and Google all keep working) restyled in `components/clerk-appearance.ts` and `app/globals.css`: logo, floating-label fields, a solid green Log In, OR, Log In With Google, Sign up. Not copied from Jobber: its ad, and Intuit and Apple sign-in (not asked for, and not needed here).
**Known limits of that screen:** (1) Clerk hides the password field on the first step for browser autofill; the CSS shows it so the form matches Jobber, relying on Clerk's own autofill path. If a typed password is not taken on the first step, Clerk asks for it on the next step. (2) "Forgot password?" only appears on that next step. (3) The button's "Log In" wording is CSS, so a Clerk update that renames its classes could revert it to "Continue" without breaking anything.
**Clerk instance state found:** sign-ups are **disabled** in the dev instance ("Sign ups are currently disabled"). That suits invite-only: people are created in the Clerk dashboard (or by Clerk invitation), and the CRM's Users screen decides what they may see. It means inviting someone is two steps (CRM Users, then Clerk). Sending the Clerk invitation from the Users screen automatically is a possible later step.
**Not done:** a Clerk **production** instance (new keys, DNS) for production; the Convex variable on production; syncing name changes made in Clerk; per-module permissions beyond edit versus view (D-006 allows more later).
**Tests:** 42 backend tests (`CRM/tests`), 14 of them new for access: signed out, signed in but never invited, claiming by invite and by case-different email, unverified emails, the first Admin, extra bootstrap Admins, deactivation and reactivation, role limits, a person with several roles, business scoping on every kind of call, moving clients, admin-only user management, input checks, last-Admin protection. **Not tested:** a real Clerk login (it needs a real account); the sign-in and sign-up pages were checked in a browser for how they look, and signed-out visits to every protected page were checked to redirect to sign-in.

### D-047: The sign-in screen is email and password only; the access screen says why
**Decided (user, 2026-11-05):** after trying the sign-in screen: remove "Log In With Google", the OR divider, and the Sign up link (and the Sign up page). The sign-in is email and password only. Clerk's "Last used" badge is hidden too. This amends D-046, which had kept Google and Sign up from Jobber's layout.
**Also fixed:** the fields were clipped at the sides because the inputs had padding without `box-sizing: border-box`, which pushed them wider than their column. They are now border-box, the wrappers do not clip, and the column has a few pixels of margin. A measurement in a browser showed every field and the button inside the column.
**Where people get accounts now:** there is no sign-up. Clerk has sign-ups disabled in the instance, so each person is created in the **Clerk dashboard** (or by a Clerk invitation) **and** invited in the CRM's Users screen. These are two separate lists. Being in Clerk alone gives no access; being in the CRM list alone gives nothing until a Clerk account with that email exists.
**The "no access" screen now says why** (`users.claim` returns the reason): not invited (it says an Admin must add the email in the Users screen, and shows the email), the sign-in token has no email (the Clerk "convex" token template must include `"email": "{{user.primary_email_address}}"`), or the email is not verified. 43 backend tests.
**Optional, in the Clerk dashboard:** switch Google off under SSO connections so it cannot be used at all; it is only hidden in the CRM's screen, not disabled in Clerk.

### D-048: The CRM asks Clerk for the "convex" token template itself
**Found (2026-11-05, from the user's real login):** the "no access" screen reported the token carried only `issuer, o, sid, sts, subject, tokenIdentifier, v`, with no email, although the Clerk "convex" template did include one. Those are Clerk's plain **session token** claims. Convex's own adapter (`ConvexProviderWithClerk`) sends the session token whenever it says `aud: "convex"` (what Clerk's Convex integration switch produces) and then never asks for the template. So the template was configured correctly and simply never used.
**Fix:** `components/convex-provider.tsx` now has its own token function: ask Clerk for the "convex" template first, and fall back to the session token only if that fails or returns nothing. No dashboard change is needed if the template carries `email` and `aud: "convex"`.
**If it still reports no email:** the template's claims need `"email": "{{user.primary_email_address}}"`, or, to use the session token instead, add the same claim under Clerk's Sessions > Customize session token.
**Also added:** the backend logs the names of the claims in each sign-in token (never their values) and accepts a few alternative names for the email claim; the "no access" screen prints the claim names. A wrong token setup can now be read from the screen or `npx convex logs`.
**Not tested:** a real Clerk login. The fix follows from reading the adapter's source and the user's reported claims.
**Added after a report that the page would not load:** if Clerk says someone is signed in but Convex refuses their token, the app used to send them to the sign-in page, which sends signed-in people straight back, looping forever. It now stops and shows "Your sign-in was not accepted" with the token source, audience and issuer (names only), the usual causes being a template without `aud: "convex"` or an issuer that differs from `CLERK_JWT_ISSUER_DOMAIN`.
**Note on the first login:** a user created in the Clerk dashboard without a first and last name is asked for them at first login (Clerk's instance requires a name). Setting the name on the Clerk user in the dashboard skips that step.

### D-049: The gear icon opens a Settings menu laid out like Jobber's
**Decided (user, 2026-11-05, from a Jobber screenshot):** the Settings gear in the top bar opens a menu: a header with the person's initials, name and email (and their roles in small print), then a list, a divider, and Log Out. It replaces the separate Clerk avatar button and the direct link to the Users screen.
**Items kept, and what they do:** **Settings** ("not built yet": there is no settings hub yet, the businesses' settings come later); **Account** (Clerk's own profile screen: name, email, password; it stands in for Jobber's "Account and Billing", since we have no billing); **Manage Team** (the Users screen, Admins only, D-046); **Log Out** (back to the sign-in page).
**Items left out, because they are Jobber's own features and not in the PRD (D-024):** Jobber Labs, Refer and Earn, Product Updates, Language, Dark Mode. Easy to add if wanted; Dark Mode in particular would be a theming job across every screen.
**Built as:** `components/account-menu.tsx`, opened through the shared popover (animated in and out, hover feedback, like the other menus), styled in `app/globals.css`.
**Checked:** typecheck, lint and build pass, and the menu's markup was rendered with the built stylesheet. Not checked with a live login (headless Chrome cannot sign in).

### D-050: Manage Team is laid out like Jobber's
**Decided (user, 2026-11-05, from a Jobber screenshot):** the Users screen becomes **Manage team** in Jobber's layout, inside a Settings area with its own navigation on the left.
**What it has:** a Settings navigation (Business management > Businesses, which is in the PRD and shows "not built yet"; Team organization > Manage Team, current page in green; Admins only); the title with a count chip ("3 people") and **Invite New Member**; a one-line description; a **Users** tab; a large **Search team members** box; "Team members (3)"; a bordered table of **Name** (avatar circle with initials, name in green opens the edit panel), **Role**, **Businesses**, **Last Active** (date and time of the last login, or a dash), **Status** (Active, Invited or Turned off pill) and a "…" menu (Edit, Turn off or on access); and a footer "Showing 1-3 of 3 items" with a rows-per-page choice (10 by default) and previous and next buttons. The Settings item in the account menu (D-049) now opens it for Admins.
**Search, sorting and paging happen in the backend** (`users.list` takes a search, sort column and direction, page and size, and returns the page and the total), like the Clients and Requests lists. The sortable columns are Name, Role, Last Active and Status.
**Differences from Jobber, on purpose:** no seats or "Manage Seats" (that is Jobber billing); no Crews tab; no promo cards; no "Active login sessions" column. A **Businesses** column is added, because who can see which business is a rule here (D-031, D-046). The primary button is green, since it is the only one.
**Route:** still /settings/users. 44 backend tests (a new one covers the search, sorting and paging).
**Checked:** typecheck, lint and build pass; the page's markup was rendered against the built stylesheet and compared with the screenshot. Not checked with a live login or real data.

### D-051: Clerk's deprecated route matcher removed; a broken icon replaced
**Clerk deprecation (found 2026-11-05 in the dev server's output):** `createRouteMatcher` is being removed in Clerk's next major release, because deciding access by matching URL paths in middleware can drift from how Next.js routes requests. `proxy.ts` now uses a plain path check for the one open page (`/sign-in`), and the `(app)` layout now checks the Clerk session on the server (`auth()` then `redirect`) before rendering anything behind sign-in. This is the resource-based check Clerk recommends. It is a second line only: the real protection is that every backend function checks the person, role and business (`convex/crm/lib/access.ts`), and the pages hold no data themselves. A signed-out visit to any protected page, and to `/sign-up` (removed in D-047), still redirects to sign-in; the server output shows no deprecation warning.
**Clerk telemetry:** the other lines in that output are Clerk's notice that its SDK sends usage data when connected to a development instance. Not an error. It can be turned off with the setting `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED=1` in `CRM/.env.local`; not changed, since it is the user's call.
**Done (2026-11-05, after the user confirmed the CRM loads after login):** `@clerk/ui` is installed and passed to `ClerkProvider` (`app/layout.tsx`). That removed the browser warning that the sign-in styling depends on Clerk's internal class names, because the version of Clerk's forms is now pinned, so the CSS in `app/globals.css` only changes behaviour when we upgrade `@clerk/ui`. Checked in a browser: the form renders, fields and button are inside their column, the button reads "Log In", Google and the sign-up link stay hidden, and there are no console errors. Upgrading `@clerk/ui` is a deliberate step: re-check the sign-in screen afterwards.
**Broken icon:** the "sort" icon in the Atlantis table (used in table headers) draws overlapping arrows and a bar, and shows as a blob at 16px. Found by rendering all 49 icons on one sheet; no other icon was wrong. It is replaced in `lib/icons-extra.ts` with a plain pair of chevrons (up and down), and hand-drawn icons now take priority over the Atlantis table in `components/icon.tsx`.

### D-052: The CRM builds on Vercel with a single-app install
**Found (2026-11-05, from the first Vercel build of the CRM):** Vercel installs only the CRM's own packages (418, not the repo root's). The build then failed at the type check with "Cannot find module" for `vitest`, `convex-test`, `vite/client` (the backend tests, which need root-level dev tools) and `@convex-dev/rate-limiter` (imported by `convex/rateLimits.ts`, which the app's type check reaches through the generated API types).
**Fix:** (1) `CRM/package.json` now lists `@convex-dev/rate-limiter`, as `forms/package.json` already does for the same reason; (2) `CRM/tsconfig.json` excludes `tests/` and `vitest.config.mts`, so the build type-checks the app only; (3) the tests keep their own type check, `npm run typecheck:tests` (`CRM/tests/tsconfig.json`). `npm test` is unchanged (44 tests).
**Proved by reproducing it:** a copy of the project with no installed packages, `npm install` run inside `CRM/` only (420 packages, no vitest, as on Vercel), then `npm run build`: compiled, type-checked and generated all pages.
**Still needed in the Vercel project (the user's settings, not code):** environment variables, which the build reads: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL` (`/sign-in`) and `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` (`/`). Root Directory `CRM` with "Include source files outside of the Root Directory" enabled (rule 7).
**What a deploy points at:** with today's values the deployed CRM talks to the **dev** Convex deployment and the **dev** Clerk instance. Fine for trying it on a preview URL. For real use it needs the production Convex URL, a Clerk production instance (its own keys and DNS) and the production variables on the Convex deployment (D-046).

### D-053: The sales form signs in through Clerk, by hand-off from the CRM
**Decided (2026-11-06, user):** the sales form (`/visit` in the forms app) is behind Clerk. Only a CRM user who is active and holds the Sales or Admin role can open it. The three shared password logins (`sales@`, `sales1@`, `sales2@` in `SALES_EMAIL` / `SALES_ACCOUNTS`) and the password login action are removed. The customer form at `/` stays public and never loads Clerk.
**Why a hand-off:** Clerk cannot run on `forms.qualityfirstturf.com` against the production instance (`launchpad.qualityfirstturf.com`) without satellite domains, which the user's Clerk plan does not include (first plan, now dropped). A second Clerk app would mean two sets of people and two identities per person.
**How:** the sales form's Sign In button goes to the CRM's `/sales-access?return=<forms origin>&next=/visit...`. The person signs in with Clerk there and the access gate checks they are an active user. The page calls `sales.clerk.issueHandoff` (Sales or Admin role only), which stores a one-time code (256 random bits, kept only as a hash, expires after 60 seconds, deleted when used) and returns it. The CRM sends the browser back to the sales form with `?code=...`. The form calls `sales.clerk.redeemHandoff`, which swaps the code for a normal sales session token, and removes the code from the address bar. Everything downstream that takes a `sessionToken` (projects, visits, assignments, Jobber push) is unchanged.
**Safe redirects:** the CRM only returns to an origin on its allowlist (`lib/sales-form.ts`: `https://forms.qualityfirstturf.com`, plus any in `NEXT_PUBLIC_SALES_FORM_ORIGINS` for local work), and only to a path under `/visit`, so a crafted link cannot send a code to another site.
**Signing out:** the form ends its sales session and then sends the person to the CRM's `/sales-access/signout` (the only open page besides `/sign-in`), which ends the Clerk session too and returns to the form. Without that, the Sign In button would sign them straight back in on a shared device.
**Settings needed:** forms: `NEXT_PUBLIC_CRM_URL` (the CRM's address). CRM: nothing for production (the forms origin is built in); `NEXT_PUBLIC_SALES_FORM_ORIGINS` to allow a local forms copy.
**Cost of the change:** the Convex deploy, the CRM deploy and the forms deploy must go out together. The old forms bundle cannot sign in once the password login is gone. Existing sales sessions keep working until they expire.
**Names:** the signed-in name comes from the person's `users` row; the "assigned to" lines still tidy the email, because that lookup lives in the forms functions, which were not edited.
**Tests:** `CRM/tests/sales-handoff.test.ts` (10): a code becomes a working session, works once, expires after a minute, a made-up code is refused, Office and Project Manager roles get none, an uninvited or deactivated or signed-out caller gets none, the code is stored hashed. **Not tested:** a real login through Clerk and the redirects in a browser.

### D-054: Deleting clients asks the person to tick everything that goes with them
**Decided (2026-11-06, user, from a Jobber screenshot):** the Delete pop-up names the client, lists what will also be deleted as tick boxes (their projects and notes, with counts), and the Delete button stays off until every box is ticked. A client with nothing attached can be deleted straight away. Deleting needs the Admin, Sales or Office role in that client's business (the same people who can edit). `clients.deletePreview` counts, `clients.remove` deletes in one transaction (up to 100 clients; a client with more than 500 projects or notes is refused with a message to archive instead). Reached from the selection bar's bin icon. The row menu (Archive, Delete, Open in New Tab) comes next; Tag and Email are not in the PRD and wait for a decision.

### D-055: Inviting a team member sends a Clerk email; the link works for 7 days; removal and cancellation reach Clerk too
**Decided (user, 2026-11-07):** when an Admin invites someone in Manage Team, Clerk emails them an invitation. The link opens the CRM's own page (`/accept-invite`), where they create a password and are signed in to the CRM straight away. The link expires after 7 days. If the Admin cancels it, it is treated as expired. Deleting a person must delete them everywhere. This replaces the two-step process in D-046 (add in Users, then create the login by hand in Clerk).

**How it works:**
- **Send.** `api.crm.invitations.send` (an action, Admin only) adds the person as "invited" (`users.createInvited`, internal; there is no longer a public `users.invite`), then calls Clerk's Backend API to create the invitation (`notify: true`, `expires_in_days: 7`, `redirect_url` = `<CRM address>/accept-invite`). If Clerk refuses, the new row is removed again. If the email already has a Clerk login Clerk cannot invite it (`form_identifier_exists`): no email is sent, the Admin is told, and the person simply signs in with the login they have. The CRM address comes from `CRM_APP_URL` on the deployment, else from the Admin's browser.
- **Accept.** Clerk's link lands on `/accept-invite?__clerk_ticket=...`. Clerk's sign-up form reads the ticket (the email is already verified by it), asks only for a password, signs them in, and the access gate links the Clerk login to the row by verified email (`users.claim`). A link that was cancelled or expired arrives without a ticket, and the page says so (`signUpUrl` on the ClerkProvider points there). The Clerk instance stays in Restricted sign-up mode, so nobody can sign up without an invitation.
- **Expiry.** The CRM does not trust Clerk's clock alone. Sending schedules `invitations.expire` for the moment the invitation runs out: it cancels the link in Clerk and marks the row **Expired**. `claim` also refuses an invitation past its time, so a late sign-in cannot slip through before the timer runs. A newer invitation is not touched by an older invitation's timer.
- **Statuses:** Invited, Active, Expired (ran out or cancelled; the person never signed in), Turned off. Row menu: Invited gets Send invitation again, Cancel invitation, Edit, Remove; Expired gets Send new invitation, Edit, Remove; Active and Turned off get Edit, Turn off/on access, Remove.
- **Cancel** (`invitations.cancel`): revokes the invitation in Clerk, then marks the row Expired. If Clerk cannot be reached, nothing changes in the CRM, so the screen never says cancelled while the link still works.
- **Remove** (`invitations.remove`, behind a tick-everything dialog like D-054): cancels any pending invitation, deletes the person's Clerk login (found from their sign-in, and by email for someone who never signed in), then deletes the row and ends their sales-form session. Clerk goes first: if Clerk fails the person stays listed and the Admin can retry. Not allowed on yourself, on the built-in admin@qualityfirstturf.com, or on the last active Admin. Turning access off also ends the sales-form session now (before, it ran to its 14-day end).
- **Deleted in Clerk instead.** Clerk webhook `POST <deployment>.convex.site/clerk/webhook`, event `user.deleted`, verified with the Svix signature (`CLERK_WEBHOOK_SECRET`; `convex/crm/lib/svix.ts`), removes the matching person here, except the last active Admin. It has to be added once per Clerk instance in the Clerk dashboard. Until then, a person deleted in Clerk stays listed, but cannot sign in.
- **Deleted in the Convex dashboard instead.** No hook exists for hand edits. The person loses CRM access at once (access needs the row), but their Clerk login stays until removed in Clerk. Remove people in Manage Team.

**Checked by hand on the dev Clerk instance (2026-11-07), not only mocked:** creating an invitation returns a link that expires in exactly 7 days; revoking works and a second revoke answers `invitation_already_revoked`; inviting an existing email answers `form_identifier_exists` (422); a second pending invitation for an email answers `duplicate_record`; the email link redirects to `/accept-invite?__clerk_status=sign_up&__clerk_ticket=...`; the ticket marks the email verified and leaves only the password missing; the instance is in Restricted sign-up mode with password required. **Clerk's user lookup ignores the bracketed filter `email_address[]=` and returns everyone**, so the code uses `email_address=` and re-checks every returned account before it can be deleted. **Not verified:** the last step of the sign-up form (typing the password and landing in the CRM) could not be completed without a browser; a hand-made sign-up request stayed at `missing_requirements` with nothing listed as missing.

**Forgot password** is Clerk's own flow (an emailed code, then a new password), reached from the always-visible link on the sign-in page (`forgot-password-link.tsx`). Verified on dev by running the whole flow against Clerk with a throwaway test user: reset email code requested, code accepted, new password set, sign-in complete. The dev instance requires passwords of at least 15 characters.

**Env vars (each deployment):** `CLERK_SECRET_KEY` (test key on dev, live key on prod), `CRM_APP_URL` (prod: `https://launchpad.qualityfirstturf.com`), `CLERK_WEBHOOK_SECRET`. **Tests:** `CRM/tests/invitations.test.ts` (29) with a pretend Clerk (`fakeClerk` in `tests/helpers.ts`).

### D-059: The Clients list is Jobber's: five columns, a hover action card, tags (2026-11-09)
**Decided (user):** the Clients list is an exact copy of Jobber's (checked in the browser, ads excluded): columns **Name, Address, Tags, Status, Last Activity** (phone, email and type are gone from the list), 48px header and 57px rows, beige hover, "Filtered clients (N results)", a **Filter by tag** chip beside the Status chip, and a third card "Total new clients, year to date". Hovering a row shows a small card at its right with **Edit tags**, **Send email** (only when the client has an email) and a three-dot menu (**Archive**, **Delete**, **Open in New Tab**).
**Built:** clients get optional `tags` (Company, Homeowner, Partner Contractor, Sub-Contractor; `convex/crm/lib/stages.ts`), `clients.setTags`, `clients.archive` and a tag filter on the list. **Send email** shows Jobber's pop-up, but Send Email only says it is coming: sending needs the Google email connection (PRD 5.3), not built. "New leads" now means new clients with no quote yet (Jobber showed 82 of 83).
**Data check against Jobber (83 clients, read from Jobber's list in the browser):** names and addresses all matched. Fixed on dev with `crm/clientImport:alignWithJobber`: tags (24 clients), status Active for all, and six clients Jobber shows by the person's name while the CRM had stored the company (Edgar Poritira, Ensar Ensar, Fernando, Norm, Shannon na, Ted Watson), plus "Jose -" and "Rick & Rose -" as Jobber spells them and the Zoho leftover text on Mario Montoya. **Production still needs the same run after `npx convex deploy`.** Prod also has one extra client, Sal Torres (typo email), not in Jobber.

### D-058: On a phone the sidebar is a menu that opens over the page, with the business name at its top
**Decided (user, 2026-11-09):** the sidebar must be collapsible in the mobile view, and show the business name. This changes the "no separate mobile layout, icon rail below ~1100px" line in D-019 for phones only.
**Built:** up to **700px** wide (the same width where the search box already hides) the sidebar is hidden and a **Menu** button at the left of the top bar opens it as a panel sliding in over the page, with a dimmed backdrop. It closes with the backdrop, Escape, the Menu button again, or by choosing any item. The business name (tap to switch business) is at the top of the panel, and leaves the top bar to make room for the buttons. The desktop Collapse button is not shown there. From 701px to 1100px the icon rail stays as it was, and wide screens are unchanged (the business name is only in the top bar there; say if you want it in the sidebar there too). Not checked in a browser.
**Also (2026-11-09):** the signature on quote #1 is now the real signature picture, stored in Convex file storage (D-056).

### D-057: Deleting a team member keeps their record (status "deleted"); it replaces the hard Remove of D-055
**Decided (user, 2026-11-09):** Manage Team gets a **Delete** option, and nothing is deleted from Convex: the person gets a new status, **Deleted**, and their row stays. This replaces D-055's "Remove", which erased the row. (Turn off access stays, as the reversible option.)
**How it works:** `invitations.deleteMember` (Admin only, behind the tick-everything dialog) cancels a pending invitation and deletes the person's Clerk login first, so they cannot sign in and the two systems agree; then `users.markDeleted` sets `status: "deleted"` with `deletedAt` and `deletedBy` and ends their sales-form session. Not allowed on yourself, the built-in admin@qualityfirstturf.com, or the last active Admin. Deleted people are hidden from Manage Team unless **Show deleted** is ticked, then shown muted. They cannot sign in (`claim` and access checks refuse them) and cannot be edited. **Restore** (a row menu item on a deleted person) sends a new Clerk invitation through the same Send-again flow: the old Clerk link on the row is cleared and the person is Invited again. Inviting a deleted person's email from the form is refused with a pointer to Restore, so there is never a second row for one email. A user deleted in Clerk's dashboard (webhook `user.deleted`) is now marked Deleted the same way, not erased.
**Still deleted from the database, on purpose:** the person's sales-form sign-in sessions (they would otherwise stay signed in to the sales form for up to 14 days), and the row of someone whose invitation Clerk refused a moment after they were added (a rollback, so a failed invite leaves nothing behind). Neither is a team record. Also fixed: only **active** Admins count when checking that one is always left (an invited Admin who never signed in used to count).
**Tests:** `CRM/tests/invitations.test.ts` now covers: the row is kept (same row count after a delete), hidden unless asked for, cannot sign in or be edited, restore, Clerk failure leaving the person as they were, and the webhook marking instead of removing.

### D-056: The Quotes tab and quote page, and Jobber quote #1 recreated as data (built on dev)
**Decided (user, 2026-11-08):** the Quotes tab is laid out like Requests and Jobber's Quotes page. Six statuses: **Draft, Awaiting response, Changes requested, Approved, Converted, Archived** (read from "Converted Archived" as two; this replaces the PRD's "Pending", "Sent" and "Rejected" wording, and Sent is now a figure card instead). The four figure cards are Jobber's: **Overview** (open statuses with counts, clickable), **Conversion rate**, **Sent**, **Converted** (past 30 days, with change against the 30 days before). The AI card is left out (D-024). Filters: **Status, Date (created), Salesperson**, plus search, sorting and paging. The quote in the screenshots is added **as data** (no builder yet).

**Built:**
- **Tables** (additive): `quotes`, `quoteLineItems`, `quoteNotes`. Money is whole cents. `quotes.totalCents` and `searchText` are labelled copies; the quote page always works the totals out from the lines (`convex/crm/lib/quoteMath.ts`), so it can never show a total the lines do not add up to. An optional line counts toward the total only while ticked ("Not included" otherwise, as in Jobber's PDF).
- **Backend** `convex/crm/quotes.ts` (`list`, `exportRows`, `salespeople`, `stats`, `get`), every call checking the person and the business like Requests. Photos and the signed PDF live in Convex file storage. Deleting a client now also deletes their quotes, lines, notes and stored files, and the delete dialog counts the quotes.
- **Screens:** `/quotes` (`quotes-page.tsx`) and `/quotes/[id]` (`quote-page.tsx`: status and title, client card, facts table, Introduction with photo, Product / Service with optional ticks, deposit rows, signature, Notes with the signed PDF; the Client Message and Contract / Disclaimer sections were removed from the page at the user's request, 2026-11-09, and their text is still stored on the quote), each with a skeleton and a `loading.tsx`. Quotes is a live sidebar item. New Quote, Create Similar Quote, adding notes and Archive say "not built yet": **the builder, sending, and customer approval or signing (Q-005) are separate steps.** Export Quotes (CSV) is under More Actions (PRD: quotes can be exported).
- **Quote page frame (user's review of the first version, 2026-11-09):** the quote's colour (burgundy, the Quote colour in the Create menu) runs as a bar across the very top of the page; the quote scrolls on the left while **Notes sit in a pinned right-hand column that folds away** with the toggle at the top right (remembered in this browser, animated, stacked under the quote below 900px); and the status, title and client card are spaced further apart with a larger title.
- **Quote page header, menus and phone layout (user's second review, 2026-11-09, copied from Jobber's live page with the browser):** a History button, a green **More** button and **Create Similar Quote** with its icon; pencils for the title, Introduction, Product / Service and each note; a "..." menu on the client card (View client, Edit client); and the **More menu**: Convert to Job, Send as... (Email, Send Text), Preview as Client, Collect Signature, Print or Save PDF, Delete. Print or Save PDF (prints just the quote) and Delete (tick-everything dialog, then the quote, its lines, notes and files are deleted for good; only people who can edit in that business) **work**; the pencils, Convert to Job, Send, Preview and Collect Signature say "not built yet" (Q-005 for signing). Roles that can only look see only Preview and Print. On a phone (700px and under) the quote stacks as Jobber's does, line items become stacked blocks with Quantity, Price and Total rows, and menus open as a sheet from the bottom of the screen. The Menu button uses Jobber's own icon.
- **Photos open in a viewer (2026-11-09):** clicking the intro photo or a line item's thumbnail opens it large over the page, with Next and Previous (or the arrow keys) through the quote's photos, Escape or the background to close, and "Open in new tab" for the original file. The signed copy in Notes already opens in a new tab. All the files from `Jobber Quote/` (six photos, the signed PDF and the signature picture) are in the dev Convex storage, checked by size against the local copies; production has none until the quote is imported there.
- **The Jobber quote**, #1 "Patio & Retaining Wall Installation", Converted, $8,100, from the files in `Jobber Quote/` (six photos and the signed PDF) and the PDF's text, was added to the **dev** deployment with `npx convex run crm/quoteImport:importQuote` (internal; the deployment you point it at is the dev/prod choice). It is attached to the existing client "Quality First Turf (Lic #1138842)" and its request "Upland" (GTU-KKK). The four included lines add up to $8,100, the unticked $380 lighting line is left out, the 10% deposit is $810 and was collected, and it is signed "May", shown as the signature picture itself (a 105x52 PNG downloaded from Jobber's upload link and stored in Convex file storage as `signatureImageId`, so nothing depends on Jobber or on a local folder; the typed name is only the fallback when there is no picture). Deleting a client deletes that file along with the quote. **Added to production on 2026-11-09 (user's go-ahead):** after the user's `npx convex deploy`, the eight files were uploaded to prod storage (sizes checked against dev) and `crm/quoteImport:importQuote` was run with `--prod`, attached to the same client and request (GTU-KKK) on prod; checked afterwards by reading prod (1 quote, 5 lines, 1 note, $8,100). `crm/quoteImport:fileUrls` (internal, dev) copies a stored file out of one deployment so it can be put in another.
- **Why the client list's Last Activity can differ from Jobber's:** the CRM does not sync activity from Jobber. The Jobber clients export had a Created Date and no activity column, so imported clients started with Last Activity = created date, and it moves only when something happens in the CRM (a request, a quote, a note, an edit). Jobber also counts events the CRM never saw (a quote viewed, a visit, an email), so it can be more recent. Importing the quote moved this client to Oct 19. Matching Jobber exactly is part of the final Jobber import at cutover (D-028).
- **Dates and time zone:** quote dates show in `America/Los_Angeles` (`BUSINESS_TIME_ZONE` in `lib/format.ts`), so "Oct 19" is the same day whoever looks from wherever. Times of day on the quote were not in the screenshots (only the note's 1:08 PM), so created, sent, viewed and approved are set a few minutes apart that afternoon. The PRD says time zone varies by job, so this becomes a property setting later.
- **Difference from Jobber to know about:** the client card shows the client's own record (phone and email as in the CRM, qualityfirstturf@gmail.com), while Jobber's quote showed office@qualityfirstturf.com. The quote does not keep its own copy of the client's contact details (rule 2).

**Tests:** `CRM/tests/quotes.test.ts` (14): money, import refusals, filters, sort and paging, salespeople, the figures, the page's totals from lines, access by business and role, and client deletion taking quotes and files with it. **Not checked in a browser.**

## Open Questions

| ID | Question | Blocks | Owner |
|----|----------|--------|-------|
| ~~Q-004~~ | Resolved: Vercel, one project per app. Subdomains: `forms.qualityfirstturf.com` (forms app), `launchpad.qualityfirstturf.com` (CRM). | | |
| Q-005 | Contract signing and completion sign-off: in-app e-signature or an external service? Client undecided. | Phase 3 contract flow, Phase 4 sign-off | Client (ask when blocked) |
| Q-006 | Phone/SMS provider (Twilio assumed). WhatsApp Business account status and verification. | Phase 5 | Client (ask when blocked) |
| Q-009 | Document generation: how quotes, work packages, invoices and sign-offs are produced (PDF from templates). | Phases 3 to 5 | Client |
| Q-010 | Google integration depth: Calendar read-only or two-way? Drive for files, or Convex storage? Drive is being merged into office@ in Workspace. | Phase 3 | Client |
| Q-014 | Roles of Sal, May and Robert (guess: Sal Admin and Sales, May Office Team, Robert Project Manager). Not asked yet. | Phase 2 roles | Client |
| Q-015 | What differs between the three businesses on quotes and invoices? (B1.3) Clients are per business (D-031). | Phase 2 schema | Client |
| ~~Q-016~~ | Resolved by the user (2026-11-05): a client is the same if the email or the phone matches, within the business (D-045). Was: Duplicate client rule: what makes a client unique (same email, phone, name + address). Needed for the form flow (D-040) and the import. Proposal in D-040. (B2.6) | Milestone 3 form flow, Phase 5 import | User, then client |
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
