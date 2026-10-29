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
- The project list shows an "Assigned Â· <name>" badge on every lead held by another salesperson, and "Assigned to you" on your own.
- Services page (customer form step 2): hovering or keyboard-focusing a service card previews what is inside it (its install types). Services with no sub-options (SOD, Patio Covers, etc.) show nothing. Touch screens do not get the preview, since a tap selects the card.
- Customer form questions page: turf and putting product pictures are three per row (two on phones). Once a single choice is made (work type, replacement package, putting green type, product, soil), the other options are hidden and a "Choose a different ..." link (or clicking the selected one again) brings them back. Multi-select lists (installation types, add-ons) are unchanged.
- On-site visit: each selected service has a required "Photos & notes" block. The salesperson cannot save (or draft the quote) until every service has at least one photo; the note ("What needs to be done") is optional. Stored as a work area labelled `Service photos: <service>` with `service: "Service photos"` (ignored by quoting), checked again on the server in `projects.mutations.update`. The photos are not pushed to Jobber yet (that is the Jobber automation upsell).
- The end-of-form photos section on the visit page is gone (photos live on each service now); only the Notes box remains there, plus any site photos saved before the change, shown read-only. Uploads show a tile with a progress bar and a green "Uploaded" tick, and Save is disabled while a photo is uploading.
- On-site measuring in sections: every measured area on the visit page (turf, putting green, demolition, and Underground/drains in linear feet) can be measured in several pieces ("Add another section"), each a length x width (or just a length for linear work). The total is added up live and saved as the area's quantity, which is all quoting reads; the pieces are stored in `workAreas.sections` so they come back on reload. Add-on quantities (e.g. border, bender board) are still a single entry.
- Visits and follow-ups (2026-10-29): every project has numbered visits: "Consultation", then "Follow-up 1", "Follow-up 2" and so on (`projects.visitNumber`, 0 is the consultation; label helper in `lib/visits.ts`). Saving a complete visit writes a read-only card for it (`visitSnapshots`, written by `saveVisitSnapshot` in `convex/projects/visits.ts`). The "Visit history" section on the visit page shows the cards newest first; each one is compared with the customer's original form, and (from Follow-up 1) can be switched to compare with the visit before it. While a follow-up is open, the review section also lists "Changes since <previous visit>". Cards are never editable, and photos an earlier card shows are never deleted from storage when a later visit drops them.
- Scheduling a follow-up: once a visit is saved complete, the top-right button is cleared and reads "Follow-up N". Booking it (`projects.consultation.book`) starts that follow-up: the finished visit stays as its card, `visitNumber` goes up by one and the form unlocks, starting from the previous visit's data. Saving then replaces the lines on the existing draft quote (no second quote); if the office already sent or approved it, the quote is not changed and the screen says so. A finished visit can still be corrected with "Edit this visit" until the next follow-up is scheduled; after that its card is frozen. Projects finished before this feature get their consultation card the first time a follow-up is scheduled.
- Another salesperson can take over a follow-up: unassign the lead, then the other salesperson assigns it to themselves and schedules the follow-up.
- Jobber appointment text: the request title is set to "<Consultation | Follow-up N> Â· <salesperson> Â· <homeowner> Â· <project code>" and the appointment notes start with the visit and salesperson, then homeowner, project ID, address, phone, email and services, then the salesperson's own notes. A Jobber request holds one appointment, so the consultation stays on the project's own request and every follow-up gets a new Jobber request of its own (same client and property, titled the same way, with the project details in its form), created when the follow-up is booked and remembered in `projects.followUpRequestId` so rescheduling moves that appointment instead of making another. Cancelling a follow-up deletes its appointment but leaves its request for the office to close. The quote stays on the original request. The title edit on a re-booked request (`requestEdit`) is best effort and was not tested against a live Jobber account; if Jobber refuses it the booking still succeeds and the notes carry the same information (the error is logged).
- Turf product home samples (2026-10-29): picking a turf product (Artificial Grass packages and Putting Green) shows its product photo and a picture of a home with it installed side by side, each with a button in its top-right corner that opens the picture in a new tab to zoom in (stacked on phones). The pictures are in `public/images/samples` (compressed to about 280 KB each, same 1697x927 size) and wired up by `productSamples` in `components/discovery-form.tsx`. Only nine products have their own picture; every other product reuses those nine in turn, in the order of the product photo list, so those samples do not show the product itself. Drop a file in the folder and add it to `ownSamples` to give a product its own.
- Customer form on phones: turf product pictures are one per row with the name underneath.
- Not done: Jobber's API does not expose each person's working hours, so only existing appointments block a time, not days off or hours outside a shift.

## Jobber item matching (2026-10-28)

The client's Jobber items are numbered and worded differently from the app ("9.02 RP - AG Budget Friendly Install - Players Choice [300 - 699 SF]"). The app now matches by a normalized name (`lib/jobber-names.ts`, `jobberKey`), ignoring the sort number, band spelling and known wording differences. Prices always come from Jobber. Checked against the export `Products and Services Export (10_23_2026).csv`: 581 of 591 priced items match, and every price equals the app's price list.

**Do not run `jobber/sync:apply` on the client's account.** It compares exact names, so it would create about 590 duplicates next to the client's items, and it would also overwrite their prices.

Still failing until fixed:
- Jobber items **88.03, 88.04, 88.05** are named "AG Turf Replacement" but are the Repair prices. The client must rename them to "AG Turf Repair". Until then, Replacement and Repair for 700 to 1999 SF show "matches more than one Jobber item" or "no Jobber item".
- No Jobber item for the add-on **Additional 2" of Base**.
- **Demolition extras** (Concrete / Rock, Additional 2" of Demolition, and Additional 2" of Demolition & Regrade) are separate banded items in Jobber (items 2, 4, 5 to 8), but the app quotes them as flat add-ons. A concrete or extra-depth demolition quote cannot be drafted until the app maps them to those items.
