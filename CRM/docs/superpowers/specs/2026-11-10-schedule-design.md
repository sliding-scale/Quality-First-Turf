# Schedule: design (Milestone 3, step 3.3, part 1)

Status: **approved by the user, 2026-11-10** (with the three answers below). The PRD says Google Calendar; the client is moving from Google Workspace to **Zoho Workspace**, so the external calendar is **Zoho Calendar** (the user, 2026-11-10). Written 2026-11-10 after reading Jobber's Schedule in the browser (Week, Month, Day, the Find a Time pop-up, an event, the filters and menus) and PRD sections 3.1 and 3.5. The user's instruction: copy Jobber's Schedule, implement every PRD point, keep what Jobber has beyond the PRD and list it. Part 2 (Tasks, from the PRD) follows once the Schedule is done.

## Intent
Staff need one calendar where consultations, follow-up visits, tasks and events are booked, assigned to people and seen by day, week or month, without double-booking anyone. It replaces Jobber's Schedule and joins the pipeline: a project waiting for a consultation shows as unscheduled, and booking it moves the project forward.

## What Jobber's Schedule has (copied)
- Header: month and year with a mini-calendar picker; previous and next arrows; **Today**; the green **Find a Time**; filters **Type** (Visits, Requests, Tasks, Events, Reminders), **Team** (each person, Unassigned, Select All, Clear) and **Status** (Completed, Overdue, Upcoming, Confirmed by client); an info icon ("Times shown are in your account's time zone (America/Los_Angeles)"); **Month / Week / Day**; an **Unscheduled** button with a count; a **Map** button; **More** (Reschedule and reassign, Create new visits, Manage crews, Schedule Settings, Give feedback).
- Week view: seven day columns, an "Anytime" row on top for items without a time, hour rows, working hours white and the rest grey, the current day highlighted. Day view: one column per team member plus Unassigned. Month view: every day with its items as one-line chips (time and title), days outside the month greyed.
- Items: coloured cards with the person's initials and the time. Clicking one opens a pop-up (title, type, a Completed tick for tasks, Team chips that can be added to or removed, start and end, **Find a time**, **Edit**, **Details**).
- Find a Time pop-up: tabs Job, Request, Task, Event; search client or address; title; add instructions; add line item (jobs); Assign; a start (Unscheduled by default) and a duration in hours; a **Show availability** switch that greys the times people are busy; More Options; Save with a menu.
- Unscheduled panel: a count, "Oldest first" sort, cards for requests and tasks with no time, which can be dragged onto the calendar. Map panel with pins (Jobber's map).
- Recurring items (a daily BREAK 10:30 and 12:30, shown on every weekday).

## PRD points (3.5 and 3.1)
Calendar with daily, weekly and monthly views; schedule consultations and follow-up visits; assign appointments to salespeople; **retrieve external calendar availability before booking** (the PRD says Google; now Zoho Calendar); individual user calendars; assign tasks to users; personal task lists on the dashboard (part 2); **prevent double-booking** based on calendar availability; dashboard figures for today's scheduled jobs and upcoming consultations.

## Decisions I am proposing (correctable)
- **Item types:** Consultation (a visit for a project, the PRD's "onsite consultation"), Follow-up visit, Task, Event, Reminder. Jobber's "Visits" and "Requests" map to Follow-up visit and Consultation; Jobs and their visits wait for the Jobs module, so the "Create new visits" menu item is greyed.
- **Tasks live on the calendar too:** the existing project tasks get an optional start and end so a scheduled task appears on the calendar, and ticking it there ticks it on the Tasks page. No second copy of a task.
- **One new table, `calendarEvents`** (consultation, follow-up visit, event, reminder): business, type, title, optional project and client, start, end or "anytime", the people it is for (one or more), status (Upcoming, Completed, Confirmed by client; Overdue is worked out, never stored), notes, optional repeat (none, daily, weekdays, weekly, monthly), who created it. Repeats are expanded when the calendar is read, not stored as copies. Additive schema only.
- **Booking a consultation moves the project:** scheduling a consultation for a project at "Schedule Onsite Consultation" moves it to "Onsite Consultation" through `moveStage`, with the usual history. The pipeline card's greyed **View Schedule** then opens the schedule at that date.
- **Unscheduled panel:** lists projects waiting at "Schedule Onsite Consultation" and tasks with no time; dragging one onto the calendar books it.
- **Double-booking (PRD):** a person cannot have two overlapping consultations, follow-up visits or events; the server refuses and says who is busy and when. Tasks and reminders never block. A booking outside working hours is allowed after a warning.
- **Availability:** a person is unavailable when they are outside working hours or have a blocking item. Working hours are set in Schedule Settings (default Monday to Friday, 8 AM to 5 PM, as Jobber shows). "Show availability" greys unavailable times for the chosen people.
- **Permissions:** Admin, Sales and Office Team book and change; Project Managers look only (same as the rest of the CRM). A person can be assigned only if they are on the business.
- **Time zone:** America/Los_Angeles, shown in the info tip.
- **Screens:** `/schedule` (Month, Week, Day in the address, `?view=` and `?date=`), built to the CRM's rules (skeleton, hover feedback, smooth motion, tooltips, red-on-submit, fixed behaviour on narrow screens).

## Decided by the user (2026-11-10)
1. **External calendar availability: yes to the proposal, and the calendar is Zoho, not Google.** Build availability on the CRM's own bookings now, with one clear place where Zoho Calendar's busy times plug in; the Zoho link is its own later step (needs a Zoho API client and each person's consent, with the keys in the Convex environment). Until then the CRM shows only its own bookings.
2. **The map:** greyed until a map provider and key exist.
3. **Tasks on the calendar:** yes, a task gets an optional start and end and appears on the Schedule; one copy only.

## Not in the PRD but kept (user's call: tell the user)
Type, Team and Status filters; the Unscheduled panel; the mini-calendar picker; the Anytime row; working-hours shading; Event and Reminder types; repeating items; the Completed tick and the Team chips in the item pop-up; dragging to move and stretching to resize; More menu items (Reschedule and reassign, Schedule Settings, Give Feedback); the "Confirmed by client" status (set by hand until a client link exists); the info tip about the time zone; the Map button (greyed); Create new visits and Manage crews (greyed).

## In the PRD but not in Jobber (added by us)
Booking a consultation moves the project in the pipeline; refusing double-booking (Jobber lets people overlap; I did not see it block); the Google availability (a later step); the Home dashboard figures for today's schedule and upcoming consultations (they come from real bookings once this exists).

## Left to the builder
Colours per type and person; exact pop-up copy; how repeats end (default: no end, shown for the visible range); how Month shows many items on one day ("+N more").

## After this: Tasks (part 2)
From the PRD: tasks assigned to users, personal task list on the Home dashboard, "tasks assigned to the logged-in user" widget, quick create a task, today's and overdue tasks. Designed once the Schedule is approved and built.
