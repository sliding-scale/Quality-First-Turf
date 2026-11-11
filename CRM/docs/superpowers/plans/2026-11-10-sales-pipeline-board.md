# Sales Pipeline Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Sales pipeline board (Jobber's Pipeline page, PRD 3.3) with validated, recorded stage moves.

**Architecture:** Backend in `convex/crm/` on the existing `opportunities` record: one `moveStage` mutation is the only writer of `stage`, writing `stageHistory`. A `pipeline.board` query returns columns and cards for the filters. The UI is a new route `/pipeline` with three tabs, built on the CRM's existing patterns (skeletons, `ui-provider` menus, `[data-tip]` tooltips, `client-page.css`-style CSS in a new `pipeline.css`). Drag and drop uses the browser's native drag events, no new dependency.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before writing Next code), React 19, Convex (read `convex/_generated/ai/guidelines.md` first), convex-test + vitest in `CRM/tests/`.

**Spec:** `CRM/docs/superpowers/specs/2026-11-10-sales-pipeline-board-design.md`. Also read `CRM/CLAUDE.md` and the repo-root `CLAUDE.md`.

## Global Constraints

- Work on the **dev deployment only**. Never run `npx convex deploy` or any `--prod` command.
- Schema edits are **additive and optional-field only**; the forms tables (`projects`, `visitSnapshots`, `visitRevisions`, `workAreas`, `salesSessions`, `jobberConnections`) and `convex/projects/`, `convex/sales/`, `convex/jobber/` are not edited.
- New backend code goes in `convex/crm/`; **file names contain only letters, digits, underscores and periods**.
- Stage names come only from `convex/crm/lib/stages.ts` (PRD names verbatim, e.g. `"Proposal Delivered — Awaiting Response"`). Nothing but `moveStage` patches `opportunities.stage`.
- Every function starts with `requireBusiness` (read) or `requireEditor` (write) from `convex/crm/lib/access.ts`. Admin, Sales, Office Team edit; Project Managers read only.
- Money in cents. Business time zone America/Los_Angeles. Queries do not read the clock; callers pass `now`.
- UI rules (CRM/CLAUDE.md): skeleton loader per screen (D-034); hover and press feedback and pointer cursor on every clickable (D-035); fixed table column widths with `<colgroup>` (D-035); red invalid fields on submit (D-035); smooth 120 to 260 ms motion, closing elements stay mounted until the exit animation ends (D-037); unbuilt controls are greyed `disabled`, never "coming soon" clicks; tooltips use `data-tip`.
- Out of scope: Automations (lightning icons, menu item), the AI "Opportunity summary", the quote builder, the calendar, Preplanning.
- Do not commit unless the user asks; the commit steps below apply only when they have. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A move to the stage a project is already in: refuse, write no history row.
- Two quick moves on one card: history rows stay in order and `from` always equals the previous `to`.
- A caller from another business, or a Project Manager: every pipeline function rejects.
- A project with no quotes: card value is `$0`, not blank or NaN.
- A project with no `stageEnteredAt` (all existing rows): time in stage falls back to `requestedAt`.
- Search plus filters plus sort together: the result count, column counts and column totals agree.
- Dropping a card on a hidden or folded column, or on its own column: nothing moves and nothing errors.
- Deleting a custom stage that still holds projects: refused.

---

### Task 1: Stage constants, rules and schema

**Files:**
- Modify: `convex/crm/lib/stages.ts` (additive exports only)
- Modify: `convex/schema.ts` (additive)
- Test: `CRM/tests/pipelineRules.test.ts`

**Interfaces:**
- Produces in `stages.ts`:
  - `PIPELINE_GROUPS: { Requests: readonly string[]; Quotes: readonly string[] }` with Requests = `["New Request","Schedule Onsite Consultation","Onsite Consultation"]` and Quotes = `["Quote Draft & Site Plan / Design","Proposal Delivered — Awaiting Response","Changes Requested","Quotes Approved — Contract Out for Signature"]`.
  - `LEAD_SOURCES = ["Existing Client","Facebook","Flyer","Google","Instagram","Other","Referral","Vehicle Wrap"] as const` (empty/absent means "No source").
  - `checkMove(from: string, to: string, opts: { isAdmin: boolean; reason?: string }): { ok: true } | { ok: false; error: string }` (pure).
  - `timeInStage(stageEnteredAt: number | undefined, requestedAt: number, now: number): number` (ms).
