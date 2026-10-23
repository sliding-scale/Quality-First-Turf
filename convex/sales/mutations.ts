import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { activeSalesSession, sessionExpiry } from "./session";

export const start = internalMutation({
  args: { token: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ctx.db.insert("salesSessions", {
      token: args.token,
      expiresAt: sessionExpiry(),
    });
    return args.token;
  },
});

export const end = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken);
    if (session !== null) await ctx.db.delete("salesSessions", session._id);
    return null;
  },
});
