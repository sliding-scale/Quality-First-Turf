# CLAUDE.md

Guidance for Claude Code in this repository: the Quality First Turf CRM, a Jobber replacement.

This folder is one app in a monorepo. The repo root `../CLAUDE.md` has the overall plan and the production safety rules, and applies here too.

## Read first
- `docs/prd.md`: requirements. Source of truth for scope.
- `docs/phases.md`: current plan and checklists. Update checkboxes as work completes.
- `docs/decisions.md`: settled decisions and open questions. Check before choosing a design. Log new decisions there.
- `docs/architecture.md`: directory layout and where things live.
- `../convex/README.md`: the backend's modules, tables, routes, crons and env vars.
- `docs/superpowers/specs/` and `plans/`: the design and plan of each feature built so far.

If a task conflicts with a recorded decision, say so instead of silently working around it.

## Current state
The client is shifting off Jobber as PRD milestones ship (D-027), so each milestone is built to completion on the real backend and released in order. Inside a milestone the UI comes first. Every screen reads and writes the shared Convex backend (`../convex/crm/`) on the **dev** deployment; nothing of the CRM is in production use. Access is Clerk sign-in, invite-only, with roles, per-module permission levels and per-business checks in `convex/crm/lib/access.ts` (D-046, D-093). Every new CRM function must start with `requireModule(ctx, businessId, module, level)` (or `requireProject` for a project), never a role check.

Built on dev (see `docs/phases.md` for the checklist): clients (with Activity history, D-113) and the Jobber client CSV import (D-103); requests and the customer form to CRM flow (D-045, D-105); the Sales, Preplanning, Construction and Finance boards with a list view (D-061, D-080, D-092, D-115); the project page with Overview, Visit (work areas and photos, D-114), Quotes, Files, Activity, Takeoff, Work package, Construction and Billing tabs; quotes with builder, customer approval and signature (D-063); the Schedule with Zoho Calendar (D-062, D-069); Home and Tasks (D-076, D-116); jobs, costs and checklists (D-094 to D-096); materials, takeoff, purchase orders and work packages (D-098 to D-100, D-104, D-107); construction, punch list and sign-off (D-081); invoices and payments (D-092); automations (D-065, D-071); permissions (D-093); export (D-101); Settings > Businesses (D-112). Messages (texting via Twilio, D-097; calls and WhatsApp by hand, D-102) is built but greyed out in the app until texting and WhatsApp go live (D-119). QuickBooks Online is decided and not built (D-120). Each new step's design is still approved by the user before it is built (D-020). No questions go to the client now; ask only when one blocks a specific piece of work (D-018).

## How to work with this user
- Go step by step. Settle one thing, then the next.
- Do not build, scaffold or install while brainstorming.
- The user dictates by text-to-speech, so "V" often means "B" (e.g. "V2.1" is B2.1). Read it as intended.
- The user answers with decisions. Record them in `docs/decisions.md` as you go, and tick `docs/phases.md`.
- To check Jobber's version of a screen, read it in the browser (D-068). The logos are in `public/brand` (`lib/brand.ts`; the originals are in the repo root `public/brand`, D-112).

## Skills
Superpowers skills (from github.com/obra/superpowers) are installed in the repo root `.claude/skills/` (with every other skill, so they are available from any folder). Use `brainstorming` before designing a feature, `writing-plans` before multi-step implementation, `test-driven-development` and `systematic-debugging` while building, and `verification-before-completion` before calling a phase done. The `unslop` skill (github.com/heydamir/unslop, CC BY 4.0, credit kept in its files) is also installed. Use it to polish finished screens for spacing, colour, copy and details. Do not let it redesign the look: the client wants a Jobber-like, minimalist interface, so its "one bright element" and visual-richness advice does not apply to the staff app. This file and `docs/decisions.md` take precedence over a skill where they conflict.