- Produces in `schema.ts`: `opportunities` gains optional `stageEnteredAt: number`, `leadSource: string`, `salespersonId: Id<"users">`, `outcome: "won" | "lost"`, `closedAt: number`, `lostReason: string`; new tables `stageHistory` (opportunityId, businessId, from, to, byName, byUserId, at, note optional; indexes `by_opportunity` [opportunityId, at], `by_business` [businessId, at]), `pipelineStages` (businessId, name, group `"Requests"|"Quotes"`, order number, hidden boolean, custom boolean; index `by_business`), `opportunityTasks` (opportunityId, businessId, title, assigneeId optional, dueAt optional, done boolean, createdAt; indexes `by_opportunity`, `by_business`), `opportunityNotes` (opportunityId, text, author, createdAt; index `by_opportunity`).

- [ ] **Step 1: Write failing tests** in `pipelineRules.test.ts` for `checkMove` and `timeInStage`:
  - same stage -> `{ ok:false }`;
  - `"New Request"` -> `"Onsite Consultation"` ok; backwards `"Changes Requested"` -> `"Quote Draft & Site Plan / Design"` ok;
  - to `"Closed Lost"` without `reason` -> not ok, with a non-empty reason -> ok;
  - to `"Closed Won"` as non-admin -> not ok (error mentions "signed contract and deposit"), as admin -> ok;
  - from `"Closed Won"` or `"Closed Lost"` to anything: only admin ok (reopening);
  - unknown stage name -> not ok;
  - `timeInStage(undefined, 1000, 5000) === 4000`, `timeInStage(3000, 1000, 5000) === 2000`.
- [ ] **Step 2: Run** `cd CRM && npx vitest run tests/pipelineRules.test.ts`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the constants and pure functions in `stages.ts` (keep the file free of Convex and React imports) and the schema additions.
- [ ] **Step 4: Run** the test file, then `npx tsc --noEmit` in `CRM/` and `npx convex dev --once` at the repo root. Expected: tests PASS, no type errors, functions ready.
- [ ] **Step 5: Commit** `feat: pipeline stage rules and schema`.

### Task 2: `moveStage` and stage history

**Files:**
- Create: `convex/crm/pipeline.ts`
- Test: `CRM/tests/pipeline.test.ts` (new; reuse `adminOf` from `tests/helpers.ts` and the seeding pattern of `clientTags.test.ts`)

**Interfaces:**
- Consumes: `checkMove`, schema from Task 1.
- Produces in `pipeline.ts`:
  - `moveStage = mutation({ args: { id: v.id("opportunities"), to: v.string(), reason: v.optional(v.string()), now: v.number() }, ... })` returning `{ from: string; to: string }`. Validates with `requireEditor` for the project's business, `checkMove` (isAdmin from staff), and that `to` is a PRD stage or a non-hidden custom stage of that business (custom stages may not be moved into from or out to Closed Won/Lost... they only sit between Requests/Quotes stages). Patches `stage`, `stageEnteredAt = now`, `searchText` (keep the stage in it as `intake`/`requests` do), `outcome`/`closedAt` for Closed Won/Lost (clears them when reopened), `lostReason`. Inserts one `stageHistory` row. Closed Won sets `closedAt` and is recorded with `note: "Admin override: contract and deposit not yet tracked"`.
  - `history = query({ args: { id: v.id("opportunities") }, ... })` returning rows newest first.

- [ ] **Step 1: Write failing tests** `moveStage` writes exactly one history row with `from`, `to`, `byName`, `at === now`; same-stage move throws and writes none; Closed Lost without reason throws; with reason sets `outcome: "lost"` and `lostReason`; Closed Won by a Sales (non-admin) user throws; by Admin sets `outcome: "won"`; reopening clears `outcome`; two sequential moves give history `[A->B, B->C]`; a user of another business and a PM both throw; `history` returns newest first.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `moveStage` and `history`. Route through one internal helper `applyMove(ctx, opportunity, to, staff, reason, now)` so Task 4 and the later quote-event moves reuse it.
- [ ] **Step 4: Run** the tests until PASS; `npx tsc --noEmit -p convex`.
- [ ] **Step 5: Commit** `feat: moveStage with history`.

