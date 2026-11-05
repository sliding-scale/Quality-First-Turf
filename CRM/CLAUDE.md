# CLAUDE.md

Guidance for Claude Code in this repository: the Quality First Turf CRM, a Jobber replacement.

This folder is one app in a monorepo. The repo root `../CLAUDE.md` has the overall plan and the production safety rules, and applies here too.

## Read first
- `docs/prd.md`: requirements. Source of truth for scope.
- `docs/phases.md`: current plan and checklists. Update checkboxes as work completes.
- `docs/decisions.md`: settled decisions and open questions. Check before choosing a design. Log new decisions there.
- `docs/architecture.md`: directory layout and where things live.
- `docs/client-answers.md`: what the client has told us, what is held, what is ours.

If a task conflicts with a recorded decision, say so instead of silently working around it.

## Current state
The client is shifting off Jobber as PRD milestones ship (D-027), so each milestone is built to completion on the real backend and released in order. Inside a milestone the UI comes first. The Milestone 2 screens (Home, Clients, Client page, New/Edit client) are built in Next.js in this folder on sample data, behind `lib/clients.ts` (D-033). The HTML mockups were converted and removed. Convex, Clerk and the access helper are not wired yet. Nothing else is built until the user approves that step's design (D-020). No questions go to the client now; ask only when one blocks a specific piece of work (D-018).

## How to work with this user
- Go step by step. Settle one thing, then the next.
- Do not build, scaffold or install while brainstorming.
- The user dictates by text-to-speech, so "V" often means "B" (e.g. "V2.1" is B2.1). Read it as intended.
- The user answers with decisions. Record them in `docs/decisions.md` and `docs/client-answers.md` as you go.
- The user will send Jobber screenshots and the logo later. Treat the current layouts as provisional until then.

## Skills
Superpowers skills (from github.com/obra/superpowers) are installed in `.claude/skills/`. Use `brainstorming` before designing a feature, `writing-plans` before multi-step implementation, `test-driven-development` and `systematic-debugging` while building, and `verification-before-completion` before calling a phase done. The `unslop` skill (github.com/heydamir/unslop, CC BY 4.0, credit kept in its files) is also installed. Use it to polish finished screens for spacing, colour, copy and details. Do not let it redesign the look: the client wants a Jobber-like, minimalist interface, so its "one bright element" and visual-richness advice does not apply to the staff app. This file and `docs/decisions.md` take precedence over a skill where they conflict.

## Stack
Next.js (App Router) + TypeScript, Convex backend, Clerk auth. The UI is plain CSS in `app/globals.css` for now (carried over unchanged from the approved mockups); Tailwind and shadcn/ui are not installed. One monorepo with the forms app and one shared Convex backend (D-026). Verify the real file layout and scripts once scaffolded. Don't assume this file is current.

## The monorepo and the live forms app (`../forms`)
The git root is `Quality-First-Turf/` (one level above this folder). It holds `forms/` (the live customer-intake and on-site-visit app: Next.js 16, Convex, Jobber push, already used by the client) and `CRM/` (this folder). They share one Convex backend (D-026).
- **Never modify the forms app, deploy, or touch its Convex or Jobber data without the user's explicit go-ahead.** Its own CLAUDE.md sets handoff rules.
- **One `convex deploy` publishes everything, so CRM work can break the live forms.** Keep schema changes additive and don't edit the forms' tables. The shared backend is `../convex/` at the repo root (D-030). CRM backend code goes in `convex/crm/` (D-029). `convex/shared/` holds domain logic the forms also use; keep it pure TypeScript and treat edits as live-app changes. Work against the dev deployment only. Never deploy to production without the go-ahead.
- Read the forms code freely. Never edit a forms function in place. Reuse it as it is, or copy it under `convex/crm/` (D-021).
- **Jobber keeps working in full until the whole CRM is complete (D-028).** Don't touch the forms' Jobber push, sync, crons or `JOBBER_*` env vars. The forms-to-CRM enquiry flow belongs to the Milestone 3 release and needs the user's go-ahead.

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
- Three **businesses**: Quality First Turf, Quality First Turf Construction, Quality First Patios (D-016). Users can belong to several; a project and a client each belong to one.
- Login roles: Admin, Sales, Office Team, Project Managers. A user can hold several (D-014). Installers do not log in; they are records that receive work packages via secure links (D-010).
- Pipelines and their exact stage names are in `docs/prd.md`. Use those names verbatim as constants in one place.
- United States, all states: tax and time zone vary by job (D-017).

