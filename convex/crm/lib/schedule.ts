/* Schedule rules (D-062): item types, overlap and double-booking, working hours and repeats. Pure TypeScript, shared by the backend and the
   app, so no Convex or React imports. All times are milliseconds; "local" means the business's time zone. */

/** The business time zone, for every time the Schedule shows or reads. */
export const BUSINESS_TZ = "America/Los_Angeles";

export const ITEM_TYPES = ["consultation", "visit", "event", "reminder"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const ITEM_LABEL: Record<ItemType | "task", string> = { consultation: "Consultation", visit: "Follow-up visit", event: "Event", reminder: "Reminder", task: "Task" };

/** Items that keep a person busy: two of them for the same person may not overlap. Tasks and reminders never block. */
export const BLOCKING: readonly ItemType[] = ["consultation", "visit", "event"];

export const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
export type Repeat = (typeof REPEATS)[number];
export const REPEAT_LABEL: Record<Repeat, string> = { none: "Does not repeat", daily: "Every day", weekdays: "Every weekday", weekly: "Every week", monthly: "Every month" };

/** Stored statuses. "Overdue" is worked out (not completed, and over), never stored. */
export const STATUSES = ["upcoming", "completed", "confirmed"] as const;
export type ItemStatus = (typeof STATUSES)[number];

export type Span = { start: number; end: number };
export type Occurrence = Span & { /** Calendar days since the first occurrence, so an occurrence has a stable key. */ occurrence: number };

const DAY = 86_400_000;
const MINUTE = 60_000;

/** Half open: an item that ends at 10:00 and one that starts at 10:00 do not overlap. */
export const overlaps = (a: Span, b: Span): boolean => a.start < b.end && b.start < a.end;

export function findConflicts<T extends Span & { id: string }>(candidate: Span, existing: readonly T[], ignoreId?: string): T[] {
  return existing.filter((e) => e.id !== ignoreId && overlaps(candidate, e));
}

type Parts = { y: number; m: number; d: number; h: number; min: number; dow: number };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const formatters = new Map<string, Intl.DateTimeFormat>();

function partsOf(ms: number, tz: string): Parts {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
    formatters.set(tz, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), h: Number(o.hour) % 24, min: Number(o.minute), dow: WEEKDAYS.indexOf(o.weekday) };
}

/** The moment at which the local clock in `tz` reads the given date and time. */
export function zonedToMs(y: number, m: number, d: number, h: number, min: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const offset = (t: number) => {
    const p = partsOf(t, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(t / MINUTE) * MINUTE;
  };
  const first = guess - offset(guess);
  return guess - offset(first); // a second pass settles the hour the clocks change
}

/** yyyy-mm-dd of a moment, in the business's time zone. */
export function dayKey(ms: number, tz: string): string {
  const p = partsOf(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Local minutes after midnight, and the weekday (0 is Sunday), of a moment. */
export function localClock(ms: number, tz: string): { minutes: number; dow: number } {
  const p = partsOf(ms, tz);
  return { minutes: p.h * 60 + p.min, dow: p.dow };
}

/** The occurrences of an item that touch `[from, to)`. A repeat keeps its local clock time across daylight saving. */
export function expandRepeats(item: Span & { repeat: Repeat; repeatUntil?: number }, from: number, to: number, tz: string): Occurrence[] {
  if (item.repeat === "none") return item.start < to && item.end > from ? [{ start: item.start, end: item.end, occurrence: 0 }] : [];
  const first = partsOf(item.start, tz);
  const duration = item.end - item.start;
  const firstDay = Date.UTC(first.y, first.m - 1, first.d);
  const lo = partsOf(from - duration - DAY, tz);
  const hi = partsOf(to, tz);
  const out: Occurrence[] = [];
  for (let day = Math.max(firstDay, Date.UTC(lo.y, lo.m - 1, lo.d)); day <= Date.UTC(hi.y, hi.m - 1, hi.d); day += DAY) {
    const date = new Date(day);
    const dow = date.getUTCDay();
    const applies =
      item.repeat === "daily" ||
      (item.repeat === "weekdays" && dow >= 1 && dow <= 5) ||
      (item.repeat === "weekly" && dow === first.dow) ||
      (item.repeat === "monthly" && date.getUTCDate() === first.d);
    if (!applies) continue;
    const start = zonedToMs(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), first.h, first.min, tz);
    if (start < item.start || (item.repeatUntil !== undefined && start > item.repeatUntil)) continue;
    const end = start + duration;
    if (start < to && end > from) out.push({ start, end, occurrence: Math.round((day - firstDay) / DAY) });
  }
  return out;
}

/** Working days (0 is Sunday) and the hours, as minutes after midnight. */
export type WorkingHours = { days: number[]; startMin: number; endMin: number };
export const DEFAULT_HOURS: WorkingHours = { days: [1, 2, 3, 4, 5], startMin: 8 * 60, endMin: 17 * 60 };

/** True when the whole span is on one working day, between the working hours. */
export function inWorkingHours(span: Span, hours: WorkingHours, tz: string): boolean {
  if (dayKey(span.start, tz) !== dayKey(span.end - 1, tz)) return false;
  const s = localClock(span.start, tz);
  const e = localClock(span.end - 1, tz);
  return hours.days.includes(s.dow) && s.minutes >= hours.startMin && e.minutes + 1 <= hours.endMin;
}