### Task 3: Board query

**Files:**
- Modify: `convex/crm/pipeline.ts`
- Test: `CRM/tests/pipeline.test.ts`

**Interfaces:**
- Produces: `board = query({ args: { businessId, sortKey: "timeInStage"|"createdDate"|"value", dir: "asc"|"desc", salespersonId: v.optional(v.union(v.id("users"), v.literal("unassigned"))), leadSources: v.array(v.string()) /* [] = all; "No source" allowed */, from: v.optional(v.number()), to: v.optional(v.number()) /* created-date range */, search: v.string(), now: v.number() } })` returning `{ columns: { name: string; group: "Requests"|"Quotes"; custom: boolean; count: number; totalCents: number; cards: Card[] }[]; total: number; groups: { Requests: { count: number }; Quotes: { count: number } } }` where `Card = { id; code; title; clientId; clientName; stage; valueCents; timeInStageMs; requestedAt; salespersonId?; salespersonName; leadSource }`. Columns are the PRD stages of each group in order, merged with the business's non-hidden custom stages by `order`. Closed Won and Lost projects are excluded. Value is the project's latest quote `totalCents` (0 when none). Search reuses the `search_text` index when `search` is non-empty.
- Consumes: `timeInStage`.

- [ ] **Step 1: Write failing tests** with seeded data: columns equal the seven PRD stage names in order; counts and totals per column equal the sum of their cards; `total` equals the sum of column counts under each filter; sort by value desc orders cards by `valueCents`; salesperson `"unassigned"` returns only projects without `salespersonId`; lead source `["No source"]` returns only projects with no `leadSource`; date range filters by `requestedAt`; search narrows; a project with no quote has `valueCents === 0`; a project with no `stageEnteredAt` uses `requestedAt`; a Closed Won project is absent; another business's caller throws.
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement** `board`; read at most 2,000 projects per business (same cap style as `requests.ts`, with a `capped` flag in the result) and compute the rest in memory.
- [ ] **Step 4: Run** tests until PASS.
- [ ] **Step 5: Commit** `feat: pipeline board query`.

### Task 4: Card actions, outcomes, lead sources

**Files:**
- Modify: `convex/crm/pipeline.ts`
- Test: `CRM/tests/pipeline.test.ts`

**Interfaces:**
- Produces: `setSalesperson({ id, salespersonId: v.union(v.id("users"), v.null()) })` (person must be an active user of the business; null clears), `setLeadSource({ id, leadSource: v.union(v.string(), v.null()) })` (must be in `LEAD_SOURCES`), `markOutcome({ id, outcome: "won"|"lost", reason?, now })` (calls `applyMove` to Closed Won / Closed Lost), `people({ businessId })` returning `{ id, name }[]` of active users who can see the business, `outcomes({ businessId, outcome: "won"|"lost", from, to, sortKey: "title"|"name"|"createdOn"|"wonOn"|"total", dir, page, size })` returning `{ rows: { id; title; clientName; createdOn; closedOn; totalCents }[]; total; page }` (size clamped 1 to 100).

- [ ] **Step 1: Write failing tests**: salesperson set, cleared, and refused for a user outside the business; unknown lead source refused; `markOutcome` lost without reason throws; won by non-admin throws; `outcomes` lists a won project with its latest quote total, sorts by `closedOn`, pages correctly, and a lost project appears only under `lost`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** until PASS.
- [ ] **Step 5: Commit** `feat: pipeline card actions and outcomes`.

### Task 5: Project tasks and notes

**Files:**
- Create: `convex/crm/opportunityTasks.ts`
- Test: `CRM/tests/opportunityTasks.test.ts`

**Interfaces:**
- Produces: `listForProject({ id })` -> tasks and notes of one project (tasks open first); `addTask({ id, title, assigneeId?, dueAt? })` (title 1 to 200 chars, trimmed); `setDone({ taskId, done })`; `addNote({ id, text })` (author = staff name); `listAll({ businessId, assigneeId: v.optional(v.id("users")), now, todayStart, todayEnd })` -> `{ counts: { all; overdue; today; upcoming }; rows }` where overdue = not done and `dueAt < todayStart`, today = due between `todayStart` and `todayEnd`, upcoming = due after `todayEnd`; tasks without a due date count only in `all`.

