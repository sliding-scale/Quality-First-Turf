# Zoho Calendar, one connection per user (design)

Status: **approved by the user 2026-11-12 (a full two-way mirror, everything shared) and built on the dev deployment.** Not yet tried against a real Zoho account. Written 2026-11-12 after reading Jobber's Calendar sync (Schedule → More → Schedule Settings → Personal settings, nothing changed) and Zoho's Calendar API pages.

## User's answers (2026-11-12) and what they change
1. Push consultations, visits, events, reminders and scheduled tasks: yes (the default).
2. Booking over a Zoho busy time: a warning that still lets you save.
3. Busy blocks **show the Zoho event's title** to the team (not just "Busy").
4. **The Zoho Calendar and the CRM calendar must look exactly the same, content-wise.** This replaces the one-way "busy blocks only" idea. It makes the sync a full two-way mirror:
   - An event made in the CRM appears in Zoho, and an event made in Zoho appears in the CRM (as a CRM calendar item of type Event, assigned to that person, with a small Zoho mark).
   - A change to the title, time, notes or place on either side changes the other. If both sides changed it, the most recent change wins.
   - Deleting an item on either side deletes it on the other.
   - Repeating items are mirrored as repeating items.
   - Zoho events count as busy time for availability, with their titles shown, and booking over one gives the warning.
   - **On disconnect nothing is deleted on either side.** The mirrored items stay where they are as ordinary items, and the sync simply stops. (This replaces the earlier "remove the CRM's events from Zoho on disconnect".)
   - The earlier "Zoho to CRM: busy blocks only" and "echo filter" rules are replaced by the link table: each mirrored item is one CRM row and one Zoho event, joined in `calendarLinks`, and a change made by the sync itself is not sent back.
   - Because the whole team sees each connected person's Zoho events with titles, a person's private Zoho appointments are visible in the CRM. The connect screen says so before they click Allow.
   - A CRM item assigned to two people is one event in each person's Zoho Calendar.
   - Open questions this adds: how Zoho reports changes (pushed notices, or a check every few minutes; the design assumes a check every 5 minutes) and how Zoho marks a deleted event; both are on the list to verify before building.

## What Jobber does (copied where it applies, D-068)
- Calendar sync is **per user** and **one way**: Jobber gives each person a private link to subscribe to from iCal or Google Calendar. Nothing comes back from the outside calendar. Jobber finds free time from working hours only.
- Each person picks what is sent: Tasks, Reminders, Events, Visits, Requests, "items that are unassigned", "items assigned to everyone".

## What the PRD needs on top (mandatory)
Availability from each person's own Zoho Calendar (PRD 3.5, with Google read as Zoho by D-062). So the CRM must **read** busy times too. That is why a link is not enough: this is a two-way connection per user.

## Intent
Each person connects their own Zoho Calendar once, with one click and Zoho's "Allow" screen. After that, the CRM puts their items in their Zoho Calendar and reads their busy times to find free time. No links, no tokens, nothing technical for the user.

## The user's part (the only thing they see)
1. **Settings → My calendar** (every role, not only Admins) shows a **Connect Zoho Calendar** button. A dismissible note on the Schedule screen points to it for anyone not connected.
2. Zoho shows "Allow Launchpad to access your calendar?" They click Allow and land back on **My calendar**, now showing "Connected as name@…", the last sync time, **Sync now** and **Disconnect**.
3. Jobber's choices, as tick boxes on the same page: Tasks, Reminders, Events, Visits, Consultations (Jobber's "Requests"), unassigned items, items assigned to everyone. Defaults: all on except "unassigned" and "assigned to everyone".
4. If the connection ever breaks (they removed access in Zoho, say), the page and the Schedule note say "Reconnect Zoho Calendar". Nothing is lost.
5. **Manage Team** (Admin) gets a Calendar column: Connected, Not connected, Needs reconnecting. It shows no tokens or calendar details.

