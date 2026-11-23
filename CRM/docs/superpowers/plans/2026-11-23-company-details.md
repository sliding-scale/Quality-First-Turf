# Company details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Admin-only Settings > Businesses screen for each business's phone, email and website, plus the right logo per business in the sidebar.

**Architecture:** Three additive optional fields on `businesses`, one pure validation module, one Admin-only mutation. A small client page in the style of Settings > Disclaimers. A `brandLogo(slug)` helper picks the sidebar logo.

**Tech Stack:** Convex (`convex/crm/`), Next.js App Router in `CRM/`, vitest with `convex-test`.

**Spec:** `CRM/docs/superpowers/specs/2026-11-23-company-details-design.md`

## Global Constraints

- Additive schema only; forms tables untouched. Backend files go in `convex/crm/`; file names contain only letters, digits, underscores, periods (no hyphens).
- Every function validates args; the mutation starts with `requireAdmin` (`convex/crm/lib/access.ts`). The read query uses `requireStaff` plus `canSee`.
- Skeleton and `loading.tsx` ship with the screen (D-034). Hover/press feedback (D-035), motion (D-037). Red-on-submit validation using `jwrap`/`bad`/`err` as in `components/client-form.tsx`, first invalid field focused, errors clear when fixed. Phone digits only via `formatPhone`, email without spaces via `cleanEmail` (`lib/fields.ts`, D-038).
- Plain CSS in `app/globals.css`; no Tailwind. No `any`.
- Do not commit unless the user asks. Work against the dev deployment only; never deploy.

## Review Focus

- Phone typed with 9 digits, or email with a space or no domain: rejected by the backend even if the UI is bypassed.
- Website typed without `https://` (`example.com`): stored with `https://` added, not rejected. `javascript:alert(1)` and `ftp://x` are rejected.
- Clearing a field saves it as empty (the field is removed), not as the string "undefined".
- A Sales user calling `saveDetails` is refused; an Admin saving another business works even if it is not the one selected.
- A business that has never had details (all three today) shows blank fields, not an error or a skeleton that never ends.

---

### Task 1: Validation and the backend

**Files:**
- Modify: `convex/schema.ts:212-215` (the `businesses` table)
- Create: `convex/crm/lib/companyDetails.ts`
- Modify: `convex/crm/businesses.ts`
- Test: `CRM/tests/companyDetails.test.ts`

**Interfaces:**
- Produces: `type CompanyDetailsInput = { phone: string; email: string; website: string }`; `checkCompanyDetails(i: CompanyDetailsInput): { ok: true; value: CompanyDetailsInput } | { ok: false; problems: Partial<Record<keyof CompanyDetailsInput, string>> }` (value is trimmed; phone formatted `(555) 123-4567`; website gets `https://` if it has no scheme); `api.crm.businesses.saveDetails({ businessId, phone, email, website })`. `api.crm.businesses.list` rows now carry optional `phone`, `email`, `website`.

