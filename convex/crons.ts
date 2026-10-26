import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("purge expired sales sessions", { hours: 1 }, internal.sales.mutations.purgeExpired, {});

export default crons;
