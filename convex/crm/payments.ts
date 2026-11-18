import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireModule } from "./lib/access";
import { allocationsOfPayment, applyAllocation, DAY_MS, financeAfterChange, logInvoiceEvent, unappliedOf } from "./lib/billing";
import { balanceOf, derivedStatus, PAYMENT_METHODS } from "./lib/invoiceMath";

/** Payments (PRD 5.2, design 2026-11-18-finance): the Payments list, Jobber's Collect Payment (one payment spread over several invoices, or
 *  part-paid), deposits that are paid before an invoice exists and applied to it later. A payment's invoice balance is always its total
 *  minus allocations (lib/billing.ts), so nothing typed here can make a balance disagree with its payments. */

const MAX_PAYMENTS = 2000;
const MAX_INVOICES = 2000;
type PaymentRow = {
  id: Id<"payments">; clientId: Id<"clients">; clientName: string; paidAt: number; method: string; amountCents: number; reference: string;
  invoice: { id: Id<"invoices">; number: number } | null; quote: { id: Id<"quotes">; number: number } | null; unappliedCents: number; source: "manual" | "quote deposit";
};
const sortKey = v.union(v.literal("client"), v.literal("paidAt"), v.literal("method"), v.literal("amount"));

export const list = query({
  args: {
    businessId: v.id("businesses"),
    /** "All" or one of the methods. */
    method: v.string(),
    search: v.string(),
    sortKey,
    dir: v.union(v.literal("asc"), v.literal("desc")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    page: v.number(),
    size: v.number(),
  },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "payments", "view");
    if (a.method !== "All" && !(PAYMENT_METHODS as readonly string[]).includes(a.method)) throw new ConvexError("Pick a method from the list.");
    const size = Math.min(100, Math.max(1, Math.floor(a.size)));
    const docs = await ctx.db.query("payments").withIndex("by_business_and_paidAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_PAYMENTS);
    const names = new Map<Id<"clients">, string>();
    const needle = a.search.trim().toLowerCase();
    const rows: PaymentRow[] = [];
    for (const p of docs) {
      if (a.method !== "All" && p.method !== a.method) continue;
      if (a.from !== undefined && p.paidAt < a.from) continue;
      if (a.to !== undefined && p.paidAt > a.to) continue;
      if (!names.has(p.clientId)) names.set(p.clientId, (await ctx.db.get(p.clientId))?.name ?? "");
      const clientName = names.get(p.clientId) ?? "";
      const alloc = (await allocationsOfPayment(ctx, p._id))[0];
      const invoice = alloc ? await ctx.db.get(alloc.invoiceId) : null;
      const quote = p.quoteId ? await ctx.db.get(p.quoteId) : null;
      if (needle && !`${clientName} ${p.reference} ${p.details} ${invoice?.number ?? ""} ${quote?.number ?? ""}`.toLowerCase().includes(needle)) continue;
      rows.push({
        id: p._id, clientId: p.clientId, clientName, paidAt: p.paidAt, method: p.method, amountCents: p.amountCents, reference: p.reference,
        invoice: invoice ? { id: invoice._id, number: invoice.number } : null, quote: quote ? { id: quote._id, number: quote.number } : null,
        unappliedCents: await unappliedOf(ctx, p), source: p.source,
      });
    }
    const sign = a.dir === "asc" ? 1 : -1;
    const key = (r: PaymentRow): number | string => (a.sortKey === "client" ? r.clientName.toLowerCase() : a.sortKey === "method" ? r.method : a.sortKey === "amount" ? r.amountCents : r.paidAt);
    rows.sort((x, y) => {
      const kx = key(x), ky = key(y);
      return (kx < ky ? -1 : kx > ky ? 1 : 0) * sign;
    });
    const page = Math.max(0, Math.floor(a.page));
    return { rows: rows.slice(page * size, page * size + size), total: rows.length, page, size, capped: docs.length >= MAX_PAYMENTS };
  },
});

/** The two cards on the Payments page: how long invoices take to be paid, and how many are paid on time. */
export const stats = query({
  args: { businessId: v.id("businesses"), now: v.number() },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "payments", "view");
    const paid = (await ctx.db.query("invoices").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_INVOICES)).filter(
      (i) => i.status === "Paid" && i.issuedAt !== undefined,
    );
    const days: number[] = [];
    let onTime = 0, counted = 0;
    for (const i of paid) {
      let last = 0;
      for (const al of await ctx.db.query("paymentAllocations").withIndex("by_invoiceId", (q) => q.eq("invoiceId", i._id)).take(200)) {
        const p = await ctx.db.get(al.paymentId);
        if (p && p.paidAt > last) last = p.paidAt;
      }
      if (last === 0) continue;
      if (last > a.now - 30 * DAY_MS) days.push(Math.max(0, (last - (i.issuedAt as number)) / DAY_MS));
      if (last > a.now - 60 * DAY_MS) {
        counted += 1;
        if (i.dueAt === undefined || last < i.dueAt + DAY_MS) onTime += 1;
      }
    }
    return {
      averageDays: days.length === 0 ? null : Math.round((days.reduce((n, d) => n + d, 0) / days.length) * 10) / 10,
      paidOnTimePercent: counted === 0 ? null : Math.round((onTime / counted) * 100),
    };
  },
});

