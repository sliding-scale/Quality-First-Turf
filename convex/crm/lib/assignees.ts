import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** A task or booking can be given to any active person on the business (an Admin counts for every business). */
export async function checkAssignee(ctx: MutationCtx, assigneeId: Id<"users"> | undefined, businessId: Id<"businesses">) {
  if (assigneeId === undefined) return;
  const user = await ctx.db.get(assigneeId);
  if (user === null || user.status !== "active" || !(user.roles.includes("admin") || user.businessIds.includes(businessId))) {
    throw new ConvexError("That person is not on this business team.");
  }
}
