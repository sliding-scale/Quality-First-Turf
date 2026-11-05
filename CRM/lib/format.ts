/* Display helpers, ported unchanged from the approved mockups. */

export const money = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money0 = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

/** "Today", a short weekday within the last week, otherwise "Mar 4". */
export function dayLabel(daysAgo: number, today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  if (daysAgo < 7) return daysAgo === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fullDate(daysAgo: number, time?: string, today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + (time ? ", " + time : "");
}

const CODE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A short project code derived from an id, e.g. "7KD-3QM". */
export function shortCode(id: number | string): string {
  let n = Number(id) * 7919;
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CODE[n % CODE.length];
    n = Math.floor(n / CODE.length) + 17;
  }
  return s.slice(0, 3) + "-" + s.slice(3);
}
