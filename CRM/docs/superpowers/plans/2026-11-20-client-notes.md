# Client notes of 2026-11-20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (built in this session, the user chose to build here). Steps use checkbox syntax.

**Goal:** The request page shows one View client profile button and two labelled staff sections, a new quote starts pre-filled from the site visit, and the customer form joins its first two steps and offers "have a professional reach out".

**Architecture:** Tasks 1 to 3 change only CRM screens and one existing query. Tasks 4 to 6 add a `wantsCall` flag that lets a project have no services, carried from the shared discovery builder through `projects.create` to the CRM handoff, then change the two forms.

**Tech Stack:** Next.js 16, Convex, vitest (`../node_modules/.bin/vitest run`).

**Spec:** `docs/superpowers/specs/2026-11-20-client-notes-design.md`

## Global Constraints
- Dev deployment only; no deploy, commit or push unless asked. Parts 4 to 6 edit live-app code: additive, tested, typecheck and build both apps.
- Convex functions start with `requireModule` or `requireProject`. Skeletons for new screens, hover feedback, red-on-submit, 400 px.
- Nothing in Jobber or the forms' Jobber code is removed (D-028).

## Review Focus
- A project from the customer form with no visit yet: the pre-fill is silent and the quote opens with its one blank line.
- A quote opened for a project with lines already typed (the page is reloaded): pre-fill must not run twice or add duplicates.
- A project not made from the customer form (no `sourceProjectId`): no pre-fill, no error toast.
- Someone without Edit access: Edit worksheet is disabled, not hidden, and the client card button still works.
- A "wants a call" request (no services): every list, the Jobber text and the quote planner handle an empty services list.

---

### Task 1: One View client profile button
**Files:** Modify `components/request-page.tsx` (client card, `clientItems`), `app/globals.css` (`.rq-clienthead`).
- [ ] Replace the `clientItems` menu and its icon button with `<Link className="btn" href={`/clients/${r.clientId}`}>View client profile</Link>` in `.rq-clienthead`; delete `clientItems`.
- [ ] Verify: `../node_modules/.bin/tsc --noEmit` clean; in a browser the card shows the name, address, phone, email and the one button.

### Task 2: Pre-fill a new quote from the visit
**Files:** Modify `components/quote-builder.tsx` (`Builder`); test `tests/quotePrefill.test.ts` for the pure rule.
**Interfaces:** Produces `shouldPrefill(lines: DraftLine[], hasProject: boolean, isNew: boolean): boolean` in `lib/quote-prefill.ts`: true only for a new quote with a project whose lines are all blank (no name, kind item).
- [ ] Test `shouldPrefill`: true for new, project, one blank line; false for an existing quote, no project, a typed line, a text line.
- [ ] In `Builder`, an effect that runs once per mount (ref guard) when `shouldPrefill`, calls `api.crm.quotePrices.fromVisit`, and if it returns lines replaces the blank line with them (same mapping as `fillFromVisit`) and toasts "Started this quote from the site visit. Check the lines and prices."; no toast when it returns none.
- [ ] Verify: the new test passes; with a project from the customer form, Convert to Quote opens with lines.

### Task 3: Two labelled sections on the request page
**Files:** Modify `components/request-page.tsx`; `convex/crm/requests.ts` only if the worksheet's state needs a field.
- [ ] Rename the Overview card's heading to "Services & Project Details" (keep the aria-label in step).
- [ ] Add a "Consultation Worksheet" card after On-site assessment: one line saying whether a worksheet exists (from the project's visit) and an **Edit worksheet** button linking to `/opportunities/<id>?tab=visit`, disabled without Edit access.
- [ ] Verify: both cards show, the button opens the Visit tab.

### Task 4: `wantsCall` through the backend
**Files:** Modify `convex/shared/discovery.ts` (`buildDiscovery(form, { requireProject, allowNoServices })`, `DiscoveryState.wantsCall`), `convex/projects/mutations.ts` (`create` arg `wantsCall`), `convex/schema.ts` (`projects.wantsCall` optional), the CRM handoff in `convex/crm/`; tests in `tests/intake.test.ts`.
- [ ] Tests first: a form with `wantsCall` and no services builds a payload, answers include "Contact preference: A professional will reach out", and one without it still refuses no services.
- [ ] Implement; check `publishVisit`, the Jobber request text and `planQuoteLines` with an empty services list (they must not throw).

### Task 5: Customer form (forms app)
**Files:** Modify `forms/components/discovery-form.tsx`, `forms/components/intake-property.tsx` (steps), `forms/lib/discovery-draft.ts`.
- [ ] Merge the property and project steps into one "Your details and project" page; add the choice page ("Pick your services" or "Have a professional reach out"); reach-out submits with `wantsCall` and goes to Confirmation.
- [ ] Verify: typecheck, lint and build of `forms/`; drafts saved before the change still load (`?step=project` maps to the merged step).

### Task 6: CRM New Request flow
**Files:** Modify `components/intake/new-request-flow.tsx` and the copied pieces.
- [ ] Same merge and choice; the reach-out choice goes straight to Schedule consultation, then saves.
- [ ] Verify: `tests/requestForm.test.ts` passes; typecheck, lint and a CRM build.
