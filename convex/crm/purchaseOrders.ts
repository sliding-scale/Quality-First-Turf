import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireModule, requireProject } from "./lib/access";
import { allows, canSeeRecord } from "./lib/permissions";
import { nextStatusProblem, readinessOf, remainingToOrder, type OrderFacts, type PoStatus } from "./lib/purchaseOrders";
import { materialsShortfall } from "./lib/readiness";
import { freeStockFor, qtyOf, setStock } from "./lib/stock";

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
const facts = (o: Doc<"purchaseOrders">): OrderFacts => ({ status: o.status, expectedDate: o.expectedDate ?? null, lines: o.lines.map((l) => ({ takeoffLineId: l.takeoffLineId ?? null, qty: l.qty })) });
/** Each takeoff line with its quantity and the yard stock free for it (D-138). */
async function needsOf(ctx: QueryCtx, id: Id<"opportunities">, lines: Doc<"takeoffLines">[]) {
  const stock = await freeStockFor(ctx, id, lines);
  return lines.map((l) => ({ id: l._id as string, qty: qtyOf(l), inStock: stock.get(l._id)!.free }));
}
const MAX_ORDER_LINES = 100;

/** An order as the screens show it. */
const orderView = (o: Doc<"purchaseOrders">, costs: boolean) => ({
  id: o._id, number: o.number, supplier: o.supplier, status: o.status, notes: o.notes, expectedDate: o.expectedDate ?? null, orderedAt: o.orderedAt ?? null, deliveredAt: o.deliveredAt ?? null,
  createdByName: o.createdByName, createdAt: o.createdAt, forStock: o.opportunityId === undefined,
  lines: o.lines.map((l) => ({ name: l.name, unit: l.unit, qty: l.qty, unitCostCents: costs ? l.unitCostCents ?? null : null, materialId: l.materialId ?? null, takeoffLineId: l.takeoffLineId ?? null })),
  totalCents: costs ? o.lines.reduce((s, l) => s + Math.round(l.qty * (l.unitCostCents ?? 0)), 0) : null,
});

export const list = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won") return null;
    const staff = await requireProject(ctx, p, "pipelinePreplanning", "view");
    const costs = allows(staff.levels.prices, "view");
    const orders = await ordersOf(ctx, p._id);
    const lines = await takeoffOf(ctx, p._id);
    const needs = await needsOf(ctx, p._id, lines);
    const r = readinessOf(needs, orders.map(facts));
    const remaining = remainingToOrder(needs, orders.map(facts));
    return {
      canSeeCosts: costs,
      orders: [...orders].sort((a, b) => b.createdAt - a.createdAt).map((o) => orderView(o, costs)),
      readiness: {
        ready: r.ready, open: r.open, onTheWay: r.onTheWay, latestExpected: r.latestExpected,
        lines: lines.map((l, i) => ({ name: l.name, unit: l.unit, supplier: l.supplier, ...r.lines[i], id: l._id })),
      },
      toOrderCount: remaining.size,
    };
  },
});

/** What is still missing, asked before a project is moved to Construction (D-136). null: nothing to warn about. */
export const handoffWarning = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null) return null;
    await requireProject(ctx, p, "pipelinePreplanning", "view");
    return materialsShortfall(ctx, p._id);
  },
});

/** One draft order per supplier for whatever the takeoff still needs to buy and the live orders do not already cover. */
export const createFromTakeoff = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const { p, staff } = await projectOf(ctx, args.id, "edit");
    const lines = await takeoffOf(ctx, p._id);
    const orders = await ordersOf(ctx, p._id);
    const remaining = remainingToOrder(await needsOf(ctx, p._id, lines), orders.map(facts));
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
        lines: group.map((l) => ({ takeoffLineId: l._id, materialId: l.materialId, name: l.name, unit: l.unit, qty: remaining.get(l._id)!, unitCostCents: l.unitCostCents })),
      });
      made++;
    }
    return made;
  },
});

async function orderOf(ctx: QueryCtx, id: Id<"purchaseOrders">) {
  const o = await ctx.db.get(id);
  if (o === null) throw new ConvexError("That order no longer exists.");
  const staff = o.opportunityId ? (await projectOf(ctx, o.opportunityId, "edit")).staff : await requireModule(ctx, o.businessId, "pipelinePreplanning", "edit");
  return { o, staff };
}

