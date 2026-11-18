# Finance: invoices, payments and the Finance pipeline (Milestone 5, PRD 5.1 and 5.2): design

Status: **awaiting the user's approval.** Nothing is built. Written 2026-11-18 after reading Jobber's job, invoice, payment and Collect Payment screens in the browser (test records only, nothing sent) and PRD 5.1 and 5.2. The user's instruction: replicate Jobber in full (UI, UX, fields), with the payment schedule on the project (approach A). The golden rule (D-091) applies: assume, and ask the client only for what cannot be assumed.

## Intent
When construction is signed off, the team bills the project: invoices against it (a deposit and a final invoice, or a payment schedule), payments recorded against those invoices, and the project moving across a six-stage Finance board until it is paid, reviewed, filed and archived. The dashboard shows what is owed.

## Goals
- Invoices and payments that look and behave like Jobber's (the user's main objective, D-068), plus what the PRD requires on top: the Finance pipeline, deposits and final payments tracked, outstanding balances, pending payments on the dashboard.
- One project record (rule 1). Invoices and payments reference the project and the client by ID; nothing is copied except labelled snapshots.
- Money rules in one pure file, used by backend, screens and tests (as `quoteMath.ts`).

## Non-goals (not now)
Online card payment (Jobber Payments), accounting sync (QuickBooks and the like), sending invoices by text (no SMS provider yet, 5.3), recurring invoices, expenses and timesheets, refunds through a payment provider. Where Jobber shows these they appear greyed with a short note, as elsewhere in the CRM.

**Anti-goal:** a number that disagrees between screens. Balances are always computed from payments, never typed.

## What Jobber does (copied)
- **The job holds the billing plan.** Billing section: "Remind me to invoice when I close the job", or "Split into multiple invoices with a payment schedule": rows of a percent (or dollar amount) of the total with a description, a progress bar (Paid, Awaiting Payment, Draft, Remaining), a **Create** button per row, and Add Invoice to Payment Schedule.
- **New Invoice:** Subject (default "For Services Rendered"), client, Invoice #, Issued date, Payment terms (Due upon receipt, Net 7, 15, 30, 45, 60, End of the month, Custom date), Salesperson, custom fields; line items (name, quantity, unit price, total, description, service date); Client view toggles (Quantities, Unit prices, Line item totals, Account balance, Late stamp); Subtotal, Discount, Tax, Total, **Deposits** (use an existing deposit or record a new one), Invoice balance; sections Client Message, Contract / Disclaimer, Images, Attachments, Notes. From a schedule row the form shows the full line total, "Due this invoice", "Portion of job: 30% ($300 of $1,000)" and the schedule table.
- **Save Invoice** with Save and Send as Email, Send as Text Message, Collect Payment.
- **Invoice page:** status (Draft, Awaiting payment, shown "Past due" once overdue; Paid; Bad debt; Voided), More menu (Send as Email, Mark as Sent, Collect Payment, Preview as Client, Collect Signature, Print or Save PDF, Delete), Client view, notes, payments listed with the balance.
- **Collect Payment** (a full page): amount, method (Other, Bank payment, Cash, Check, Credit/debit card, Cash App, PayPal, Venmo, Zelle), transaction date, Reference #, Details, and an **Outstanding invoices** table: tick invoices, type the amount for each; one payment can span several and can be partial. Save, or Save and Email Receipt.
- **Lists:** Invoices has overview cards (Past due, Sent but not due, Draft, Issued past 30 days, Average invoice), Status filter (Awaiting payment: past due / not yet due / all, Draft, Paid, Bad Debt, Voided) and Date filter, search, and a table (Client, Invoice number, Due date, Subject, Status, Total, Balance). Payments has Status, Method and Date filters, search, and a table (Client with a link to its invoice or quote, Payment date, Status, Method, Amount).

## Approaches considered
- **A. Copy Jobber, schedule on the project (chosen by the user).** The approved quote's total is the project's billing total; the project's Billing tab holds the payment schedule; each row creates an invoice. Standalone invoices still work. Trade-off: the most to build, but it is Jobber's way and covers a deposit plus final, or progress billing, with no rework.
- **B. Deposit plus one final invoice per project.** Simpler; drops progress billing and would need rebuilding if the team bills in stages.
- **C. Invoices only, no link to the board.** Closest to a bare New Invoice, but the Finance board would be moved by hand and the dashboard's pending payments would have nothing to read.

