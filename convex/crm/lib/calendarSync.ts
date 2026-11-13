/* Zoho Calendar mirror (D-069): the pure rules. CRM item to Zoho event and back, dates, repeats, change detection, search windows.
   No Convex, no fetch: the backend and the tests use this file. All times are milliseconds; Zoho's are text. */

import { BUSINESS_TZ, zonedToMs, type Repeat } from "./schedule";

export const SYNC_TYPE_KEYS = ["tasks", "reminders", "events", "visits", "consultations"] as const;
export type SyncTypes = Record<(typeof SYNC_TYPE_KEYS)[number], boolean>;
/** Jobber's choices for what to send (its "unassigned" and "assigned to everyone" do not apply: a mirrored item belongs to a person). */
export const DEFAULT_SYNC_TYPES: SyncTypes = { tasks: true, reminders: true, events: true, visits: true, consultations: true };
export const SYNC_TYPE_LABEL: Record<keyof SyncTypes, string> = { tasks: "Tasks", reminders: "Reminders", events: "Events", visits: "Follow-up visits", consultations: "Consultations" };

export type ItemKind = "consultation" | "visit" | "event" | "reminder" | "task";
const TYPE_KEY: Record<ItemKind, keyof SyncTypes> = { consultation: "consultations", visit: "visits", event: "events", reminder: "reminders", task: "tasks" };
export const syncsKind = (types: SyncTypes, kind: ItemKind): boolean => types[TYPE_KEY[kind]];

/** The part of an item both calendars hold. */
export type Mirrored = {
  title: string;
  start: number;
  end: number;
  anytime: boolean;
  notes: string;
  repeat: Repeat;
  repeatUntil?: number;
  location: string;
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** `yyyyMMdd'T'HHmmss'Z'` (GMT), the way Zoho takes a timed event. */
export function zohoUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** The local calendar date in a time zone, `yyyyMMdd`, for all-day events and search ranges. */
export function zohoDay(ms: number, tz = BUSINESS_TZ): string {
  const o: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms)) o[p.type] = p.value;
  return `${o.year}${o.month}${o.day}`;
}

/** Reads Zoho's date text: `yyyyMMdd'T'HHmmss'Z'`, the same with an offset (`+0200`), or an all-day `yyyyMMdd` (local midnight in `tz`). */
export function parseZohoTime(text: string, tz = BUSINESS_TZ): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?)?$/.exec(text.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] === undefined) return zonedToMs(y, mo, d, 0, 0, tz);
  const base = Date.UTC(y, mo - 1, d, Number(m[4]), Number(m[5]), Number(m[6]));
  const zone = m[7];
  if (!zone || zone === "Z") return m[7] === undefined ? zonedToMs(y, mo, d, Number(m[4]), Number(m[5]), tz) : base;
  const sign = zone[0] === "-" ? -1 : 1;
  return base - sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5))) * 60_000;
}

/* ---- Repeats ---- */

export function repeatToRrule(repeat: Repeat, until?: number): string | undefined {
  if (repeat === "none") return undefined;
  const base = repeat === "daily" ? "FREQ=DAILY;INTERVAL=1" : repeat === "weekdays" ? "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR" : repeat === "weekly" ? "FREQ=WEEKLY;INTERVAL=1" : "FREQ=MONTHLY;INTERVAL=1";
  return until === undefined ? base : `${base};UNTIL=${zohoUtc(until)}`;
}

/** The CRM's four repeats are the only ones it can hold. Anything else from Zoho (every 2 weeks, a certain weekday, a count) comes back as
 *  `lossy`: the first occurrence is kept as a one-off and the series stays in Zoho. */
export function rruleToRepeat(rrule: string | undefined): { repeat: Repeat; until?: number; lossy: boolean } {
  if (!rrule) return { repeat: "none", lossy: false };
  const parts = Object.fromEntries(rrule.replace(/^RRULE:/i, "").split(";").map((p) => p.split("=") as [string, string]));
  const interval = Number(parts.INTERVAL ?? 1);
  const until = parts.UNTIL ? parseZohoTime(parts.UNTIL) ?? undefined : undefined;
  if (parts.COUNT || interval !== 1) return { repeat: "none", lossy: true };
  if (parts.FREQ === "DAILY" && !parts.BYDAY) return { repeat: "daily", until, lossy: false };
  if (parts.FREQ === "MONTHLY" && !parts.BYDAY && !parts.BYMONTHDAY && !parts.BYSETPOS) return { repeat: "monthly", until, lossy: false };
  if (parts.FREQ === "WEEKLY") {
    const days = (parts.BYDAY ?? "").split(",").filter(Boolean).sort().join(",");
    if (days === "FR,MO,TH,TU,WE") return { repeat: "weekdays", until, lossy: false };
    if (days === "") return { repeat: "weekly", until, lossy: false };
  }
  return { repeat: "none", lossy: true };
}

