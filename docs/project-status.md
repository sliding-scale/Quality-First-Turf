# Project status (post-handoff)

Last updated: 2026-10-29. The project is handed off to Quality First Turf and live. Keep this file current.

## After every change

1. `npx convex deploy` (production backend).
2. Delete test data in Convex.
3. Delete test data in Jobber.
4. Confirm Jobber is connected to the client's **official** account, not the personal testing one.

Past incident: at handoff Jobber was still on the personal testing account and Convex was still on the dev deployment. It cost reputation. Do not repeat it.

## Waiting on the client

1. Custom domain.
2. More information on the CP (contractor pricing) and the remaining RP (retail pricing) services.
3. Login details for every salesperson (name, email, password). Add them to `SALES_ACCOUNTS` (see "Salesperson accounts" below). Use the same email as their Jobber login so their consultations land on their own Jobber calendar.

## Upsells to pitch

1. Automation on the Jobber CRM to upload pictures and services.
2. An admin panel on the forms for easy management, potentially replacing Jobber.

## Features added since handoff

- **Assigned leads**: a salesperson can assign a lead to themselves and unassign it from the visit page (`projects.mutations.assign` / `unassign`, field `projects.assignedTo` holds the session email). The sidebar filter has an "Assigned" option. Per-salesperson logins are still needed for this to separate people; with the shared login, every salesperson counts as one.

## Salesperson accounts (2026-10-29)

- Accounts live in the Convex env var `SALES_ACCOUNTS`, a JSON list: `[{"email":"jane@x.com","password":"...","name":"Jane Doe"}]`. The old shared login (`SALES_EMAIL` / `SALES_PASSWORD`, optional `SALES_NAME`) still works and is listed first. Set it on the **production** deployment too; it is separate from dev.
- The signed-in name shows under the logo in the sidebar.
- Only the salesperson a lead is assigned to can book, reschedule, cancel, edit or save it, and a lead can only be edited once a consultation is booked. Enforced on the server (`projects.consultation.*`, `projects.mutations.update`, `projects.actions.draftVisit`).
- Booking puts `Salesperson: <name>` at the top of the Jobber appointment's instructions and assigns the Jobber team member whose email matches the salesperson's email. No matching Jobber user means the name is still on the appointment but nobody is assigned to it.
- Availability: a booking is refused if it overlaps another consultation the salesperson holds in the app or on their Jobber calendar (when matched to a Jobber user). The booking form lists their commitments for the chosen day.
- Jobber to app sync: when a project is opened, and every 10 minutes (`syncAll` cron), the stored consultation is compared with Jobber. A time changed in Jobber is copied across; an appointment deleted or unscheduled in Jobber clears the consultation here (which locks the visit form again).
- Breaks: calendar events in Jobber whose title contains break, lunch, time off or day off are read with their exact times, shown as "On a break" in the booking form, and block booking (error says the salesperson is on a break). Jobber's API cannot create or delete events, so this was not tested against a live break event.
- The project list shows an "Assigned · <name>" badge on every lead held by another salesperson, and "Assigned to you" on your own.
- Services page (customer form step 2): hovering or keyboard-focusing a service card previews what is inside it (its install types). Services with no sub-options (SOD, Patio Covers, etc.) show nothing. Touch screens do not get the preview, since a tap selects the card.
- Not done: Jobber's API does not expose each person's working hours, so only existing appointments block a time, not days off or hours outside a shift.

## Jobber item matching (2026-10-28)

The client's Jobber items are numbered and worded differently from the app ("9.02 RP - AG Budget Friendly Install - Players Choice [300 - 699 SF]"). The app now matches by a normalized name (`lib/jobber-names.ts`, `jobberKey`), ignoring the sort number, band spelling and known wording differences. Prices always come from Jobber. Checked against the export `Products and Services Export (10_23_2026).csv`: 581 of 591 priced items match, and every price equals the app's price list.

**Do not run `jobber/sync:apply` on the client's account.** It compares exact names, so it would create about 590 duplicates next to the client's items, and it would also overwrite their prices.

Still failing until fixed:
- Jobber items **88.03, 88.04, 88.05** are named "AG Turf Replacement" but are the Repair prices. The client must rename them to "AG Turf Repair". Until then, Replacement and Repair for 700 to 1999 SF show "matches more than one Jobber item" or "no Jobber item".
- No Jobber item for the add-on **Additional 2" of Base**.
- **Demolition extras** (Concrete / Rock, Additional 2" of Demolition, and Additional 2" of Demolition & Regrade) are separate banded items in Jobber (items 2, 4, 5 to 8), but the app quotes them as flat add-ons. A concrete or extra-depth demolition quote cannot be drafted until the app maps them to those items.
