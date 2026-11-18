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

/** Construction pipeline stages, verbatim from the PRD. The last one is refused until customer sign-off exists (rule 5). */
export const CONSTRUCTION_STAGES = [
  "Ready to Start",
  "PM Job Walk & Mark-up",
  "20% Completed",
  "40% Completed",
  "60% Completed",
  "80% Completed",
  "PM Job Walk with Client",
  "Punch List / Corrections Needed",
  "100% Completed & Sign-off",
] as const;

/** Finance pipeline stages, verbatim from the PRD (5.1). A project enters at the first one once the customer has signed off (design 2026-11-18). */
export const FINANCE_STAGES = [
  "Send Final Invoice",
  "Pending Final Payment",
  "Final Payment Received",
  "Get Client Review",
  "Consolidate Files",
  "Archive",
] as const;
export const FINANCE_ENTRY = FINANCE_STAGES[0];
/** Moving here needs the project fully paid. */
export const FINANCE_PAID_STAGE = "Final Payment Received";

/** The construction stage that needs resolved punch items and a customer sign-off. */
export const COMPLETION_STAGE = "100% Completed & Sign-off";

/** Login roles (D-014: a person can hold several). Installers log in too, as the PRD says (D-090). */
export const ROLES = ["admin", "sales", "office", "pm", "installer"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", sales: "Sales", office: "Office Team", pm: "Project Manager", installer: "Installer" };
/** Roles that may add and change clients, requests and notes. Project Managers can look but not change, for now (D-046). */
export const EDIT_ROLES: readonly Role[] = ["admin", "sales", "office"];

export const PIPELINES = ["Sales", "Preplanning", "Construction", "Finance"] as const;
export type Pipeline = (typeof PIPELINES)[number];
/** The pipelines after Sales. */
export const WORK_PIPELINES = ["Preplanning", "Construction", "Finance"] as const;
export type WorkPipeline = (typeof WORK_PIPELINES)[number];

/** The stage names of one pipeline, in board order. An unknown pipeline reads as Sales. */
export function stagesOf(pipeline: string): readonly string[] {
  if (pipeline === "Preplanning") return PREPLANNING_STAGES;
  if (pipeline === "Construction") return CONSTRUCTION_STAGES;
  if (pipeline === "Finance") return FINANCE_STAGES;
  return SALES_STAGES;
}

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
  // A project that has moved on to Preplanning or Construction is still the request it came from, and is Converted (D-080).
  if (isWorkStage(stage)) return "Converted";
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
export const LEAD_SOURCES = ["Existing Client", "Facebook", "Flyer", "Forms", "Google", "Instagram", "Other", "Referral", "Vehicle Wrap"] as const;
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

/** Pure rules for moving a project inside Preplanning or Construction. `signOff` is true only once the customer has signed off
 *  and every required punch item is resolved; until that exists the server passes false and the last stage is refused. */
export function checkWorkMove(pipeline: WorkPipeline, from: string, to: string, opts: { signOff?: boolean } = {}): MoveResult {
  const stages = stagesOf(pipeline);
  if (!stages.includes(from)) return { ok: false, error: `"${from}" is not a ${pipeline} stage.` };
  if (!stages.includes(to)) return { ok: false, error: `"${to}" is not a ${pipeline} stage.` };
  if (from === to) return { ok: false, error: `The project is already in "${to}".` };
  if (to === COMPLETION_STAGE && !opts.signOff) {
    return { ok: false, error: "100% Completed & Sign-off needs the customer's sign-off, and every required punch item resolved." };
  }
  return { ok: true };
}

/** True for a stage of Preplanning or Construction. Their names are locked, so a custom Sales stage can never share one. */
export function isWorkStage(stage: string): boolean {
  return (PREPLANNING_STAGES as readonly string[]).includes(stage) || (CONSTRUCTION_STAGES as readonly string[]).includes(stage) || (FINANCE_STAGES as readonly string[]).includes(stage);
}

/** Whether a project is shown as a request: every Sales project, and every won project, whichever pipeline it has moved to since (D-080). */
export function isRequest(p: { pipeline: string; outcome?: "won" | "lost" }): boolean {
  return p.pipeline === "Sales" || p.outcome === "won";
}

/** How long a project has been in its stage. Projects from before stage times were kept count from when they were requested. */
export function timeInStage(stageEnteredAt: number | undefined, requestedAt: number, now: number): number {
  return Math.max(0, now - (stageEnteredAt ?? requestedAt));
}