## UI/UX direction (client requirement, D-019)
- **Build only what the PRD describes (D-024).** Jobber has many features the client does not need. Check `docs/prd.md` before adding any screen, field, filter or button. The exceptions are the Jobber items the user chose to keep (D-025).
- **Fonts and icons are Jobber's:** Inter for text and Figtree for headings (an open-source stand-in for Jobber Pro, which is proprietary and must not be shipped; see D-025), and the Atlantis icon set from `@jobber/design` (MIT). The icon table is `lib/icons-data.ts`; keep its licence notice (`lib/ICONS-LICENSE.txt`).
- **Heavily inspired by Jobber's interface.** Left sidebar, top bar with search and a Create button, list and detail pages. Nav (D-025): Create, Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices, Payments, Messages, Pipeline.
- **Minimalist.** Little ornament, generous whitespace, no gradients, restrained shadows, thin borders. Detail goes on the detail page.
- **Colours: mainly white, off-white, gray and black.** Define them as tokens once. Jobber's green `#388523` is the single accent (primary buttons, links, active tab). Sampled values live in `app/globals.css`: shell `#eeece7`, headings `#032b3a`, body `#233d48`. Use other colour only where it carries meaning (status, errors). Don't use the forms app's forest-green/sand palette.
- **Kanban/board view wherever it applies.** Every pipeline gets a board with a list toggle. Quotes and tasks get boards where it fits.
- **Clients page** follows Jobber's section order. **Project page** tabs: Overview, Visit, Quotes, Files, Activity.
- **Lists use pagination, never infinite scroll.** No separate mobile layout: below ~1100px the desktop view gets more compact (icon-rail nav, right-hand column below the main content).
- **Phone-first:** Today/Schedule, Project Overview, Visit, Tasks, progress and punch list, customer sign-off. **Desktop-first:** boards, quotes, invoices, takeoff, crews, settings, import. Everything is responsive.
- Searchable tables, one consistent form style, one consistent detail-page layout, large tap targets.
- **Skeleton loaders everywhere (D-034).** Any screen, list, table, card, panel or form that waits for data, a route or the browser shows a skeleton shaped like the real content. Never a blank area and never a bare spinner. New screens ship with their skeleton in the same change: add it to components/skeletons.tsx (build it from the screen's own layout classes so nothing jumps), use it as the client-side fallback, and add a loading.tsx for the route. Skeletons use the .sk class, which turns its animation off under prefers-reduced-motion.
- **Hover feedback on everything clickable (D-035).** Every button, link styled as a button, icon button, tab, chip, toggle, radio option, sort header, menu item and clickable row changes visibly on hover and on press, and shows a pointer cursor. Disabled controls get none. Check it with a real mouse hover, and remember that a more specific rule (such as `.name-row .btn`) can silently hide a base `:hover`.
- **Fixed table column widths (D-035).** Every table is `<table class="table">` (CSS `table-layout: fixed`) with a `<colgroup>` that sets each column's width, in px or %. Columns never resize with their content, the search or the filter. Long text wraps; for one-line rows add class `single` so text is cut off with an ellipsis, and put the full text in `title`. A table's skeleton uses the same `<colgroup>`.
- **Invalid fields turn red on submit (D-035).** Nothing is flagged while the user is still typing. When they try to submit, every invalid field is highlighted red (border, tint and label, using the `bad` class on `.field`) with a message under it and `aria-invalid`, and the first one is focused. Each clears as soon as it is corrected. A field is never left red after it is fixed. Server-side validation errors use the same red state. See `components/client-form.tsx`.
- **Smooth motion on every state change (D-037).** Anything that appears, disappears, expands, collapses or changes state animates: menus and popovers (in and out), toasts, the sidebar collapse, tab and page content, new rows and notes, error messages, and hover/press colour changes. 120 to 260 ms, ease-out going in and ease-in going out. A closing element stays mounted until its exit animation ends, so it never just vanishes. Everything stops under `prefers-reduced-motion`. Verify by sampling the real element over time in a browser (width, opacity), not by reading the CSS.
- **Inputs stop wrong characters, and fields use the right control (D-038).** A field filters what is typed so a wrong character never lands (phone: digits only, formatted as you type; ZIP: five digits; names and cities: no digits; email: no spaces) using the helpers in `lib/fields.ts`. A fixed set of choices is a dropdown, not free text (state uses the shared `US_STATES` list). This sits on top of the red-on-submit validation (D-035), which still catches what filtering cannot, such as a phone number with too few digits.
- The UI is built first on sample data (D-013). Keep data access behind a thin layer so Convex replaces the samples without rewriting screens.

## Conventions
- TypeScript strict. No `any` without a comment saying why.
- Convex: validators on all function args. Schema in `convex/schema.ts`. Index every field used in filters or lookups. Paginate lists.
- Search/filter belongs in Convex indexes or search indexes, not client-side filtering of full tables.
- Match surrounding code style, naming and comment density. Don't add speculative abstractions.
- Secrets (Twilio, WhatsApp, Google, Clerk) go in env vars / Convex environment, never in client code or committed files.

## Working agreements
- Test each phase before calling it done. Pipeline transitions, permissions and the formula engine need automated tests.
- Report blockers early; blocking client questions come from the backlog in `docs/client-questions-later.docx` (D-018).
- Delivery dates in the PRD are ignored (D-005). Don't rush scope to hit them.
- Don't commit or push unless asked.
