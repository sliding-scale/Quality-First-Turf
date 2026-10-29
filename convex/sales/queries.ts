import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { salespersonName } from "./accounts";
import { activeSalesSession } from "./session";

export const active = internalQuery({
  args: { sessionToken: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return (await activeSalesSession(ctx, args.sessionToken)) !== null;
  },
});

const identityValidator = v.object({ email: v.string(), name: v.string() });

/** Who is signed in, for the name shown in the app. */
export const me = query({
  args: { sessionToken: v.string() },
  returns: v.union(identityValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken);
    if (session === null || session.email === undefined) return null;
    return { email: session.email, name: session.name ?? salespersonName(session.email) };
  },
});

/** The same, for server code that has to know which salesperson is acting. */
export const identity = internalQuery({
  args: { sessionToken: v.string() },
  returns: v.union(identityValidator, v.null()),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken, true);
    if (session === null || session.email === undefined) return null;
    return { email: session.email, name: session.name ?? salespersonName(session.email) };
  },
});
