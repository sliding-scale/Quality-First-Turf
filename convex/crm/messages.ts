import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalMutation, mutation, query, type QueryCtx } from "../_generated/server";
import { requireModule } from "./lib/access";
import { lastTen, normalizePhone, samePhone } from "./lib/phone";

/** Messages (plan 2026-11-19-messages, PRD 5.3): every text to or from a client, kept against the client, the job it came from and the person who
 *  sent it. Sending goes through Twilio once the keys and a number are set; until then a text is logged as "sent by hand" and the screen opens the
 *  phone's messaging app. Nothing is deleted from here: the log is the record. */

const WINDOW = 1000;
const MAX_BODY = 1600;

/** Whether texts really go out: the two Twilio keys are set on this deployment. A number is needed too (see `send`). */
export const providerReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

const keyOf = (m: { clientId?: Id<"clients">; phone: string }) => (m.clientId ? `c:${m.clientId}` : `p:${lastTen(m.phone)}`);

async function recent(ctx: QueryCtx, businessId: Id<"businesses">) {
  return ctx.db.query("messages").withIndex("by_business_and_at", (q) => q.eq("businessId", businessId)).order("desc").take(WINDOW);
}

/** One row per conversation (a client, or a bare number no client matches), newest first, with how many of their texts are still unread. */
export const conversations = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "messages", "view");
    const out = new Map<string, { key: string; clientId: Id<"clients"> | null; name: string; phone: string; lastBody: string; lastAt: number; lastDirection: "in" | "out"; unread: number }>();
    const names = new Map<Id<"clients">, string>();
    for (const m of await recent(ctx, args.businessId)) {
      const key = keyOf(m);
      let c = out.get(key);
      if (!c) {
        let name = m.phone;
        if (m.clientId) {
          if (!names.has(m.clientId)) names.set(m.clientId, (await ctx.db.get(m.clientId))?.name ?? m.phone);
          name = names.get(m.clientId)!;
        }
        c = { key, clientId: m.clientId ?? null, name, phone: m.phone, lastBody: m.body.slice(0, 140), lastAt: m.at, lastDirection: m.direction, unread: 0 };
        out.set(key, c);
      }
      if (m.direction === "in" && m.readAt === undefined) c.unread += 1;
    }
    return [...out.values()];
  },
});

async function threadOf(ctx: QueryCtx, businessId: Id<"businesses">, a: { clientId?: Id<"clients">; phone?: string }) {
  if (a.clientId) return ctx.db.query("messages").withIndex("by_client_and_at", (q) => q.eq("clientId", a.clientId!)).order("desc").take(300);
  if (a.phone) {
    const rows = await recent(ctx, businessId);
    return rows.filter((m) => !m.clientId && lastTen(m.phone) === lastTen(a.phone!)).slice(0, 300);
  }
  return [];
}

/** A conversation's texts, oldest first, each with who sent it. */
export const thread = query({
  args: { businessId: v.id("businesses"), clientId: v.optional(v.id("clients")), phone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "messages", "view");
    const rows = (await threadOf(ctx, args.businessId, args)).filter((m) => m.businessId === args.businessId).reverse();
    return rows.map((m) => ({ id: m._id, direction: m.direction, body: m.body, at: m.at, status: m.status, error: m.error ?? null, userName: m.userName ?? null, opportunityId: m.opportunityId ?? null, channel: m.channel ?? "sms" }));
  },
});

/** How many received texts nobody has read yet, for the badge. */
export const unread = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "messages", "view");
    return (await recent(ctx, args.businessId)).filter((m) => m.direction === "in" && m.readAt === undefined).length;
  },
});

export const markRead = mutation({
  args: { businessId: v.id("businesses"), clientId: v.optional(v.id("clients")), phone: v.optional(v.string()), now: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "messages", "view");
    for (const m of await threadOf(ctx, args.businessId, args)) {
      if (m.businessId === args.businessId && m.direction === "in" && m.readAt === undefined) await ctx.db.patch(m._id, { readAt: args.now });
    }
  },
});

