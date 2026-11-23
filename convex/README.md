# Convex backend

One Convex backend serves both apps: the live forms app (`forms/`) and the CRM (`CRM/`). One `npx convex deploy` publishes all of it, so a CRM mistake can break the live forms. Read `_generated/ai/guidelines.md` before changing anything here, and the rules in the repo root `CLAUDE.md`.

Run every Convex command from the **repo root** (`npm run convex:dev`, `npx convex env set`, `npx convex run`). Work on the dev deployment only; production needs the user's explicit go-ahead.

File names under `convex/` may contain only letters, digits, underscores and periods (no hyphens), or the whole push fails.

## Layout

| Path | Owner | Contents |
|---|---|---|
| `schema.ts` | shared | Every table. The forms' tables come first; CRM tables are added below them (additive only). |
| `convex.config.ts` | shared | Typed env vars and the rate-limiter component. A new env var must be added here. |
| `auth.config.ts` | CRM | Clerk as the auth provider when `CLERK_JWT_ISSUER_DOMAIN` is set; with it unset nobody can sign in and every CRM call is refused, and a deploy still works. |
| `http.ts` | shared | HTTP routes (below). |
| `crons.ts` | shared | Scheduled jobs (below). |
| `rateLimits.ts` | forms | Limits on project creation, `publishVisit` and sign-in. |
| `projects/` | forms | `mutations.ts`, `queries.ts`, `actions.ts` (`publishVisit`, `draftVisit`: push to Jobber), `consultation.ts` (book, move or cancel the Jobber request's appointment), `visits.ts` (visit snapshots and the change log), `shortCode.ts`. |
| `sales/` | forms | Sales sign-in: `accounts.ts` (the `SALES_*` logins and display names), `clerk.ts` (the hand-off from the CRM's `/sales-access` page, D-053), `mutations.ts`, `session.ts`, `queries.ts`. |
| `jobber/` | forms | `client.ts` (OAuth and GraphQL), `connection.ts`, `mutations.ts`/`queries.ts` (token storage), `http.ts` (OAuth handlers), `sync.ts` (catalogue `plan`/`apply` against the price list). |
| `shared/` | both | Pure TypeScript used by the backend and both apps (`@/convex/shared/...`): `catalogue.ts`, `priceList.ts`, `quoteLines.ts`, `discovery.ts`, `visits.ts`, `zonedTime.ts`, `usStates.ts`, `jobberNames.ts`, `errors.ts`. A change here changes the live forms. |
| `crm/` | CRM | Every CRM function; paths read `api.crm.*`. See below. |

## CRM modules (`crm/`)

Every public CRM function starts with `requireModule(ctx, businessId, module, level)` (or `requireProject`) from `crm/lib/access.ts`: a signed-in Clerk user with an active `users` row, the module permission level for their roles (D-093) and the business. Never a bare role check.

| Area | Modules |
|---|---|
| People and access | `users.ts`, `invitations.ts`, `clerkWebhook.ts`, `businesses.ts` (incl. company details, D-112), `lib/access.ts`, `lib/permissions.ts` |
| Clients | `clients.ts`, `clientActivity.ts` (D-113), `clientImport.ts` (Jobber CSV, D-103), `clientMail.ts`, `clientEmail.ts`, `zohoMailSync.ts` (Zoho Mail, D-064) |
| Requests and projects | `intake.ts` (customer form to CRM, D-045), `requestForm.ts`, `requests.ts`, `projects.ts`, `opportunityPage.ts`, `opportunityVisit.ts` (D-114), `opportunityTasks.ts`, `noteFiles.ts`, `mentions.ts`, `jobberConsultation.ts` (D-085) |
| Pipelines | `pipeline.ts` (`moveStage`, the one path that changes a stage and writes `stageHistory`), `lib/stages.ts`, `lib/pipelineStages.ts`, `automations.ts`, `automationSend.ts`, `customAutomations.ts` |
| Schedule | `schedule.ts` (double-booking prevention), `calendarConnect.ts`, `calendarHttp.ts`, `calendarSync.ts` (Zoho Calendar, D-069) |
| Quotes | `quotes.ts`, `quoteDraft.ts`, `quoteFlow.ts`, `quotePrices.ts`, `quoteImport.ts`, `disclaimers.ts`, `clientQuote.ts` (the customer's `/q/` page) |
| Jobs | `jobs.ts`, `jobCosts.ts`, `checklists.ts`, `catalogue.ts` (Products & Services) |
| Preplanning and construction | `materials.ts`, `materialKits.ts`, `takeoff.ts`, `purchaseOrders.ts`, `workPackages.ts`, `clientWorkPackage.ts` (the installer's `/w/` page), `construction.ts`, `clientSignoff.ts` (`/signoff/`) |
| Finance | `invoices.ts`, `payments.ts`, `billing.ts`, `invoiceSettings.ts`, `clientInvoice.ts` (`/i/`) |
| Messages | `messages.ts`, `messageSend.ts`, `messagesHttp.ts` (Twilio inbound), `phoneNumbers.ts`, `calls.ts`, `whatsapp.ts` |
| Data | `exports.ts` (D-101), `seed.ts`, `sampleData.ts`, `devBoardDemo.ts` (dev only, behind `CRM_ALLOW_SAMPLE_DATA`) |
| Helpers | `crm/lib/`: shared rules such as `formula.ts` (safe expression evaluator, no `eval`), `quoteMath.ts`, `invoiceMath.ts`, `takeoff.ts`, `activity.ts`, `visitData.ts`, `companyDetails.ts`, `exportCsv.ts` |

The CRM's backend tests run in memory with `convex-test` from `CRM/tests/` (`npm test` in `CRM/`).

## Tables

**Forms (never edited by CRM work):** `projects`, `visitSnapshots`, `visitRevisions`, `workAreas`, `salesSessions`, `salesHandoffs`, `jobberConnections`.

**CRM:** `businesses`, `users`, `clients`, `clientNotes`, `activities`, `opportunities` (the central project record), `stageHistory`, `pipelineStages`, `opportunityTasks`, `opportunityNotes`, `opportunityFiles`, `opportunityVisits`, `noteMentions`, `quotes`, `quoteLineItems`, `quoteEvents`, `quoteRevisions`, `quoteAttachments`, `quoteDefaults`, `quoteNotes`, `disclaimers`, `catalogueItems`, `catalogueSettings`, `jobCounters`, `jobTimeEntries`, `jobExpenses`, `jobSignatures`, `checklistTemplates`, `jobChecklistItems`, `materials`, `materialKits`, `takeoffs`, `takeoffLines`, `purchaseOrders`, `workPackages`, `crews`, `progressUpdates`, `punchItems`, `signoffs`, `invoices`, `invoiceLines`, `invoiceEvents`, `invoiceSettings`, `billingPlans`, `paymentScheduleItems`, `payments`, `paymentAllocations`, `automations`, `automationSettings`, `automationRuns`, `customAutomations`, `customAutomationRuns`, `calendarEvents`, `calendarConnections`, `calendarLinks`, `calendarOauthStates`, `scheduleSettings`, `phoneNumbers`, `messages`, `calls`, `zohoMailSync`, `zohoWatchedAddresses`, `clientMailMessages`, `clientMailThreads`, `clientMailBodies`.

## HTTP routes (`<deployment>.convex.site`)

| Route | Purpose |
|---|---|
| `GET /jobber/connect?key=…` | Start the Jobber OAuth connection (needs `JOBBER_CONNECT_KEY`) |
| `GET /jobber/callback` | Jobber OAuth redirect |
| `POST /clerk/webhook` | Clerk tells the CRM a user was deleted (Svix-signed, `CLERK_WEBHOOK_SECRET`) |
| `GET /zoho/calendar/callback` | Zoho Calendar OAuth redirect, one connection per person |
| `POST /twilio/sms` | Twilio inbound texts |

## Crons

| Job | Every |
|---|---|
| Purge expired sales sessions | 1 hour |
| Sync consultations from Jobber | 10 minutes |
| Sync the Zoho mailbox into client profiles | 3 minutes |
| Pipeline automations (follow-ups, auto-archive, D-065) | 15 minutes |
| Custom automations (D-071) | 15 minutes |
| Mirror Zoho calendars | 5 minutes |

## Env vars

Set with `npx convex env set NAME value` on each deployment. All are optional; a feature without its variables stays off.

| Variables | Feature |
|---|---|
| `SALES_EMAIL`, `SALES_PASSWORD`, `SALES_NAME`, `SALES_ACCOUNTS` | Forms sales logins (`SALES_ACCOUNTS` is a JSON list of `{email, password, name}`) |
| `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, `JOBBER_CONNECT_KEY` | Jobber |
| `CLERK_JWT_ISSUER_DOMAIN` | CRM sign-in (read by `auth.config.ts`) |
| `CRM_BOOTSTRAP_ADMIN_EMAILS` | Extra first Admins (`admin@qualityfirstturf.com` is built in) |
| `CRM_ALLOW_SAMPLE_DATA` | `true` on dev only, to load sample data |
| `CLERK_SECRET_KEY`, `CRM_APP_URL`, `CLERK_WEBHOOK_SECRET` | Team invitations (D-055) |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_MAILBOX`, `ZOHO_ACCOUNTS_URL`, `ZOHO_MAIL_API_URL` | Zoho Mail read (D-064) and the automations' emails (D-065) |
| `ZOHO_CAL_CLIENT_ID`, `ZOHO_CAL_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY` | Zoho Calendar (D-069) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Texting; without them texts are logged as sent by hand |

## Forms access model

- **Public** (customer flow): `projects.mutations.create`, `projects.actions.publishVisit`.
- **Sales only** (a valid `sessionToken`): `projects.mutations.update`/`generateUploadUrl`, `projects.queries.listForSales`/`visit`, `projects.actions.draftVisit`.
- **Internal**: everything that touches Jobber tokens or writes integration fields (`recordJobberResult`, `jobber.*`).
- Clients cannot set `jobberClientId`, `jobberQuoteId`, `missingMapping` or `integrationError`; only `recordJobberResult` does.
- `/jobber/connect` requires `?key=<JOBBER_CONNECT_KEY>`.
- The one forms-side hook into the CRM is a `scheduler.runAfter` in `projects.create` that hands the submission to `crm/intake.ts` (D-045); it runs separately, so it can never block the form or the Jobber push.

## Jobber flow (forms)

1. `/jobber/connect` stores a one-time `oauthState` and PKCE verifier and redirects to Jobber.
2. `/jobber/callback` validates `state`, exchanges the code and stores the tokens.
3. The customer form creates a Jobber **request**. `publishVisit`/`draftVisit` refresh the token when needed, find or create the client and property, then create a **draft** quote from `shared/quoteLines.ts`. Quotes are never sent automatically.

## Other behaviour worth knowing

- **Short project codes**: every project gets a 6-character `shortCode` (no 0/O/1/I/L), shown as `K7M-3PQ`, searchable in the sales list and used in Jobber quote titles.
- **Sessions**: only a SHA-256 hash of the token is stored; each session schedules its own deletion at expiry and a cron purges stragglers hourly.
- **Jobber pushes** take a per-project lock (`claimDraft`, 2 minutes) so double clicks cannot create two quotes; requests time out after 20 s.
- The customer-facing `publishVisit` never returns Jobber ids or upstream error text.
- Photos are validated (image type, ≤ 15 MB) and removed from storage when dropped from a project.

## Commands (from the repo root)

```bash
npm run convex:dev            # develop against the dev deployment
npx convex env set NAME value # dev deployment
npx convex deploy             # production: only with the user's go-ahead
```
