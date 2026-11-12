import { ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { canEdit, requireStaff } from "./lib/access";

/** A place to upload one photo or voice note for a note. Only people who may write notes get one. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    if (!canEdit(staff)) throw new ConvexError("Your role can view this but not change it.");
    return await ctx.storage.generateUploadUrl();
  },
});
