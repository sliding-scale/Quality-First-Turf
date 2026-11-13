import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireStaff } from "./lib/access";

/* The bell in the top bar (D-073): the notes that tag the signed-in person with @. Each person sees only their own. */

const MAX_SHOWN = 50;

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    const rows = await ctx.db.query("noteMentions").withIndex("by_user_and_at", (q) => q.eq("userId", staff.userId)).order("desc").take(MAX_SHOWN);
    const out = [];
    for (const r of rows) {
      const business = await ctx.db.get(r.businessId);
      const project = r.opportunityId ? await ctx.db.get(r.opportunityId) : null;
      const client = r.clientId ? await ctx.db.get(r.clientId) : null;
      const quote = r.quoteId ? await ctx.db.get(r.quoteId) : null;
      // Where it was said, in words, and the page to open.
      const where = r.kind === "project" ? project?.title ?? "A project" : r.kind === "client" ? client?.name ?? "A client" : quote ? `Quote #${quote.number}` : "A quote";
      const href = r.kind === "project" && r.opportunityId ? `/requests/${r.opportunityId}` : r.kind === "client" && r.clientId ? `/clients/${r.clientId}` : r.quoteId ? `/quotes/${r.quoteId}` : null;
      out.push({ id: r._id, byName: r.byName, kind: r.kind, where, href, businessName: business?.name ?? "", excerpt: r.excerpt, at: r.at, read: r.readAt !== undefined });
    }
    return { items: out, unread: out.filter((m) => !m.read).length };
  },
});

/** Marks one tag as read, or all of the person's when no id is given. */
export const markRead = mutation({
  args: { id: v.optional(v.id("noteMentions")), now: v.number() },
  handler: async (ctx, a) => {
    const staff = await requireStaff(ctx);
    if (a.id) {
      const row = await ctx.db.get(a.id);
      if (!row || row.userId !== staff.userId) throw new ConvexError("That notification is not yours.");
      if (row.readAt === undefined) await ctx.db.patch(row._id, { readAt: a.now });
      return null;
    }
    const rows = await ctx.db.query("noteMentions").withIndex("by_user_and_at", (q) => q.eq("userId", staff.userId)).order("desc").take(MAX_SHOWN);
    for (const r of rows) if (r.readAt === undefined) await ctx.db.patch(r._id, { readAt: a.now });
    return null;
  },
});