/** Changes an order's supplier, expected date, notes and (while it is a draft) its quantities, one per line in order. */
export const save = mutation({
  args: { id: v.id("purchaseOrders"), supplier: v.string(), expectedDate: v.optional(v.number()), notes: v.string(), qtys: v.optional(v.array(v.number())) },
  handler: async (ctx, args) => {
    const { o } = await orderOf(ctx, args.id);
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

/** Adds what arrived (or part of it) to the yard stock. */
async function addToStock(ctx: MutationCtx, o: Pick<Doc<"purchaseOrders">, "_id" | "businessId" | "opportunityId" | "number">, rows: { materialId: Id<"materials">; qty: number }[], reason: "delivery" | "bought", byName: string, now: number) {
  for (const row of rows) {
    if (!Number.isFinite(row.qty) || row.qty < 0 || row.qty > 10_000_000) throw new ConvexError("Check the amount going into stock.");
    if (row.qty === 0) continue;
    const m = await ctx.db.get(row.materialId);
    if (m === null || m.businessId !== o.businessId) throw new ConvexError("That material no longer exists.");
    await setStock(ctx, m, (m.inStock ?? 0) + row.qty, { reason, byName, now, note: o.number, purchaseOrderId: o._id, ...(o.opportunityId ? { opportunityId: o.opportunityId } : {}) });
  }
}

const stockRow = v.object({ materialId: v.id("materials"), qty: v.number() });

export const setStatus = mutation({
  args: {
    id: v.id("purchaseOrders"), status: v.union(v.literal("ordered"), v.literal("delivered"), v.literal("cancelled")), now: v.number(),
    /** On delivery: what goes to the yard. Goods bought for a job stay with the job unless listed here. */
    toStock: v.optional(v.array(stockRow)),
  },
  handler: async (ctx, args) => {
    const { o, staff } = await orderOf(ctx, args.id);
    const why = nextStatusProblem(o.status as PoStatus, args.status);
    if (why) throw new ConvexError(why);
    await ctx.db.patch(o._id, { status: args.status, ...(args.status === "ordered" ? { orderedAt: args.now } : {}), ...(args.status === "delivered" ? { deliveredAt: args.now } : {}) });
    if (args.status === "delivered" && args.toStock) {
      const ordered = new Set(await Promise.all(o.lines.map(async (l) => l.materialId ?? (l.takeoffLineId ? (await ctx.db.get(l.takeoffLineId))?.materialId : undefined))));
      if (args.toStock.some((r) => !ordered.has(r.materialId))) throw new ConvexError("Only what is on the order can go into stock from it.");
      await addToStock(ctx, o, args.toStock, "delivery", staff.name, args.now);
    }
  },
});

/** Every supplier order of the business, newest first: for jobs and for the yard (the Orders tab of the Stock page). */
export const all = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "pipelinePreplanning", "view");
    const costs = allows(staff.levels.prices, "view");
    const rows = await ctx.db.query("purchaseOrders").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).order("desc").take(500);
    const jobs = new Map<Id<"opportunities">, Doc<"opportunities"> | null>();
    const orders = [];
    for (const o of rows) {
      if (o.opportunityId && !jobs.has(o.opportunityId)) jobs.set(o.opportunityId, await ctx.db.get(o.opportunityId));
      const p = o.opportunityId ? jobs.get(o.opportunityId) ?? null : null;
      // Someone limited to their own records sees the orders of their jobs only.
      if (staff.assignedOnly && (!p || !canSeeRecord({ assignedOnly: true, userId: staff.userId }, p))) continue;
      // The takeoff line says which material an older order's line was.
      const lines = await Promise.all(o.lines.map(async (l) => ({ ...l, materialId: l.materialId ?? (l.takeoffLineId ? (await ctx.db.get(l.takeoffLineId))?.materialId : undefined) })));
      orders.push({ ...orderView({ ...o, lines }, costs), job: p ? { id: p._id, code: p.code, title: p.title } : null });
    }
    const materials = await ctx.db.query("materials").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId)).take(3000);
    const jobOptions = (await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", args.businessId)).order("desc").take(300))
      .filter((p) => p.outcome === "won" && p.archivedAt === undefined && p.jobClosedAt === undefined && canSeeRecord({ assignedOnly: staff.assignedOnly, userId: staff.userId }, p))
      .map((p) => ({ id: p._id, code: p.code, title: p.title }));
    return {
      orders, canSeeCosts: costs, jobOptions,
      materials: materials.map((m) => ({ id: m._id, name: m.name, unit: m.unit, supplier: m.supplier, category: m.category })),
      suppliers: [...new Set([...materials.map((m) => m.supplier.trim()), ...rows.map((o) => o.supplier.trim())].filter(Boolean))].sort(),
    };
  },
});