/* ---- The two directions ---- */

const NOTES_MARK = "\n\n— Launchpad: ";

/** The CRM item as Zoho's `eventdata`. A line at the end links back to the item; `notesFromZoho` takes it off again. */
export function toZohoEvent(m: Mirrored, link: string | null, tz = BUSINESS_TZ): Record<string, unknown> {
  const data: Record<string, unknown> = {
    title: m.title,
    isallday: m.anytime,
    dateandtime: m.anytime
      ? { timezone: tz, start: zohoDay(m.start, tz), end: zohoDay(Math.max(m.end, m.start + 86_400_000), tz) }
      : { timezone: tz, start: zohoUtc(m.start), end: zohoUtc(m.end) },
    description: `${m.notes}${link ? `${NOTES_MARK}${link}` : ""}`.slice(0, 10_000),
    location: m.location.slice(0, 255),
    transparency: 0,
  };
  const rrule = repeatToRrule(m.repeat, m.repeatUntil);
  if (rrule) data.rrule = rrule;
  return data;
}

export function notesFromZoho(description: string | undefined): string {
  const text = (description ?? "").replace(/\r\n/g, "\n");
  const at = text.lastIndexOf(NOTES_MARK);
  return (at === -1 ? text : text.slice(0, at)).trim();
}

export type ZohoEvent = {
  uid: string;
  etag: string;
  title?: string;
  description?: string;
  location?: string;
  isallday?: boolean;
  start?: string;
  end?: string;
  dateandtime?: { timezone?: string; start?: string; end?: string };
  rrule?: string;
  lastmodifiedtime?: string;
};

/** A Zoho event as the CRM fields. null when its time cannot be read. */
export function fromZohoEvent(e: ZohoEvent, tz = BUSINESS_TZ): (Mirrored & { lossy: boolean }) | null {
  const zone = e.dateandtime?.timezone || tz;
  const startText = e.dateandtime?.start ?? e.start;
  const endText = e.dateandtime?.end ?? e.end;
  if (!startText || !endText) return null;
  const anytime = e.isallday === true || /^\d{8}$/.test(startText);
  const start = parseZohoTime(startText, zone);
  let end = parseZohoTime(endText, zone);
  if (start === null || end === null) return null;
  if (end <= start) end = anytime ? start + 86_400_000 : start + 30 * 60_000;
  const r = rruleToRepeat(e.rrule);
  return { title: (e.title ?? "").trim() || "(No title)", start, end, anytime, notes: notesFromZoho(e.description), repeat: r.repeat, repeatUntil: r.until, location: e.location ?? "", lossy: r.lossy };
}

/** A short fingerprint of the mirrored fields, to tell whether one side changed since the last time they matched. */
export function fieldsHash(m: Mirrored): string {
  const s = JSON.stringify([m.title.trim(), m.start, m.end, m.anytime, m.notes.trim(), m.repeat, m.repeatUntil ?? null, m.location.trim()]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Zoho times are not worth comparing to the second, and Zoho keeps its own notes and location, so the hash of a Zoho event ignores nothing
 *  that the CRM stores. */
export const zohoHash = (e: ZohoEvent): string | null => {
  const f = fromZohoEvent(e);
  return f ? fieldsHash(f) : null;
};

/** When both sides changed since they last matched, the later change wins. Times are the CRM item's last change and Zoho's `lastmodifiedtime`. */
export function whoWins(crmChangedAt: number, zohoModified: string | undefined): "crm" | "zoho" {
  const z = zohoModified ? parseZohoTime(zohoModified) : null;
  return z !== null && z > crmChangedAt ? "zoho" : "crm";
}

/** Search windows no longer than Zoho allows (31 days), as `yyyyMMdd` pairs, covering [from, to]. */
export function searchWindows(from: number, to: number, tz = BUSINESS_TZ, days = 28): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (let at = from; at < to; at += days * 86_400_000) out.push({ start: zohoDay(at, tz), end: zohoDay(Math.min(at + (days - 1) * 86_400_000, to), tz) });
  return out;
}
