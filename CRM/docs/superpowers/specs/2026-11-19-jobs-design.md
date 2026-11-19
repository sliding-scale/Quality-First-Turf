# Jobs: design

Date: 2026-11-19. Status: **approved by the user; plan 1 (steps 1 to 5 for the catalogue list) built on dev, see D-094.**

## Intent
The team uses Jobber's Jobs page today. Launchpad greys out Jobs (sidebar, Home card, Create menu, schedule's Job tab and "Create new visits", "Convert to Job" on quotes and requests). The user's call: **every Closed Won project is a job**, and the job page is Jobber's (approach A), read from the real browser on 2026-11-19. The main objective stays "replicate Jobber" (D-068); the PRD is the mandatory floor.

## Goals
- `/jobs`: Jobber's Jobs list. `/jobs/[id]`: Jobber's job page.
- A job is **the project record seen through a Jobs page**, not a new record (architecture rule 1). Everything shown is read from records that already exist (rule 2).
- Un-grey, because they now work: Jobs in the sidebar, the Home Jobs card, Create > Job, the schedule's Job tab, Convert to Job on a quote, and Job in the client page's Create menu.

## Non-goals
- No separate job record, no copy of client, quote or invoice data.
- Nothing in Jobber, the forms app or production is touched (D-028).
- **Rule (user, 2026-11-19): anything on Jobber's job page or in the PRD gets built; only what is in neither is left for client feedback.** So recurring jobs, Job type, Labor (time entries), Expenses, Checklists and the Close Job and New Job actions are all in scope, built in the later steps of the plan (below), not left greyed. The one limit is a provider that does not exist yet: texts (PRD 5.3, carrier registration) get their screens, with Send greyed until the number is live. Email uses the existing Zoho sender.

## What Jobber has (read 2026-11-19, one test job)
- **List:** header with New Job and More Actions; cards Overview (Ending within 30 days, Late, Requires Invoicing, Action Required, Unscheduled, each with a count), Recent visits (past 30 days: count and revenue) and Visits scheduled (next 30 days: count and revenue); "All jobs (n results)"; filters Status (All, Ending within 30 days, Late, Requires Invoicing, Action Required, Unscheduled, Active, Today, Upcoming, On Hold, Archived, each with a count) and Job Type; search; columns Client, Job number (with the title under it), Property, Schedule, Status, Total.
- **Job page:** green status pill and title; a history clock, More menu and a main button ("Show Late Visit"); a client card (name, property address, phone, email); Job # / Job type / Started on / Ends on / Billing frequency; **Product / Service** (lines, subtotal, total price, total cost); **Labor** and **Expenses** (empty, with add links); **Scheduled visits** (first visit, checklists, arrival window, status filter, a table of Date and time, Title and instructions, Status, Assigned, with a complete tick and an edit pencil, and a + to add a visit); **Billing** (reminders, Invoicing and Reminders tabs, Payment Schedule with the paid, awaiting, draft and remaining bar); right column **Total cost to date** (revenue, cost, profit) and **Notes**.
- **More menu:** Close Job, Create Similar Job, Send Job Follow-up Email, Text Booking Confirmation, Email Booking Confirmation, Create Invoice, Collect Signature, Email Job Costs CSV, Print or Save PDF, Delete.

## Approaches (the user picked A)
- **A. A Jobber-style job page (chosen).** More work, matches the main objective.
- B. The Jobs list links to the existing project page. Faster, looks nothing like Jobber. Rejected.

## Design

**What is a job.** An `opportunities` row with `outcome === "won"` (the Closed Won rule, D-063, already guards this: signed contract and deposit). Not archived-lost. It keeps `pipeline` and `stage`, so it still moves through Preplanning, Construction and Finance as today; the job page shows where it is as a line under the title ("Construction: Ready to Start") with a link to the project page, and the project page links back to its job.

**Job number.** New `opportunities.jobNumber` (optional number) and a per-business counter table `jobCounters` (`businessId`, `next`). The number is written once, in the one place a project becomes Closed Won (the stage mutation), so it cannot be skipped or repeated. A one-time internal backfill numbers the projects already won, oldest `closedAt` first. Both are additive (rule 3 of the root CLAUDE.md).

**Statuses, derived, never stored** (rule 7: computed from real records). In this order, first match wins:
1. *Archived*: `archivedAt` set, or the job was closed by hand (Jobber shows a closed job as Archived).
2. *Requires Invoicing*: construction signed off (the project is in Finance) and invoices sent so far do not cover the billing total (the same test the Finance board uses).
3. *Late*: a visit linked to the project is before today and not completed.
4. *Unscheduled*: no visit linked.
5. *Today*, *Upcoming*, *Active*: a visit today; otherwise the next visit is in the future; otherwise the work is under way.
"Ending within 30 days" counts jobs whose last visit falls in the next 30 days. "Action Required" and "On Hold" are shown greyed in the filter (nothing in Launchpad sets them yet).

**Visits.** The existing schedule items (`opportunityId`), kinds Follow-up visit and Consultation. The + on the job page opens the existing Find a Time popup prefilled with the project, as the schedule's "Job" tab (un-greyed) does. A visit's complete tick uses the existing complete mutation.

