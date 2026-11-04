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

export default crons;
