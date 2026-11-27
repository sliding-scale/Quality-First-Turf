/* Filling a project's takeoff from its approved quote and site visit (D-137). Used when a sale is won, and by the Takeoff tab's button. */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { emptyInputs, lineQuantity } from "./takeoff";
import { planFill, serviceKey, serviceOf, sharedService, suggestMeasure, type LinkMeasure } from "./takeoffLinks";
import { workAreasOf } from "./visitData";

/** Measurements to start from when the project has a site visit (the CRM's, else the customer form's): its work areas added up. Null when there is nothing to read. */
export async function visitMeasurements(ctx: QueryCtx, p: Doc<"opportunities">): Promise<{ area: number; perimeter: number } | null> {
  const areas = await workAreasOf(ctx, p);
  if (areas === null) return null;
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

/** The quote the job was sold on: the newest approved (or converted) one. */
export async function approvedQuote(ctx: QueryCtx, opportunityId: Id<"opportunities">) {
  const quotes = await ctx.db.query("quotes").withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId)).take(50);
  return quotes.filter((q) => q.status === "Approved" || q.status === "Converted").sort((a, b) => b.createdAt - a.createdAt || b.number - a.number)[0] ?? null;
}

/** The kits and measurement a service is linked to: its own link, else the one its installation group shares. */
export async function linkOf(ctx: QueryCtx, businessId: Id<"businesses">, service: string) {
  const find = (name: string) => ctx.db.query("serviceKits").withIndex("by_business_and_key", (q) => q.eq("businessId", businessId).eq("key", serviceKey(name))).first();
  const own = await find(service);
  if (own) return { row: own, shared: null };
  const group = sharedService(service);
  const row = group ? await find(group) : null;
  return row ? { row, shared: group } : null;
}

/** The approved quote's priced lines that count (an optional line only when ticked), each with its service and link. */
export async function quoteServices(ctx: QueryCtx, p: Doc<"opportunities">) {
  const quote = await approvedQuote(ctx, p._id);
  if (!quote) return { quote: null, lines: [] };
  const rows = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(200);
  const lines = [];
  for (const l of rows) {
    if (l.kind === "text" || (l.optional && !l.selected)) continue;
    const name = l.catalogueName ?? l.name;
    const service = serviceOf(name);
    lines.push({ name, service, quantity: l.quantity, link: await linkOf(ctx, p.businessId, service), suggested: suggestMeasure(name) as LinkMeasure });
  }
  return { quote, lines };
}

/** Adds the materials the linked services need that are not on the takeoff yet, and fills measurements nobody has typed: area, length and the
 *  rest from the quote, otherwise area and perimeter from the site visit. Typed measurements and existing lines are left as they are. */
export async function fillTakeoff(ctx: MutationCtx, p: Doc<"opportunities">, byName: string, now: number) {
  const { quote, lines } = await quoteServices(ctx, p);
  const fillable = [];
  const missing = new Set<Id<"materials">>();
  for (const l of lines) {
    if (!l.link) continue;
    const kitMaterials: Id<"materials">[][] = [];
    for (const kitId of l.link.row.kitIds) {
      const kit = await ctx.db.get(kitId);
      if (kit && kit.businessId === p.businessId) kitMaterials.push(kit.materialIds);
    }
    fillable.push({ quantity: l.quantity, kitMaterials, measure: l.link.row.measure });
  }
  const plan = planFill(fillable);

  const takeoff = await ctx.db.query("takeoffs").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).unique();
  const inputs: Record<string, number> = { ...emptyInputs(), ...(takeoff?.inputs ?? {}) };
  const visit = await visitMeasurements(ctx, p);
  let measured = false;
  const take = (key: string, value: number | undefined) => {
    if (value !== undefined && value > 0 && !(inputs[key] > 0)) { inputs[key] = Math.round(value * 1000) / 1000; measured = true; }
  };
  for (const [key, value] of plan.totals) take(key, value);
  take("area", visit?.area);
  take("perimeter", visit?.perimeter);
  if (measured) {
    const stamp = { inputs, updatedAt: now, updatedByName: byName };
    if (takeoff) await ctx.db.patch(takeoff._id, stamp);
    else await ctx.db.insert("takeoffs", { businessId: p.businessId, opportunityId: p._id, ...stamp });
  }

  const existing = await ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(500);
  const have = new Set(existing.map((l) => l.materialId));
  let position = existing.length;
  let added = 0;
  for (const [materialId, amounts] of plan.needs) {
    const id = materialId as Id<"materials">;
    if (have.has(id)) continue;
    const m = await ctx.db.get(id);
    if (m === null || m.businessId !== p.businessId) { missing.add(id); continue; }
    // The line keeps amounts of its own only where they differ from the job's measurement (two services of different sizes).
    const own = Object.fromEntries([...amounts].filter(([key, value]) => Math.abs((inputs[key] ?? 0) - value) > 0.001));
    const r = lineQuantity({ formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding, inputs: { ...inputs, ...own } });
    await ctx.db.insert("takeoffLines", {
      businessId: p.businessId, opportunityId: p._id, position: position++, materialId: m._id, name: m.name, category: m.category, sku: m.sku, unit: m.unit, formula: m.formula,
      wastagePercent: m.wastagePercent, rounding: m.rounding, unitCostCents: m.costCents, supplier: m.supplier, leadTimeDays: m.leadTimeDays, notes: "",
      ...(Object.keys(own).length ? { measures: own } : {}), ...(r.ok ? { calcQty: r.qty } : { calcError: r.error }),
    });
    added += 1;
  }
  // Lines already there are worked out again with any measurement just filled in.
  if (measured) {
    for (const l of existing) {
      const r = lineQuantity({ formula: l.formula, wastagePercent: l.wastagePercent, rounding: l.rounding, inputs: { ...inputs, ...(l.measures ?? {}) } });
      await ctx.db.patch(l._id, r.ok ? { calcQty: r.qty, calcError: undefined } : { calcQty: undefined, calcError: r.error });
    }
  }
  return { added, measured, quoteNumber: quote?.number ?? null, unlinked: [...new Set(lines.filter((l) => !l.link).map((l) => l.service))] };
}
