# Sales pipeline board: design (Milestone 3, step 3.1)

Status: **awaiting the user's approval.** Nothing is built. Written 2026-11-10 after reading Jobber's Pipeline page in the browser and the PRD (section 3.3).

## Intent and why
Staff need one screen that shows every open sales project by stage, lets them move a project forward with the rules enforced, and keeps a history of every move. It replaces Jobber's Pipeline page. The user wants it to look and behave like Jobber's, with the PRD's stages and business rules underneath.

## Goals
- A board and a list-free layout like Jobber's: two stage groups, cards, counts and dollar totals per column, sideways scroll.
- Move a project between stages by dragging a card or from the card's menu. Every move is validated and recorded (who, when, from, to).
- Everything on Jobber's page that is not in the PRD stays, except Automations and the AI summary (user's call, 2026-11-10).
- Tasks and Sales Outcomes tabs, as in Jobber.

## Non-goals
- No Automations (lightning icons, the More Actions item) and no AI "Opportunity summary".
- No quote builder, calendar or full project page here (later steps). The card panel is a light version.
- Preplanning, Construction and Finance boards are Milestones 4 and 5.

## Anti-goals
- A second project record or a copy of client data (rule 1 and 2 of `CRM/CLAUDE.md`).
- Anything that lets the UI move a project without the server checking the rules (rule 4 and 5).

## Approach chosen: A (hand-moved with rules, automatic moves added later)
Considered: **A** hand-moved plus rules, with automatic moves when quote events exist (chosen by the user); **B** fully automatic like Jobber (fails the PRD's "move opportunities between stages", history and the Closed Won rules); **C** fully manual (staff move every card after each quote change).

## Findings from Jobber (what is copied)
- Tabs: Pipeline, Tasks (count badge), Sales Outcomes.
- Board: groups **Requests** and **Quotes**; each group has a vertical label with a count badge at the top, a "+" (new request or new quote), and an arrow at the bottom that folds the group away. Each column header shows its name, card count, dollar total, and (Jobber only) a lightning icon. Board scrolls sideways; columns scroll vertically.
- Card: "Title · CODE", client name, request title, time-in-stage chip (such as 18h), value. Hover: dark border and a "..." button. Menu: View Request, Salesperson, Mark as won, Mark as lost. Click: right-hand panel with title, value, stage and time chips, client card (name, address, phone, email, menu), Email and View Request, Tasks with Add task, Notes.
- Above the board: Sort by (Time in stage, Created date, Value) with a direction arrow; Salesperson (All, Unassigned, people); Lead source (searchable, Clear; Existing Client, Facebook, Flyer, Google, Instagram, Other, Referral, Vehicle Wrap, No source); Date range; result count; search; Add New (Request, Quote); More Actions (Edit Stages, Automations, Give Feedback).
- Edit Stages: built-in stages locked, can add a stage, hide a stage (a "Show N hidden stage" button appears), reorder and delete custom stages. Autosaves.
- Tasks tab: All, Overdue, Today, Upcoming chips with counts, Assignee filter.
- Sales Outcomes tab: Outcome (Won, Lost) and Date range filters, sortable table (Title, Name, Created On, Won On, Total), 10/25/50/100 per page.
- Not verified: how Jobber's drag behaves (a scripted drag did not move the card). Date range option list, tooltip text on the lightning icon, and the Automations screen were not captured.

## Stages (my mapping, correctable)
Stage names are the PRD's, in `convex/crm/lib/stages.ts` (existing, unchanged).

| Group | Column (PRD stage) | Jobber's name |
|---|---|---|
| Requests | New Request | New requests |
| Requests | Schedule Onsite Consultation | Assessment unscheduled |
| Requests | Onsite Consultation | Assessment scheduled |
| Quotes | Quote Draft & Site Plan / Design | Draft |
| Quotes | Proposal Delivered, Awaiting Response | Awaiting response |
| Quotes | Changes Requested | Changes requested |
| Quotes | Quotes Approved, Contract Out for Signature | Approved |
| Closed | Closed Won, Closed Lost (shown as Won and Lost) | Added 2026-11-10 at the user's request: a third group of two columns. Also on the Sales Outcomes tab and the card menu. |

Jobber's "Assessment completed" is dropped (user's call).

