# Installer work packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** PRD 4.3 and the crew half of 4.4: an installer budget with labour costs, an installation schedule, site access and customer availability, a consolidated work package with drawings, photos and the material list, and a secret expiring link to share it, plus an agreed rate and availability on each crew.

**Architecture:** One `workPackages` row per project (editable, Preplanning module). The budget lines are priced, so they need the `prices` module. A secret 64-character link (`/w/<token>`, open in `proxy.ts` like `/q/`, `/signoff/`, `/i/`) shows a read-only page: no sign-in, expires after N days (default 14), can be revoked, and shows no customer prices. Crews gain optional `rateCents` and `availability`. Sending by WhatsApp stays "copy the link" until 5.4.

**Spec:** D-099 in `CRM/docs/decisions.md` (assumptions by the golden rule, D-091, since the client's package format has not arrived: everything is editable text and lines).

## Global Constraints
- Additive schema only; CRM code in `convex/crm/`; file names without hyphens.
- Money is whole cents. Dates are UTC midnight numbers.
- The public query returns only what an installer needs: no client contact details beyond the site address, no customer prices, no internal costs of materials.
- Every staff function starts with `requireProject`/`requireModule`.

## Review Focus
- Expired, revoked and replaced links return null. A token shorter than 32 characters returns null.
- A staff member without `prices` view cannot read or change budget lines (the old lines stay).
- A selected file that was deleted from the project is skipped, not an error.
- Dates: an end before the start is refused.
- A project not Closed Won has no package.

### Task 1: Pure rules (`convex/crm/lib/workPackage.ts`)
- `budgetTotalCents(lines)`, `lineTotalCents(line)`, `shareState(pkg, now): "none" | "live" | "expired"`, `validateDays(n)`.
- Tests in `CRM/tests/workPackage.test.ts`.

### Task 2: Backend `convex/crm/workPackages.ts`, `clientWorkPackage.ts`, schema, crew fields
- `get`, `save`, `share`, `revoke`; public `clientWorkPackage.get({token})`.
- `saveCrew` takes `rateCents`, `availability`. Tests in `CRM/tests/workPackageApi.test.ts`.

### Task 3: UI
- Project tab **Work package** (`work-package-tab.tsx`): scope, schedule and target start, site access, customer availability, crew and installers (from the Construction team), budget lines, which files to attach, material list on/off, share link panel, Print.
- Public page `/w/[token]` (`client-work-package.tsx`), skeleton, `proxy.ts` open path.
- Crews dialog: rate and availability fields.

### Task 4: Verify in the browser, record D-099, update phases.md and CLAUDE.md, final checks (tsc, eslint on touched files, vitest, build).
