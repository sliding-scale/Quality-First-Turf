import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireModule, requireProject } from "./lib/access";

/** Checklists (plan 2026-11-19-jobs-extras, Jobber's Settings > Checklists): a template is a name and a list of things to do. A job takes a copy of the
 *  templates it is given, so changing or deleting a template later does not change a job that already has it. Ticking an item records who and when. */

const MAX_ITEMS = 100;
const MAX_ITEM = 200;
const MAX_NAME = 100;

const templateFields = { name: v.string(), items: v.array(v.string()) };

function clean(name: string, items: string[]) {
  const n = name.trim();
  if (!n) throw new ConvexError("Give the checklist a name.");
  if (n.length > MAX_NAME) throw new ConvexError(`The name is longer than ${MAX_NAME} characters.`);
  const rows = items.map((i) => i.trim()).filter(Boolean);
  if (rows.length === 0) throw new ConvexError("Add at least one item to the checklist.");
  if (rows.length > MAX_ITEMS) throw new ConvexError(`A checklist can have up to ${MAX_ITEMS} items.`);
  if (rows.some((i) => i.length > MAX_ITEM)) throw new ConvexError(`An item is longer than ${MAX_ITEM} characters.`);
  return { name: n, items: rows };
}

export const templates = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "jobs", "view");
    const rows = await ctx.db.query("checklistTemplates").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).take(200);
    return rows.sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ id: t._id, name: t.name, items: t.items }));
  },
});

export const saveTemplate = mutation({
  args: { id: v.optional(v.id("checklistTemplates")), businessId: v.id("businesses"), ...templateFields, now: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "templates", "edit");
    const { name, items } = clean(args.name, args.items);
    const same = (await ctx.db.query("checklistTemplates").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).take(200)).find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (same && same._id !== args.id) throw new ConvexError("A checklist with that name already exists.");
    if (args.id) {
      const t = await ctx.db.get(args.id);
      if (t === null || t.businessId !== args.businessId) throw new ConvexError("That checklist no longer exists.");
      await ctx.db.patch(t._id, { name, items, updatedAt: args.now });
      return t._id;
    }
    return ctx.db.insert("checklistTemplates", { businessId: args.businessId, name, items, createdAt: args.now, updatedAt: args.now });
  },
});

export const removeTemplate = mutation({
  args: { id: v.id("checklistTemplates") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.id);
    if (t === null) return;
    await requireModule(ctx, t.businessId, "templates", "edit");
    await ctx.db.delete(t._id);
  },
});

/** The checklists on one job, each with its items in order. */
export const forJob = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.jobNumber === undefined) return [];
    await requireProject(ctx, p, "jobs", "view");
    const rows = await ctx.db.query("jobChecklistItems").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(2000);
    const lists = new Map<string, { listName: string; templateId: Id<"checklistTemplates"> | null; items: { id: Id<"jobChecklistItems">; text: string; done: boolean; doneByName: string | null; doneAt: number | null }[] }>();
    for (const r of rows) {
      const key = r.listName;
      if (!lists.has(key)) lists.set(key, { listName: r.listName, templateId: r.templateId ?? null, items: [] });
      lists.get(key)!.items.push({ id: r._id, text: r.text, done: r.done, doneByName: r.doneByName ?? null, doneAt: r.doneAt ?? null });
    }
    return [...lists.values()];
  },
});

/** Gives a job a copy of a checklist template. A job has each template once. */
export const attach = mutation({
  args: { id: v.id("opportunities"), templateId: v.id("checklistTemplates") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.jobNumber === undefined) throw new ConvexError("That job no longer exists.");
    await requireProject(ctx, p, "jobs", "edit");
    const t = await ctx.db.get(args.templateId);
    if (t === null || t.businessId !== p.businessId) throw new ConvexError("That checklist no longer exists.");
    const existing = await ctx.db.query("jobChecklistItems").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(2000);
    if (existing.some((r) => r.listName === t.name)) throw new ConvexError("This job already has that checklist.");
    for (let i = 0; i < t.items.length; i += 1) {
      await ctx.db.insert("jobChecklistItems", { businessId: p.businessId, opportunityId: p._id, templateId: t._id, listName: t.name, text: t.items[i], position: i, done: false });
    }
  },
});

export const detach = mutation({
  args: { id: v.id("opportunities"), listName: v.string() },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null) return;
    await requireProject(ctx, p, "jobs", "edit");
    for (const r of await ctx.db.query("jobChecklistItems").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(2000)) {
      if (r.listName === args.listName) await ctx.db.delete(r._id);
    }
  },
});

export const setDone = mutation({
  args: { itemId: v.id("jobChecklistItems"), done: v.boolean(), now: v.number() },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.itemId);
    if (r === null) throw new ConvexError("That item no longer exists.");
    const p = await ctx.db.get(r.opportunityId);
    if (p === null) throw new ConvexError("That job no longer exists.");
    const staff = await requireProject(ctx, p, "jobs", "edit");
    await ctx.db.patch(r._id, args.done ? { done: true, doneByName: staff.name, doneAt: args.now } : { done: false, doneByName: undefined, doneAt: undefined });
  },
});
