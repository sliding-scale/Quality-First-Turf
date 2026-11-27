import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireProject } from "./lib/access";
import { allows } from "./lib/permissions";
import { emptyInputs, lineQuantity, summarize, TAKEOFF_INPUTS } from "./lib/takeoff";
import { fillTakeoff, quoteServices, visitMeasurements } from "./lib/takeoffFill";
import { LINK_MEASURES, serviceKey, serviceOf, sharedService } from "./lib/takeoffLinks";
import { freeStockFor } from "./lib/stock";

/** A project's material takeoff (PRD 4.2, plan 2026-11-19-takeoff): the measurements, the materials with the quantity each formula works out, and
 *  the requirements summary. It is Preplanning work, so it follows the Preplanning module whatever stage the project is at. A line is a labelled
 *  snapshot of its material; changing the catalogue later changes no takeoff until someone refreshes the line. */

async function projectOf(ctx: QueryCtx, id: Id<"opportunities">, need: "view" | "edit") {
  const p = await ctx.db.get(id);
  if (p === null || p.outcome !== "won") throw new ConvexError("That project is not ready for a takeoff yet. It needs to be Closed Won.");
  const staff = await requireProject(ctx, p, "pipelinePreplanning", need);
  return { p, staff };
}

async function takeoffOf(ctx: QueryCtx, id: Id<"opportunities">) {
  return ctx.db.query("takeoffs").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).unique();
}
async function linesOf(ctx: QueryCtx, id: Id<"opportunities">) {
  return ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).take(500);
}

/** The measurements as every formula input, missing ones as zero. */
function inputsOf(t: Doc<"takeoffs"> | null): Record<string, number> {
  return { ...emptyInputs(), ...(t?.inputs ?? {}) };
}

export const get = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won") return null;
    const staff = await requireProject(ctx, p, "pipelinePreplanning", "view");
    const costs = allows(staff.levels.prices, "view");
    const t = await takeoffOf(ctx, p._id);
    const rows = await linesOf(ctx, p._id);
    const stock = await freeStockFor(ctx, p._id, rows);
    const lines = await Promise.all(rows.map(async (l) => ({
      id: l._id, name: l.name, category: l.category ?? (l.materialId ? (await ctx.db.get(l.materialId))?.category ?? "" : ""), sku: l.sku, unit: l.unit, formula: l.formula, wastagePercent: l.wastagePercent, calcQty: l.calcQty ?? null, calcError: l.calcError ?? null,
      qtyOverride: l.qtyOverride ?? null, qty: l.qtyOverride ?? l.calcQty ?? 0, unitCostCents: costs ? l.unitCostCents ?? null : null, supplier: l.supplier,
      leadTimeDays: l.leadTimeDays ?? null, notes: l.notes, materialId: l.materialId ?? null, measures: l.measures ?? null,
      // What is in the yard, and how much of it is free for this job after the jobs ahead of it (D-138). null: not tracked.
      onHand: stock.get(l._id)!.onHand, inStock: stock.get(l._id)!.free,
    })));
    const summary = summarize(lines.map((l) => ({ name: l.name, unit: l.unit, qty: l.qty, unitCostCents: l.unitCostCents, supplier: l.supplier, leadTimeDays: l.leadTimeDays, inStock: l.inStock })));
    return {
      inputs: inputsOf(t), saved: t !== null, updatedAt: t?.updatedAt ?? null, updatedByName: t?.updatedByName ?? null, suggested: await visitMeasurements(ctx, p), stockUsedAt: t?.stockUsedAt ?? null,
      lines, summary, canSeeCosts: costs, inputList: TAKEOFF_INPUTS.map((i) => ({ key: i.key, label: i.label, unit: i.unit, group: i.group as string })),
    };
  },
});

/** Works every line out again from the measurements, unless the person typed their own quantity for it (that stays, and the worked-out one is still kept). */
async function recalc(ctx: MutationCtx, id: Id<"opportunities">, inputs: Record<string, number>) {
  for (const l of await linesOf(ctx, id)) {
    const r = lineQuantity({ formula: l.formula, wastagePercent: l.wastagePercent, rounding: l.rounding, inputs: { ...inputs, ...(l.measures ?? {}) } });
    await ctx.db.patch(l._id, r.ok ? { calcQty: r.qty, calcError: undefined } : { calcQty: undefined, calcError: r.error });
  }
}

