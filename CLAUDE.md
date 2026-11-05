# CLAUDE.md

Monorepo for Quality First Turf. Read this first in every session started at the repo root. It carries the plan and the safety rules, so you should not need to ask the user for background.

## What this is
Two apps, one git repo, **one shared Convex deployment**:

| Folder | App | Status | Domain (Vercel, one project each) |
| --- | --- | --- | --- |
| `forms/` | Customer intake and on-site visit app. Next.js 16, Convex, Jobber push. | **Live**, used by the client | `forms.qualityfirstturf.com` |
| `CRM/` | The CRM that will replace Jobber. | Next.js app on sample data (Milestone 2 screens); Convex not wired yet | `launchpad.qualityfirstturf.com` |

The Convex backend lives in `convex/` at the repo root, a sibling of `forms/` and `CRM/`, and serves both apps (D-026, D-030). Domain logic that both the backend and the apps use (catalogue, price list, quote lines, discovery rules, visit and time helpers, US states) lives in `convex/shared/`; apps import it as `@/convex/shared/...`. Hosting is Vercel, one project per app, both pointing at the same Convex deployment through `NEXT_PUBLIC_CONVEX_URL`. The git remote is `github.com/sliding-scale/Quality-FIrst-Turf`.

**Tooling.** The root `package.json` uses npm workspaces (`forms` and `CRM`) and holds the backend's packages (`convex`, `@convex-dev/rate-limiter`). The lockfile is at the root. Run `npm install` once at the repo root, not inside an app. Each app keeps its own `package.json`, scripts and env files. **Convex CLI commands (`npx convex dev`, `env set`, `run`, `deploy`) run from the repo root** (`npm run convex:dev` and `convex:deploy` are root scripts). The root `.env.local` holds `CONVEX_DEPLOYMENT` (the dev deployment), and the backend is the root `convex/` folder, so no `convex.json` is needed there. Each app's own `.env.local` keeps only that app's variables: `NEXT_PUBLIC_CONVEX_URL` (the dev deployment's URL, for the browser) and, for `forms/`, the Clerk keys. Next.js only reads env files from the app's own folder, so those cannot move to the root. `forms/convex.json` and `CRM/convex.json` stay for any tool or host that runs inside an app folder, but a Convex command run there has no deployment set. `CRM/` is set up like `forms/`: in the root `workspaces`, the `@/convex/*` alias in its `tsconfig.json`, and `turbopack.root` and `outputFileTracingRoot` set to the repo root in its `next.config.ts`; its `.env.local` points at the dev deployment.

## The plan (decided by the user)
- Jobber keeps working **in full** until the CRM is completely built. Nothing is removed, disabled or repointed in Jobber or in the forms' Jobber code before then (D-028).
- The CRM is built beside it, on the same Convex deployment. The team moves onto the CRM gradually as PRD milestones ship (D-027).
- Only when the CRM is complete is the Jobber connection ended and the team fully on the CRM. That is its own final task and needs the user's explicit go-ahead.

Full reasoning and the numbered decisions are in `CRM/docs/decisions.md`. The build plan and checklists are in `CRM/docs/phases.md`.

## Where to read, by task
- **Any CRM work:** `CRM/CLAUDE.md`, then `CRM/docs/decisions.md`, `phases.md`, `architecture.md`, `prd.md`. If a task conflicts with a recorded decision, say so instead of working around it.
- **Any forms work:** `forms/CLAUDE.md` (handoff rules) and `forms/AGENTS.md`. Next.js 16 differs from older versions: read the guide in `node_modules/next/dist/docs/` (at the repo root, since the workspace install) before writing Next code.
- **Any Convex code:** read `convex/_generated/ai/guidelines.md` (repo root) first. It overrides what you know about Convex.
- Subfolder CLAUDE.md files load when you work in them. This file holds the rules that apply everywhere.

