/* Purchase order and material readiness rules (PRD 4.4, plan 2026-11-20-purchase-orders). Pure TypeScript, no Convex or React imports. */

export const PO_STATUSES = ["draft", "ordered", "delivered", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_LABEL: Record<PoStatus, string> = { draft: "Draft", ordered: "Ordered", delivered: "Delivered", cancelled: "Cancelled" };

/** What still has to be bought for a takeoff line: its quantity less what is in stock, never below zero, to two decimals. */
export const toOrderQty = (qty: number, inStock: number | null): number => (inStock === null ? qty : Math.max(0, Math.round((qty - inStock) * 100) / 100));

export type OrderLine = { takeoffLineId: string | null; qty: number };
export type OrderFacts = { status: PoStatus; expectedDate: number | null; lines: OrderLine[] };

/** Orders move forward only: Draft to Ordered, Ordered to Delivered, and Draft or Ordered to Cancelled. Delivered and Cancelled are final. */
export function nextStatusProblem(from: PoStatus, to: PoStatus): string | null {
  const ok: Record<PoStatus, PoStatus[]> = { draft: ["ordered", "cancelled"], ordered: ["delivered", "cancelled"], delivered: [], cancelled: [] };
  if (ok[from].includes(to)) return null;
  if (from === "delivered") return "A delivered order cannot change.";
  if (from === "cancelled") return "A cancelled order cannot change. Make a new order instead.";
  return `An order cannot go from ${PO_LABEL[from]} to ${PO_LABEL[to]}.`;
}

/** How much of a takeoff line the live (not cancelled) orders cover, and how much of that has arrived. */
export function coverage(lineId: string, orders: OrderFacts[]): { covered: number; delivered: number; expected: number | null } {
  let covered = 0;
  let delivered = 0;
  let expected: number | null = null;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const l of o.lines) {
      if (l.takeoffLineId !== lineId) continue;
      covered += l.qty;
      if (o.status === "delivered") delivered += l.qty;
      else if (o.expectedDate !== null) expected = expected === null ? o.expectedDate : Math.max(expected, o.expectedDate);
    }
  }
  return { covered: Math.round(covered * 100) / 100, delivered: Math.round(delivered * 100) / 100, expected };
}

export type Readiness = "stock" | "open" | "ordered" | "delivered";
export const READINESS_LABEL: Record<Readiness, string> = { stock: "In stock", open: "Not ordered", ordered: "Ordered", delivered: "Delivered" };

/** One takeoff line's readiness. A line with an order of draft status counts as "Not ordered" until the order is placed. */
export function lineReadiness(line: { id: string; qty: number; inStock: number | null }, orders: OrderFacts[]) {
  const need = toOrderQty(line.qty, line.inStock);
  if (need <= 0) return { state: "stock" as Readiness, need, ordered: 0, delivered: 0, expected: null as number | null };
  const placed = orders.map((o) => (o.status === "draft" ? { ...o, status: "cancelled" as PoStatus } : o)); // a draft is not bought yet
  const c = coverage(line.id, placed);
  const state: Readiness = c.delivered >= need ? "delivered" : c.covered >= need ? "ordered" : "open";
  return { state, need, ordered: c.covered, delivered: c.delivered, expected: state === "ordered" ? c.expected : null };
}

/** The whole project: ready when every line is in stock or delivered; otherwise how many are still open or on the way, and the latest expected date. */
export function readinessOf(lines: { id: string; qty: number; inStock: number | null }[], orders: OrderFacts[]) {
  const per = lines.map((l) => ({ id: l.id, ...lineReadiness(l, orders) }));
  const open = per.filter((p) => p.state === "open").length;
  const onTheWay = per.filter((p) => p.state === "ordered").length;
  const dates = per.flatMap((p) => (p.expected === null ? [] : [p.expected]));
  return { lines: per, open, onTheWay, ready: per.length > 0 && open === 0 && onTheWay === 0, latestExpected: dates.length ? Math.max(...dates) : null };
}

/** What a new order would cover for each line: the need less what live orders (drafts included) already cover. Lines that are covered are left out. */
export function remainingToOrder(lines: { id: string; qty: number; inStock: number | null }[], orders: OrderFacts[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    const left = Math.round((toOrderQty(l.qty, l.inStock) - coverage(l.id, orders).covered) * 100) / 100;
    if (left > 0) out.set(l.id, left);
  }
  return out;
}
