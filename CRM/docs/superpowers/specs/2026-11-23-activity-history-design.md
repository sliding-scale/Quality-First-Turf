# Activity history (client page): design

Status: built on the user's instruction "then implement it" (2026-11-23), after the user asked whether it is in the PRD. Every call below is the builder's, made under the golden rule (D-091), and is open to correction.

## Intent and why
PRD 2.1 says a client profile contains "activity history", and PRD section 7 asks for activity history that is auditable. D-007 ("Significant record changes write to `activities`") settled the table. Today the client page has no activity history, and a client's own changes (created, edited, tags, archived) are recorded nowhere. The project page already has an Activity tab that merges existing logs; the client page gets the same idea, plus the new table.

## Goals
- Table `activities`, append-only: who, when, what, tied to a client (and optionally a project).
- Client changes write to it: created, details edited (which fields changed), tags changed, archived.
- Client page, new tab "Activity history", one timeline newest first, merging: those activities, client notes, each project's "request created" and stage moves, quote events, invoice events.
- Each source shows only to someone who may see it (quotes need Quotes view, invoices need Invoices view, requests and stage moves need Requests view).

## Non-goals
- Logging every mutation in the CRM. Quotes, invoices and stages already keep their own logs and are read from them, not copied.
- Editing or deleting activity rows from the screens. The one deletion is deleting the client, which removes its own rows.
- Before and after values of every field (the entry names the fields that changed, not their contents, so a phone number is not copied into a log).

## Approaches
1. **New `activities` table for client-level events, and read the existing logs for the rest (chosen).** No duplicated data, no edits to the many modules that already log.
2. Write every event into `activities` from every module. One source, but it touches dozens of mutations and duplicates what `stageHistory`, `quoteEvents` and `invoiceEvents` hold.
3. Only read existing logs, no new table. Cheapest, but client edits, tags and archiving stay unrecorded, against the PRD's "auditable".

## Constraints
- Additive schema. Backend in `convex/crm/`. Reads bounded with `take`. Every function starts with `requireStaff`/`requireModule`.
- Skeleton for the tab (D-034); motion, hover as elsewhere. Reuses the project timeline's `op-tl` styles.