- [ ] **Step 1: Write the failing tests** in `CRM/tests/companyDetails.test.ts`. Pure rules: `checkCompanyDetails({phone:"",email:"",website:""})` is ok with empty values; `phone:"555123"` gives `problems.phone`; `phone:"5551234567"` gives value `"(555) 123-4567"`; `email:"a b@c.com"` and `"a@b"` give `problems.email`; `website:"example.com"` gives `"https://example.com"`; `"javascript:alert(1)"` and `"ftp://x.com"` give `problems.website`; website over 200 chars gives `problems.website`. Convex (use `seeded()` from `./pipelineSeed`): `w.admin` saves for `w.qft` and `w.other`, then `api.crm.businesses.list` shows the values and the name unchanged; saving empty strings clears them (`phone` is `undefined` on the row); `w.sales` and `w.outsider` calling `saveDetails` reject with `/Only an Admin/`; invalid input rejects with a `ConvexError` message.
- [ ] **Step 2: Run** `npx vitest run CRM/tests/companyDetails.test.ts` from the repo root. Expected: FAIL (module and mutation missing).
- [ ] **Step 3: Implement** the three optional string fields on `businesses` in `schema.ts`, `checkCompanyDetails` in `lib/companyDetails.ts` (reuse `formatPhone`, `phoneDigits`, `isValidEmail` from `./fields`; website accepts only `http`/`https`, max 200, email max 120), and `saveDetails` in `businesses.ts`: `requireAdmin`, check the business exists, run `checkCompanyDetails`, `ctx.db.patch` setting each field to its value or `undefined` when empty (patch with `undefined` removes the field). Throw `ConvexError` with the first problem's message.
- [ ] **Step 4: Run** the same command. Expected: PASS. Also run `npx tsc --noEmit -p convex` (or the repo's existing typecheck for `convex/`) and expect no errors.
- [ ] **Step 5: Commit** (only if the user has asked): `feat: company details fields and Admin-only save`.

### Task 2: Logo per business

**Files:**
- Create: `CRM/lib/brand.ts`, `CRM/public/brand/QFP-logo.png` (copy of `public/brand/QFP-logo.png`)
- Modify: `CRM/components/shell.tsx:102-106` (`BrandMark`) and its call site(s)
- Test: `CRM/tests/brand.test.ts`

**Interfaces:**
- Produces: `brandLogo(slug: string): { src: string; width: number; height: number }`. Slugs `quality-first-turf` and `quality-first-turf-construction` return `/brand/logo-full.png` at 39x30; `quality-first-patios` returns `/brand/QFP-logo.png` at the width that keeps its 800x~360 ratio at 30px high; any other slug returns the QFT logo.

- [ ] **Step 1: Write the failing test** in `CRM/tests/brand.test.ts` for the three slugs and an unknown one, asserting `src` and that `width / height` of the Patios entry is within 0.05 of the PNG's real ratio (read the dimensions in the test from the file header bytes 16-24).
- [ ] **Step 2: Run** `npx vitest run CRM/tests/brand.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `brandLogo`, copy the Patios logo, and change `BrandMark` to take the business `slug` and render `brandLogo(slug)` for every business (the plain "Q" tile goes). Update the stale comment above it. Check `.brand-logo` in `app/globals.css` so a wider logo is not squashed, and that the collapsed icon rail still looks right.
- [ ] **Step 4: Run** the test again. Expected: PASS. Then run the app (`npm run dev` in `CRM/`) and look at all three businesses in the switcher, expanded and collapsed sidebar.
- [ ] **Step 5: Commit** (only if asked): `feat: sidebar logo for each business`.

### Task 3: The Businesses settings screen

**Files:**
- Create: `CRM/app/(app)/settings/businesses/page.tsx`, `CRM/app/(app)/settings/businesses/loading.tsx`, `CRM/components/businesses-settings.tsx`
- Modify: `CRM/components/skeletons.tsx` (add `BusinessesSkeleton`), `CRM/components/settings-nav.tsx` (replace the disabled `Businesses` button with a `Link` to `/settings/businesses`, same active-state pattern as its neighbours), `CRM/app/globals.css`, `CRM/lib/clients.ts` (only if `BusinessDoc` needs the new fields)

**Interfaces:**
- Consumes: `api.crm.businesses.saveDetails`, `checkCompanyDetails`, `useWorkspace`, `useStaff`, `brandLogo`.
- Produces: `export function BusinessesSettings()`; `export function BusinessesSkeleton()`.

- [ ] **Step 1: Build the skeleton and the loading file** first. `BusinessesSkeleton` mirrors the real layout (page head, a card with the logo block and three field rows) using the same class names so nothing jumps; `loading.tsx` renders it.
- [ ] **Step 2: Build `BusinessesSettings`.** Shows the selected business's logo, its name (read-only text), and Phone, Email, Website inputs (`jwrap`/`bad`/`err` pattern; phone through `formatPhone`, email through `cleanEmail`; website free text, `maxLength` 200). A non-Admin sees the same values as plain text and no Save button, plus a line saying only an Admin can change them. Save is disabled until something changed; submit marks all invalid fields red, focuses the first, and sends the trimmed values; a `ConvexError` string from the server shows under the form; success shows a toast. Switching business in the top bar swaps the fields. The page sets `document.title`.
- [ ] **Step 3: Wire the nav link and the route** (`page.tsx` with `metadata.title = "Businesses"`).
- [ ] **Step 4: Verify in a browser** as an Admin on dev: all three businesses, save, reload, clear a field, type a bad phone and email and a website without `https://`, check red states, hover states, the skeleton on a slow load, and a 700px-wide window. Then check as a non-Admin that the link is absent and `/settings/businesses` shows the read-only view. Expected: everything behaves as the Review Focus lists. Say plainly if any of it could not be checked.
- [ ] **Step 5: Commit** (only if asked): `feat: Settings > Businesses screen`.

### Task 4: Records and checks

**Files:**
- Modify: `CRM/docs/decisions.md` (new `### D-112` entry above D-111, same style), `CRM/docs/phases.md` (Setup: tick the logo; Phase 2 settings line: businesses settings screen built on dev), `CRM/CLAUDE.md` only if its current-state paragraph names the missing screen.

- [ ] **Step 1: Write D-112**: what was built, that the name is read-only and why, that tax, time zone and address were left out on purpose (PRD: tax and time zone are per quote or property), logos per business, and that `forms/public/brand` now holds `QFT-logo.png` and `QFT-favicon.png` with the five forms files pointing at them.
- [ ] **Step 2: Run the checks**: `npx tsc --noEmit` and `npm run lint` and `npm run build` in `CRM/` and in `forms/`, plus `npx vitest run CRM/tests/companyDetails.test.ts CRM/tests/brand.test.ts`. Expected: all pass. The 27 older failures in `access.test.ts` and `invitations.test.ts` are known and unrelated.
- [ ] **Step 3: Report** what changed in the backend and end with the standing reminder: run `npx convex deploy` so production gets the change.
