import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import schema from "../schema";
import { loadConnection } from "./connection";

export const get = internalQuery({
  args: {},
  returns: v.union(v.null(), schema.doc("jobberConnections")),
  handler: async (ctx) => {
    return await loadConnection(ctx);
  },
});

export const status = internalQuery({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    accountName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const connection = await loadConnection(ctx);
    return {
      connected: connection !== null && connection.refreshToken !== null,
      accountName: connection?.accountName ?? null,
    };
  },
});
