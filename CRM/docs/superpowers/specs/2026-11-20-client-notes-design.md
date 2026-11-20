# Client notes of 2026-11-20: request page, quote pre-fill, and the customer form's first steps

Approved by the user in the conversation of 2026-11-20 ("yes, pre-fill when the quote is created, go ahead"). Short design, written from what we settled.

## Intent
The client (two people with the same priority) reviewed the CRM and sent notes. They want the request page to show the client's details and to give staff clear places to edit the customer's answers and the consultation worksheet. They did not find where the worksheet turns into quote lines. They want the customer form to join the details and project steps and to offer a way to skip choosing services.

## Goals
1. **Client card.** One button, View client profile, replaces the three-dot menu on the request page's client card. Edit client details is reached from the profile.
2. **Two labelled staff-only sections** on the request page: **Services & Project Details** (today's Overview, renamed, same pencil) and **Consultation Worksheet** (a new card with an Edit worksheet button that opens the salesperson's on-site form). The customer's path is not changed by this.
3. **Quote pre-fill.** A new quote for a project that has a site visit starts with the lines the visit works out (same planner and prices as Fill from the site visit), with a note saying so. The button stays.
4. **Customer form (forms app, and the same flow inside the CRM's New Request).** Steps 01 Your details and 02 Your project become one step. After it, one choice: pick services, or have a professional reach out. Reaching out skips Services and Questions; the request arrives marked "wants a call". In the CRM's New Request the reach-out choice goes straight to Schedule consultation.

## Non-goals and anti-goals
- No change to the per-service Questions step for customers who pick services (the client confirmed it stays in the customer's path).
- Saving the worksheet does not silently create a quote. A quote is a document the client may send.
- The customer does not pick a consultation date (they cannot see the staff calendar). Staff schedule it.
- Nothing is removed from Jobber or the forms' Jobber code (D-028). The Jobber push must still work for a request that has no services.
- No deploy without the user's go-ahead.

## Constraints
- Parts 1 to 3 touch only `CRM/`. Part 4 touches the live forms app and `convex/shared/discovery.ts`, which both apps and the backend use, so it is additive and tested, and needs the typecheck and build of both apps before any deploy.
- CRM rules: Convex checks on every function, skeletons, hover feedback, red-on-submit, 400 px.

## Approaches considered
- Quote pre-fill: (a) when the quote is created (chosen), (b) when the worksheet is saved, (c) button only (today). (b) writes money documents without a person deciding; (c) is what the client could not find.
- Reach-out choice: (a) a flag on the project, `wantsCall`, with services allowed to be empty (chosen), (b) a fake service called "Consultation". (b) pollutes the catalogue, the quote planner and Jobber's text.
- Worksheet edit: (a) a card with a button into the existing Visit tab (chosen), (b) copy the worksheet into the request page. (b) duplicates a 2,500-line form.

## Left to the builder
Where exactly the Visit tab opens, the wording of the pre-fill note, and how "wants a call" shows on the request page and in Jobber's request text.
