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

export default crons;