export const saveInputs = mutation({
  args: { id: v.id("opportunities"), inputs: v.record(v.string(), v.number()), now: v.number() },
  handler: async (ctx, args) => {
    const { p, staff } = await projectOf(ctx, args.id, "edit");
    const known = new Set<string>(TAKEOFF_INPUTS.map((i) => i.key));
    const clean: Record<string, number> = {};
    for (const [k, val] of Object.entries(args.inputs)) {
      if (!known.has(k)) throw new ConvexError(`"${k}" is not a measurement.`);
      if (!Number.isFinite(val) || val < 0 || val > 10_000_000) throw new ConvexError(`Check the ${k}.`);
      clean[k] = Math.round(val * 1000) / 1000;
    }
    const merged = { ...emptyInputs(), ...clean };
    const t = await takeoffOf(ctx, p._id);
    if (t) await ctx.db.patch(t._id, { inputs: merged, updatedAt: args.now, updatedByName: staff.name });
    else await ctx.db.insert("takeoffs", { businessId: p.businessId, opportunityId: p._id, inputs: merged, updatedAt: args.now, updatedByName: staff.name });
    await recalc(ctx, p._id, merged);
  },
});

const snapshot = (m: Doc<"materials">) => ({
  materialId: m._id, name: m.name, category: m.category, sku: m.sku, unit: m.unit, formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, unitCostCents: m.costCents,
  supplier: m.supplier, leadTimeDays: m.leadTimeDays,
});

export const addLine = mutation({
  args: { id: v.id("opportunities"), materialId: v.id("materials") },
  handler: async (ctx, args) => {
    const { p } = await projectOf(ctx, args.id, "edit");
    const m = await ctx.db.get(args.materialId);
    if (m === null || m.businessId !== p.businessId) throw new ConvexError("That material no longer exists.");
    const lines = await linesOf(ctx, p._id);
    if (lines.some((l) => l.materialId === m._id)) throw new ConvexError("That material is already on this takeoff.");
    const r = lineQuantity({ formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, inputs: inputsOf(await takeoffOf(ctx, p._id)) });
    return ctx.db.insert("takeoffLines", {
      businessId: p.businessId, opportunityId: p._id, position: lines.length, ...snapshot(m), notes: "",
      ...(r.ok ? { calcQty: r.qty } : { calcError: r.error }),
    });
  },
});

/** Adds every material of a kit to the takeoff, worked out from the measurements. A material already on the takeoff is skipped (the same material is
 *  in several kits), and one deleted from the list since the kit was made is counted as missing. */
export const addKit = mutation({
  args: { id: v.id("opportunities"), kitId: v.id("materialKits") },
  handler: async (ctx, args) => {
    const { p } = await projectOf(ctx, args.id, "edit");
    const kit = await ctx.db.get(args.kitId);
    if (kit === null || kit.businessId !== p.businessId) throw new ConvexError("That kit no longer exists.");
    const lines = await linesOf(ctx, p._id);
    const have = new Set(lines.map((l) => l.materialId));
    const inputs = inputsOf(await takeoffOf(ctx, p._id));
    let added = 0;
    let skipped = 0;
    let missing = 0;
    let position = lines.length;
    for (const materialId of kit.materialIds) {
      const m = await ctx.db.get(materialId);
      if (m === null || m.businessId !== p.businessId) { missing += 1; continue; }
      if (have.has(m._id)) { skipped += 1; continue; }
      const r = lineQuantity({ formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, inputs });
      await ctx.db.insert("takeoffLines", { businessId: p.businessId, opportunityId: p._id, position: position++, ...snapshot(m), notes: "", ...(r.ok ? { calcQty: r.qty } : { calcError: r.error }) });
      have.add(m._id);
      added += 1;
    }
    return { added, skipped, missing };
  },
});

export const updateLine = mutation({
  args: {
    lineId: v.id("takeoffLines"),
    /** `null` clears the person's own quantity, so the worked-out one is used again. */
    qtyOverride: v.union(v.number(), v.null()), supplier: v.string(), leadTimeDays: v.union(v.number(), v.null()),
    unitCostCents: v.union(v.number(), v.null()), notes: v.string(),
    /** Drops the line's own amounts, so it follows the job's measurements again (D-137). */
    useJobMeasurements: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.lineId);
    if (l === null) throw new ConvexError("That line no longer exists.");
    const { staff } = await projectOf(ctx, l.opportunityId, "edit");
    if (args.qtyOverride !== null && (!Number.isFinite(args.qtyOverride) || args.qtyOverride < 0 || args.qtyOverride > 10_000_000)) throw new ConvexError("Check the quantity.");
    if (args.leadTimeDays !== null && (!Number.isInteger(args.leadTimeDays) || args.leadTimeDays < 0 || args.leadTimeDays > 365)) throw new ConvexError("The lead time is between 0 and 365 days.");
    if (args.unitCostCents !== null && (!Number.isInteger(args.unitCostCents) || args.unitCostCents < 0)) throw new ConvexError("Check the cost.");
    const costs = allows(staff.levels.prices, "view");
    let reset = {};
    if (args.useJobMeasurements && l.measures) {
      const r = lineQuantity({ formula: l.formula, wastagePercent: l.wastagePercent, rounding: l.rounding, inputs: inputsOf(await takeoffOf(ctx, l.opportunityId)) });
      reset = { measures: undefined, ...(r.ok ? { calcQty: r.qty, calcError: undefined } : { calcQty: undefined, calcError: r.error }) };
    }
    await ctx.db.patch(l._id, {
      qtyOverride: args.qtyOverride ?? undefined, supplier: args.supplier.trim().slice(0, 100), leadTimeDays: args.leadTimeDays ?? undefined,
      ...(costs ? { unitCostCents: args.unitCostCents ?? undefined } : {}), notes: args.notes.trim().slice(0, 1000), ...reset,
    });
  },
});

