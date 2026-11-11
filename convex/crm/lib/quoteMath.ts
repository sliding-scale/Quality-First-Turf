/* The money on a quote (D-056, D-063). Amounts are whole cents, so nothing is ever a fraction of a cent. A quote's subtotal is the sum of
   its priced lines that are in it: a normal line always is, an optional line only while it is ticked, and a text line (only words)
   carries no money. A discount comes off the subtotal (never below zero), tax goes on what is left, and a deposit is a percent of the
   total or a fixed amount. Pure functions, used by the backend, the screens and the tests, so what is shown and what is stored cannot
   disagree. */

export type PricedLine = { quantity: number; unitPriceCents: number; optional: boolean; selected: boolean; kind?: "item" | "text" };

export type QuoteMoneyOptions = {
  discountKind?: "amount" | "percent";
  /** Cents for "amount", 0 to 100 for "percent". */
  discountValue?: number;
  /** For example 8.75 for 8.75 percent. */
  taxPercent?: number;
  depositKind?: "percent" | "amount";
  /** 0 to 100 for "percent", cents for "amount". */
  depositValue?: number;
};

export const lineTotalCents = (l: Pick<PricedLine, "quantity" | "unitPriceCents">) => Math.round(l.quantity * l.unitPriceCents);

/** An optional line that is not ticked is "Not included". */
export const lineIncluded = (l: Pick<PricedLine, "optional" | "selected">) => !l.optional || l.selected;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));

export function quoteTotals(lines: PricedLine[], depositOrOptions: number | QuoteMoneyOptions, depositCollectedCents: number) {
  const o: QuoteMoneyOptions = typeof depositOrOptions === "number" ? { depositKind: "percent", depositValue: depositOrOptions } : depositOrOptions;
  const subtotalCents = lines.filter((l) => l.kind !== "text" && lineIncluded(l)).reduce((sum, l) => sum + lineTotalCents(l), 0);
  const discountCents =
    o.discountKind === "amount" ? Math.min(subtotalCents, Math.max(0, Math.round(o.discountValue ?? 0)))
    : o.discountKind === "percent" ? Math.round((subtotalCents * clamp(o.discountValue ?? 0, 0, 100)) / 100)
    : 0;
  const taxable = subtotalCents - discountCents;
  const taxCents = Math.round((taxable * Math.max(0, o.taxPercent ?? 0)) / 100);
  const totalCents = taxable + taxCents;
  const depositCents =
    o.depositKind === "amount" ? Math.min(totalCents, Math.max(0, Math.round(o.depositValue ?? 0)))
    : o.depositKind === "percent" ? Math.round((totalCents * clamp(o.depositValue ?? 0, 0, 100)) / 100)
    : 0;
  const collected = Math.max(0, depositCollectedCents);
  return { subtotalCents, discountCents, taxCents, totalCents, depositCents, depositCollectedCents: collected, depositOutstandingCents: Math.max(0, depositCents - collected) };
}
