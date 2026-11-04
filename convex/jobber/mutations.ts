import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { loadConnection } from "./connection";

const emptyConnection = {
  singleton: "default" as const,
  refreshToken: null,
  accessToken: null,
  accessTokenExpiresAt: null,
  accountId: null,
  accountName: null,
  oauthState: null,
  codeVerifier: null,
};

export const beginAuthorization = internalMutation({
  args: {
    oauthState: v.string(),
    codeVerifier: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await loadConnection(ctx);
    if (connection === null) {
      await ctx.db.insert("jobberConnections", {
        ...emptyConnection,
        oauthState: args.oauthState,
        codeVerifier: args.codeVerifier,
      });
      return null;
    }
    await ctx.db.patch("jobberConnections", connection._id, {
      oauthState: args.oauthState,
      codeVerifier: args.codeVerifier,
    });
    return null;
  },
});

export const saveTokens = internalMutation({
  args: {
    refreshToken: v.string(),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    accountId: v.union(v.string(), v.null()),
    accountName: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await loadConnection(ctx);
    const tokens = {
      refreshToken: args.refreshToken,
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      accountId: args.accountId,
      accountName: args.accountName,
      oauthState: null,
      codeVerifier: null,
    };
    if (connection === null) {
      await ctx.db.insert("jobberConnections", {
        ...emptyConnection,
        ...tokens,
      });
      return null;
    }
    await ctx.db.patch("jobberConnections", connection._id, tokens);
    return null;
  },
});

export const saveAccount = internalMutation({
  args: {
    accountId: v.string(),
    accountName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await loadConnection(ctx);
    if (connection === null) {
      throw new Error("Jobber connection is missing");
    }
    await ctx.db.patch("jobberConnections", connection._id, {
      accountId: args.accountId,
      accountName: args.accountName,
    });
    return null;
  },
});
