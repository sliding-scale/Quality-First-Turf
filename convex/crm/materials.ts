import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireModule } from "./lib/access";
import { nameKeyOf } from "./lib/catalogue";
import { formulaProblem } from "./lib/formula";
import { allows } from "./lib/permissions";
import { ROUNDINGS } from "./lib/takeoff";

/** The business's materials (PRD 4.2, plan 2026-11-19-takeoff): editable data, the catalogue and formulas the client supplies. They are managed by
 *  whoever works on Preplanning (Admin, Office, Project Manager); Sales can look. Costs show only to someone who can see prices. */

const MAX_CENTS = 100_000_000_00;
const PAGE_SIZE = 25;
const LIST_CAP = 3000;

const roundingV = v.union(v.literal("up"), v.literal("nearest"), v.literal("none"));
const fields = {
  name: v.string(),
  sku: v.string(),
  category: v.string(),
  unit: v.string(),
  costCents: v.optional(v.number()),
  supplier: v.string(),
  leadTimeDays: v.optional(v.number()),
  inStock: v.optional(v.number()),
  sizeDetails: v.string(),
  formula: v.string(),
  wastagePercent: v.number(),
  rounding: roundingV,
};

const view = (m: Doc<"materials">, costs: boolean) => ({
  id: m._id, name: m.name, sku: m.sku, category: m.category, unit: m.unit, costCents: costs ? m.costCents ?? null : null, supplier: m.supplier, leadTimeDays: m.leadTimeDays ?? null,
  inStock: m.inStock ?? null, sizeDetails: m.sizeDetails, formula: m.formula, wastagePercent: m.wastagePercent, rounding: m.rounding,
});

export const list = query({
  args: { businessId: v.id("businesses"), search: v.string(), page: v.number() },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "pipelinePreplanning", "view");
    const costs = allows(staff.levels.prices, "view");
    const all = await ctx.db.query("materials").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId)).take(LIST_CAP);
    const term = args.search.trim().toLowerCase();
    const found = term ? all.filter((m) => `${m.name} ${m.sku} ${m.category} ${m.supplier}`.toLowerCase().includes(term)) : all;
    const page = Math.max(1, Math.floor(args.page));
    return { rows: found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((m) => view(m, costs)), total: found.length, pageSize: PAGE_SIZE };
  },
});

/** Every material, for the takeoff's "add a material" picker. */
export const options = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "pipelinePreplanning", "view");
    const all = await ctx.db.query("materials").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId)).take(LIST_CAP);
    return all.map((m) => ({ id: m._id, name: m.name, sku: m.sku, unit: m.unit, supplier: m.supplier, category: m.category }));
  },
});

function check(a: { name: string; unit: string; formula: string; wastagePercent: number; rounding: string; costCents?: number; leadTimeDays?: number; inStock?: number }) {
  const name = a.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Give the material a name.");
  if (name.length > 200) throw new ConvexError("The name is too long.");
  if (!a.unit.trim()) throw new ConvexError("Say what it is ordered in (roll, bag, ton...).");
  const why = formulaProblem(a.formula);
  if (why) throw new ConvexError(`Formula: ${why}`);
  if (!Number.isFinite(a.wastagePercent) || a.wastagePercent < 0 || a.wastagePercent > 100) throw new ConvexError("Wastage is between 0 and 100 percent.");
  if (!(ROUNDINGS as readonly string[]).includes(a.rounding)) throw new ConvexError("Pick how to round.");
  if (a.costCents !== undefined && (!Number.isInteger(a.costCents) || a.costCents < 0 || a.costCents > MAX_CENTS)) throw new ConvexError("Check the cost.");
  if (a.leadTimeDays !== undefined && (!Number.isInteger(a.leadTimeDays) || a.leadTimeDays < 0 || a.leadTimeDays > 365)) throw new ConvexError("The lead time is between 0 and 365 days.");
  if (a.inStock !== undefined && (!Number.isFinite(a.inStock) || a.inStock < 0)) throw new ConvexError("Check the amount in stock.");
  return name;
}

export const save = mutation({
  args: { id: v.optional(v.id("materials")), businessId: v.id("businesses"), ...fields, now: v.number() },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "pipelinePreplanning", "edit");
    const name = check(args);
    const nameKey = nameKeyOf(name);
    const same = await ctx.db.query("materials").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId).eq("nameKey", nameKey)).first();
    if (same && same._id !== args.id) throw new ConvexError("A material with that name already exists.");
    const existing = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (existing === null || existing.businessId !== args.businessId)) throw new ConvexError("That material no longer exists.");
    // Someone who cannot see prices cannot change a cost: the one on the material stays.
    const costs = allows(staff.levels.prices, "view");
    const costCents = costs ? args.costCents : existing?.costCents;
    const row = {
      name, nameKey, sku: args.sku.trim().slice(0, 60), category: args.category.trim().slice(0, 60), unit: args.unit.trim().slice(0, 30), costCents, supplier: args.supplier.trim().slice(0, 100),
      leadTimeDays: args.leadTimeDays, inStock: args.inStock, sizeDetails: args.sizeDetails.trim().slice(0, 300), formula: args.formula.trim(), wastagePercent: args.wastagePercent,
      rounding: args.rounding, updatedAt: args.now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert("materials", { businessId: args.businessId, createdAt: args.now, ...row });
  },
});

export const remove = mutation({
  args: { id: v.id("materials") },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.id);
    if (m === null) return;
    await requireModule(ctx, m.businessId, "pipelinePreplanning", "full");
    await ctx.db.delete(m._id);
  },
});

