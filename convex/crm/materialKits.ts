import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireModule } from "./lib/access";
import { nameKeyOf } from "./lib/catalogue";
import { formulaInputs } from "./lib/formula";
import { STARTER_KITS, STARTER_MATERIALS } from "./lib/materialStarter";
import { TAKEOFF_INPUTS } from "./lib/takeoff";

/** Kits (D-104): a named list of materials that go on a takeoff together. They follow the same rule as materials: Admin, Office and Project Manager edit,
 *  Sales can look, an Admin deletes. A kit holds no rates; each material has its own formula. */

const LIST_CAP = 300;
const MAX_ITEMS = 60;
const inputOrder = (k: string) => TAKEOFF_INPUTS.findIndex((i) => i.key === k);

export const list = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "pipelinePreplanning", "view");
    const kits = await ctx.db.query("materialKits").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId)).take(LIST_CAP);
    const out = [];
    for (const k of kits) {
      const items: { id: Id<"materials">; name: string; unit: string; formula: string }[] = [];
      for (const id of k.materialIds) {
        const m = await ctx.db.get(id);
        if (m !== null && m.businessId === args.businessId) items.push({ id: m._id, name: m.name, unit: m.unit, formula: m.formula });
      }
      const uses = [...new Set(items.flatMap((i) => formulaInputs(i.formula)))].filter((k2) => inputOrder(k2) >= 0).sort((a, b) => inputOrder(a) - inputOrder(b));
      out.push({ id: k._id, name: k.name, group: k.group, description: k.description, items, missing: k.materialIds.length - items.length, uses });
    }
    return out.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  },
});

export const save = mutation({
  args: { id: v.optional(v.id("materialKits")), businessId: v.id("businesses"), name: v.string(), group: v.string(), description: v.string(), materialIds: v.array(v.id("materials")), now: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "pipelinePreplanning", "edit");
    const name = args.name.trim().replace(/\s+/g, " ");
    if (!name) throw new ConvexError("Give the kit a name.");
    if (name.length > 120) throw new ConvexError("The name is too long.");
    if (args.materialIds.length === 0) throw new ConvexError("A kit needs at least one material.");
    if (args.materialIds.length > MAX_ITEMS) throw new ConvexError(`A kit has up to ${MAX_ITEMS} materials.`);
    if (new Set(args.materialIds).size !== args.materialIds.length) throw new ConvexError("A material can be in a kit only once.");
    for (const id of args.materialIds) {
      const m = await ctx.db.get(id);
      if (m === null || m.businessId !== args.businessId) throw new ConvexError("One of the materials no longer exists.");
    }
    const nameKey = nameKeyOf(name);
    const same = await ctx.db.query("materialKits").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId).eq("nameKey", nameKey)).first();
    if (same && same._id !== args.id) throw new ConvexError("A kit with that name already exists.");
    const existing = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (existing === null || existing.businessId !== args.businessId)) throw new ConvexError("That kit no longer exists.");
    const row = { name, nameKey, group: args.group.trim().slice(0, 60), description: args.description.trim().slice(0, 300), materialIds: args.materialIds, updatedAt: args.now };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert("materialKits", { businessId: args.businessId, createdAt: args.now, ...row });
  },
});

export const remove = mutation({
  args: { id: v.id("materialKits") },
  handler: async (ctx, args) => {
    const k = await ctx.db.get(args.id);
    if (k === null) return;
    await requireModule(ctx, k.businessId, "pipelinePreplanning", "full");
    await ctx.db.delete(k._id);
  },
});

/** Loads the client's material calculator (lib/materialStarter.ts): each material and kit that is not already there by name. Anything the team has
 *  already added or edited is kept as it is, so running it again only fills in what is missing. Admin only. */
export const loadStarter = mutation({
  args: { businessId: v.id("businesses"), now: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "pipelinePreplanning", "full");
    const ids = new Map<string, Id<"materials">>();
    let materialsAdded = 0;
    let materialsKept = 0;
    for (const s of STARTER_MATERIALS) {
      const nameKey = nameKeyOf(s.name);
      const found: Doc<"materials"> | null = await ctx.db.query("materials").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId).eq("nameKey", nameKey)).first();
      if (found) {
        ids.set(s.name, found._id);
        materialsKept += 1;
        continue;
      }
      ids.set(s.name, await ctx.db.insert("materials", {
        businessId: args.businessId, name: s.name, nameKey, sku: "", category: s.category, unit: s.unit, supplier: "", sizeDetails: s.sizeDetails, formula: s.formula,
        wastagePercent: s.wastagePercent, rounding: s.rounding, createdAt: args.now, updatedAt: args.now,
      }));
      materialsAdded += 1;
    }
    let kitsAdded = 0;
    let kitsKept = 0;
    for (const k of STARTER_KITS) {
      const nameKey = nameKeyOf(k.name);
      const found = await ctx.db.query("materialKits").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId).eq("nameKey", nameKey)).first();
      if (found) {
        kitsKept += 1;
        continue;
      }
      await ctx.db.insert("materialKits", {
        businessId: args.businessId, name: k.name, nameKey, group: k.group, description: k.description, materialIds: k.items.map((n) => ids.get(n)!), createdAt: args.now, updatedAt: args.now,
      });
      kitsAdded += 1;
    }
    return { materialsAdded, kitsAdded, materialsKept, kitsKept };
  },
});
