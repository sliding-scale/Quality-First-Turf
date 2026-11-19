# Jobs, plan 3: the rest of Jobber's job page (Job type, recurring, Create Similar, Delete, emails, texts, signature, costs CSV, checklists)

> **For agentic workers:** executed in the session (the user chose to build here). Steps are tasks with a failing test first for backend rules.

**Goal:** Every item on Jobber's job page More menu, and the Checklists and recurring jobs it shows, work in Launchpad.

**Spec:** `CRM/docs/superpowers/specs/2026-11-19-jobs-design.md` (step 7). The user's rule (2026-11-19): anything on Jobber or in the PRD is built; a missing provider gets a workaround (D-091).

## Global Constraints
- Dev only; no deploy without the user's go-ahead; no commits unless asked. Additive schema. Every function starts with `requireModule` / `requireProject` on `jobs`. Skeletons, hover feedback, red-on-submit, motion, 400 px (D-034/035/037).

## Decisions (my calls, D-091)
- **Job type:** `opportunities.jobType` ("oneoff" or "recurring", absent = one-off). A recurring job's visits are one repeating visit series on the Schedule (the calendar already repeats daily, weekdays, weekly, monthly, until a date), booked by New Job.
- **Create Similar Job:** opens New Job with the client, title, details and lines copied; it makes a new project with its own number.
- **Delete (Admin only):** refused once the job has a quote, invoice or payment (archive or Close Job instead); otherwise removes the project with its visits, notes, time, expenses, payment schedule, history and signature.
- **Emails:** the existing Zoho sender (`SendEmailDialog`), prefilled: Follow-up (thanks and a request for a review) and Booking Confirmation (the next visit's date and time).
- **Text Booking Confirmation:** until texting is registered, opens the phone's messaging app (`sms:`) with the message filled in, and logs a note "Text confirmation opened (sent by hand)".
- **Collect Signature:** the signature pad; saved on the job with who signed and when (`jobSignatures`), shown on the job page.
- **Email Job Costs CSV:** the job's lines (with costs), Labor and Expenses as a CSV the person downloads (nothing is emailed by the CRM).
- **Checklists:** templates in Settings > Checklists (name and items); a job takes a copy of chosen templates (so later edits to a template do not change a job); items are ticked on the job page with who and when.

## Tasks
1. Job type and recurring: schema, `jobs.create` takes `jobType`, `jobs.list` filters by it, New Job form, Job Type filter, job page facts. Tests.
2. Create Similar Job (New Job opened from a job). 3. Delete job (`jobs.remove`) with tests for the refusals and the clean-up.
4. Signature (`jobSignatures`, `jobs.saveSignature`) and the dialog. 5. Emails, text, costs CSV on the More menu (`jobs.logText`).
6. Checklists (`checklistTemplates`, `jobChecklistItems`, `convex/crm/checklists.ts`), Settings > Checklists, the job page card.
7. Docs, whole check, deploy reminder.