## Shared Convex backend: rules
1. **One `convex deploy` publishes everything.** A CRM mistake can break the live forms. Production is never touched without the user's explicit go-ahead.
2. **Work against the dev deployment only.** Never run `npx convex deploy`, `npx convex run --prod`, `--prod` env changes, or touch production data without the user's go-ahead for that action.
3. **Additive only.** Existing forms tables (`projects`, `visitSnapshots`, `visitRevisions`, `workAreas`, `salesSessions`, `jobberConnections`) and functions (`convex/projects/`, `convex/sales/`, `convex/jobber/`, the Jobber crons and routes) are not edited by CRM work. CRM tables use new names.
4. **CRM backend code goes in `convex/crm/`.** Function paths read `api.crm.*`. The shared single files (`schema.ts`, `http.ts`, `crons.ts`, `convex.config.ts`) get additive edits only. `convex.config.ts` lists the allowed env vars, so a new env var has to be added there. Every CRM function checks a signed-in Clerk user with an active row in the `users` table, their role and their business (`convex/crm/lib/access.ts`, D-046); with Clerk not configured on a deployment (`CLERK_JWT_ISSUER_DOMAIN` unset) nobody can sign in and every CRM call is rejected, and a deploy still works. Env vars: `CLERK_JWT_ISSUER_DOMAIN` (the Clerk instance URL), `CRM_BOOTSTRAP_ADMIN_EMAILS` (extra first Admins; `admin@qualityfirstturf.com` is built in), and `CRM_ALLOW_SAMPLE_DATA` (dev only, to load sample data). Each deployment needs its own Clerk instance's issuer.
5. **Before proposing any production deploy,** typecheck and build both apps (`npx tsc --noEmit`, `npm run build` in each) and say what changed in the backend.
6. **Shared code.** `convex/shared/` is imported by both the backend and the apps, so it must stay pure TypeScript with no React, Next or browser-only imports, and a change there affects the live forms app too.
   **File names under `convex/` may contain only letters, digits, underscores and periods, so no hyphens** (`quoteLines.ts`, not `quote-lines.ts`). Convex rejects any other name when it pushes, and one bad name fails `npx convex dev` and `npx convex deploy` for the whole backend. Typecheck, lint, build and esbuild do not catch it; only a real push does.
7. **Vercel, one-time dashboard settings (the user does these; not yet verified on Vercel):** for each project set Root Directory to the app folder (`forms`, later `CRM`) and enable "Include source files outside of the Root Directory". The install must run from the repo root so the workspace packages resolve. Check the first preview build of the `monorepo` branch before merging to `master`.
8. **What was verified locally when the backend moved (D-030):** typecheck of `forms/` and `convex/`, `npm run lint`, `npm run build` in `forms/`, and esbuild bundling of all 31 backend modules. **Not verified:** the Convex CLI itself (`npx convex dev` was refused on this machine with "You don't have access to the selected project", so run it once yourself on the dev deployment), and any Vercel build.

## After every change: remind the user
This is the user's standing rule, from the live handoff. After any change to `forms/`, to the shared `convex/` folder, or to deploy, env or hosting configuration, end your final message with:
1. Run `npx convex deploy` so production gets the change. Code that is only on the dev deployment is not live.
2. Delete test data from Convex (projects, work areas, sessions, uploaded photos made while testing).
3. Delete test data from Jobber (clients, requests, quotes, assessments).

Why: at handoff the Jobber connection was left on the personal testing account and Convex was not moved to production, which cost the client's trust. Changes that touch only `CRM/` docs and `CRM/` app code that touches nothing shared don't need the reminder. If unsure, include it.

## Git
Branch `monorepo` holds the restructure: forms moved into `forms/` (`201de5c`, pure renames), `CRM/` added (`aefc543`), the Convex backend and shared domain code moved to the repo root with npm workspaces (`29ce591`, revertible on its own), `.next/` ignored (`3eff6e6`). It is **not merged and not pushed**. Before it reaches `master` or GitHub, the Vercel settings in rule 7 above must be in place, or the forms build will break. The user's pending docs changes in `forms/docs/` (several deleted and untracked files, including `forms/docs/project-status.md`, which `forms/CLAUDE.md` still points to) are uncommitted and are the user's to sort out. Don't commit, push or merge without being asked. Commit messages end with the attribution line from the session instructions.

## Working with this user
- Go step by step. Settle one thing, then the next. For CRM design, brainstorm first and build nothing until that step's design is approved (D-020). Do not scaffold or install while brainstorming.
- The user dictates by text-to-speech, so words and letters can be wrong: "V2.1" means "B2.1", "version deployment" meant "Vercel deployment". Read it in context and say which reading you used when it changes what you do.
- The user answers with decisions. Record them in `CRM/docs/decisions.md` as you go.
- No questions go to the client now; ask only when one blocks a specific piece of work (D-018).
