# User management and permissions (Milestone 5, PRD 5.5): design

Status: **awaiting the user's approval.** Nothing is built. Written 2026-11-18. The user's instruction: do what the PRD says (Installers are a user group, D-090), copy Jobber where it has an equivalent, and follow the golden rule (D-091): assume, make it a setting, ask the client last.

## Intent
Each person sees and changes only what their job needs: by module (can they open Invoices at all, can they delete a client) and by record (an Installer sees only the projects they are assigned to). Admin manages all of it from Manage Team.

## Where we are (read from the code)
- Roles: Admin, Sales, Office Team, Project Manager. A person can hold several (D-014). Business access is per user (D-031).
- The only permission split is **edit versus view**: `EDIT_ROLES` (admin, sales, office) in `convex/crm/lib/stages.ts`, with two exceptions (Project Managers move cards inside Construction, D-081; money is Admin and Office, D-092). Every function starts with a helper in `convex/crm/lib/access.ts`.
- Missing against PRD 5.5: the **Installer** group; **module permissions**; **record-level limits** ("restrict users to assigned records", "managers and Admins broader visibility"). Already there: Admin manages users (Manage Team), controlled access between departments by business, each user's own calendar (Schedule's Employee view) and tasks (Tasks, My tasks).

## What Jobber does (read in the browser, nothing saved)
A user is an **administrator** (everything) or has **preset levels** (Field crew, Senior field crew, Crew lead, Manager), customisable per module. Modules with levels: Schedule (view own, complete own, edit own, edit everyone's, edit and delete), Notes, Clients and properties (names only, view, edit, delete), Requests, Quotes, Jobs, Invoices (View only / create and edit / delete), Payments (needs Show pricing, client and invoice edit), Client communications, Reports, Expenses, Timesheets, Pipeline, Marketing. "Show pricing" hides prices and costs. Each module also decides whether it shows on the person's menu.

## Approaches
- **A. A permission matrix, enforced in the backend (recommended).** Each role is a preset of levels per module; a person's levels are the most any of their roles gives, and an Admin can override a module for one person. One helper, `requireModule(ctx, businessId, module, level)`, replaces the role checks. Trade-off: every CRM function changes its check (a mechanical pass, covered by tests), but permissions then live in one table that Admin can edit, and the client can refine it later without code.
- **B. Add Installer and record scoping only.** Smaller, leaves view-versus-edit as it is. Trade-off: Admin cannot tune anything, and every later change is a code change.
- **C. Per-user toggles only, no roles.** Most flexible, hardest to manage and to explain; the PRD asks for the five groups.

## Design (approach A)
- **Modules:** Clients, Requests, Quotes, Schedule, Tasks, Pipeline: Sales, Pipeline: Preplanning, Pipeline: Construction, Pipeline: Finance, Invoices, Payments, Prices and costs (show pricing), Settings and team. **Levels:** None, View, Edit, Full (Edit plus delete and reopen).
- **Presets (my assumptions, editable by Admin per role and per person):**
  | Module | Admin | Office | Sales | Project Manager | Installer |
  |---|---|---|---|---|---|
  | Clients, Requests, Quotes | Full | Edit | Edit | View | None |
  | Schedule, Tasks | Full | Edit | Edit | Edit | View own |
  | Pipeline: Sales | Full | Edit | Edit | View | None |
  | Pipeline: Preplanning | Full | Edit | View | Edit | None |
  | Pipeline: Construction | Full | Edit | View | Edit | Edit assigned (progress, punch list, photos) |
  | Pipeline: Finance, Invoices, Payments | Full | Edit | View | View | None |
  | Prices and costs | Yes | Yes | Yes | Yes | **No** (customer prices and costs hidden) |
  | Settings and team | Full | None (Disclaimers and Invoice settings: Edit) | None | None | None |
- **Record level:** a per-person switch **"Only records assigned to them"**. On by default for **Installers** (projects where they are on the work team); off for everyone else (today's behaviour: everyone in the business sees the business). Assignment uses what exists: salesperson, project manager, crews. A new `installerIds` list on a project (the Installers on its work team) is added, set from the Construction tab's Team card.
- **Installer logs in** like the others (invited, Clerk, a row in `users`); the menu shows only their modules. Secure work-package links (PRD 5.4) stay for people who do not log in.
- **Manage Team:** the invite and edit screens gain the Installer role and a **Permissions** section like Jobber's: preset buttons, a level per module, and the assigned-only switch. The person's menu follows their levels.
- **Backend:** `convex/crm/lib/permissions.ts` (pure matrix and merge, shared with the screens), `requireModule` in `access.ts`, a `permissions` override on `users`, `installerIds` on `opportunities`. Reads filter assigned-only people to their records server-side (never only in the UI, rule 3). `canEdit`, `requireEditor` and the money helpers become thin wrappers so nothing changes behaviour for existing roles.
- **Calendars and tasks (PRD 5.5, last bullet):** each user already has their own calendar (Schedule, Employee view) and tasks (My tasks). With this work an Installer sees only their own on both. No new screen.

## Goals, non-goals
**Goals:** the five PRD groups; module levels; assigned-only; Admin-editable; one enforcement point; no change in what today's four roles can do until Admin changes it.
**Non-goals:** Jobber's Reports, Expenses, Timesheets, Marketing and client-communication levels (no such modules here yet); per-record sharing; field-level hiding beyond prices and costs.
**Anti-goal:** a screen that hides something the backend still returns.

## Build order (each step ends with checks and a pause)
1. Pure matrix and `requireModule`, Installer role, `installerIds`, tests: every module by every preset, a person with two roles, assigned-only, an Installer refused on prices, other business refused.
2. Move every CRM function onto `requireModule` (mechanical; the existing 388 tests must still pass).
3. Manage Team: the Installer role, the Permissions section, the menu following levels, `installerIds` on the Construction tab's Team card.
4. Installer view: their projects, progress, punch list, schedule and tasks only, prices hidden.

## Constraints
Dev deployment only; no hyphens in `convex/` file names; additive schema (`users.permissions`, `opportunities.installerIds` optional); the forms app is not touched; the installer-login change replaces D-010 (D-090) and the Users screen's wording about installers is updated.

## Calls I made (please check)
1. The preset table above, especially: Sales see everything in their business (the client has not said otherwise), Project Managers can edit Preplanning and Construction but only look at Sales and money, Installers get no prices.
2. Assigned-only is on for Installers and off for everyone else by default, and Admin can switch it on for anyone.
3. Approach A, done in four steps with a pause after each.
