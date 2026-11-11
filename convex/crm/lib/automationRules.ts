/* Pipeline automations (D-065): Jobber's four, fixed. Pure rules and wording only (no Convex, no React), so the Next app and the
   tests import this file too. The four cannot be added to or deleted; staff change the days, the message and on/off. */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const AUTOMATION_KEYS = ["quoteArchive", "quoteFollowUp5", "quoteFollowUp2", "requestArchive"] as const;
export type AutomationKey = (typeof AUTOMATION_KEYS)[number];

export type AutomationDef = {
  title: string;
  group: "Quotes" | "Requests";
  target: "quote" | "request";
  action: "archive" | "email";
  defaultDays: number;
  /** "And only if", in Jobber's words. */
  onlyIf: string;
  /** The picture the card and panel show: what starts the clock. */
  startsFrom: "quotes are sent" | "requests are created";
};

export const AUTOMATIONS: Record<AutomationKey, AutomationDef> = {
  quoteArchive: {
    title: "Auto-archive Quotes", group: "Quotes", target: "quote", action: "archive", defaultDays: 90,
    onlyIf: "Status is awaiting response, changes requested, or approved", startsFrom: "quotes are sent",
  },
  quoteFollowUp5: {
    title: "Follow-up with clients 5 days after quotes are sent", group: "Quotes", target: "quote", action: "email", defaultDays: 5,
    onlyIf: "Status is awaiting response", startsFrom: "quotes are sent",
  },
  quoteFollowUp2: {
    title: "Follow-up with clients 2 days after quotes are sent", group: "Quotes", target: "quote", action: "email", defaultDays: 2,
    onlyIf: "Status is awaiting response", startsFrom: "quotes are sent",
  },
  requestArchive: {
    title: "Auto-archive Requests", group: "Requests", target: "request", action: "archive", defaultDays: 90,
    onlyIf: "Status is not converted or archived", startsFrom: "requests are created",
  },
};

/** A title that follows the day count, as Jobber's does ("Follow-up with clients 5 days after quotes are sent"). */
export function automationTitle(key: AutomationKey, days: number): string {
  if (AUTOMATIONS[key].action === "archive") return AUTOMATIONS[key].title;
  return `Follow-up with clients ${days} day${days === 1 ? "" : "s"} after quotes are sent`;
}

export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

/** Quote statuses each automation acts on. */
export const QUOTE_ARCHIVE_STATUSES: readonly string[] = ["Awaiting response", "Changes requested", "Approved"];
export const QUOTE_FOLLOW_UP_STATUSES: readonly string[] = ["Awaiting response"];
/** A quote in one of these was left unanswered, so archiving it also closes its project as lost (user, 2026-11-11). */
export const QUOTE_UNANSWERED_STATUSES: readonly string[] = ["Awaiting response", "Changes requested"];

export const DEFAULT_COMPANY_PHONE = "+19095617291";

/* ---- Message wording (Jobber's, kept) ---- */

export const DEFAULT_SUBJECT = "Following up on quote {{QUOTE_NUMBER}}";
export const DEFAULT_BODY = `Hi {{CLIENT_FIRST_NAME}},

We just wanted to send a quick note to see if you had a chance to look at the quote we sent recently? We're happy to answer any questions you might have.

We're excited to get to work, so if you'd like to proceed let us know and we can get started!

Thanks,

{{COMPANY_NAME}}
{{DEFAULT_PHONE}}`;
export const DEFAULT_TEXT = "Hi {{CLIENT_FIRST_NAME}}, just a quick note that you have a quote from {{COMPANY_NAME}}.";

export const VARIABLES = ["CLIENT_FIRST_NAME", "CLIENT_NAME", "COMPANY_NAME", "DEFAULT_PHONE", "QUOTE_NUMBER"] as const;
export type TemplateVars = Record<(typeof VARIABLES)[number], string>;

const VARIABLE = /\{\{\s*([A-Z_]+)\s*\}\}/g;

/** Variable names used in a template that the CRM does not know. */
export function unknownVariables(template: string): string[] {
  const known = new Set<string>(VARIABLES);
  const bad = new Set<string>();
  for (const m of template.matchAll(VARIABLE)) if (!known.has(m[1])) bad.add(m[1]);
  return [...bad];
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(VARIABLE, (whole, name: string) => (name in vars ? vars[name as keyof TemplateVars] : whole));
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email as HTML: the body's paragraphs and line breaks, then a button-style link to the quote the way Jobber's follow-up has one. */
export function followUpHtml(body: string, quoteUrl: string | null): string {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const link = quoteUrl === null ? "" : `<p style="margin:0 0 14px"><a href="${escapeHtml(quoteUrl)}" style="display:inline-block;padding:10px 18px;background:#3d8b1f;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">View your quote</a></p>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1d2b33">${paragraphs}${link}</div>`;
}

export const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
export const isEmail = (s: string) => EMAIL_PATTERN.test(s.trim());

/* ---- When something is due ---- */

/** Due when the clock started after the automation was turned on and `days` have passed. `startedAt` is sentAt for a quote and the
 *  request date for a request. Anything from before the automation was turned on is left alone (user, 2026-11-11). */
export function isDue(startedAt: number | undefined, activeSince: number, days: number, now: number): boolean {
  if (startedAt === undefined || startedAt < activeSince) return false;
  return now - startedAt >= days * DAY_MS;
}

export type RunStatus = "queued" | "sent" | "tested" | "logged" | "skipped" | "failed" | "archived";
export type Mode = "log" | "test" | "live";
export const MODES: readonly Mode[] = ["log", "test", "live"];
export const MODE_LABEL: Record<Mode, string> = { log: "Log only", test: "Test address", live: "Live" };

export const MAX_ATTEMPTS = 3;
/** A queued row whose send never finished (the server restarted mid-send) is picked up again after this long. */
export const STUCK_AFTER_MS = 60 * 60 * 1000;

export type RunRow = { _id: string; status: RunStatus; attempts: number; at: number };

/** What to do about one item (a quote or request) for one automation, given its existing run row, if any. One row per item and
 *  automation, ever: it is reused, never duplicated, so nobody is emailed twice. A "logged" row (a preview) and a "tested" row (a send to
 *  the test address) do not count as done, so turning the mode up later still does the real thing once. */
export function decide(row: RunRow | null, mode: Mode, now: number): { action: "skip" } | { action: "new" } | { action: "reuse"; id: string; attempts: number } {
  if (row === null) return { action: "new" };
  switch (row.status) {
    case "sent": case "archived": case "skipped": return { action: "skip" };
    case "queued": return now - row.at > STUCK_AFTER_MS ? { action: "reuse", id: row._id, attempts: row.attempts } : { action: "skip" };
    case "failed": return row.attempts >= MAX_ATTEMPTS ? { action: "skip" } : { action: "reuse", id: row._id, attempts: row.attempts };
    case "logged": return mode === "log" ? { action: "skip" } : { action: "reuse", id: row._id, attempts: row.attempts };
    case "tested": return mode === "live" ? { action: "reuse", id: row._id, attempts: row.attempts } : { action: "skip" };
  }
}

/** "Archived automatically after 3 months of unresponsiveness" for the usual 90 days. */
export function unresponsiveReason(days: number): string {
  const span = days % 30 === 0 ? `${days / 30} month${days === 30 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"}`;
  return `Archived automatically after ${span} of unresponsiveness`;
}
