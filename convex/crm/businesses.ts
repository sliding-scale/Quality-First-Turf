import { query } from "../_generated/server";
import { requireStaff } from "./lib/access";

/** The three businesses, in the order they were created (Quality First Turf first). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return await ctx.db.query("businesses").take(20);
  },
});
