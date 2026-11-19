import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireProject } from "./lib/access";
import { allows } from "./lib/permissions";
import { nextStatusProblem, readinessOf, remainingToOrder, type OrderFacts, type PoStatus } from "./lib/purchaseOrders";

/** A project's purchase orders and material readiness (PRD 4.4, plan 2026-11-20-purchase-orders). Preplanning work, so it follows the Preplanning
 *  module. Unit costs are prices and show only with the Prices module. Readiness is worked out here from the takeoff and the live orders, never stored. */

async function projectOf(ctx: QueryCtx, id: Id<"opportunities">, need: "view" | "edit") {
  const p = await ctx.db.get(id);
  if (p === null || p.outcome !== "won") throw new ConvexError("Purchase orders start once the project is Closed Won.");
  const staff = await requireProject(ctx, p, "pipelinePreplanning", need);
  return { p, staff };
}

const ordersOf = (ctx: QueryCtx, id: Id<"opportunities">) => ctx.db.query("purchaseOrders").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).take(300);
const takeoffOf = (ctx: QueryCtx, id: Id<"opportunities">) => ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).take(500);
const qtyOf = (l: Doc<"takeoffLines">) => l.qtyOverride ?? l.calcQty ?? 0;
const facts = (o: Doc<"purchaseOrders">): OrderFacts => ({ status: o.status, expectedDate: o.expectedDate ?? null, lines: o.lines.map((l) => ({ takeoffLineId: l.takeoffLineId ?? null, qty: l.qty })) });
const needs = (lines: Doc<"takeoffLines">[]) => lines.map((l) => ({ id: l._id as string, qty: qtyOf(l), inStock: l.inStock ?? null }));

export const list = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won") return null;
    const staff = await requireProject(ctx, p, "pipelinePreplanning", "view");
    const costs = allows(staff.levels.prices, "view");
    const orders = await ordersOf(ctx, p._id);
    const lines = await takeoffOf(ctx, p._id);
    const r = readinessOf(needs(lines), orders.map(facts));
    const remaining = remainingToOrder(needs(lines), orders.map(facts));
    return {
      canSeeCosts: costs,
      orders: [...orders].sort((a, b) => b.createdAt - a.createdAt).map((o) => ({
        id: o._id, number: o.number, supplier: o.supplier, status: o.status, notes: o.notes, expectedDate: o.expectedDate ?? null, orderedAt: o.orderedAt ?? null, deliveredAt: o.deliveredAt ?? null,
        createdByName: o.createdByName, createdAt: o.createdAt,
        lines: o.lines.map((l) => ({ name: l.name, unit: l.unit, qty: l.qty, unitCostCents: costs ? l.unitCostCents ?? null : null })),
        totalCents: costs ? o.lines.reduce((s, l) => s + Math.round(l.qty * (l.unitCostCents ?? 0)), 0) : null,
      })),
      readiness: {
        ready: r.ready, open: r.open, onTheWay: r.onTheWay, latestExpected: r.latestExpected,
        lines: lines.map((l, i) => ({ name: l.name, unit: l.unit, supplier: l.supplier, ...r.lines[i] })),
      },
      toOrderCount: remaining.size,
    };
  },
});

/** One draft order per supplier for whatever the takeoff still needs to buy and the live orders do not already cover. */
export const createFromTakeoff = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const { p, staff } = await projectOf(ctx, args.id, "edit");
    const lines = await takeoffOf(ctx, p._id);
    const orders = await ordersOf(ctx, p._id);
    const remaining = remainingToOrder(needs(lines), orders.map(facts));
    if (remaining.size === 0) throw new ConvexError(lines.length === 0 ? "Add materials to the takeoff first." : "Everything on the takeoff is in stock or already on an order.");
    const bySupplier = new Map<string, Doc<"takeoffLines">[]>();
    for (const l of lines) {
      if (!remaining.has(l._id)) continue;
      const key = l.supplier.trim();
      bySupplier.set(key, [...(bySupplier.get(key) ?? []), l]);
    }
    let count = orders.length;
    let made = 0;
    for (const [supplier, group] of [...bySupplier.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      await ctx.db.insert("purchaseOrders", {
        businessId: p.businessId, opportunityId: p._id, number: `PO-${p.code}-${++count}`, supplier, status: "draft", notes: "", createdByName: staff.name, createdAt: args.now,
        lines: group.map((l) => ({ takeoffLineId: l._id, name: l.name, unit: l.unit, qty: remaining.get(l._id)!, unitCostCents: l.unitCostCents })),
      });
      made++;
    }
    return made;
  },
});

async function orderOf(ctx: QueryCtx, id: Id<"purchaseOrders">) {
  const o = await ctx.db.get(id);
  if (o === null) throw new ConvexError("That order no longer exists.");
  await projectOf(ctx, o.opportunityId, "edit");
  return o;
}

/** Changes an order's supplier, expected date, notes and (while it is a draft) its quantities, one per line in order. */
export const save = mutation({
  args: { id: v.id("purchaseOrders"), supplier: v.string(), expectedDate: v.optional(v.number()), notes: v.string(), qtys: v.optional(v.array(v.number())) },
  handler: async (ctx, args) => {
    const o = await orderOf(ctx, args.id);
    if (o.status === "delivered" || o.status === "cancelled") throw new ConvexError("A delivered or cancelled order cannot change.");
    if (args.expectedDate !== undefined && (!Number.isFinite(args.expectedDate) || args.expectedDate < 0)) throw new ConvexError("Check the expected date.");
    const notes = args.notes.trim();
    if (notes.length > 3000) throw new ConvexError("The notes are too long (3,000 characters at most).");
    const patch: Partial<Doc<"purchaseOrders">> = { supplier: args.supplier.trim().slice(0, 100), expectedDate: args.expectedDate, notes };
    if (args.qtys !== undefined) {
      if (o.status !== "draft") throw new ConvexError("Quantities can change only while the order is a draft.");
      if (args.qtys.length !== o.lines.length) throw new ConvexError("The quantities do not match the order's lines.");
      for (const q of args.qtys) if (!Number.isFinite(q) || q <= 0 || q > 10_000_000) throw new ConvexError("Every quantity must be more than zero.");
      patch.lines = o.lines.map((l, i) => ({ ...l, qty: Math.round(args.qtys![i] * 100) / 100 }));
    }
    await ctx.db.patch(o._id, patch);
  },
});

export const setStatus = mutation({
  args: { id: v.id("purchaseOrders"), status: v.union(v.literal("ordered"), v.literal("delivered"), v.literal("cancelled")), now: v.number() },
  handler: async (ctx, args) => {
    const o = await orderOf(ctx, args.id);
    const why = nextStatusProblem(o.status as PoStatus, args.status);
    if (why) throw new ConvexError(why);
    await ctx.db.patch(o._id, { status: args.status, ...(args.status === "ordered" ? { orderedAt: args.now } : {}), ...(args.status === "delivered" ? { deliveredAt: args.now } : {}) });
  },
});

/** Only a draft or a cancelled order can be deleted; one that was placed stays as the record. */
export const remove = mutation({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    const o = await orderOf(ctx, args.id);
    if (o.status === "ordered" || o.status === "delivered") throw new ConvexError("An order that was placed cannot be deleted. Cancel it instead.");
    await ctx.db.delete(o._id);
  },
});