**Job page sections** (Jobber's order, one card each, plain CSS in the existing style, skeleton and `loading.tsx` per D-034): header; client card; details; Product / Service (the accepted quote's lines, read only, edited on the quote); Labor and Expenses (greyed, with the add links disabled); Scheduled visits; Billing (the existing project Billing tab content, reused as a component: payment schedule, invoices, Create invoice from a row); right column Totals and Notes (the project's existing notes, with the existing `@` tagging).
- **Totals card:** Jobber's Revenue, Cost, Profit, all computed: Revenue is the quote total, Cost is the sum of the job's lines' costs (from the products and services catalogue, below), Labor and Expenses. Never typed.
- **More menu, all live except where a provider is missing:** Close Job (manual: the user's call, 2026-11-19. It marks the job closed. Closing is its own recorded step with who and when, and it does not skip the construction sign-off or Finance guards, which still decide the project's pipeline stage), Create Similar Job (a copy of the lines on a new project for the same client), Create Invoice (`/invoices/new?clientId=&projectId=`), Print or Save PDF, Send Job Follow-up Email and Email Booking Confirmation (the existing Zoho sender), Collect Signature (the existing signature pad), Email Job Costs CSV (a download built from the job's lines, Labor and Expenses), Delete (Admin only, refused once the job has an invoice or payment, as clients are). Text Booking Confirmation is greyed until texting is live.
- **Main button:** where Jobber says "Show Late Visit" we show the next visit that needs attention if there is one; otherwise it is hidden.

**Convert to Job** (quote page and request page). Enabled when the quote is Approved. It runs the existing Closed Won move (`moveStage`) so the same server-side guard applies, then opens the job. If the guard refuses (no signed contract or deposit) the refusal message shows as it does today.

**New Job** (user, 2026-11-19: not greyed, a job can be made by hand). It opens Jobber's New Job form: client and property, title, line items, one-off or recurring, a start date and visits. Saving creates a project (`opportunities`) at Closed Won with `outcome: "won"`, no quote and a job number, and the project then moves into Preplanning as every won project does (D-088). The signed-contract and deposit rule applies to a quote being approved, not to a job entered by hand, so the form records "Created by hand" in the history. This is the one way a project is created without going through Sales; it is logged in `stageHistory` like every move.

**Permissions.** A new module `jobs` in `convex/crm/lib/permissions.ts` (D-093): Admin Edit and delete, Office Create and edit, Project Manager Create and edit, Sales View, Installer None (they keep their Construction access). Every job function starts with `requireModule(ctx, businessId, "jobs", level)` and, for one project, `requireProject`. "Only records assigned to me" follows the project's existing assignment rules.

**Backend** (all additive): `convex/crm/jobs.ts` (`list` paginated with search and a status filter, `counts` for the cards and the filter, `get`), the counter, the `jobNumber` write in the one Closed Won place, and an internal backfill. Search is a search index or the existing `searchText`, not a client-side filter (CLAUDE.md conventions). Lists use pagination.

**Home.** The Jobs card (Jobber's Home counts) shows real counts: active, late, requires invoicing.

**Tests.** Status derivation (each of the status rules and the order), the counter (one number per won project, none repeated, per business), the Closed Won hook, Convert to Job (refusal and success), and the new module's levels.

## Products and services catalogue (user, 2026-11-19)
Jobber's Settings > Products & Services has **617 records** (Name, Description, Type, and in each one: Cost, Markup %, Unit Price, an optional image, "Exempt from Tax", "Available on quotes, quote templates, jobs, invoices and online booking"). They give the lines their cost and price. Plan: a `catalogueItems` table per business, copied in once from Jobber's own **Export CSV** (field mapping, a per-row error report and a dry run, as the import rule 6 asks), editable in Settings > Products & Services, and picked from in the quote, request and job line editors. Images are copied separately (see the user's question below).

## Calls I made (the user can overrule)
- Statuses derive from existing records; Action Required and On Hold stay in the filter, greyed, until something sets them.
- Cost is computed from the catalogue, Labor and Expenses, never typed.
- The `jobs` permission levels above.
- Job number counts per business, starting at 1.

## Left to the builder
The exact visual spacing (copy Jobber's), the skeleton shapes, the card order on narrow screens (the existing mobile rules apply), and the tooltip text.

## Plan order
1. Backend: counter, `jobNumber`, `jobs.ts`, permissions, backfill, tests.
2. `/jobs` list and the nav and Home un-greying.
3. `/jobs/[id]` page, with Close Job, Create Invoice, Print.
4. Convert to Job, the schedule's Job tab, Create > Job, New Job by hand, then a browser check on dev.
5. Products and services catalogue: the table, the Jobber CSV import, Settings page, the line pickers, and cost on the Totals card.
6. Labor (time entries) and Expenses (with receipts), feeding Cost.
7. Checklists, recurring jobs and Job type, "Create Similar Job", Email follow-up and booking confirmation, Collect Signature, Email Job Costs CSV.
