"use client";

/* Jobs (design 2026-11-19-jobs). The backend (convex/crm/jobs.ts) works out every status, total and count; this file only asks for them and
   holds the colours and the filter list the screens share. */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ENDING_SOON, JOB_STATUSES, type JobStatus } from "@/convex/crm/lib/jobStatus";
import { startOfToday, useKept } from "./clients";

export { ENDING_SOON, JOB_STATUSES, type JobStatus };

/** Jobber's dots: red for what is late, amber for what needs attention, green for work on its way, grey for closed. */
export const JOB_DOT: Record<JobStatus, string> = {
  Archived: "var(--muted)", "Requires Invoicing": "var(--orange)", Late: "var(--red)", Unscheduled: "var(--orange)", Today: "var(--green)", Upcoming: "var(--green)", Active: "var(--green)",
};
export const JOB_PILL: Record<JobStatus, string> = {
  Archived: "draft", "Requires Invoicing": "consult", Late: "overdue", Unscheduled: "consult", Today: "active", Upcoming: "active", Active: "active",
};

/** What the Status filter offers, in Jobber's order. Action Required and On Hold are shown greyed: nothing in Launchpad sets them yet. */
export const JOB_FILTERS: { label: string; disabled?: boolean }[] = [
  { label: "All" },
  { label: ENDING_SOON },
  { label: "Late" },
  { label: "Requires Invoicing" },
  { label: "Action Required", disabled: true },
  { label: "Unscheduled" },
  { label: "Active" },
  { label: "Today" },
  { label: "Upcoming" },
  { label: "On Hold", disabled: true },
  { label: "Archived" },
];

export function useJobs(businessId: Id<"businesses">, status: string, search: string, page: number) {
  return useKept(useQuery(api.crm.jobs.list, { businessId, ...(status !== "All" ? { status } : {}), search, page, dayStart: startOfToday() }));
}
export function useJobCounts(businessId: Id<"businesses">) {
  return useKept(useQuery(api.crm.jobs.counts, { businessId, dayStart: startOfToday() }));
}
export function useJob(id: string | undefined) {
  return useQuery(api.crm.jobs.get, id ? { id: id as Id<"opportunities">, dayStart: startOfToday() } : "skip");
}