/** Reads the material again (its formula, supplier, cost and lead time) and works the line out from its measurements. The person's own quantity is cleared. */
export const refreshLine = mutation({
  args: { lineId: v.id("takeoffLines") },
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.lineId);
    if (l === null) throw new ConvexError("That line no longer exists.");
    const { p } = await projectOf(ctx, l.opportunityId, "edit");
    const m = l.materialId ? await ctx.db.get(l.materialId) : null;
    if (m === null) throw new ConvexError("This material is no longer in the list, so there is nothing to refresh from.");
    const r = lineQuantity({ formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, inputs: { ...inputsOf(await takeoffOf(ctx, p._id)), ...(l.measures ?? {}) } });
    await ctx.db.patch(l._id, { ...snapshot(m), qtyOverride: undefined, ...(r.ok ? { calcQty: r.qty, calcError: undefined } : { calcQty: undefined, calcError: r.error }) });
  },
});

/** The approved quote's services and how each is linked to material kits (D-137), for the Takeoff tab's "From the quote" card. */
export const fromQuote = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won") return null;
    await requireProject(ctx, p, "pipelinePreplanning", "view");
    const { quote, lines } = await quoteServices(ctx, p);
    return {
      quote: quote ? { id: quote._id, number: quote.number, status: quote.status } : null,
      lines: lines.map((l) => ({
        name: l.name, service: l.service, quantity: l.quantity, suggested: l.suggested,
        link: l.link ? { kitIds: l.link.row.kitIds, measure: l.link.row.measure, shared: l.link.shared } : null,
      })),
    };
  },
});

/** Links a quoted service to the kits it needs, for this and every later job. A product of an installation group ("AG Standard Install -
 *  Malibu") also becomes the group's link when the group has none, so the other products need no linking. No kits removes the link. */
export const linkService = mutation({
  args: {
    id: v.id("opportunities"), name: v.string(), kitIds: v.array(v.id("materialKits")),
    measure: v.union(v.literal("area"), v.literal("perimeter"), v.literal("length"), v.literal("quantity"), v.literal("none")), now: v.number(),
  },
  handler: async (ctx, args) => {
    const { p, staff } = await projectOf(ctx, args.id, "edit");
    const service = serviceOf(args.name);
    if (!service || service.length > 200) throw new ConvexError("That service has no name.");
    if (!(LINK_MEASURES as readonly string[]).includes(args.measure)) throw new ConvexError("Pick what the quantity measures.");
    const kitIds = [...new Set(args.kitIds)];
    if (kitIds.length > 20) throw new ConvexError("A service can use up to 20 kits.");
    for (const id of kitIds) if ((await ctx.db.get(id))?.businessId !== p.businessId) throw new ConvexError("That kit no longer exists.");
    const find = (name: string) => ctx.db.query("serviceKits").withIndex("by_business_and_key", (q) => q.eq("businessId", p.businessId).eq("key", serviceKey(name))).first();
    const write = async (name: string, existing: Doc<"serviceKits"> | null) => {
      const row = { service: name, kitIds, measure: args.measure, updatedAt: args.now, updatedByName: staff.name };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("serviceKits", { businessId: p.businessId, key: serviceKey(name), ...row });
    };
    const own = await find(service);
    const group = sharedService(service);
    if (kitIds.length === 0) {
      if (own) await ctx.db.delete(own._id);
      // With no link of its own it would take its group's again, so the group's goes too.
      const shared = group ? await find(group) : null;
      if (shared) await ctx.db.delete(shared._id);
      return;
    }
    await write(service, own);
    if (group && (await find(group)) === null) await write(group, null);
  },
});

/** Adds the materials of the linked services and fills measurements nobody typed (D-137). */
export const fill = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const { p, staff } = await projectOf(ctx, args.id, "edit");
    return fillTakeoff(ctx, p, staff.name, args.now);
  },
});

export const removeLine = mutation({
  args: { lineId: v.id("takeoffLines") },
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.lineId);
    if (l === null) return;
    await projectOf(ctx, l.opportunityId, "edit");
    await ctx.db.delete(l._id);
  },
});