- [ ] **Step 1: Write failing tests**: empty or 201-char title throws; counts for tasks due yesterday, today, tomorrow, and with no date; completing a task removes it from overdue; assignee filter; PM and other-business callers throw.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** until PASS.
- [ ] **Step 5: Commit** `feat: project tasks and notes`.

### Task 6: Custom stages (Edit Stages)

**Files:**
- Modify: `convex/crm/pipeline.ts`
- Test: `CRM/tests/pipeline.test.ts`

**Interfaces:**
- Produces: `stagesForEdit({ businessId })` -> the PRD stages (locked: true) and the business's custom and hidden rows in display order, with each stage's project count; `addStage({ businessId, group, name })` (name 1 to 60 chars, unique in the business, not a PRD name); `renameStage({ id, name })` (custom only); `setStageHidden({ id | prdName, hidden })` (PRD stages can be hidden via a `pipelineStages` row with `custom: false`; a stage holding projects cannot be hidden); `reorderStages({ businessId, group, names: string[] })`; `deleteStage({ id })` (custom only, refused while it holds projects).

- [ ] **Step 1: Write failing tests**: custom stage appears in `board` between the right neighbours after `reorderStages`; hidden stage disappears from `board`; hiding a stage with projects throws; deleting a custom stage with a project throws and with none succeeds; a PRD name or duplicate name is refused; `moveStage` into a custom stage works and into a hidden stage throws.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**; make `board` and `moveStage` read the same merged stage list through one helper `stageList(ctx, businessId)`.
- [ ] **Step 4: Run** until PASS.
- [ ] **Step 5: Commit** `feat: custom and hidden pipeline stages`.

### Task 7: Sample data for the board

**Files:**
- Modify: `convex/crm/sampleData.ts` and the code that seeds opportunities (`convex/crm/seed.ts`)
- Test: `CRM/tests/pipeline.test.ts`

**Interfaces:** the seed gives each sample project a spread of stages (all seven open stages populated, one Closed Won, one Closed Lost), some salespeople, lead sources, and `stageEnteredAt` set. Existing tests in `crm-backend.test.ts` must still pass.

- [ ] **Step 1: Write failing test:** after seeding, `board` has at least one card in every column and `outcomes` has one won and one lost row.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the seed changes (dev only; production is never seeded).
- [ ] **Step 4: Run** the whole suite `cd CRM && npx vitest run`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat: pipeline sample data`.

### Task 8: Board screen (read side)

**Files:**
- Create: `CRM/app/(app)/pipeline/page.tsx`, `CRM/app/(app)/pipeline/loading.tsx`, `CRM/components/pipeline-page.tsx`, `CRM/app/pipeline.css` (imported in `app/layout.tsx` after `client-page.css`)
- Modify: `CRM/components/skeletons.tsx` (`PipelineSkeleton`), `CRM/components/shell.tsx` (Pipeline item becomes a live link to `/pipeline`; it is greyed today), `CRM/lib/icons-extra.ts` if an icon is missing

**Interfaces:**
- Consumes: `api.crm.pipeline.board`, `people`, `LEAD_SOURCES`, `PIPELINE_GROUPS`.
- Produces: tabs Pipeline, Tasks (with count badge), Sales Outcomes in the URL as `?tab=`; the filter bar (Sort by menu with direction toggle, Salesperson menu with search, Lead source menu with search, "1 selected", Clear, Date range menu, result count, search box); the two groups with vertical label, count badge, "+" (opens New Request, Task 9 wires it) and fold arrow at the bottom; columns with name, count, `$` total; cards showing `Title · CODE`, client, title, time-in-stage chip (`18h`, `3d`), value; sideways board scroll and per-column vertical scroll; empty column state; `PipelineSkeleton` shaped like the board.
- Layout rule: the board fills the page height, the page itself does not scroll (same pattern as the client page's two scroll areas).

- [ ] **Step 1: Write the screen** to match the spec's "Findings from Jobber". Open Jobber's Pipeline in Chrome (`https://secure.getjobber.com/sales`, the user keeps it signed in) and compare sizes, spacing, hover and tooltips side by side; do not click Jobber's Edit Stages controls (they autosave to the user's real account).
- [ ] **Step 2: Verify in Chrome** on `localhost:3000/pipeline`: groups fold and unfold smoothly, the board scrolls sideways, counts match filters, the skeleton shows while loading. Run `npx tsc --noEmit`, `npm run lint`.
- [ ] **Step 3: Commit** `feat: pipeline board screen`.

