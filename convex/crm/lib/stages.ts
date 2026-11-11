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

/** Login roles (D-014: a person can hold several). Installers do not log in (D-010). */
export const ROLES = ["admin", "sales", "office", "pm"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", sales: "Sales", office: "Office Team", pm: "Project Manager" };
/** Roles that may add and change clients, requests and notes. Project Managers can look but not change, for now (D-046). */
export const EDIT_ROLES: readonly Role[] = ["admin", "sales", "office"];

export const PIPELINES = ["Sales", "Preplanning"] as const;
export type Pipeline = (typeof PIPELINES)[number];

export const CLIENT_TYPES = ["homeowner", "contractor"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const CLIENT_TYPE_LABEL: Record<ClientType, string> = { homeowner: "Homeowner", contractor: "Contractor" };

export const CLIENT_STATUSES = ["lead", "active", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = { lead: "Lead", active: "Active", archived: "Archived" };

/** The Clients list's Status filter (D-041). */
/** The tags a client can carry, as in Jobber. */
export const CLIENT_TAGS = ["Company", "Homeowner", "Partner Contractor", "Sub-Contractor"] as const;

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

/** Quote statuses (D-056), in the order Jobber lists them. Stored on the quote, unlike a request's. */
export const QUOTE_STATUSES = ["Draft", "Awaiting response", "Changes requested", "Approved", "Rejected", "Converted", "Archived"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
/** The four that the Overview card counts; Converted and Archived are not "open" any more. */
export const QUOTE_OPEN_STATUSES = ["Draft", "Awaiting response", "Changes requested", "Approved"] as const;

/* Sales pipeline board (D-061). The board's open columns, grouped as Jobber groups them. Closed Won and Closed Lost are a third
   group, CLOSED_STAGES, below; they are also listed under Sales Outcomes. */
export const PIPELINE_GROUPS = {
  Requests: ["New Request", "Schedule Onsite Consultation", "Onsite Consultation"],
  Quotes: [
    "Quote Draft & Site Plan / Design",
    "Proposal Delivered — Awaiting Response",
    "Changes Requested",
    "Quotes Approved — Contract Out for Signature",
  ],
} as const satisfies Record<string, readonly string[]>;
export type PipelineGroup = keyof typeof PIPELINE_GROUPS;

/** The board's third group: projects that are won or lost, as two columns (D-061). Not editable in Edit Stages. */
export const CLOSED_STAGES = ["Closed Won", "Closed Lost"] as const;
export type BoardGroup = PipelineGroup | "Closed";

/** Jobber's lead sources. A project with none shows as "No source". */
export const LEAD_SOURCES = ["Existing Client", "Facebook", "Flyer", "Google", "Instagram", "Other", "Referral", "Vehicle Wrap"] as const;
export const NO_SOURCE = "No source";

type MoveResult = { ok: true } | { ok: false; error: string };

/** Pure rules for moving a project between Sales stages. `custom` is the business's own extra stage names. */
export function checkMove(from: string, to: string, opts: { isAdmin: boolean; reason?: string; custom?: readonly string[] }): MoveResult {
  const known = new Set<string>([...SALES_STAGES, ...(opts.custom ?? [])]);
  if (!known.has(from)) return { ok: false, error: `"${from}" is not a Sales stage.` };
  if (!known.has(to)) return { ok: false, error: `"${to}" is not a Sales stage.` };
  if (from === to) return { ok: false, error: `The project is already in "${to}".` };
  const closed = (s: string) => s === "Closed Won" || s === "Closed Lost";
  if (closed(from) && !opts.isAdmin) return { ok: false, error: "Only an Admin can reopen a closed project." };
  if (to === "Closed Lost" && !(opts.reason ?? "").trim()) return { ok: false, error: "Say why the project was lost." };
  // Closed Won is checked against the project's quote, in applyMove (convex/crm/pipeline.ts): it needs a signed quote, for everyone.
  return { ok: true };
}

/** How long a project has been in its stage. Projects from before stage times were kept count from when they were requested. */
export function timeInStage(stageEnteredAt: number | undefined, requestedAt: number, now: number): number {
  return Math.max(0, now - (stageEnteredAt ?? requestedAt));
}
