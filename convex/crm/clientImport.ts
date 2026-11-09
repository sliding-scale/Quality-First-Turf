import { ConvexError, v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { clientSearchText } from "./lib/clientInput";
import { CLIENT_TAGS } from "./lib/stages";

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

/* Brings imported clients in line with how Jobber shows them (the 2026-11-09 check against Jobber's list): the tag, the name on the
   first line, the company on the second, and Active status. `scripts` in the session notes build the updates from Jobber's list; this
   only applies them, and refuses a client that is not in the business or an unknown tag.
     npx convex run crm/clientImport:alignWithJobber '{"businessSlug":"quality-first-turf","updates":[{"id":"...","tags":["Homeowner"]}]}' */
export const alignWithJobber = internalMutation({
  args: {
    businessSlug: v.string(),
    updates: v.array(v.object({
      id: v.id("clients"),
      tags: v.array(v.string()),
      name: v.optional(v.string()),
      company: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.query("businesses").filter((q) => q.eq(q.field("slug"), args.businessSlug)).first();
    if (!business) throw new ConvexError(`No business with the slug "${args.businessSlug}".`);
    const known: readonly string[] = CLIENT_TAGS;
    let changed = 0;
    for (const u of args.updates) {
      const c = await ctx.db.get(u.id);
      if (c === null || c.businessId !== business._id) throw new ConvexError(`Client ${u.id} is not in ${args.businessSlug}.`);
      if (u.tags.some((t) => !known.includes(t))) throw new ConvexError(`Unknown tag for ${c.name}.`);
      const name = u.name ?? c.name;
      const company = u.company ?? c.company;
      const next = { name, nameKey: name.toLowerCase(), company, tags: u.tags, status: "active" as const };
      await ctx.db.patch(c._id, { ...next, searchText: clientSearchText({ ...c, ...next }) });
      changed += 1;
    }
    return { changed };
  },
});
