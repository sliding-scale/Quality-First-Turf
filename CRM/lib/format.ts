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


/* Quotes (D-056). Money on a quote is whole cents. Dates on a quote are shown in the business's own time zone, so "Oct 19" is the same
   day for everyone whichever country they are looking from. All three businesses are in California for now; the PRD says the time zone
   varies by job, so this becomes a property setting later. */
export const BUSINESS_TIME_ZONE = "America/Los_Angeles";

export const moneyCents = (cents: number) => money(cents / 100);

export const quoteDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: BUSINESS_TIME_ZONE });

export const quoteDateTime = (ms: number) =>
  `${quoteDate(ms)}, ${new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE })}`;
