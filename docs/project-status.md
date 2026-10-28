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

## Jobber item matching (2026-10-28)

The client's Jobber items are numbered and worded differently from the app ("9.02 RP - AG Budget Friendly Install - Players Choice [300 - 699 SF]"). The app now matches by a normalized name (`lib/jobber-names.ts`, `jobberKey`), ignoring the sort number, band spelling and known wording differences. Prices always come from Jobber. Checked against the export `Products and Services Export (10_23_2026).csv`: 581 of 591 priced items match, and every price equals the app's price list.

**Do not run `jobber/sync:apply` on the client's account.** It compares exact names, so it would create about 590 duplicates next to the client's items, and it would also overwrite their prices.

Still failing until fixed:
- Jobber items **88.03, 88.04, 88.05** are named "AG Turf Replacement" but are the Repair prices. The client must rename them to "AG Turf Repair". Until then, Replacement and Repair for 700 to 1999 SF show "matches more than one Jobber item" or "no Jobber item".
- No Jobber item for the add-on **Additional 2" of Base**.
- **Demolition extras** (Concrete / Rock, Additional 2" of Demolition, and Additional 2" of Demolition & Regrade) are separate banded items in Jobber (items 2, 4, 5 to 8), but the app quotes them as flat add-ons. A concrete or extra-depth demolition quote cannot be drafted until the app maps them to those items.
