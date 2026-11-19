# Jobs, plan 2: costs (Labor, Expenses, line costs, profit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose to build in this session). Steps use checkbox syntax.

**Goal:** A job's Cost is real: the catalogue cost of its lines, the Labor logged on it and its Expenses, shown with Profit, as on Jobber's job page.

**Architecture:** Two new tables (`jobTimeEntries`, `jobExpenses`), one new module `convex/crm/jobCosts.ts`, pure money rules in `convex/crm/lib/jobCosts.ts`, and the job page's Labor, Expenses, Product / Service and Totals cards wired to them. Cost is always computed, never typed (CRM rule 7).

**Spec:** `CRM/docs/superpowers/specs/2026-11-19-jobs-design.md` (step 6). Jobber's dialogs read on 2026-11-19: New time entry (Employee, Employee cost per hour, Start date, Start and End time, Hours and Minutes, Notes) and New expense (Date, Item name, Description, Total, Accounting code, Reimburse to, Receipt).

## Global Constraints
- Dev deployment only; never deploy or touch production without the user's go-ahead. Do not commit unless asked.
- Additive schema only. New files under `convex/` use letters and digits only.
- Every function starts with `requireModule` / `requireProject`. Costs are prices: reading or writing them also needs the `prices` module at View (Admin, Office, Sales, Project Manager have it; Installer does not).
- Skeletons, hover feedback, red-on-submit validation, 120 to 260 ms motion, 400 px width (D-034, D-035, D-037).
- Calls (user's golden rule, D-091): the cost per hour is typed on the entry and starts from the same person's last entry (Jobber keeps a labor rate on the team member; a field on Manage Team can follow). Receipt Auto-fill needs a reading service, so it stays greyed.

## Review Focus
1. A job with lines that are not in the catalogue has no line cost for them (shown as a dash), and the total still adds up.
2. Hours and minutes stay consistent: 09:00 to 17:00 is 8 h 0 m; an end before the start is refused.
3. Someone without the `prices` module sees no cost anywhere on the job page and cannot add an entry.
4. An expense's receipt is removed from storage with the expense.
5. Turning off "Product & Services costs" on the catalogue hides line costs from the job but keeps Labor and Expenses.

---

### Task 1: Cost rules (pure)
**Files:** Create `convex/crm/lib/jobCosts.ts`; Test `CRM/tests/jobCosts.test.ts`.
**Interfaces:** Produces `minutesBetween(startAt, endAt): number`, `laborCostCents(minutes, perHourCents): number`, `lineCostCents(quantity, unitCostCents | null): number | null`, `profitOf(revenueCents, costCents): { cents: number; percent: number | null }`.
- [ ] Write tests: `minutesBetween` 9:00 to 17:00 is 480, an end at or before the start throws no value (returns 0); `laborCostCents(90, 2500)` is 3750; `lineCostCents(2, 380)` is 760 and `lineCostCents(2, null)` is null; `profitOf(100000, 0)` is `{ cents: 100000, percent: 100 }`, `profitOf(0, 500)` is `{ cents: -500, percent: null }`.
- [ ] Run to fail, implement, run to pass.

### Task 2: Backend, costs of a job
**Files:** Modify `convex/schema.ts` (tables `jobTimeEntries`: `businessId, opportunityId, employeeId, costPerHourCents, startAt, endAt, minutes, notes, createdBy, createdAt`, index `by_opportunity` on `["opportunityId","startAt"]`; `jobExpenses`: `businessId, opportunityId, date, name, description, totalCents, accountingCode, reimburseToId?, receiptId?, createdBy, createdAt`, index `by_opportunity` on `["opportunityId","date"]`); Create `convex/crm/jobCosts.ts`; Test `CRM/tests/jobCostsApi.test.ts`.
**Interfaces:** Produces
- `jobCosts.get({ id })` returning `null` without `prices`, else `{ lineCosts: (number | null)[]  /* per unit, in the order of the job's lines */, linesCostCents, laborCents, expensesCents, costCents, time: { id, employeeId, employeeName, startAt, endAt, minutes, costPerHourCents, costCents, notes }[], expenses: { id, date, name, description, totalCents, accountingCode, reimburseToId, reimburseToName, receiptUrl }[], lastRates: Record<employeeId, costPerHourCents> }`
- `addTime / updateTime({ id?, opportunityId, employeeId, costPerHourCents, startAt, endAt, notes, now })`, `removeTime({ id })`
- `addExpense / updateExpense({ id?, opportunityId, date, name, description, totalCents, accountingCode, reimburseToId?, receiptId? })`, `removeExpense({ id })`, `expenseUploadUrl({ businessId })`
- A line's unit cost comes from the catalogue item with the same name (`nameKey`) in the business, only while the catalogue costs switch is on.
- [ ] Write failing tests for Review Focus 1, 2, 3 and 4, plus add, change and remove of a time entry and an expense, Sales (view jobs, has prices) refused on add, and a total that adds lines, labor and expenses.
- [ ] Implement; run `npx vitest run tests/jobCostsApi.test.ts tests/jobs.test.ts`.

### Task 3: The job page
**Files:** Modify `CRM/components/job-page.tsx`, `CRM/lib/jobs.ts` (`useJobCosts`), `CRM/app/globals.css`; Create `CRM/components/job-costs.tsx` (Labor card, Expenses card, the two dialogs).
- [ ] Product / Service table gets a **Unit Cost** column (a dash when there is none) and Total cost from `jobCosts.get`; the Labor card lists entries (Employee, date and time, hours, cost) with edit and delete and an **Add Time Entry** dialog in Jobber's layout (Employee, cost per hour starting from `lastRates`, Total cost line, Start Date, Start and End time, Hours and Minutes kept in step, Notes); the Expenses card lists expenses and **Add Expense** offers Auto-fill (greyed) and **Create manually** (a side drawer: Date, Item name, Description, Total, Accounting code, Reimburse to, Receipt upload); the Totals card shows Total cost to date, a Revenue bar, Cost, and Profit with its percent.
- [ ] Verify in Chrome: add a time entry and an expense with a receipt, see Cost and Profit change, delete them, and check 400 px width.

### Task 4: Docs and the whole check
- [ ] Update D-094 (or a new D-095) and `phases.md`; run `npx tsc --noEmit` (CRM, forms, convex), `npm run lint` on touched files, `npx vitest run` (only the 27 older failures may remain), and a build of both apps.
- [ ] End with the `npx convex deploy` reminder.
