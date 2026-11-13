import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("purge expired sales sessions", { hours: 1 }, internal.sales.mutations.purgeExpired, {});

crons.interval(
  "sync consultations from Jobber",
  { minutes: 10 },
  internal.projects.consultation.syncAll,
  {},
);

// Read-only. Pulls new Inbox and Sent mail for office@qualityfirstturf.com and keeps filling history while any remains (D-064).
crons.interval("sync Zoho mailbox into client profiles", { minutes: 3 }, internal.crm.zohoMailSync.syncBatch, {});

// Pipeline automations (D-065): quote follow-ups and auto-archive. Sends nothing and changes nothing while a business is in "log only" mode.
crons.interval("run pipeline automations", { minutes: 15 }, internal.crm.automations.tick, {});

// Custom automations an Admin built (D-071). Same sending mode as above: nothing is sent or changed while a business is "log only".
crons.interval("run custom automations", { minutes: 15 }, internal.crm.customAutomations.tick, {});

// Zoho Calendar mirror (D-069): reads each connected person's calendar and sends what the CRM has changed. Does nothing until someone connects.
crons.interval("mirror Zoho calendars", { minutes: 5 }, internal.crm.calendarSync.pullAll, {});

export default crons;
