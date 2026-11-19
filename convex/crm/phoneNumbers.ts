import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireModule } from "./lib/access";
import { displayPhone, normalizePhone } from "./lib/phone";

/** A business's phone numbers for texting (PRD 5.3: multiple numbers). Admins keep them in Settings > Phone numbers. A text goes out from the
 *  business's first number, and a text sent to one of these numbers is filed under that business. A number belongs to one business only. */

export const list = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "messages", "view");
    const rows = await ctx.db.query("phoneNumbers").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).take(50);
    return rows.map((r) => ({ id: r._id, number: r.number, display: displayPhone(r.number), label: r.label }));
  },
});

export const add = mutation({
  args: { businessId: v.id("businesses"), number: v.string(), label: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "settings", "edit");
    const number = normalizePhone(args.number);
    if (!number) throw new ConvexError("Enter the number with its area code, such as (555) 123-4567.");
    const label = args.label.trim().slice(0, 60);
    const taken = await ctx.db.query("phoneNumbers").withIndex("by_number", (q) => q.eq("number", number)).first();
    if (taken) throw new ConvexError(taken.businessId === args.businessId ? "That number is already in the list." : "That number belongs to another business.");
    return ctx.db.insert("phoneNumbers", { businessId: args.businessId, number, label, createdAt: args.now });
  },
});

export const remove = mutation({
  args: { id: v.id("phoneNumbers") },
  handler: async (ctx, args) => {
    const n = await ctx.db.get(args.id);
    if (n === null) return;
    await requireModule(ctx, n.businessId, "settings", "edit");
    await ctx.db.delete(n._id);
  },
});