## One-time setup (Admin, about 5 minutes, I walk through it)
A Zoho **Server-based Application** in the Zoho API console (name Launchpad CRM). Two redirect addresses (one for dev, one for production, both Convex site addresses ending `/zoho/calendar/callback`). I store its Client ID and Secret in the Convex environment (`ZOHO_CAL_CLIENT_ID`, `ZOHO_CAL_CLIENT_SECRET`) and a key for encrypting tokens (`CALENDAR_TOKEN_KEY`). Scopes asked of each user: `ZohoCalendar.calendar.READ`, `ZohoCalendar.event.ALL`, `ZohoCalendar.freebusy.READ` (names to be re-checked in the console; Zoho's help pages confirm `event.ALL` and `freebusy.READ`). The existing mail Self Client is not used for this.

## How it works
- **Connect.** The button calls a mutation that makes a one-use `state` code for that user (10 minutes), then sends the browser to Zoho. Zoho returns to a Convex HTTP route (`/zoho/calendar/callback`, an additive edit to `convex/http.ts`). The route checks the state, swaps the code for tokens, finds the person's main calendar, saves the connection and sends the browser back to **My calendar**. The Zoho data centre (`.com`, `.eu`, `.in`) is taken from Zoho's reply and stored, so every later call goes to the right server.
- **Tokens.** Stored in a new table `calendarConnections` (one row per user: status, Zoho email, data centre, calendar id, tick-box choices, encrypted refresh token, short-lived access token, last sync, last error). Never returned to the browser. A person can only read or change their own row; Admins see status only.
- **CRM to Zoho.** When a consultation, visit, event, reminder or scheduled task is booked, changed, reassigned or deleted, a background action updates that person's Zoho Calendar (create, update, delete), for each assigned person who is connected and has that kind of item ticked. The Zoho event holds the title, time, client, property address and a link back to the item in the CRM. Repeating items go as a Zoho repeat rule. A table `calendarLinks` remembers which CRM item is which Zoho event, so changes update the same event and never duplicate it. A nightly check re-sends anything that failed.
- **Zoho to CRM.** A background job every 10 minutes (and **Sync now**) reads each connected person's events for the next 60 days and stores them as busy blocks in `externalBusy` (a cache, because the schedule's queries cannot call outside services). Events the CRM itself put there are skipped (by their stored id), so nothing blocks itself. All-day events and events Zoho marks "free" do not block. `externalBusy()` in `convex/crm/schedule.ts` reads this cache.
- **What the CRM shows.** Busy blocks appear on the person's column as grey "Busy" with no title, so nobody sees what a colleague's private appointment is. Find a Time and the availability check treat them as unavailable.
- **Booking over a Zoho busy time.** A warning names the person and the time ("Sam is busy in Zoho Calendar 2:00–3:00 pm"), and the booking can still be saved. (Booking over another CRM item stays a hard stop, D-062.)
- **Disconnect.** Revokes the token at Zoho, deletes the stored tokens and the cached busy blocks, and removes the events the CRM created in their Zoho Calendar (so no stray appointments are left behind).
- **When something fails.** A failed refresh marks the connection "Needs reconnecting" and stops the sync for that person only. A failed push is retried with a delay, three times, then shown in the connection's last error. Zoho's rate limit is respected with backoff. Nothing is lost silently (rule 6).

## Backend and screens
- New tables `calendarConnections`, `calendarLinks`, `externalBusy` (additive). `convex/crm/calendar*.ts` for connect, sync and push; pure rules in `convex/crm/lib/calendarSync.ts` (CRM item to Zoho event, which items qualify, echo filter, busy merge, 60-day windows). Zoho calls sit behind one small client so tests use a pretend Zoho, as the invitation tests use a pretend Clerk.
- Env vars added to `convex.config.ts`: `ZOHO_CAL_CLIENT_ID`, `ZOHO_CAL_CLIENT_SECRET`, `CALENDAR_TOKEN_KEY`.
- Screens: **Settings → My calendar** (with skeleton, D-034), Schedule note, Manage Team column, a "Busy" style on the schedule.
- Tests: the mapping rules; the echo filter; one connection per user and nobody else can read or change it; the tick boxes; disconnect cleanup; failure paths.

## Not in this step
Google and Outlook; creating CRM items from Zoho events; shared or team calendars; Zoho Meeting links; editing a single occurrence of a repeating item from Zoho.

## To check before building (not yet verified)
How many days one Zoho events request may cover; Zoho's call limits; how repeat rules and all-day/free events are marked in the reply; the exact redirect parameters Zoho sends back; whether `ZohoCalendar.calendar.READ` is needed to find the main calendar.

## Decisions I need from the user
1. **What goes to Zoho:** consultations, visits, events, reminders and scheduled tasks (my default), or fewer?
2. **Booking over a Zoho busy time:** warn but allow (my default), or block?
3. **Busy blocks:** show "Busy" only (my default), or also the Zoho event's title to the team?
4. **On disconnect:** remove the CRM's events from their Zoho Calendar (my default), or leave them?