The `impeccable` skill (github.com/pbakaus/impeccable, Apache-2.0, installed 2026-11-23 with `npx skills add pbakaus/impeccable --skill impeccable --agent claude-code`, recorded in the repo root `skills-lock.json`; installed at the repo root `.claude/skills/` so it is available from any folder) is a design skill with commands such as audit, critique and polish. Use it to review and refine finished screens. Its pull toward a bold, distinctive look does not apply to the staff app: the client wants Jobber's look (D-019, D-068), so keep the existing identity and let it fix details (spacing, hierarchy, states, accessibility). Its own rule that "the brief wins" applies here, and the brief is this file and `docs/decisions.md`. It runs a launcher script (`../.claude/skills/impeccable/scripts/impeccable`); no hook was added to the settings.

## Stack
Next.js 16 (App Router) + React 19 + TypeScript, Convex backend, Clerk auth. The UI is plain CSS: `app/globals.css` (tokens and shared styles) plus one stylesheet per area (`pipeline.css`, `schedule.css`, `client-page.css` and so on); Tailwind and shadcn/ui are not installed. Screens are in `components/` (one file per screen or dialog), small client-side rules in `lib/`, backend tests in `tests/` (`npm test`). One monorepo with the forms app and one shared Convex backend (D-026). `docs/architecture.md` has the layout. Don't assume this file is current: check the code.

