# Home and Tasks: what is left (PRD 3.1, 3.5): design

Status: built on the user's "do the Home dashboard and Tasks next" (2026-11-23). The scope is the builder's call under the golden rule (D-091).

## What reading the code showed
- **Home** already shows every PRD 3.1 figure from real records: requests (new, overdue, in consultation), quotes (pending, draft, approved), jobs (active, late, requires invoicing), invoices (pending payments, past due, awaiting invoicing), today's appointments, upcoming consultations and the signed-in person's tasks. D-076 said Jobs and Invoices did not exist; they do now and the cards read them. The phases line "Home dashboard figures still to do" was stale.
- **Tasks** (own page in the sidebar, D-061) has the Jobber chips, an Assignee filter, a Completed section, and tasks made on a project. What is missing against PRD 3.5 ("assign tasks to users", "each user has a task area"): only an **Admin** can make a task that belongs to no project, and **no task can be edited or deleted** once made (title, due date and assignee are fixed; the only action is ticking it).

## Goals
- Anyone with Edit on Tasks can make a standalone task, for themselves or any active person on the business. A person limited to their own records (`assignedOnly`) can only make and change tasks given to themselves.
- A task can be **edited** (title, due date, assignee) and **deleted** by someone with Edit on Tasks (same limit for `assignedOnly`). A scheduled task keeps its Schedule and calendar mirror in step; deleting it removes them.
- The Tasks page: New task for everyone who can edit; a click on a task's title opens it to edit or delete; the Assignee menu has "Me" at the top.
- Home's My tasks gets a **New task** button (assigned to the person by default) and shows an overdue count.

## Non-goals
- Notifying the assignee (the bell), task descriptions, repeating tasks, sub-tasks, a separate board of tasks. Any of these can follow on the client's word.
- New Home cards: the PRD's "approved leads" is read as the Quotes card's Approved count.

## Approaches
1. **Extend the existing task functions and dialog (chosen).** Small, no new tables.
2. A new Tasks module with its own table. The existing table already holds everything.

## Constraints
- `convex/crm/opportunityTasks.ts` only, plus UI. No schema change. Every write starts with `requireModule(..., "tasks", "edit")`.
- Skeleton, hover and motion rules as elsewhere. Red-on-submit validation in the dialog (already there).
