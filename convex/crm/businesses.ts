import { query } from "../_generated/server";
import { requireStaff } from "./lib/access";

/** The businesses this person may work in (an Admin: all three), in the order they were created. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    const all = await ctx.db.query("businesses").take(20);
    return staff.isAdmin ? all : all.filter((b) => staff.businessIds.includes(b._id));
  },
});