/** Whether texts go out for real from this business: the keys are set and it has a number. The screen says which it is. */
export const provider = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "messages", "view");
    const numbers = await ctx.db.query("phoneNumbers").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).take(20);
    return { connected: providerReady() && numbers.length > 0, keysSet: providerReady(), numbers: numbers.length };
  },
});

/** A text to a client (or, for a reply, to a bare number). Returns how it will go: `provider` (Twilio sends it) or `manual` (the screen opens the
 *  phone's messaging app; the log says it was sent by hand). */
export const send = mutation({
  args: {
    businessId: v.id("businesses"), clientId: v.optional(v.id("clients")), phone: v.optional(v.string()), opportunityId: v.optional(v.id("opportunities")),
    body: v.string(), now: v.number(),
  },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "messages", "edit");
    const body = args.body.trim();
    if (!body) throw new ConvexError("Write the message first.");
    if (body.length > MAX_BODY) throw new ConvexError(`A text is up to ${MAX_BODY} characters.`);
    let client: Doc<"clients"> | null = null;
    if (args.clientId) {
      client = await ctx.db.get(args.clientId);
      if (client === null || client.businessId !== args.businessId) throw new ConvexError("Pick a client from this business.");
    }
    const raw = args.phone ?? client?.phone ?? "";
    const phone = normalizePhone(raw);
    if (!phone) throw new ConvexError(client ? "This client has no phone number to text." : "Enter a phone number to text.");
    if (args.opportunityId) {
      const p = await ctx.db.get(args.opportunityId);
      if (p === null || p.businessId !== args.businessId) throw new ConvexError("That project is not in this business.");
    }
    const from = (await ctx.db.query("phoneNumbers").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).first())?.number;
    const viaProvider = providerReady() && from !== undefined;
    const id = await ctx.db.insert("messages", {
      businessId: args.businessId, ...(client ? { clientId: client._id } : {}), ...(args.opportunityId ? { opportunityId: args.opportunityId } : {}), phone, direction: "out", body,
      userId: staff.userId, userName: staff.name, status: viaProvider ? "queued" : "manual", ...(from ? { fromNumber: from } : {}), at: args.now,
    });
    if (viaProvider) await ctx.scheduler.runAfter(0, internal.crm.messageSend.deliver, { id });
    return { id, mode: viaProvider ? ("provider" as const) : ("manual" as const), phone, body };
  },
});

/** An inbound text, from Twilio's webhook. Filed under the business that owns the number it was sent to, and under the client whose phone matches. */
export const receive = internalMutation({
  args: { to: v.string(), from: v.string(), body: v.string(), sid: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const to = normalizePhone(args.to);
    const from = normalizePhone(args.from) ?? args.from.trim();
    if (!to) return { filed: false as const, why: "bad to" };
    if (args.sid && (await ctx.db.query("messages").withIndex("by_providerSid", (q) => q.eq("providerSid", args.sid)).first()) !== null) return { filed: false as const, why: "duplicate" };
    const number = await ctx.db.query("phoneNumbers").withIndex("by_number", (q) => q.eq("number", to)).first();
    if (number === null) return { filed: false as const, why: "unknown number" };
    const clients = await ctx.db.query("clients").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", number.businessId)).take(5000);
    const match = clients.find((c) => samePhone(c.phone, from) || (c.phones ?? []).some((p) => samePhone(p.number, from)));
    await ctx.db.insert("messages", {
      businessId: number.businessId, ...(match ? { clientId: match._id } : {}), phone: from, direction: "in", body: args.body.slice(0, 5000), status: "received",
      fromNumber: to, providerSid: args.sid || undefined, at: args.now,
    });
    return { filed: true as const };
  },
});

export const markSent = internalMutation({
  args: { id: v.id("messages"), sid: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "sent", providerSid: args.sid, error: undefined });
  },
});

export const markFailed = internalMutation({
  args: { id: v.id("messages"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "failed", error: args.error.slice(0, 500) });
  },
});
