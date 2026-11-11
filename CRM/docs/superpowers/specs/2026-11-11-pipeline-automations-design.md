# Pipeline automations and outbound email (design)

Status: **approved by the user 2026-11-11 and built on the dev deployment** (the Zoho send permission is not set up yet, so nothing has been emailed). Written 2026-11-11 after reading Jobber's Automations page and its Emails & Text Messages settings in the browser (nothing saved in Jobber).

## Scope (user, 2026-11-11)
Jobber's reminders and other automatic messages come to the CRM, but **this step is only the automations that act on the pipeline** (quotes and requests). Invoice follow-ups, assessment and visit reminders, job follow-up and the rest are later steps. No "New Automation": the list is fixed. Everything Jobber lets staff edit stays editable.

## The four automations (copied from Jobber, all Active)
| Automation | Trigger | Only if | Action |
|---|---|---|---|
| Auto-archive Quotes | 90 days after the quote is sent | Awaiting response, Changes requested or Approved | Archive the quote |
| Follow-up, 5 days | 5 days after the quote is sent | Awaiting response | Email the client |
| Follow-up, 2 days | 2 days after the quote is sent | Awaiting response | Email the client |
| Auto-archive Requests | 90 days after the request is created | Not Converted, not archived | Archive the request |

**Editable, as in Jobber:** the number of days, the email subject and body, Active on or off. (The time of day is on Jobber's invoice automations only, so it comes with them.) Admin only. Nothing can be added or deleted.

**Message wording (Jobber's, kept).** Subject: `Following up on quote {{QUOTE_NUMBER}}`. Body: `Hi {{CLIENT_FIRST_NAME}},` / "We just wanted to send a quick note to see if you had a chance to look at the quote we sent recently? We're happy to answer any questions you might have." / "We're excited to get to work, so if you'd like to proceed let us know and we can get started!" / `Thanks,` `{{COMPANY_NAME}}` `{{DEFAULT_PHONE}}`. Variables offered by "Insert variable". The text-message tab shows Jobber's text (`Hi {{CLIENT_FIRST_NAME}}, just a quick note that you have a quote from {{COMPANY_NAME}}.`) but is marked "coming soon": no SMS provider yet (D-018 list, phone/SMS question 10).

## Outbound email through Zoho
- Sent from `office@qualityfirstturf.com` through the Zoho Mail API, so it uses the Zoho DNS records (SPF, DKIM) the client already has and replies land in the inbox the Communication tab reads. The email carries the link to the client's quote page (`/q/<token>`).
- Needs one new Zoho scope, `ZohoMail.messages.CREATE`, so the user generates a new refresh token once. The existing read scopes stay. The send code is separate from the read-only sync, and nothing else in the CRM sends (D-064 is narrowed, not dropped).
- A sent message is recorded in the client's Communication tab through the normal sync (it lands in Sent) and in the quote's activity ("Follow-up sent, 2 days").

## Safety (user, 2026-11-11)
- **Mode:** `log only` (default) writes what it would send to the log and sends nothing. `test` sends every message to one test address instead of the client. `live` sends to clients. Changing the mode is Admin only. Dev stays on log only or test; production starts on log only.
- **Old quotes are not followed up.** An automation only acts on a quote sent after that automation's `activeSince` time (set when the CRM first turns it on). One follow-up per quote per automation, ever (a unique record), so a quote that is resent or re-checked is not emailed twice.
- A client with no email, or an unusable one, is logged as skipped. A failed send is logged, retried a few times, and never marks the follow-up done.
- Closing conditions are checked at the moment of sending: if the quote was approved, rejected, archived or changed since, nothing is sent.

## Archive and Closed Lost (user, 2026-11-11; PRD 3.3: Closed Lost applies when the customer is unresponsive after the three-month follow-up period)
- **Requests:** when Auto-archive Requests fires (90 days, not converted, not already closed), the project is moved to **Closed Lost** with the reason "Archived automatically after 3 months of unresponsiveness" (`outcome: lost`, `closedAt`, `lostReason`) **and** archived. Archiving is its own flag: optional `archivedAt` and `archivedReason` on the project (additive schema, CLAUDE.md rule 3). Archived requests leave the pipeline and request lists, stay searchable, and staff can restore them (restoring clears the flag and puts the project back in the stage it was in, so the lost mark is removed too).
- **Quotes:** Auto-archive Quotes sets the existing `Archived` status and records "Archived automatically after 90 days" in the activity. My call, correctable: if the quote was Awaiting response or Changes requested, its project is closed as lost with the same reason as above, since that is the unresponsive customer; an Approved quote is archived only, and its project is left alone.
- Nothing already Closed Won, Closed Lost or Converted is touched.

## Backend and screen
- New tables `automations` (the four fixed rows per business: key, days, subject, body, active, activeSince) and `automationRuns` (what ran, on what, result, time), plus `automationSettings` (mode, test address). New files `convex/crm/automations.ts`, `automationRun.ts`, `lib/automationRules.ts` (pure rules, unit-tested), `zohoMailSend.ts`. A cron every 15 minutes finds due items and runs them. Env var changes go in `convex.config.ts` (none new beyond the new refresh token).
- Screen: **Settings → Automations**, Jobber's card layout grouped Quotes and Requests, each card opens a side panel (When this happens / And only if / Then do this) with the editable fields and Save; a message-template dialog with Email and Text Message tabs and a live preview; an **Activity** list of runs; the mode switch. Skeleton loader and hover/red-field rules apply (D-034, D-035). The Pipeline "More Actions → Automations" item and the lightning icons point here.
- Tests: rule timing (2, 5 and 90 days, `activeSince`, once only), status checks at send time, template variables, mode behaviour.

## Not in this step
Invoice automations, assessment and visit reminders, job follow-up, texts, any new automation, the 8:00 am time setting (it comes with invoices).

## Dev only
Built and tested on the dev deployment. Production is not touched without the user's go-ahead.
