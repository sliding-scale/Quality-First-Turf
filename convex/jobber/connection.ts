import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function loadConnection(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("jobberConnections")
    .withIndex("by_singleton", (q) => q.eq("singleton", "default"))
    .unique();
}
