import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import { activeSalesSession, hashToken, sessionExpiry } from "./session";

export const start = internalMutation({
  args: { token: v.string(), email: v.string(), name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const expiresAt = sessionExpiry();
    const sessionId = await ctx.db.insert("salesSessions", {
      token: await hashToken(args.token),
      expiresAt,
      email: args.email,
      name: args.name,
    });
    await ctx.scheduler.runAt(expiresAt, internal.sales.mutations.expire, { sessionId });
    return args.token;
  },
});

export const expire = internalMutation({
  args: { sessionId: v.id("salesSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("salesSessions", args.sessionId);
    return null;
  },
});

/** Backstop for sessions whose scheduled expiry never ran. */
export const purgeExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("salesSessions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(200);
    for (const session of stale) await ctx.db.delete("salesSessions", session._id);
    if (stale.length === 200) {
      await ctx.scheduler.runAfter(0, internal.sales.mutations.purgeExpired, {});
    }
    return null;
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
