# Project page: Visit measurements and photos in the CRM: design

Status: built on the user's "go ahead with 1" (2026-11-23). The scope below is the builder's call under the golden rule (D-091); the user approved the direction ("copy the visit flow's logic into `convex/crm/`, one phone-first screen in the Visit tab") but not this narrower reading, so it is open to correction.

## Intent and why
PRD 3.4 says the project page holds "Measurements and photos", and the plan (D-021) is to bring the forms app's on-site visit into the CRM. Today the Visit tab is read-only and shows only what the customer form's visit captured, so a salesperson cannot record a site measurement or a photo in the CRM, and a project made in the CRM (for Construction or Patios) has nowhere to put them.

## What reading the code showed
The forms app's visit is the customer form's whole question flow (services, install types, soil, quantities) plus work areas with photos. The quote pre-fill reads those answers to pick catalogue lines. Porting that whole flow is thousands of lines and is a separate piece of work. The New Request screen already carries the question flow in the CRM, and the Request page edits the answers.

## Goals (this change)
- On the Visit tab, anyone who may edit the project can **add, change and remove work areas**: name, service, installation type, length and width (or a quantity), notes, and **photos** (camera or gallery). They can **Save**, or **Complete visit**, which stamps the visit date.
- The visit is **CRM-owned data**, one row per project, so it works for any project in any business. It starts from the customer form's work areas when there are any, so nothing already captured is lost.
- Everything that read the form's work areas now reads the CRM visit first: the quote's "Fill from the site visit" and the takeoff's measurement suggestion.
- Saving is recorded in the client's activity history (D-113).

## Non-goals
- The customer form's follow-up questions, the measured-pieces planner and the change log. The forms app keeps doing them until the CRM is complete (D-028); a full port is a later step.
- Editing services, products and add-ons from the Visit tab (the Request page owns the answers).
- The forms' own rows are never edited (CRM rule 3, and the schema note on `opportunities.requestForm`).

## Approaches
1. **CRM-owned `opportunityVisits` row, seeded from the form (chosen).** Additive, works without a forms row, leaves the forms untouched.
2. Write into the forms' `workAreas` rows. Breaks the additive-only rule and the forms' Jobber push assumptions.
3. Link the Visit tab out to the forms app's `/visit` screen. Cheapest, but only works for projects that have a forms row and keeps the CRM dependent on the forms app.

## Constraints
- Additive schema; backend in `convex/crm/`; `requireProject(..., "edit")` on every write; every read bounded.
- Photos are images up to 15 MB each, at most 20 per area; at most 30 areas.
- A photo taken out of a visit is deleted from storage only if the customer form's work areas do not also use it.
- Skeleton for the editor (D-034), hover and motion as elsewhere, filtered inputs (D-038), red-on-submit validation (D-035).
- Phone-first layout: one column, large tap targets.
