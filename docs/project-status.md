# Project status (post-handoff)

Last updated: 2026-10-28. The project is handed off to Quality First Turf and live. Keep this file current.

## After every change

1. `npx convex deploy` (production backend).
2. Delete test data in Convex.
3. Delete test data in Jobber.
4. Confirm Jobber is connected to the client's **official** account, not the personal testing one.

Past incident: at handoff Jobber was still on the personal testing account and Convex was still on the dev deployment. It cost reputation. Do not repeat it.

## Waiting on the client

1. Custom domain.
2. More information on the CP (contractor pricing) and the remaining RP (retail pricing) services.
3. Login credentials for every salesperson. Until then there is one shared login (`SALES_EMAIL` / `SALES_PASSWORD`), so there is effectively one salesperson.

## Upsells to pitch

1. Automation on the Jobber CRM to upload pictures and services.
2. An admin panel on the forms for easy management, potentially replacing Jobber.

## Features added since handoff

- **Assigned leads**: a salesperson can assign a lead to themselves and unassign it from the visit page (`projects.mutations.assign` / `unassign`, field `projects.assignedTo` holds the session email). The sidebar filter has an "Assigned" option. Per-salesperson logins are still needed for this to separate people; with the shared login, every salesperson counts as one.
