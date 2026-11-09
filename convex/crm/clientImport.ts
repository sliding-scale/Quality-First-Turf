import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";

/* One-off fixes to imported clients (D-056). Internal: it can only be run from a terminal against the deployment you choose.
     npx convex run crm/clientImport:setLastActivity '{"businessSlug":"quality-first-turf","clientName":"...","at":1790000000000}'
   Sets the date a client shows as their Last Activity, for matching Jobber's, which counts events the CRM never saw. Refuses unless
   exactly one client in that business has that exact name. */

export const setLastActivity = internalMutation({
  args: { businessSlug: v.string(), clientName: v.string(), at: v.number() },
  handler: async (ctx, args) => {
    const business = await ctx.db.query("businesses").filter((q) => q.eq(q.field("slug"), args.businessSlug)).first();
    if (!business) throw new ConvexError(`No business with the slug "${args.businessSlug}".`);
    const clients = await ctx.db.query("clients").take(5000);
    const matches = clients.filter((c) => c.businessId === business._id && c.name === args.clientName);
    if (matches.length !== 1) throw new ConvexError(`Expected exactly one client named "${args.clientName}" in that business, found ${matches.length}.`);
    const client = matches[0];
    await ctx.db.patch(client._id, { lastActivityAt: args.at });
    return { name: client.name, before: new Date(client.lastActivityAt).toISOString(), after: new Date(args.at).toISOString() };
  },
});
