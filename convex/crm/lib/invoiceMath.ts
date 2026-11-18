/* The money on an invoice and its payment schedule (PRD 5.2, design 2026-11-18-finance). Amounts are whole cents. Discount comes off the
   subtotal, tax goes on what is left, exactly as on a quote (quoteMath.ts), so an invoice made from a quote can never disagree with it.
   Pure functions, used by the backend, the screens and the tests. No Convex or React imports. */

import { quoteTotals } from "./quoteMath";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jobber's payment terms, in its order. `days` is added to the issued date; "eom" is the last day of that month; "custom" is typed. */
export const PAYMENT_TERMS = [
  { key: "custom", label: "Custom date", days: "custom" },
  { key: "due_on_receipt", label: "Due upon receipt", days: 0 },
  { key: "net_7", label: "Net 7", days: 7 },
  { key: "net_15", label: "Net 15", days: 15 },
  { key: "net_30", label: "Net 30", days: 30 },
  { key: "net_45", label: "Net 45", days: 45 },
  { key: "net_60", label: "Net 60", days: 60 },
  { key: "end_of_month", label: "End of the month", days: "eom" },
] as const;
export type PaymentTermsKey = (typeof PAYMENT_TERMS)[number]["key"];
export const PAYMENT_TERMS_KEYS = PAYMENT_TERMS.map((t) => t.key) as readonly string[];

/** Jobber's payment methods, in its order. */
export const PAYMENT_METHODS = ["Other", "Bank payment", "Cash", "Check", "Credit/debit card", "Cash App", "PayPal", "Venmo", "Zelle"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type StoredInvoiceStatus = "Draft" | "Sent" | "Paid" | "Bad debt" | "Void";
export type InvoiceStatus = "Draft" | "Awaiting payment" | "Past due" | "Paid" | "Bad debt" | "Void";

const clean = (n: number) => (Number.isFinite(n) ? n : 0);

/** The due date for an invoice issued at `issuedAt`. An unknown term counts as due on receipt. */
export function dueDateFor(issuedAt: number, terms: string, customDueAt?: number): number {
  const found = PAYMENT_TERMS.find((t) => t.key === terms);
  if (!found) return issuedAt;
  if (found.days === "custom") return customDueAt ?? issuedAt;
  if (found.days === "eom") {
    const d = new Date(issuedAt);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  }
  return issuedAt + found.days * DAY_MS;
}

export type InvoiceLineMoney = { quantity: number; unitPriceCents: number; /** This invoice's share of the line, when it was made from a schedule row. */ dueCents?: number };
export type InvoiceMoneyOptions = { discountKind?: "amount" | "percent"; discountValue?: number; taxPercent?: number };

export const invoiceLineCents = (l: InvoiceLineMoney) => (l.dueCents !== undefined ? Math.max(0, Math.round(l.dueCents)) : Math.round(l.quantity * l.unitPriceCents));

export function invoiceTotals(lines: InvoiceLineMoney[], o: InvoiceMoneyOptions) {
  const priced = lines.map((l) => ({ quantity: 1, unitPriceCents: invoiceLineCents(l), optional: false, selected: true }));
  const t = quoteTotals(priced, { discountKind: o.discountKind, discountValue: o.discountValue, taxPercent: o.taxPercent }, 0);
  return { subtotalCents: t.subtotalCents, discountCents: t.discountCents, taxCents: t.taxCents, totalCents: t.totalCents };
}

export type ScheduleRow = { kind: "percent" | "amount"; value: number };

/** What each payment-schedule row bills, in cents. A row never takes more than what is left of the total. When every row is a percent and
 *  they add up to 100, the last row takes whatever rounding left, so the rows always add up to the total exactly. */
export function splitSchedule(totalCents: number, rows: ScheduleRow[]): { amounts: number[]; remainingCents: number } {
  const total = Math.max(0, Math.round(clean(totalCents)));
  const allPercent = rows.length > 0 && rows.every((r) => r.kind === "percent");
  const percentSum = rows.reduce((n, r) => n + (r.kind === "percent" ? clean(r.value) : 0), 0);
  const fillsTotal = allPercent && Math.abs(percentSum - 100) < 0.01;
  const amounts: number[] = [];
  let left = total;
  rows.forEach((r, i) => {
    const wanted = fillsTotal && i === rows.length - 1 ? left : r.kind === "percent" ? Math.round((total * Math.max(0, clean(r.value))) / 100) : Math.round(Math.max(0, clean(r.value)));
    const amount = Math.min(left, wanted);
    amounts.push(amount);
    left -= amount;
  });
  return { amounts, remainingCents: left };
}

/** The Invoices list's Status filter, as Jobber words it. */
export const INVOICE_STATUS_FILTERS = ["All", "Awaiting payment: past due", "Awaiting payment: not yet due", "Awaiting payment: all", "Draft", "Paid", "Bad Debt", "Voided"] as const;
export type InvoiceStatusFilter = (typeof INVOICE_STATUS_FILTERS)[number];

export function matchesInvoiceFilter(status: InvoiceStatus, filter: string): boolean {
  switch (filter) {
    case "Awaiting payment: past due": return status === "Past due";
    case "Awaiting payment: not yet due": return status === "Awaiting payment";
    case "Awaiting payment: all": return status === "Past due" || status === "Awaiting payment";
    case "Draft": return status === "Draft";
    case "Paid": return status === "Paid";
    case "Bad Debt": return status === "Bad debt";
    case "Voided": return status === "Void";
    default: return true;
  }
}

export const balanceOf =(totalCents: number, paidCents: number) => Math.max(0, totalCents - Math.max(0, paidCents));

/** What the screens show. "Past due" and "Awaiting payment" are never stored: they depend on today. The due day itself still counts as on time. */
export function derivedStatus(stored: StoredInvoiceStatus, dueAt: number | undefined, balanceCents: number, now: number): InvoiceStatus {
  if (stored === "Draft" || stored === "Void" || stored === "Bad debt") return stored;
  if (stored === "Paid" || balanceCents <= 0) return "Paid";
  return dueAt !== undefined && dueAt + DAY_MS <= now ? "Past due" : "Awaiting payment";
}

/** Spreads a schedule row's amount over an invoice's lines in proportion to their totals; the last line takes the rounding remainder. */
export function spreadDue(lines: { quantity: number; unitPriceCents: number }[], rowCents: number): number[] {
  const totals = lines.map((l) => Math.max(0, Math.round(l.quantity * l.unitPriceCents)));
  const sum = totals.reduce((a, b) => a + b, 0);
  if (lines.length === 0) return [];
  if (sum <= 0) return lines.map((_, i) => (i === lines.length - 1 ? rowCents : 0));
  const out: number[] = [];
  let left = rowCents;
  totals.forEach((t, i) => {
    const share = i === totals.length - 1 ? left : Math.min(left, Math.round((rowCents * t) / sum));
    out.push(share);
    left -= share;
  });
  return out;
}
