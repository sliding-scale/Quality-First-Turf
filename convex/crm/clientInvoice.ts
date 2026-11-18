import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import { allocationsOfInvoice, linesOf, logInvoiceEvent } from "./lib/billing";
import { balanceOf, derivedStatus, invoiceLineCents, invoiceTotals, PAYMENT_TERMS } from "./lib/invoiceMath";

/** The client's side of an invoice (design 2026-11-18-finance). No sign-in: the secret link (`token`, 64 characters, made when the invoice was
 *  sent) is the key. Read only: no online payment. Everything is checked by the token alone and shows only what the invoice's Client view allows;
 *  nothing about staff, notes, other invoices or the project. A draft, a voided invoice and an unknown link all read as "not valid". */

async function byToken(ctx: QueryCtx, token: string): Promise<Doc<"invoices"> | null> {
  if (token.length < 32) return null;
  const inv = await ctx.db.query("invoices").withIndex("by_shareToken", (q) => q.eq("shareToken", token)).first();
  return inv === null || inv.status === "Draft" || inv.status === "Void" ? null : inv;
}

export const get = query({
  args: { token: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const inv = await byToken(ctx, a.token);
    if (inv === null) return null;
    const [business, client] = await Promise.all([ctx.db.get(inv.businessId), ctx.db.get(inv.clientId)]);
    const view = inv.clientView;
    const lineDocs = await linesOf(ctx, inv._id);
    const scheduled = lineDocs.length > 0 && lineDocs.every((l) => l.dueCents !== undefined);
    const totals = invoiceTotals(lineDocs.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, ...(scheduled ? { dueCents: l.dueCents } : {}) })), inv);
    const payments = [];
    for (const al of await allocationsOfInvoice(ctx, inv._id)) {
      const p = await ctx.db.get(al.paymentId);
      if (p) payments.push({ paidAt: p.paidAt, method: p.method, amountCents: al.amountCents });
    }
    payments.sort((x, y) => x.paidAt - y.paidAt);
    const balanceCents = inv.status === "Bad debt" ? 0 : balanceOf(inv.totalCents, inv.paidCents);
    const status = derivedStatus(inv.status, inv.dueAt, balanceOf(inv.totalCents, inv.paidCents), a.now);
    let accountBalanceCents: number | null = null;
    if (view.accountBalance) {
      const all = await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", inv.clientId)).take(2000);
      accountBalanceCents = all.filter((i) => i.status === "Sent").reduce((n, i) => n + balanceOf(i.totalCents, i.paidCents), 0);
    }
    return {
      businessName: business?.name ?? "",
      clientName: client?.name ?? "",
      number: inv.number,
      subject: inv.subject,
      status: status === "Bad debt" ? "Awaiting payment" : status,
      late: view.lateStamp && status === "Past due",
      issuedAt: inv.issuedAt ?? null,
      dueAt: inv.dueAt ?? null,
      terms: PAYMENT_TERMS.find((t) => t.key === inv.termsKey)?.label ?? "",
      salesperson: inv.salesperson,
      lines: lineDocs.map((l) => ({
        id: l._id, name: l.name, description: l.description, serviceDate: l.serviceDate ?? null,
        quantity: view.quantities ? l.quantity : null,
        unitPriceCents: view.unitPrices ? l.unitPriceCents : null,
        totalCents: view.lineTotals ? invoiceLineCents(scheduled ? { quantity: l.quantity, unitPriceCents: l.unitPriceCents, dueCents: l.dueCents } : l) : null,
      })),
      totals,
      payments,
      balanceCents,
      accountBalanceCents,
      clientMessage: inv.clientMessage,
      contract: inv.contract,
    };
  },
});

/** The first time the client opens the link. */
export const markViewed = mutation({
  args: { token: v.string() },
  handler: async (ctx, a) => {
    await rateLimiter.limit(ctx, "clientQuoteAnswer", { key: a.token.slice(0, 16), throws: true });
    const inv = await byToken(ctx, a.token);
    if (inv === null || inv.viewedAt !== undefined) return;
    const now = Date.now();
    await ctx.db.patch(inv._id, { viewedAt: now });
    await logInvoiceEvent(ctx, inv._id, "viewed", "Client", "Opened the invoice", now);
  },
});
