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