/** The invoices a client can pay now: sent and still owing, soonest due first (Collect Payment's "Outstanding invoices"). */
export const outstanding = query({
  args: { clientId: v.id("clients"), now: v.number() },
  handler: async (ctx, a) => {
    const client = await ctx.db.get(a.clientId);
    if (client === null) return null;
    await requireModule(ctx, client.businessId, "payments", "view");
    const all = await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", a.clientId)).take(MAX_INVOICES);
    const open = all.filter((i) => i.status === "Sent" && balanceOf(i.totalCents, i.paidCents) > 0).sort((x, y) => (x.dueAt ?? 0) - (y.dueAt ?? 0) || x.number - y.number);
    return {
      client: { id: client._id, name: client.name, businessId: client.businessId },
      accountBalanceCents: open.reduce((n, i) => n + balanceOf(i.totalCents, i.paidCents), 0),
      invoices: open.map((i) => ({
        id: i._id, number: i.number, subject: i.subject, dueAt: i.dueAt, status: derivedStatus(i.status, i.dueAt, balanceOf(i.totalCents, i.paidCents), a.now),
        totalCents: i.totalCents, balanceCents: balanceOf(i.totalCents, i.paidCents), opportunityId: i.opportunityId,
      })),
    };
  },
});

/** Payments with money left to apply (Jobber's "Find Deposit"): this client's, optionally limited to one project. */
export const deposits = query({
  args: { clientId: v.id("clients"), opportunityId: v.optional(v.id("opportunities")) },
  handler: async (ctx, a) => {
    const client = await ctx.db.get(a.clientId);
    if (client === null) return [];
    await requireModule(ctx, client.businessId, "payments", "view");
    const all = await ctx.db.query("payments").withIndex("by_clientId", (q) => q.eq("clientId", a.clientId)).order("desc").take(MAX_PAYMENTS);
    const out = [];
    for (const p of all) {
      if (a.opportunityId !== undefined && p.opportunityId !== undefined && p.opportunityId !== a.opportunityId) continue;
      const left = await unappliedOf(ctx, p);
      if (left > 0) out.push({ id: p._id, paidAt: p.paidAt, method: p.method, reference: p.reference, amountCents: p.amountCents, unappliedCents: left, source: p.source, quoteId: p.quoteId });
    }
    return out;
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    opportunityId: v.optional(v.id("opportunities")),
    method: v.string(),
    paidAt: v.number(),
    reference: v.string(),
    details: v.string(),
    amountCents: v.number(),
    /** The invoices this payment pays, and how much of it each. What is not allocated stays on the payment as a deposit. */
    allocations: v.array(v.object({ invoiceId: v.id("invoices"), amountCents: v.number() })),
    now: v.number(),
  },
  handler: async (ctx, a) => {
    const client = await ctx.db.get(a.clientId);
    if (client === null) throw new ConvexError("That client no longer exists.");
    const staff = await requireModule(ctx, client.businessId, "payments", "edit");
    if (!(PAYMENT_METHODS as readonly string[]).includes(a.method)) throw new ConvexError("Pick a payment method from the list.");
    if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) throw new ConvexError("Enter the amount received, more than zero.");
    if (a.reference.length > 200 || a.details.length > 2000) throw new ConvexError("The reference can be at most 200 characters and the details 2,000.");
    if (a.allocations.reduce((n, x) => n + x.amountCents, 0) > a.amountCents) throw new ConvexError("The invoices add up to more than the payment.");
    let project: Id<"opportunities"> | undefined = a.opportunityId;
    if (project !== undefined) {
      const p = await ctx.db.get(project);
      if (p === null || p.businessId !== client.businessId || p.clientId !== a.clientId) throw new ConvexError("That project does not belong to this client.");
    }
    const seen = new Set<string>();
    for (const x of a.allocations) {
      if (seen.has(x.invoiceId)) throw new ConvexError("An invoice can only be listed once.");
      seen.add(x.invoiceId);
      const inv = await ctx.db.get(x.invoiceId);
      if (inv === null) throw new ConvexError("That invoice no longer exists.");
      if (inv.status === "Draft") throw new ConvexError(`Send invoice #${inv.number} before collecting payment on it.`);
      if (project === undefined && a.allocations.length === 1 && inv.opportunityId) project = inv.opportunityId;
    }
    const id = await ctx.db.insert("payments", {
      businessId: client.businessId, clientId: a.clientId, ...(project ? { opportunityId: project } : {}), method: a.method, paidAt: a.paidAt, reference: a.reference.trim(),
      details: a.details.trim(), amountCents: a.amountCents, source: "manual", byName: staff.name, createdAt: a.now,
    });
    const payment = (await ctx.db.get(id))!;
    const projects = new Set<Id<"opportunities">>();
    for (const x of a.allocations) {
      const inv = await applyAllocation(ctx, payment, x.invoiceId, x.amountCents, a.now);
      await logInvoiceEvent(ctx, x.invoiceId, "payment", staff.name, `Payment received: $${(x.amountCents / 100).toFixed(2)} (${a.method})`, a.now);
      if (inv.opportunityId) projects.add(inv.opportunityId);
    }
    for (const p of projects) await financeAfterChange(ctx, p, { name: staff.name, userId: staff.userId }, a.now);
    return id;
  },
});

/** Applies money that is left on a payment (a deposit) to an invoice. */
export const applyDeposit = mutation({
  args: { paymentId: v.id("payments"), invoiceId: v.id("invoices"), amountCents: v.number(), now: v.number() },
  handler: async (ctx, a) => {
    const payment = await ctx.db.get(a.paymentId);
    if (payment === null) throw new ConvexError("That payment no longer exists.");
    const staff = await requireModule(ctx, payment.businessId, "payments", "edit");
    const inv = await applyAllocation(ctx, payment, a.invoiceId, a.amountCents, a.now);
    await logInvoiceEvent(ctx, a.invoiceId, "deposit", staff.name, `Deposit applied: $${(a.amountCents / 100).toFixed(2)}`, a.now);
    await financeAfterChange(ctx, inv.opportunityId, { name: staff.name, userId: staff.userId }, a.now);
  },
});
