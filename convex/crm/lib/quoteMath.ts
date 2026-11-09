/* The money on a quote (D-056). Amounts are whole cents, so nothing is ever a fraction of a cent. A quote's total is the sum of its
   lines that are in it: a normal line always is, an optional line only while it is ticked. Pure functions, used by the backend and
   by the tests, so the screen and the stored total can never disagree. */

export type PricedLine = { quantity: number; unitPriceCents: number; optional: boolean; selected: boolean };

export const lineTotalCents = (l: Pick<PricedLine, "quantity" | "unitPriceCents">) => Math.round(l.quantity * l.unitPriceCents);

/** An optional line that is not ticked is "Not included". */
export const lineIncluded = (l: Pick<PricedLine, "optional" | "selected">) => !l.optional || l.selected;

export function quoteTotals(lines: PricedLine[], depositPercent: number, depositCollectedCents: number) {
  const totalCents = lines.filter(lineIncluded).reduce((sum, l) => sum + lineTotalCents(l), 0);
  const depositCents = Math.round((totalCents * depositPercent) / 100);
  const collected = Math.max(0, depositCollectedCents);
  return { subtotalCents: totalCents, totalCents, depositCents, depositCollectedCents: collected, depositOutstandingCents: Math.max(0, depositCents - collected) };
}
