import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { activeSalesSession } from "./session";

export const active = internalQuery({
  args: { sessionToken: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return (await activeSalesSession(ctx, args.sessionToken)) !== null;
  },
});
