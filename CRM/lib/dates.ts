/* Date ranges for list filters (D-041). A range is picked from a fixed list, or typed in as a custom range. */

export type RangeKey = "all" | "last-week" | "last-30" | "last-month" | "this-month" | "this-year" | "last-12" | "custom";

/** `from` and `to` are yyyy-mm-dd strings, used only by "custom". Either may be empty (open-ended). */
export type DateRange = { key: RangeKey; from?: string; to?: string };

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "last-week", label: "Last week" },
  { key: "last-30", label: "Last 30 days" },
  { key: "last-month", label: "Last month" },
  { key: "this-month", label: "This month" },
  { key: "this-year", label: "This year" },
  { key: "last-12", label: "Last 12 months" },
  { key: "custom", label: "Custom range" },
];

export const ALL_TIME: DateRange = { key: "all" };

export const rangeLabel = (r: DateRange) => RANGE_OPTIONS.find((o) => o.key === r.key)?.label ?? "All";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function parse(s: string | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** The first and last day of a range (inclusive). null means open on that side. */
export function rangeBounds(r: DateRange, today: Date = new Date()): { from: Date | null; to: Date | null } {
  const t = startOfDay(today);
  switch (r.key) {
    case "all":
      return { from: null, to: null };
    case "last-week": {
      // The previous calendar week, Sunday to Saturday.
      const start = addDays(t, -(t.getDay() + 7));
      return { from: start, to: addDays(start, 6) };
    }
    case "last-30":
      return { from: addDays(t, -30), to: null };
    case "last-month":
      return { from: new Date(t.getFullYear(), t.getMonth() - 1, 1), to: new Date(t.getFullYear(), t.getMonth(), 0) };
    case "this-month":
      return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: null };
    case "this-year":
      return { from: new Date(t.getFullYear(), 0, 1), to: null };
    case "last-12":
      return { from: new Date(t.getFullYear() - 1, t.getMonth(), t.getDate()), to: null };
    case "custom":
      return { from: parse(r.from), to: parse(r.to) };
  }
}

/** Is a date that many days ago inside the range? */
export function daysAgoInRange(daysAgo: number, r: DateRange, today: Date = new Date()): boolean {
  const { from, to } = rangeBounds(r, today);
  const d = addDays(startOfDay(today), -daysAgo);
  return (!from || d >= from) && (!to || d <= to);
}