## The monorepo and the live forms app (`../forms`)
The git root is `Quality-First-Turf/` (one level above this folder). It holds `forms/` (the live customer-intake and on-site-visit app: Next.js 16, Convex, Jobber push, already used by the client) and `CRM/` (this folder). They share one Convex backend (D-026).
- **Never modify the forms app, deploy, or touch its Convex or Jobber data without the user's explicit go-ahead.** Its own CLAUDE.md sets handoff rules.
- **One `convex deploy` publishes everything, so CRM work can break the live forms.** Keep schema changes additive and don't edit the forms' tables. The shared backend is `../convex/` at the repo root (D-030). CRM backend code goes in `convex/crm/` (D-029). `convex/shared/` holds domain logic the forms also use; keep it pure TypeScript and treat edits as live-app changes. Work against the dev deployment only. Never deploy to production without the go-ahead.
- Read the forms code freely. Never edit a forms function in place. Reuse it as it is, or copy it under `convex/crm/` (D-021).
- **Jobber keeps working in full until the whole CRM is complete (D-028).** Don't touch the forms' Jobber push, sync, crons or `JOBBER_*` env vars. The forms-to-CRM enquiry flow is built (D-045, user's go-ahead given 2026-11-05): the only edit to forms code is one `scheduler.runAfter` line in `projects.create`, and the CRM step runs separately so it can never block the form or the Jobber push. Do not add more to forms code without asking.

## Non-negotiable architecture rules
1. **One central record.** `opportunities` is the project record for its whole life (the UI says "Project"). Preplanning, Construction and Finance are `pipeline` + `stage` on that record. Never create a new project record at handoff. Child data (quotes, takeoffs, punch items, invoices, payments, documents) references the project ID.
2. **No duplicated data.** Reference by ID. Don't copy client fields onto child records unless it's a deliberate, labelled snapshot (e.g. a sent quote's pricing).
3. **Access control lives in Convex.** Every query and mutation checks the caller's roles, module permission and record assignment through the shared helper. Hiding things in the UI is never sufficient.
4. **Everything is auditable.** Stage changes go through a single mutation that validates the transition, writes `stageHistory` (who, when, from, to) and triggers notifications/tasks. Never patch `stage` directly elsewhere.
5. **Stage guards are server-side.** Closed Won needs signed contract + deposit (if applicable). Final construction stage needs resolved required punch items + customer sign-off. Finance entry needs construction sign-off.
6. **Never lose data silently.** Imports and integration calls (Jobber, Google, SMS, WhatsApp) must report failures per row/call, keep the failed input, and be retryable.
7. **Dashboards compute from real records.** No hard-coded or cached-by-hand numbers.
8. **Formulas are data, not code.** Material calculations come from configurable formulas, evaluated by a safe parser. Never `eval` or `new Function`.

## Terminology
- The PRD's "Company" and "Contact" are one entity: a Jobber **client**, stored in `clients` (D-008). Don't create separate company/contact tables. Both are one Clients tab.
- Each business has its own client list: a client belongs to one business and lists are scoped to the selected business (D-031).
- Client types: `homeowner`, `contractor`. The type comes from the customer form.
- Three **businesses**: Quality First Turf Landscape, Quality First Turf Construction, Quality First Patios (D-016, D-066). Users can belong to several; a project and a client each belong to one. The landscape business keeps the slug `quality-first-turf`.
- Login roles: Admin, Sales, Office Team, Project Managers, Installers. A user can hold several (D-014). Installers log in too, as the PRD says (D-090); secure work-package links (PRD 5.4) still stand. What each role can do is a level per module (None, View, Create and edit, Edit and delete) with the Admin's per-person overrides, enforced in the backend by `requireModule` in `convex/crm/lib/access.ts` (D-093); a person can also be limited to records assigned to them (an Installer is, by default).
- Pipelines and their exact stage names are in `docs/prd.md`. Use those names verbatim as constants in one place.
- United States, all states: tax and time zone vary by job (D-017).

## UI/UX direction (client requirement, D-019)
- **The main objective is to replicate Jobber (D-068).** The PRD (`docs/prd.md`) is the guideline and the list of mandatory features that must be in Launchpad; it is not a ceiling. When building or changing a screen, copy Jobber's version (read it in the browser) and add whatever the PRD requires on top. Do not leave out a Jobber feature just because the PRD does not mention it. This replaces the old "build only what the PRD describes" rule (D-024). If Jobber and the PRD disagree, the PRD's mandatory feature stays and the difference is reported. Anything the user has told us to leave out (for example the AI summary, D-061) stays out.
- **Fonts and icons are Jobber's:** Inter for text and Figtree for headings (an open-source stand-in for Jobber Pro, which is proprietary and must not be shipped; see D-025), and the Atlantis icon set from `@jobber/design` (MIT). The icon table is `lib/icons-data.ts`; keep its licence notice (`lib/ICONS-LICENSE.txt`).
- **Heavily inspired by Jobber's interface.** Left sidebar, top bar with search and a Create button, list and detail pages. Nav (D-025, as built in `components/shell.tsx`): Create, Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices, Payments, Pipeline (Sales, Preplanning, Construction, Finance), Tasks, Messages (greyed out for now, D-119); Settings from the top bar.
- **Use the tokens, not raw values (D-117).** Colours, borders, radii and control heights come from the `:root` variables in `app/globals.css`: `--line`/`--line-soft`, `--error`/`--error-soft`, `--hover`, `--radius-sm/ctl/lg`, `--control`/`--control-sm`/`--control-lg`. A new screen does not introduce a hex code or a height that a token already covers. Summary cards use `.kpis`/`.kpi` (they fill the row), lists use the shared pager and `.table` (52 px rows, Status on the left), and the list pages' header has More Actions.
- **Minimalist.** Little ornament, generous whitespace, no gradients, restrained shadows, thin borders. Detail goes on the detail page.
- **Colours: mainly white, off-white, gray and black.** Define them as tokens once. Jobber's green `#388523` is the single accent (primary buttons, links, active tab). Sampled values live in `app/globals.css`: shell `#eeece7`, headings `#032b3a`, body `#233d48`. Use other colour only where it carries meaning (status, errors). Don't use the forms app's forest-green/sand palette. The one exception is the New Request flow for Quality First Turf Landscape (D-079), which is the forms app's look on purpose: its styles live only inside the `.nrf` wrapper (`app/intake.css`, generated; `app/intake-flow.css`) and its components in `components/intake/`.
- **Kanban/board view wherever it applies.** Every pipeline gets a board with a list toggle. Quotes and tasks get boards where it fits.
- **Clients page** follows Jobber's section order. **Project page** tabs: Overview, Visit, Quotes, Files, Activity, and Construction for a project in Construction (D-081).
- **Lists use pagination, never infinite scroll.** No separate mobile layout: below ~1100px the desktop view gets more compact (icon-rail nav, right-hand column below the main content). The one exception (D-058): up to 700px wide the sidebar becomes a menu that opens over the page from a Menu button, with the business name at its top.
- **Phone-first:** Today/Schedule, Project Overview, Visit, Tasks, progress and punch list, customer sign-off. **Desktop-first:** boards, quotes, invoices, takeoff, crews, settings, import. Everything is responsive.
- Searchable tables, one consistent form style, one consistent detail-page layout, large tap targets.
- **Skeleton loaders everywhere (D-034).** Any screen, list, table, card, panel or form that waits for data, a route or the browser shows a skeleton shaped like the real content. Never a blank area and never a bare spinner. New screens ship with their skeleton in the same change: add it to components/skeletons.tsx (build it from the screen's own layout classes so nothing jumps), use it as the client-side fallback, and add a loading.tsx for the route. Skeletons use the .sk class, which turns its animation off under prefers-reduced-motion.
- **Hover feedback on everything clickable (D-035).** Every button, link styled as a button, icon button, tab, chip, toggle, radio option, sort header, menu item and clickable row changes visibly on hover and on press, and shows a pointer cursor. Disabled controls get none. Check it with a real mouse hover, and remember that a more specific rule (such as `.name-row .btn`) can silently hide a base `:hover`.
- **Fixed table column widths (D-035).** Every table is `<table class="table">` (CSS `table-layout: fixed`) with a `<colgroup>` that sets each column's width, in px or %. Columns never resize with their content, the search or the filter. Long text wraps; for one-line rows add class `single` so text is cut off with an ellipsis, and put the full text in `title`. A table's skeleton uses the same `<colgroup>`.
- **Invalid fields turn red on submit (D-035).** Nothing is flagged while the user is still typing. When they try to submit, every invalid field is highlighted red (border, tint and label, using the `bad` class on `.field`) with a message under it and `aria-invalid`, and the first one is focused. Each clears as soon as it is corrected. A field is never left red after it is fixed. Server-side validation errors use the same red state. See `components/client-form.tsx`.
- **Smooth motion on every state change (D-037).** Anything that appears, disappears, expands, collapses or changes state animates: menus and popovers (in and out), toasts, the sidebar collapse, tab and page content, new rows and notes, error messages, and hover/press colour changes. 120 to 260 ms, ease-out going in and ease-in going out. A closing element stays mounted until its exit animation ends, so it never just vanishes. Everything stops under `prefers-reduced-motion`. Verify by sampling the real element over time in a browser (width, opacity), not by reading the CSS.
- **Inputs stop wrong characters, and fields use the right control (D-038).** A field filters what is typed so a wrong character never lands (phone: digits only, formatted as you type; ZIP: five digits; names and cities: no digits; email: no spaces) using the helpers in `lib/fields.ts`. A fixed set of choices is a dropdown, not free text (state uses the shared `US_STATES` list). This sits on top of the red-on-submit validation (D-035), which still catches what filtering cannot, such as a phone number with too few digits.
- Screens read and write Convex (`api.crm.*`), through small hooks in `lib/` where one exists (`lib/clients.ts` is the door to client data) or `useQuery`/`useMutation` directly; the early sample-data layer (D-013, D-033) has been replaced. `lib/store.ts` keeps only browser preferences (the chosen business, views). Sample records for dev come from `crm/seed` (`CRM_ALLOW_SAMPLE_DATA`).

## Conventions
- TypeScript strict. No `any` without a comment saying why.
- Convex: validators on all function args. Schema in `convex/schema.ts`. Index every field used in filters or lookups. Paginate lists.
- Search/filter belongs in Convex indexes or search indexes, not client-side filtering of full tables.
- Match surrounding code style, naming and comment density. Don't add speculative abstractions.
- Secrets (Twilio, WhatsApp, Google, Clerk) go in env vars / Convex environment, never in client code or committed files.

## Working agreements
- Test each phase before calling it done. Pipeline transitions, permissions and the formula engine need automated tests.
- Report blockers early; a client question is asked only when it blocks the work (D-018) and the golden rule in `../CLAUDE.md` cannot cover it (D-091).
- Delivery dates in the PRD are ignored (D-005). Don't rush scope to hit them.
- Don't commit or push unless asked.

## Waiting on the user (remind them when they ask what is outstanding)
Received and integrated (user, 2026-11-23): the **product catalogue and measurement units**, and the **material formulas and wastage rules** (earlier loaded as kits, D-104 and D-107). Nothing about them is outstanding; changes to them are edits to the data in Settings, not code.

Still to ask of the client (user's call, 2026-11-23; ask in one message, each is something the PRD says the client supplies and Jobber has nothing to copy):
1. **Not a blocker.** **One recent installer work package** (a screenshot of the last message sent to an installer is enough), and **how installers are paid** (per square foot, per day, or a flat price per job). Until it arrives the work package (D-099) is editable text and lines the team can change (golden rule in `../CLAUDE.md`, D-091).
2. **BLOCKER (Messages and WhatsApp cannot go live without it, and registration takes days to weeks).** **For texting and WhatsApp (we do all the setup ourselves; the client does not create or own a Twilio or Meta account):** legal business name, EIN, business address and website; a document that proves the business (IRS EIN letter or state registration); the phone number customers know them by (we decide whether to buy a new number or move theirs); one number serves both texting and WhatsApp. We create the Twilio account ourselves and the Meta Business account under one of the client's accounts the user already holds; the business email and the domain verification (DNS) come from the user's admin access at qualityfirstturf.com, so none of that is asked of the client. Business-texting registration takes days to weeks, so ask early.
3. **Not a blocker (ask proactively, load the real list when it comes).** **Suppliers:** name, contact, what they supply, typical lead time, how they order (phone, email or portal), and anything worth knowing when ordering (a minimum order, how far they deliver, items they often run out of). No placeholders for this one: we load the real list.

The contract, invoice and completion sign-off templates are **not asked for now** (user, 2026-11-23): we keep using our own, and the client's replace them when they send them.

## To do: check the Jobber link (D-085), on a machine where Jobber is connected
The CRM sends consultations to Jobber (`convex/crm/jobberConsultation.ts`), but it was built on a machine where Jobber was not connected, so **no call to Jobber has ever been tried**. Do this in a new session on the dev deployment, then delete this section and note the result in D-085:
1. Confirm the dev deployment is connected to Jobber (the forms app's connect link). Never use production for this test.
2. Check the GraphQL names against Jobber's schema, especially `assessmentComplete(assessmentId:)`, `assessmentCreate`, `assessmentEdit`, `assessmentDelete`, `requestEdit` and `users { email { raw } }` (a throwaway internal action that introspects `__type(name: "Mutation")`, deleted afterwards, worked as a plan).
3. In New Request (Quality First Turf Landscape): assign someone, Schedule consultation, save. Expect it in Jobber on the request, assigned to that person's Jobber user (or unassigned if their email is not a Jobber user), the sales form showing the same booking, and the request at Onsite Consultation.
4. Move the time, change the person, mark it complete, and delete it from the CRM; each should follow in Jobber. Then move a request past the request stages with an open consultation and check it is completed in Jobber.
5. Make a failure (disconnect Jobber, book): the CRM booking must stay, the request page must say "Not in Jobber: ..." and **Send to Jobber** must work once reconnected.
6. Closed Lost: open visits become Lost on the Schedule and Jobber is untouched.
Fix what does not match, then run `npx vitest run tests/consultationStage.test.ts tests/schedule.test.ts` (the 27 failures in `access.test.ts` and `invitations.test.ts` ("Unexpected field `url`") are older and unrelated).
