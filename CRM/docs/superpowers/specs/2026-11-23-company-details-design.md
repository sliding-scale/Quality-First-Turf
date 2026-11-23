# Company details (Settings): design

Status: approved by the user, 2026-11-23.

## Intent and why
Each of the three businesses needs a place for its own details, so quotes, invoices and the sign-off page can show them and an Admin can fix them without a developer. Today a business has only a name and a slug.

## Goals
- Settings > Company details, one page per business (the business selector decides which).
- Fields: phone, email, website, all optional. The business name is shown but not editable here (builder's call, see below).
- Admin-only to edit (user, 2026-11-23). Everyone else with access to Settings sees it read-only.
- Logos (user, 2026-11-23, from the new `public/brand` files): Quality First Turf Landscape and Quality First Turf Construction share the QFT logo; Quality First Patios has its own (QFP). They replace the plain "Q" tile the other two businesses use in the sidebar today. Fixed files per business, no upload.

## Non-goals
- Address (left out by the user), sales tax rate (the PRD makes tax per quote or per property, not a business default), time zone (the PRD makes it per property or user), business hours, branding colours, document templates, per-business logo upload.

## Constraints
- Additive schema only: new optional fields on `businesses`. Forms tables untouched.
- Backend in `convex/crm/`; the mutation starts with `requireModule`; business rename keeps the existing rule (D-066).
- Skeleton and `loading.tsx` ship with the screen (D-034); hover, motion, red-on-submit validation and input filtering follow D-035, D-037, D-038 (phone digits only, email no spaces).
- Past quotes and invoices keep their own snapshot; editing company details never rewrites them.

## Approaches
1. **New settings page and optional fields on `businesses` (chosen).** Smallest, matches how the other settings pages work.
2. A separate `businessSettings` table. More moving parts for four text fields.
3. Put the fields into an existing settings page (Invoices). Mixes concerns and is hard to find.

## Left to the builder
The exact skeleton layout, wording of validation messages, and the sidebar logo size for the Patios logo (check the collapsed icon rail too).

## Calls made while planning (not agreed with the user)
- The name is read-only. Names are tied to code (`lib/businessNames.ts`, `businesses.alignNames`, and `intake.ts`, which resets the form business's name on every intake), so an editable name would be silently reverted. Making it editable is a separate change.
- The screen is `/settings/businesses`, replacing the disabled "Businesses" link already in the Settings navigation (Admin-only link, so non-Admins never reach it; the read query is open to anyone who works in the business, for later use on quotes).
- Landscape and Construction keep the existing `logo-full.png`; Patios gets `QFP-logo.png`.
