import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireProject } from "./lib/access";
import { allows } from "./lib/permissions";
import { emptyInputs, lineQuantity, summarize, TAKEOFF_INPUTS } from "./lib/takeoff";

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

/** Measurements to start from when the project came from the customer form: its work areas added up. Null when there is nothing to read. */
async function suggestion(ctx: QueryCtx, p: Doc<"opportunities">): Promise<{ area: number; perimeter: number } | null> {
  if (!p.sourceProjectId) return null;
  const areas = await ctx.db.query("workAreas").withIndex("by_projectId", (q) => q.eq("projectId", p.sourceProjectId!)).take(100);
  let area = 0;
  let perimeter = 0;
  for (const a of areas) {
    if (a.length === null || a.width === null) continue;
    const n = a.quantity ?? 1;
    area += a.length * a.width * n;
    perimeter += 2 * (a.length + a.width) * n;
  }
  return area > 0 ? { area: Math.round(area * 100) / 100, perimeter: Math.round(perimeter * 100) / 100 } : null;
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
    const lines = rows.map((l) => ({
      id: l._id, name: l.name, sku: l.sku, unit: l.unit, formula: l.formula, wastagePercent: l.wastagePercent, calcQty: l.calcQty ?? null, calcError: l.calcError ?? null,
      qtyOverride: l.qtyOverride ?? null, qty: l.qtyOverride ?? l.calcQty ?? 0, unitCostCents: costs ? l.unitCostCents ?? null : null, supplier: l.supplier,
      leadTimeDays: l.leadTimeDays ?? null, inStock: l.inStock ?? null, notes: l.notes, materialId: l.materialId ?? null,
    }));
    const summary = summarize(lines.map((l) => ({ name: l.name, unit: l.unit, qty: l.qty, unitCostCents: l.unitCostCents, supplier: l.supplier, leadTimeDays: l.leadTimeDays, inStock: l.inStock })));
    return {
      inputs: inputsOf(t), saved: t !== null, updatedAt: t?.updatedAt ?? null, updatedByName: t?.updatedByName ?? null, suggested: await suggestion(ctx, p),
      lines, summary, canSeeCosts: costs, inputList: TAKEOFF_INPUTS.map((i) => ({ key: i.key, label: i.label, unit: i.unit })),
    };
  },
});

/** Works every line out again from the measurements, unless the person typed their own quantity for it (that stays, and the worked-out one is still kept). */
async function recalc(ctx: MutationCtx, id: Id<"opportunities">, inputs: Record<string, number>) {
  for (const l of await linesOf(ctx, id)) {
    const r = lineQuantity({ formula: l.formula, wastagePercent: l.wastagePercent, rounding: l.rounding, inputs });
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
  materialId: m._id, name: m.name, sku: m.sku, unit: m.unit, formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, unitCostCents: m.costCents,
  supplier: m.supplier, leadTimeDays: m.leadTimeDays, inStock: m.inStock,
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
    qtyOverride: v.union(v.number(), v.null()), supplier: v.string(), leadTimeDays: v.union(v.number(), v.null()), inStock: v.union(v.number(), v.null()),
    unitCostCents: v.union(v.number(), v.null()), notes: v.string(),
  },
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.lineId);
    if (l === null) throw new ConvexError("That line no longer exists.");
    const { staff } = await projectOf(ctx, l.opportunityId, "edit");
    if (args.qtyOverride !== null && (!Number.isFinite(args.qtyOverride) || args.qtyOverride < 0 || args.qtyOverride > 10_000_000)) throw new ConvexError("Check the quantity.");
    if (args.leadTimeDays !== null && (!Number.isInteger(args.leadTimeDays) || args.leadTimeDays < 0 || args.leadTimeDays > 365)) throw new ConvexError("The lead time is between 0 and 365 days.");
    if (args.inStock !== null && (!Number.isFinite(args.inStock) || args.inStock < 0)) throw new ConvexError("Check the amount in stock.");
    if (args.unitCostCents !== null && (!Number.isInteger(args.unitCostCents) || args.unitCostCents < 0)) throw new ConvexError("Check the cost.");
    const costs = allows(staff.levels.prices, "view");
    await ctx.db.patch(l._id, {
      qtyOverride: args.qtyOverride ?? undefined, supplier: args.supplier.trim().slice(0, 100), leadTimeDays: args.leadTimeDays ?? undefined, inStock: args.inStock ?? undefined,
      ...(costs ? { unitCostCents: args.unitCostCents ?? undefined } : {}), notes: args.notes.trim().slice(0, 1000),
    });
  },
});

/** Reads the material again (its formula, supplier, cost, lead time and stock) and works the line out from the project's measurements. The person's own quantity is cleared. */
export const refreshLine = mutation({
  args: { lineId: v.id("takeoffLines") },
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.lineId);
    if (l === null) throw new ConvexError("That line no longer exists.");
    const { p } = await projectOf(ctx, l.opportunityId, "edit");
    const m = l.materialId ? await ctx.db.get(l.materialId) : null;
    if (m === null) throw new ConvexError("This material is no longer in the list, so there is nothing to refresh from.");
    const r = lineQuantity({ formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, inputs: inputsOf(await takeoffOf(ctx, p._id)) });
    await ctx.db.patch(l._id, { ...snapshot(m), qtyOverride: undefined, ...(r.ok ? { calcQty: r.qty, calcError: undefined } : { calcQty: undefined, calcError: r.error }) });
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