/** An order added on the Orders tab, for the yard or a job, wherever it is up to: still to be ordered (a draft), ordered and on its way, or
 *  already bought and received. Received goods for the yard go into stock; goods bought for a job count toward that job's takeoff. */
export const create = mutation({
  args: {
    businessId: v.id("businesses"), opportunityId: v.optional(v.id("opportunities")), supplier: v.string(), notes: v.string(),
    state: v.union(v.literal("draft"), v.literal("ordered"), v.literal("received")),
    /** The expected delivery of a draft or an order; the day something received was bought. */
    date: v.optional(v.number()),
    lines: v.array(v.object({ materialId: v.id("materials"), qty: v.number() })),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    let staff = await requireModule(ctx, args.businessId, "pipelinePreplanning", "edit");
    let job: Doc<"opportunities"> | null = null;
    if (args.opportunityId) {
      const found = await projectOf(ctx, args.opportunityId, "edit");
      if (found.p.businessId !== args.businessId) throw new ConvexError("That job is not in this business.");
      job = found.p;
      staff = found.staff;
    } else if (staff.assignedOnly) throw new ConvexError("Your role can order for your own jobs only.");
    if (args.lines.length === 0) throw new ConvexError("Add at least one material.");
    if (args.lines.length > MAX_ORDER_LINES) throw new ConvexError(`An order can have up to ${MAX_ORDER_LINES} lines.`);
    if (new Set(args.lines.map((l) => l.materialId)).size !== args.lines.length) throw new ConvexError("Each material can be on an order once.");
    if (args.date !== undefined && (!Number.isFinite(args.date) || args.date < 0)) throw new ConvexError("Check the date.");
    const received = args.state === "received";
    if (received && args.date === undefined) throw new ConvexError("Pick the day it was bought.");
    const notes = args.notes.trim();
    if (notes.length > 3000) throw new ConvexError("The notes are too long (3,000 characters at most).");
    const taken = job ? await takeoffOf(ctx, job._id) : [];
    const lines = [];
    for (const l of args.lines) {
      if (!Number.isFinite(l.qty) || l.qty <= 0 || l.qty > 10_000_000) throw new ConvexError("Every quantity must be more than zero.");
      const m = await ctx.db.get(l.materialId);
      if (m === null || m.businessId !== args.businessId) throw new ConvexError("That material no longer exists.");
      const onJob = taken.find((t) => t.materialId === m._id);
      lines.push({ materialId: m._id, ...(onJob ? { takeoffLineId: onJob._id } : {}), name: m.name, unit: m.unit, qty: Math.round(l.qty * 100) / 100, unitCostCents: m.costCents });
    }
    const siblings = job
      ? (await ordersOf(ctx, job._id)).length
      : (await ctx.db.query("purchaseOrders").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).take(2000)).filter((o) => o.opportunityId === undefined).length;
    const number = `PO-${job ? job.code : "STOCK"}-${siblings + 1}`;
    const id = await ctx.db.insert("purchaseOrders", {
      businessId: args.businessId, ...(job ? { opportunityId: job._id } : {}), number, supplier: args.supplier.trim().slice(0, 100), notes, createdByName: staff.name, createdAt: args.now, lines,
      ...(received
        ? { status: "delivered" as const, orderedAt: args.date, deliveredAt: args.date }
        : { status: args.state === "ordered" ? ("ordered" as const) : ("draft" as const), ...(args.state === "ordered" ? { orderedAt: args.now } : {}), ...(args.date !== undefined ? { expectedDate: args.date } : {}) }),
    });
    if (received && !job) await addToStock(ctx, { _id: id, businessId: args.businessId, number }, lines.map((l) => ({ materialId: l.materialId, qty: l.qty })), "bought", staff.name, args.now);
    return id;
  },
});

/** Only a draft or a cancelled order can be deleted; one that was placed stays as the record. */
export const remove = mutation({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    const { o } = await orderOf(ctx, args.id);
    if (o.status === "ordered" || o.status === "delivered") throw new ConvexError("An order that was placed cannot be deleted. Cancel it instead.");
    await ctx.db.delete(o._id);
  },
});