## Design

### Data (additive; new tables, no existing table edited except one validator)
- `invoices`: business, client, optional project (`opportunityId`), number (next per business, as quotes), subject, status (`Draft`, `Sent`, `Paid`, `Bad debt`, `Void`; "Past due" is derived from the due date, never stored), issued date, payment terms key, due date, salesperson, client message, contract text, discount and tax (kind and value, as quotes), client view, `scheduleItemId` and portion (when made from the schedule), share token, and labelled copies `totalCents` and `paidCents` for sorting and listing, kept by the one place that writes lines and payments. Search text, as quotes.
- `invoiceLines`: name, description, quantity, unit price, service date, position, and `dueCents` (this invoice's share when made from a schedule row).
- `paymentScheduleItems`: project, position, description, kind (percent or amount), value, and the invoice it created. The project's billing total is the approved quote's total at the time the schedule is made, stored as a labelled snapshot on the project's billing plan (`billingPlans`: project, totalCents, mode `remind` or `schedule`).
- `payments`: business, client, optional project and quote, method, transaction date, reference, details, amount (cents), status (`Succeeded`), who recorded it, source (`manual` or `quote deposit`).
- `paymentAllocations`: payment, invoice, amount. A payment with unallocated cents is a **deposit** that the invoice form's "Find Deposit" can apply. Invoice balance is `total` minus its allocations. A payment can never allocate more than its amount or more than the invoice's balance.
- `invoiceEvents` (activity: created, sent, marked sent, viewed, payment recorded, voided and so on) and `invoiceSettings` per business (default payment terms, default client message and contract text, the review link used at Get Client Review, next invoice number).
- `opportunities.pipeline` gains the literal `Finance` (a validator widening, the only edit to an existing table).
- Existing quote deposits: when staff mark a quote's deposit received (today a field on the quote), the same mutation also writes a `payment` (source `quote deposit`) so it appears in Payments and can be applied to the first invoice. Quote #1's $810 is backfilled once. The quote's own fields keep working unchanged.

### Pure rules: `convex/crm/lib/invoiceMath.ts`
Line and invoice totals (same discount, tax order as `quoteMath.ts`), splitting a project total into schedule rows (percent or amount) where **the last row takes the rounding remainder so the rows always add up exactly**, balance, derived status (Draft, Awaiting payment not yet due, Past due, Paid, and so on), payment terms to due date, and allocation checks. All amounts are whole cents.

### The Finance board (PRD 5.1)
- `FINANCE_STAGES` in `stages.ts`, verbatim: Send Final Invoice, Pending Final Payment, Final Payment Received, Get Client Review, Consolidate Files, Archive. Finance joins `WORK_PIPELINES`, so the board, drag moves and the history use the same machinery as Preplanning and Construction.
- **Entry (my call, correctable):** automatic, in the same save as the customer's completion sign-off, as Closed Won already enters Preplanning (D-080). The project lands in Send Final Invoice, stays visible in the last Construction column with a green "In Finance" line (as D-089), and the Office team gets the existing alert. Rule 5: Finance cannot be entered without construction sign-off (server-side).
- **Automatic moves** (all written through the one stage-move function, with `stageHistory`):
  - When the invoices sent for the project cover its billing total (the last schedule row's invoice is sent, or a standalone final invoice leaves nothing to invoice) while the project is in Send Final Invoice: move to **Pending Final Payment**.
  - When the project's outstanding balance reaches $0 with everything invoiced, while in Pending Final Payment: move to **Final Payment Received**.
  - **Get Client Review, Consolidate Files, Archive** are moved by hand. The card for Get Client Review offers Copy review link (from settings). Consolidate Files uses the project's existing Files tab. Archive is the last column: a project there stays on the board and counts as done (my call; simpler than hiding it, and it keeps the history in one place).
- **Server guard:** a project cannot be moved to Final Payment Received while it has an outstanding balance. An Admin can mark an invoice Bad debt or Void, which clears it.
- A board card shows the client, project, balance due and the days in stage, with the same filters, list toggle and touch drag as the other boards.

### Screens (Jobber's layouts, the CRM's tokens and rules: skeletons, hover, fixed table columns, red-on-submit, motion)
- `/invoices` list and overview cards, `/invoices/new`, `/invoices/[id]`, `/invoices/[id]/edit`. Opened from a schedule row, the New Invoice form is prefilled.
- `/payments` list with its cards, and `/payments/new` (Collect Payment) with the Outstanding invoices table.
- `/pipeline/finance` (the Finance board; the Pipeline menu entry stops being greyed).
- A **Billing** tab on the project page (after Construction): billing total, mode, the payment schedule with Create buttons and the progress bar, and the project's invoices and payments.
- The client page's Billing card and balance read the real payments and invoices; the Invoices stat on the client page counts real invoices.
- **Home:** the Invoices card becomes real: Past due, Awaiting payment, Draft, and the PRD's pending payments; "Jobs awaiting invoicing" is the projects in Send Final Invoice.
- **Print or Save PDF** through the browser print view, as the sign-off. **Preview as Client** is the public page below.
- **Public invoice page** `/i/<secret link>` (no sign-in, read-only, hidden from search engines, rate-limited like the quote link, a skeleton): the invoice as the Client view allows, with the balance and payments. No online payment. **Send as Email** uses the existing Zoho sending (D-077) with the link; **Send as Text Message** stays greyed until 5.3.
- **Invoice template:** our own, in Jobber's layout, business name, logo, address and tax text coming from each business's settings (editable by Admin). The client's own template replaces it when they send one.

### Who may do what (my call, correctable; refined by the permissions work in 5.5)
Admin and Office Team create, edit, send and record payments. Admin only: void, mark bad debt, delete a draft, and edit invoice settings. Sales and Project Managers can look at invoices and payments of their business. Installers see nothing here. Every function starts with the access helpers in `access.ts` and checks the business (rule 3). A new `requireBilling` helper holds the money rule in one place.

### Testing
Backend tests (Vitest, the CRM's `tests/` pattern) for: the pure math (rounding remainder, discount and tax order, terms to due dates, balances, derived status); allocation limits (never over the payment or the balance); the schedule's rows summing to the total; creating an invoice from a row and the row recording its invoice; the quote deposit writing a payment and being applied as a deposit; both automatic moves and the guard on Final Payment Received; Finance refused without sign-off; permissions per role and business; the public invoice link (valid, wrong, expired, rate limit). Then typecheck, lint, a production build, and a browser check of every screen on the dev deployment with test data, like earlier milestones.

### Build order (each step ends with checks, a decisions entry and a pause for the user)
1. Backend: tables, `invoiceMath`, invoices and payments functions, schedule, Finance stages and moves, tests.
2. Invoices list, New Invoice, invoice page.
3. Payments list and Collect Payment.
4. The project's Billing tab and payment schedule.
5. The Finance board, and the client page and Home wiring.
6. The public invoice page, Send as Email, print.

## Constraints
- Dev deployment only; `convex deploy` and any production data need the user's go-ahead (root rule 2). File names under `convex/` use no hyphens (rule 6). Every new env var is added to `convex.config.ts`. This work touches the shared `convex/` folder, so each step ends with the `npx convex deploy` reminder.
- Nothing in the forms app, Jobber code or crons is touched (D-028).

## Left to the builder
Exact column widths and copy, the skeletons' shapes, the order of fields inside the dialogs, the rate limit numbers, and how the board card lays out its balance, as long as they follow the CRM's UI rules and Jobber's screens.

## Calls I made (please check these)
1. Finance entry is automatic on the customer's sign-off, and the project stays visible in the last Construction column.
2. Archive is the last board column, not a hidden state. (I earlier said Archive would take a project off the board; this is simpler. Say if you want it hidden.)
3. Admin and Office Team handle money; Sales and Project Managers only look.
4. The Pending Final Payment move happens when all invoices covering the billing total are sent, and Final Payment Received when the balance reaches $0.
5. A public invoice link and Send as Email are in this milestone, with no online payment.
6. Our own invoice template for now.
