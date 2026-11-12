import { mutation, query } from "../_generated/server";
import { requireStaff } from "./lib/access";
import { RENAMED, TURF_NAME, TURF_SLUG } from "./lib/businessNames";

/** The businesses this person may work in (an Admin: all three), in the order they were created. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    const all = await ctx.db.query("businesses").take(20);
    return staff.isAdmin ? all : all.filter((b) => staff.businessIds.includes(b._id));
  },
});

/** Renames Quality First Turf to Quality First Turf Landscape (D-066). The slug stays, so nothing that looks the business up breaks. Safe to run again. */
export const alignNames = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const row = await ctx.db.query("businesses").withIndex("by_slug", (q) => q.eq("slug", TURF_SLUG)).first();
    if (row && row.name !== TURF_NAME) await ctx.db.patch(row._id, { name: TURF_NAME });
    // Any other business still under an old name, such as "Quality First Construction" (now "Quality First Turf Construction").
    for (const b of await ctx.db.query("businesses").take(20)) {
      const fixed = RENAMED[b.name];
      if (fixed && b.slug !== TURF_SLUG && fixed !== b.name) await ctx.db.patch(b._id, { name: fixed });
    }
  },
});
