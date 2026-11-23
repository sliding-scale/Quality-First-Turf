import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAdmin, requireStaff } from "./lib/access";
import { checkCompanyDetails } from "./lib/companyDetails";
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

/** An Admin sets a business's phone, email and website (D-112). An empty value removes the field. The name is not touched here. */
export const saveDetails = mutation({
  args: { businessId: v.id("businesses"), phone: v.string(), email: v.string(), website: v.string() },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(a.businessId);
    if (!row) throw new ConvexError("That business no longer exists.");
    const checked = checkCompanyDetails({ phone: a.phone, email: a.email, website: a.website });
    if (!checked.ok) throw new ConvexError(Object.values(checked.problems)[0] ?? "Check the details and try again.");
    const { phone, email, website } = checked.value;
    await ctx.db.patch(row._id, { phone: phone || undefined, email: email || undefined, website: website || undefined });
    return null;
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
