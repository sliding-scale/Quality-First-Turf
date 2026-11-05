/* Stage names, request statuses and client statuses, in one place (CRM/CLAUDE.md: "use those names verbatim as constants
   in one place"). Pure TypeScript: the Next app imports this file too, so no Convex or React imports here. */

// Sales pipeline stages, verbatim from the PRD.
export const SALES_STAGES = [
  "New Request",
  "Schedule Onsite Consultation",
  "Onsite Consultation",
  "Quote Draft & Site Plan / Design",
  "Proposal Delivered — Awaiting Response",
  "Changes Requested",
  "Quotes Approved — Contract Out for Signature",
  "Closed Won",
  "Closed Lost",
] as const;

export const PREPLANNING_STAGES = [
  "Ready for Preplanning",
  "Contract & Scope of Work Review",
  "Material Takeoff & Availability",
  "Installer Work Package",
  "Crew Alignment & Hold",
  "Schedule & Access Confirmation",
  "Order & Schedule Delivery for Materials",
  "Ready for Construction / Installs Scheduled",
] as const;

export const PIPELINES = ["Sales", "Preplanning"] as const;
export type Pipeline = (typeof PIPELINES)[number];

export const CLIENT_TYPES = ["homeowner", "contractor"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const CLIENT_TYPE_LABEL: Record<ClientType, string> = { homeowner: "Homeowner", contractor: "Contractor" };

export const CLIENT_STATUSES = ["lead", "active", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = { lead: "Lead", active: "Active", archived: "Archived" };

/** The Clients list's Status filter (D-041). */
export const CLIENT_STATUS_FILTERS = ["All", "Leads and Active", "Leads", "Active", "Archived"] as const;
export type ClientStatusFilter = (typeof CLIENT_STATUS_FILTERS)[number];

export function matchesClientStatusFilter(status: ClientStatus, filter: ClientStatusFilter): boolean {
  switch (filter) {
    case "Leads and Active": return status !== "archived";
    case "Leads": return status === "lead";
    case "Active": return status === "active";
    case "Archived": return status === "archived";
    default: return true;
  }
}

/** A request is a Sales project seen through its stage (D-039); its status is derived, never stored. */
export const REQUEST_STATUSES = ["New", "Overdue", "Consultation", "Converted", "Lost"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** A New Request still untouched after this many days counts as Overdue. Our assumption; the PRD gives no number. */
export const OVERDUE_AFTER_DAYS = 21;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** `now` is passed in (queries must not read the clock), as the start of today or the current time. */
export function requestStatus(stage: string, requestedAt: number, now: number): RequestStatus {
  const index = (SALES_STAGES as readonly string[]).indexOf(stage);
  if (index <= 0) return now - requestedAt > OVERDUE_AFTER_DAYS * DAY_MS ? "Overdue" : "New";
  if (index <= 2) return "Consultation"; // Schedule Onsite Consultation, Onsite Consultation
  if (stage === "Closed Lost") return "Lost";
  return "Converted"; // quoting, proposal, contract, Closed Won: the request became a real project
}
