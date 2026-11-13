import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireBusiness, requireEditor, type Staff } from "./lib/access";
import { MAX_LIBRARY, STARTER_DISCLAIMERS, checkDisclaimer, sameTitle } from "./lib/disclaimers";

/* The library of saved disclaimers (D-075) that a quote can attach. Anyone who works on the business can read it (the quote builder
   needs it); an Admin or the Office team changes it. A quote keeps a copy of each disclaimer it attaches, so changing or deleting one
   here never changes a quote that was already made. */

/** Who may add, change or delete library entries: Admins and the Office team (user, 2026-11-13). */
async function requireLibraryEditor(ctx: MutationCtx, businessId: Id<"businesses">): Promise<Staff> {
  const staff = await requireBusiness(ctx, businessId);
  if (!staff.isAdmin && !staff.roles.includes("office")) throw new ConvexError("Only an Admin or the Office team can change the disclaimers.");
  return staff;
}

export const list = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const rows = await ctx.db.query("disclaimers").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_LIBRARY + 1);
    const defaults = await ctx.db.query("quoteDefaults").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    return {
      items: rows.sort((x, y) => x.title.localeCompare(y.title)).map((d) => ({ id: d._id, title: d.title, text: d.text, updatedAt: d.updatedAt, updatedByName: d.updatedByName })),
      /** False until the starter wording has been added once; the screens ask for that. */
      seeded: defaults?.disclaimersSeededAt !== undefined,
    };
  },
});

/** Adds the starter disclaimers to a business's library the first time, and never again (deleting them all does not bring them back). */
export const ensureDefaults = mutation({
  args: { businessId: v.id("businesses"), now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireEditor(ctx, a.businessId);
    const row = await ctx.db.query("quoteDefaults").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    if (row?.disclaimersSeededAt !== undefined) return null;
    const existing = await ctx.db.query("disclaimers").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_LIBRARY);
    for (const d of STARTER_DISCLAIMERS) {
      if (existing.some((e) => sameTitle(e.title, d.title))) continue;
      await ctx.db.insert("disclaimers", { businessId: a.businessId, title: d.title, text: d.text, createdAt: a.now, updatedAt: a.now, updatedByName: staff.name });
    }
    if (row) await ctx.db.patch(row._id, { disclaimersSeededAt: a.now });
    else await ctx.db.insert("quoteDefaults", { businessId: a.businessId, disclaimersSeededAt: a.now });
    return null;
  },
});

export const save = mutation({
  args: { businessId: v.id("businesses"), id: v.optional(v.id("disclaimers")), title: v.string(), text: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireLibraryEditor(ctx, a.businessId);
    const problem = checkDisclaimer({ title: a.title, text: a.text });
    if (problem) throw new ConvexError(problem);
    const title = a.title.trim();
    const text = a.text.trim();
    const all = await ctx.db.query("disclaimers").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_LIBRARY + 1);
    if (all.some((d) => d._id !== a.id && sameTitle(d.title, title))) throw new ConvexError("There is already a disclaimer with that title.");
    if (a.id) {
      const row = await ctx.db.get(a.id);
      if (!row || row.businessId !== a.businessId) throw new ConvexError("That disclaimer no longer exists.");
      await ctx.db.patch(row._id, { title, text, updatedAt: a.now, updatedByName: staff.name });
      return row._id;
    }
    if (all.length >= MAX_LIBRARY) throw new ConvexError(`The library can hold up to ${MAX_LIBRARY} disclaimers.`);
    return await ctx.db.insert("disclaimers", { businessId: a.businessId, title, text, createdAt: a.now, updatedAt: a.now, updatedByName: staff.name });
  },
});

export const remove = mutation({
  args: { id: v.id("disclaimers") },
  handler: async (ctx, a) => {
    const row = await ctx.db.get(a.id);
    if (!row) return null;
    await requireLibraryEditor(ctx, row.businessId);
    await ctx.db.delete(row._id);
    return null;
  },
});