### Task 9: Moving cards, card menu and panel

**Files:**
- Modify: `CRM/components/pipeline-page.tsx` (split into `pipeline-board.tsx`, `pipeline-card-panel.tsx` if it passes about 600 lines)

**Interfaces:**
- Consumes: `moveStage`, `markOutcome`, `setSalesperson`, `setLeadSource`, `opportunityTasks.*`, `history`.
- Produces: native drag and drop (a dragged card dims, valid columns highlight, a Won and a Lost drop target appear while dragging, dropping on its own column or a folded column does nothing, a refused move shows the server's message in a toast and the card returns); the card "..." menu (View Request, Salesperson submenu or dialog, Mark as won, Mark as lost with a reason dialog); the right-hand panel (title, value, stage chip, time chip, client card with address, phone, email, Email and View Request buttons, Tasks with Add task, Notes, stage history list); keyboard focus and Escape to close; the panel's exit animation completes before unmount.

- [ ] **Step 1: Implement** the above; unbuilt buttons (Email send) are greyed.
- [ ] **Step 2: Verify in Chrome**: drag a card across columns and see it persist after reload; move it back; a Closed Lost move without a reason shows the red field; mark won as a Sales user is refused with the message; the history list shows each move.
- [ ] **Step 3: Run** `npx tsc --noEmit`, `npm run lint`, `npx vitest run`.
- [ ] **Step 4: Commit** `feat: pipeline drag, card menu and panel`.

### Task 10: Tasks tab, Sales Outcomes tab, Edit Stages, Add New, Give Feedback

**Files:**
- Create: `CRM/components/pipeline-tasks.tsx`, `CRM/components/pipeline-outcomes.tsx`, `CRM/app/(app)/pipeline/edit/page.tsx`, `CRM/components/pipeline-edit-stages.tsx`
- Modify: skeletons for each, `pipeline-page.tsx` (Add New menu: Request, Quote; More Actions: Edit Stages, Give Feedback; Automations is not shown)

**Interfaces:**
- Consumes: `opportunityTasks.listAll`, `pipeline.outcomes`, `stagesForEdit` and the stage mutations.
- Produces: Tasks tab with All, Overdue, Today, Upcoming chips with counts and an Assignee filter; Sales Outcomes tab with Outcome (Won, Lost) and Date range filters, sortable table with fixed columns (Title, Name, Created On, Won On, Total) and 10/25/50/100 per page; Edit Stages page (locked PRD stages show a lock with a tooltip "Locked stage", custom stages have rename, drag-to-reorder and delete, hide and the "Show N hidden stage" button, an "All changes saved" chip); Add New: Request opens the existing New Request path (greyed if none exists yet), Quote is greyed until the quote builder exists; Give Feedback opens a dialog with a text area and a Send button that is greyed until a destination is decided.

- [ ] **Step 1: Implement** each screen against the spec.
- [ ] **Step 2: Verify in Chrome**: each tab loads with its skeleton, filters change results and counts, Edit Stages changes persist and show on the board, tooltips match the rest of the CRM.
- [ ] **Step 3: Run** `npx tsc --noEmit`, `npm run lint`, `npx vitest run`.
- [ ] **Step 4: Commit** `feat: pipeline tasks, outcomes and stage editor`.

### Task 11: Docs and final verification

**Files:**
- Modify: `CRM/docs/decisions.md` (D-061: Sales pipeline board, with the spec's calls), `CRM/docs/phases.md` (tick 3.1's board), `CRM/docs/architecture.md` (new files)

- [ ] **Step 1: Update** the three docs.
- [ ] **Step 2: Verify**: `npx tsc --noEmit` in `CRM/` and `forms/`, `npx tsc --noEmit -p convex`, `npm run lint`, `npx vitest run`, `npm run build` in `CRM/`. Expected: all clean and passing.
- [ ] **Step 3: Report** to the user: what changed in the shared backend (new tables and `convex/crm/pipeline.ts`, `opportunityTasks.ts`, additive schema), that production needs `npx convex deploy`, and that nothing was run against production.
