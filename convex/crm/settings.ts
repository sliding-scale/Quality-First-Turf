import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireAdmin, requireStaff } from "./lib/access";
import { DEFAULT_TIME_ZONE } from "./lib/schedule";

/* Settings for the whole CRM (Settings > General). Today that is the time zone. Anyone signed in reads it; only an Admin changes it. */

/** The CRM's time zone: the saved one, or Los Angeles until someone sets it. */
export async function businessZone(ctx: QueryCtx): Promise<string> {
  const row = await ctx.db.query("crmSettings").withIndex("by_singleton", (q) => q.eq("singleton", "default")).unique();
  return row?.timeZone ?? DEFAULT_TIME_ZONE;
}

export const timeZone = query({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireStaff(ctx);
    return businessZone(ctx);
  },
});

export const setTimeZone = mutation({
  args: { timeZone: v.string() },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const zone = a.timeZone.trim();
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
    } catch {
      throw new ConvexError("That is not a time zone this system knows.");
    }
    const row = await ctx.db.query("crmSettings").withIndex("by_singleton", (q) => q.eq("singleton", "default")).unique();
    if (row) await ctx.db.patch(row._id, { timeZone: zone });
    else await ctx.db.insert("crmSettings", { singleton: "default", timeZone: zone });
  },
});
