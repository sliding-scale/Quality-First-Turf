import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireModule, requireProject } from "./lib/access";
import { claimsByMaterial, onHandOf, orderedFor, qtyOf, setStock } from "./lib/stock";

/** Stock in the yard (D-138): the Stock page, counting, and recording what a finished job used. Materials are Preplanning data, so it follows
 *  the Preplanning module. The rules are in lib/stock.ts. */

const MAX_MATERIALS = 3000;
const MAX_QTY = 10_000_000;

const checkQty = (n: number) => {
  if (!Number.isFinite(n) || n < 0 || n > MAX_QTY) throw new ConvexError("Enter an amount of zero or more.");
};

const materialsOf = (ctx: QueryCtx, businessId: Id<"businesses">) => ctx.db.query("materials").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", businessId)).take(MAX_MATERIALS);

/** Whether a job's work is over: it reached Backend, or its job was closed. */
const finished = (p: Doc<"opportunities">) => p.pipeline === "Finance" || p.jobClosedAt !== undefined;

/** The Stock page: every material with what is in the yard, what open jobs need from it and when it was last counted, those with something
 *  needed or in stock first; and finished jobs that have not recorded what they used. */
export const list = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "pipelinePreplanning", "view");
    const claimed = await claimsByMaterial(ctx, args.businessId);
    const waiting = new Set<Id<"opportunities">>();
    const items = (await materialsOf(ctx, args.businessId)).map((m) => {
      const claims = claimed.get(m._id) ?? [];
      for (const c of claims) waiting.add(c.opportunityId);
      return {
        id: m._id, name: m.name, unit: m.unit, category: m.category, supplier: m.supplier, inStock: onHandOf(m),
        needed: Math.round(claims.reduce((s, c) => s + c.qty, 0) * 100) / 100, jobs: new Set(claims.map((c) => c.opportunityId)).size,
        countedAt: m.stockCountedAt ?? null, countedBy: m.stockCountedBy ?? null,
      };
    });
    const rank = (i: (typeof items)[number]) => (i.needed > i.inStock ? 0 : i.needed > 0 ? 1 : i.inStock > 0 ? 2 : 3);
    items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const toRecord = [];
    for (const id of waiting) {
      const p = await ctx.db.get(id);
      if (p && finished(p) && !staff.assignedOnly) toRecord.push({ id: p._id, code: p.code, title: p.title });
    }
    return { items, toRecord };
  },
});

/** What is really in the yard, as counted. */
export const count = mutation({
  args: { businessId: v.id("businesses"), counts: v.array(v.object({ materialId: v.id("materials"), qty: v.number() })), now: v.number() },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "pipelinePreplanning", "edit");
    if (args.counts.length === 0 || args.counts.length > 500) throw new ConvexError("Enter at least one amount.");
    for (const c of args.counts) {
      checkQty(c.qty);
      const m = await ctx.db.get(c.materialId);
      if (m === null || m.businessId !== args.businessId) throw new ConvexError("That material no longer exists.");
      await setStock(ctx, m, c.qty, { reason: "count", byName: staff.name, now: args.now });
    }
  },
});

/** A material's changes, newest first. */
export const history = query({
  args: { materialId: v.id("materials") },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.materialId);
    if (m === null) return [];
    await requireModule(ctx, m.businessId, "pipelinePreplanning", "view");
    const rows = await ctx.db.query("stockMovements").withIndex("by_material", (q) => q.eq("materialId", m._id)).order("desc").take(50);
    const out = [];
    for (const r of rows) {
      const p = r.opportunityId ? await ctx.db.get(r.opportunityId) : null;
      out.push({ id: r._id, at: r.at, change: r.change, after: r.after, reason: r.reason, byName: r.byName, note: r.note, job: p ? `${p.title} · ${p.code}` : "" });
    }
    return out;
  },
});

/** What a job is about to record: its materials, with what it should have taken from the yard (its quantity less what was ordered for it,
 *  and no more than the yard holds). null when the project has no takeoff. */
export const usage = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won") return null;
    await requireProject(ctx, p, "pipelinePreplanning", "view");
    const lines = await ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(500);
    if (lines.length === 0) return null;
    const takeoff = await ctx.db.query("takeoffs").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).unique();
    const orders = await ctx.db.query("purchaseOrders").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(300);
    const rows = [];
    for (const l of lines) {
      const m = l.materialId ? await ctx.db.get(l.materialId) : null;
      if (!m) continue;
      const short = Math.max(0, qtyOf(l) - orderedFor(l._id, orders));
      rows.push({ materialId: m._id, name: m.name, unit: m.unit, inStock: onHandOf(m), suggested: Math.round(Math.min(short, onHandOf(m)) * 100) / 100 });
    }
    return { finished: finished(p), recordedAt: takeoff?.stockUsedAt ?? null, recordedBy: takeoff?.stockUsedByName ?? null, rows };
  },
});

/** What a job took from the yard and what it brought back, once. Later corrections are made by counting. */
export const recordUse = mutation({
  args: { id: v.id("opportunities"), rows: v.array(v.object({ materialId: v.id("materials"), used: v.number(), returned: v.number() })), now: v.number() },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won") throw new ConvexError("That project is not ready for this.");
    const staff = await requireProject(ctx, p, "pipelinePreplanning", "edit");
    const takeoff = await ctx.db.query("takeoffs").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).unique();
    if (takeoff?.stockUsedAt !== undefined) throw new ConvexError("What this job used is already recorded. Correct stock by counting it.");
    if (args.rows.length > 500) throw new ConvexError("That is too many materials.");
    for (const r of args.rows) {
      checkQty(r.used);
      checkQty(r.returned);
      const m = await ctx.db.get(r.materialId);
      if (m === null || m.businessId !== p.businessId) throw new ConvexError("That material no longer exists.");
      if (r.used === 0 && r.returned === 0) continue;
      await setStock(ctx, m, onHandOf(m) - r.used + r.returned, {
        reason: "used", byName: staff.name, now: args.now, opportunityId: p._id, note: `Used ${r.used}${r.returned ? `, returned ${r.returned}` : ""}`,
      });
    }
    const stamp = { stockUsedAt: args.now, stockUsedByName: staff.name };
    if (takeoff) await ctx.db.patch(takeoff._id, stamp);
    else await ctx.db.insert("takeoffs", { businessId: p.businessId, opportunityId: p._id, inputs: {}, updatedAt: args.now, updatedByName: staff.name, ...stamp });
  },
});
