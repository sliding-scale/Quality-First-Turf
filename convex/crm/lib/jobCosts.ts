/* What a job costs (plan 2026-11-19-jobs-costs): Labor, Expenses and the catalogue cost of its lines. Pure TypeScript with no Convex or React
   imports, so the backend and the screens agree. Money is whole cents. Cost is always worked out from these records, never typed. */

/** Whole minutes from a start to an end (both in ms), rounded to the nearest minute. Zero when the end is not after the start. */
export function minutesBetween(startAt: number, endAt: number): number {
  return endAt > startAt ? Math.round((endAt - startAt) / 60_000) : 0;
}

/** The cost of some minutes of work at an hourly cost. */
export const laborCostCents = (minutes: number, perHourCents: number): number => Math.round((minutes / 60) * perHourCents);

/** The cost of a line: its quantity times the item's unit cost, or null when the item has no cost (a line typed by hand, or off the list). */
export const lineCostCents = (quantity: number, unitCostCents: number | null): number | null => (unitCostCents === null ? null : Math.round(quantity * unitCostCents));

/** Revenue less cost, and the margin as a percent of revenue to one decimal (null when there was no revenue). */
export function profitOf(revenueCents: number, costCents: number): { cents: number; percent: number | null } {
  const cents = revenueCents - costCents;
  return { cents, percent: revenueCents > 0 ? Math.round((cents / revenueCents) * 1000) / 10 : null };
}
