import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireBusiness } from "./lib/access";

/** A client's projects, newest first, for the Related projects table on the client page. */
export const byClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (client === null) return [];
    await requireBusiness(ctx, client.businessId);
    const rows = await ctx.db.query("opportunities").withIndex("by_clientId", (q) => q.eq("clientId", args.clientId)).take(50);
    return rows.sort((a, b) => b.requestedAt - a.requestedAt);
  },
});