## Behaviour
- **Moving.** Drag a card to a column, or use the menu. Closed Won and Closed Lost are reached by "Mark as won / lost" or by dropping on a Won/Lost target that appears while dragging. One server function, `moveStage`, does every move: checks the caller's role and business, validates the transition, writes `stageHistory` (who, when, from, to), and updates the project. The UI never patches `stage`.
- **Rules (PRD).** Closed Won needs a signed contract and a received deposit, if applicable. Closed Lost is for a decline, a cancellation, or no reply after the three-month follow-up. Until signed contracts and deposits exist (later steps), Closed Won is allowed only with an Admin override that is recorded in the history. Which other moves are blocked (for example skipping straight to Quotes Approved) is a builder call: allow forward and backward moves inside the Requests and Quotes stages, require a reason for Closed Lost.
- **Automatic moves (later).** The same function is called when a quote is sent, approved or sent back for changes. Not built in this step because the quote builder does not exist.
- **Handoff.** Closed Won sets a handoff trigger for Preplanning (Milestone 4). Preplanning itself is not built here.
- **Time in stage** is computed from the stage history (the time of the last move).
- **Value** on a card is the project's latest quote total (existing `quotes.totalCents`), $0 when none.
- **Custom stages.** Added stages sit inside the Requests or Quotes group, can be hidden, reordered and deleted when empty, and cannot take part in the Closed Won and Closed Lost rules. The nine PRD stages are locked.
- **Permissions.** Admin, Sales and Office Team can move and edit. Project Managers can look only (same as the rest of the CRM, D-046).

## Data (additive only; existing forms tables untouched)
- `opportunities` (existing): add optional `stageEnteredAt`, `leadSource`, `salespersonId` (replaces the free-text `owner` for filtering; `owner` stays), `outcome` (`won` or `lost`), `closedAt`, `lostReason`.
- New `stageHistory`: opportunityId, from, to, by, at, note.
- New `pipelineStages`: businessId, name, group, order, hidden, custom (only for customised stages; the PRD stages come from code).
- New `leadSources` (or a constant list, Jobber's nine): see "left to the builder".
- New `tasks` (needed for the card panel and the Tasks tab; the full Tasks feature is step 3.3): opportunityId, title, assignee, dueAt, done.
- Notes on a project reuse the note pattern of `clientNotes` (new `opportunityNotes`).
- Indexes: by business and stage, by opportunity for history and tasks.

## Screens and UI rules
- Route `/pipeline` (the sidebar item is greyed today and becomes live). Tabs Pipeline, Tasks, Sales Outcomes.
- Built to the CRM rules: skeleton loader shaped like the board (D-034), hover and press feedback on everything clickable (D-035), fixed table columns on Sales Outcomes (D-035), smooth motion on opening, closing and moving (D-037), tooltips in the CRM's Jobber-style format, red-on-submit validation in dialogs.
- Right-hand panel slides in from the right with the Jobber contents above, without the AI summary.
- Narrow screens: the board keeps scrolling sideways, panels become full width.

## Not in the PRD but kept (user's call)
Sort by, Salesperson, Lead source and Date filters, search, per-column dollar totals, time-in-stage chip, collapsible groups, "+" per group, Add New menu, Edit Stages, card panel with tasks and notes, Tasks tab, Sales Outcomes tab, Give Feedback (opens a simple form; where feedback goes is a builder call, default: an email to the Admin, not built yet).

## In the PRD but not in Jobber (added by us)
Stage history with who and when; notifications and handoffs; the Closed Won guard; the three-month Closed Lost rule; the Preplanning handoff; the Site Plan / Design and contract-signature parts of the stage names (stages only, the features come later).

## Left to the builder
Exact transition matrix beyond the rules above; whether lead sources are a table or a list in code (default: a list in code, Jobber's nine, with "No source" as empty); sample data for the board; copy for dialogs; the empty state of a column.

## Open items that need the user later
Contract template and signing method (Q-005) before Closed Won can be fully enforced. Whether the "three-month follow-up" is a reminder, an automatic Closed Lost, or only a rule (default: a rule and a reminder task, no automatic close).
