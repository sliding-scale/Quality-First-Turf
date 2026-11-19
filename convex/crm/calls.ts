import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireModule } from "./lib/access";
import { callProblem } from "./lib/calls";
import { lastTen, normalizePhone } from "./lib/phone";

/** The call log (plan 2026-11-20-calls-whatsapp, PRD 5.3): calls to and from clients, kept against the client, the project and the person who made
 *  or took them. Logged by hand for now; a voice provider can write the same rows later. Governed by the Messages module (view to read, edit to log). */

const WINDOW = 1000;
const outcome = v.union(v.literal("answered"), v.literal("no_answer"), v.literal("voicemail"), v.literal("busy"));

async function callsOf(ctx: QueryCtx, businessId: Id<"businesses">, a: { clientId?: Id<"clients">; phone?: string }) {
  if (a.clientId) return ctx.db.query("calls").withIndex("by_client_and_at", (q) => q.eq("clientId", a.clientId!)).order("desc").take(300);
  if (a.phone) {
    const rows = await ctx.db.query("calls").withIndex("by_business_and_at", (q) => q.eq("businessId", businessId)).order("desc").take(WINDOW);
    return rows.filter((c) => !c.clientId && lastTen(c.phone) === lastTen(a.phone!)).slice(0, 300);
  }
  return [];
}

/** A conversation's calls, oldest first. */
export const thread = query({
  args: { businessId: v.id("businesses"), clientId: v.optional(v.id("clients")), phone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "messages", "view");
    const rows = (await callsOf(ctx, args.businessId, args)).filter((c) => c.businessId === args.businessId).reverse();
    return rows.map((c) => ({ id: c._id, direction: c.direction, outcome: c.outcome, durationSeconds: c.durationSeconds ?? null, notes: c.notes, at: c.at, userName: c.userName, opportunityId: c.opportunityId ?? null }));
  },
});

export const log = mutation({
  args: {
    businessId: v.id("businesses"), clientId: v.optional(v.id("clients")), phone: v.optional(v.string()), opportunityId: v.optional(v.id("opportunities")),
    direction: v.union(v.literal("in"), v.literal("out")), outcome, durationSeconds: v.optional(v.number()), notes: v.string(), at: v.number(), now: v.number(),
  },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "messages", "edit");
    let client: Doc<"clients"> | null = null;
    if (args.clientId) {
      client = await ctx.db.get(args.clientId);
      if (client === null || client.businessId !== args.businessId) throw new ConvexError("Pick a client from this business.");
    }
    const phone = normalizePhone(args.phone ?? client?.phone ?? "");
    if (!phone) throw new ConvexError(client ? "This client has no phone number. Enter the number that was called." : "Enter the phone number of the call.");
    if (args.opportunityId) {
      const p = await ctx.db.get(args.opportunityId);
      if (p === null || p.businessId !== args.businessId) throw new ConvexError("That project is not in this business.");
    }
    const why = callProblem({ outcome: args.outcome, durationSeconds: args.durationSeconds, at: args.at, now: args.now, notes: args.notes });
    if (why) throw new ConvexError(why);
    return ctx.db.insert("calls", {
      businessId: args.businessId, ...(client ? { clientId: client._id } : {}), ...(args.opportunityId ? { opportunityId: args.opportunityId } : {}), phone, direction: args.direction,
      outcome: args.outcome, ...(args.durationSeconds ? { durationSeconds: args.durationSeconds } : {}), notes: args.notes.trim(), userId: staff.userId, userName: staff.name, at: args.at, createdAt: args.now,
    });
  },
});
