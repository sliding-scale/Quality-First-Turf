/* A job's status (design 2026-11-19-jobs). Computed from the project's records every time it is read, never stored (CRM rule 7). Pure
   TypeScript, no Convex or React imports, so the backend and the screens agree. The rules are tried in the order of JOB_STATUSES. */

export const JOB_STATUSES = ["Archived", "Requires Invoicing", "Late", "Unscheduled", "Today", "Upcoming", "Active"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
/** The Status filter's extra choice: not a status of its own, but jobs whose last visit falls in the next 30 days. */
export const ENDING_SOON = "Ending within 30 days";

export type JobFacts = {
  /** The project was archived, or the job was closed by hand (Jobber shows both as Archived). */
  archived: boolean;
  closed: boolean;
  /** The project has reached the Finance pipeline (construction signed off). */
  inFinance: boolean;
  /** The sent invoices cover the billing total (`projectMoney(...).covered`). */
  invoicesCover: boolean;
  visits: { start: number; status: "upcoming" | "completed" | "confirmed" | "lost" }[];
  /** Start of the business-local day, in ms. */
  dayStart: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function jobStatusOf(f: JobFacts): JobStatus {
  if (f.archived || f.closed) return "Archived";
  if (f.inFinance && !f.invoicesCover) return "Requires Invoicing";
  const live = f.visits.filter((v) => v.status !== "lost");
  const open = live.filter((v) => v.status === "upcoming" || v.status === "confirmed");
  if (open.some((v) => v.start < f.dayStart)) return "Late";
  if (live.length === 0) return "Unscheduled";
  if (open.some((v) => v.start >= f.dayStart && v.start < f.dayStart + DAY_MS)) return "Today";
  if (open.some((v) => v.start >= f.dayStart + DAY_MS)) return "Upcoming";
  return "Active";
}
