import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireModule } from "./lib/access";
import { billingTotalOf, scheduleAmounts, signedQuoteOf, signedQuoteTotal, writeQuoteDepositPayment } from "./lib/billing";
import { balanceOf, derivedStatus } from "./lib/invoiceMath";

/** A project's billing (Jobber's job Billing section, design 2026-11-18-finance): remind me to invoice at the end, or a payment schedule whose rows
 *  each make an invoice. The billing total is the approved quote's total, snapshotted when the plan is saved. */

const MAX_ROWS = 50;

export const get = query({
  args: { opportunityId: v.id("opportunities"), now: v.number() },
  handler: async (ctx, a) => {
    const project = await ctx.db.get(a.opportunityId);
    if (project === null) return null;
    const staff = await requireModule(ctx, project.businessId, "invoices", "view");
    const plan = await ctx.db.query("billingPlans").withIndex("by_opportunityId", (q) => q.eq("opportunityId", project._id)).unique();
    const signed = await signedQuoteOf(ctx, project._id);
    const quoteTotalCents = signed ? signed.quote.totalCents : null;
    const billingTotalCents = await billingTotalOf(ctx, project);
    const { rows, amounts, remainingCents } = await scheduleAmounts(ctx, project._id, billingTotalCents);
    const invoicesRaw = await ctx.db.query("invoices").withIndex("by_opportunityId", (q) => q.eq("opportunityId", project._id)).take(500);
    const invoices = invoicesRaw
      .sort((x, y) => x.number - y.number)
      .map((i) => ({
        id: i._id, number: i.number, subject: i.subject, status: derivedStatus(i.status, i.dueAt, balanceOf(i.totalCents, i.paidCents), a.now), totalCents: i.totalCents,
        balanceCents: i.status === "Sent" ? balanceOf(i.totalCents, i.paidCents) : 0, dueAt: i.dueAt, stored: i.status,
      }));
    const live = invoicesRaw.filter((i) => i.status !== "Void");
    const paidCents = live.reduce((n, i) => n + i.paidCents, 0);
    const awaitingCents = live.filter((i) => i.status === "Sent").reduce((n, i) => n + balanceOf(i.totalCents, i.paidCents), 0);
    const draftCents = live.filter((i) => i.status === "Draft").reduce((n, i) => n + i.totalCents, 0);
    const paymentsRaw = await ctx.db.query("payments").withIndex("by_opportunityId", (q) => q.eq("opportunityId", project._id)).order("desc").take(200);
    const rowOut = [];
    for (const [i, r] of rows.entries()) {
      const inv = r.invoiceId ? await ctx.db.get(r.invoiceId) : null;
      rowOut.push({
        id: r._id, position: r.position, description: r.description, kind: r.kind, value: r.value, amountCents: amounts[i],
        invoice: inv ? { id: inv._id, number: inv.number, status: derivedStatus(inv.status, inv.dueAt, balanceOf(inv.totalCents, inv.paidCents), a.now), totalCents: inv.totalCents, balanceCents: balanceOf(inv.totalCents, inv.paidCents) } : null,
      });
    }
    return {
      project: { id: project._id, businessId: project.businessId, clientId: project.clientId, code: project.code, title: project.title, pipeline: project.pipeline, stage: project.stage },
      plan: plan ? { mode: plan.mode, totalCents: plan.totalCents } : null,
      quoteTotalCents, quoteNumber: signed ? signed.quote.number : null, quoteLines: signed ? signed.lines : [], billingTotalCents, rows: rowOut, unscheduledCents: remainingCents,
      summary: { paidCents, awaitingCents, draftCents, remainingCents: Math.max(0, billingTotalCents - paidCents - awaitingCents - draftCents) },
      invoices,
      payments: paymentsRaw.map((p) => ({ id: p._id, paidAt: p.paidAt, method: p.method, amountCents: p.amountCents, clientId: p.clientId })),
      canBill: staff.levels.invoices === "edit" || staff.levels.invoices === "full",
    };
  },
});

const rowV = v.object({ id: v.optional(v.id("paymentScheduleItems")), description: v.string(), kind: v.union(v.literal("percent"), v.literal("amount")), value: v.number() });

export const save = mutation({
  args: {
    opportunityId: v.id("opportunities"),
    mode: v.union(v.literal("remind"), v.literal("schedule")),
    /** For a project with no approved quote: the total to bill. Ignored when there is a quote, or once an invoice was made from the schedule. */
    totalCents: v.optional(v.number()),
    rows: v.array(rowV),
  },
  handler: async (ctx, a) => {
    const project = await ctx.db.get(a.opportunityId);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireModule(ctx, project.businessId, "invoices", "edit");
    const existing = await ctx.db.query("paymentScheduleItems").withIndex("by_opportunityId_and_position", (q) => q.eq("opportunityId", project._id)).take(MAX_ROWS + 1);
    const invoiced = existing.filter((r) => r.invoiceId !== undefined);
    const plan = await ctx.db.query("billingPlans").withIndex("by_opportunityId", (q) => q.eq("opportunityId", project._id)).unique();
    const total = invoiced.length > 0 && plan ? plan.totalCents : ((await signedQuoteTotal(ctx, project._id)) ?? a.totalCents ?? 0);
    if (!Number.isInteger(total) || total < 0) throw new ConvexError("The total must be a whole number of cents, zero or more.");

    if (a.mode === "remind") {
      if (invoiced.length > 0) throw new ConvexError("Invoices were already made from the payment schedule, so it cannot be switched off.");
      for (const r of existing) await ctx.db.delete(r._id);
    } else {
      if (total <= 0) throw new ConvexError("A payment schedule needs a project total. Get the quote approved, or enter the total.");
      if (a.rows.length < 1 || a.rows.length > MAX_ROWS) throw new ConvexError(`A payment schedule needs 1 to ${MAX_ROWS} payments.`);
      let requested = 0, percent = 0;
      for (const r of a.rows) {
        if (r.description.trim().length < 1 || r.description.length > 200) throw new ConvexError("Each payment needs a description of 1 to 200 characters.");
        if (r.kind === "percent") {
          if (!(r.value > 0 && r.value <= 100)) throw new ConvexError("A payment percent is more than 0 and at most 100.");
          percent += r.value;
          requested += Math.round((total * r.value) / 100);
        } else {
          if (!Number.isInteger(r.value) || r.value <= 0) throw new ConvexError("A payment amount must be more than zero.");
          requested += r.value;
        }
      }
      if (percent > 100.0001 || requested > total + 1) throw new ConvexError("The payments add up to more than the project total.");
      const keep = new Map(a.rows.filter((r) => r.id).map((r) => [r.id as Id<"paymentScheduleItems">, r]));
      for (const r of invoiced) {
        const k = keep.get(r._id);
        if (!k) throw new ConvexError(`"${r.description}" already has an invoice, so it cannot be removed.`);
        if (k.kind !== r.kind || k.value !== r.value) throw new ConvexError(`"${r.description}" already has an invoice, so its amount cannot change.`);
      }
      for (const r of existing) if (r.invoiceId === undefined && !keep.has(r._id)) await ctx.db.delete(r._id);
      for (const [i, r] of a.rows.entries()) {
        if (r.id) {
          const row = existing.find((e) => e._id === r.id);
          if (!row) throw new ConvexError("That payment is not on this project's schedule.");
          await ctx.db.patch(row._id, { position: i, description: r.description.trim(), kind: r.kind, value: r.value });
        } else {
          await ctx.db.insert("paymentScheduleItems", { opportunityId: project._id, position: i, description: r.description.trim(), kind: r.kind, value: r.value });
        }
      }
    }
    const fields = { opportunityId: project._id, businessId: project.businessId, mode: a.mode, totalCents: total };
    if (plan) await ctx.db.replace(plan._id, fields);
    else await ctx.db.insert("billingPlans", fields);
  },
});

/** One-time, run by hand on a deployment: writes a payment for every quote deposit that was recorded before payments existed (for example Jobber's
 *  quote #1 deposit). Safe to run again: it only adds the difference between a quote's deposit and the payments already written for it. */
export const backfillQuoteDeposits = internalMutation({
  args: {},
  handler: async (ctx) => {
    let added = 0;
    for (const quote of await ctx.db.query("quotes").take(5000)) {
      const deposit = quote.depositCollectedCents ?? 0;
      if (deposit <= 0) continue;
      const have = (await ctx.db.query("payments").withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id)).take(200)).reduce((n, p) => n + p.amountCents, 0);
      if (have >= deposit) continue;
      await writeQuoteDepositPayment(ctx, quote, deposit - have, quote.depositCollectedAt ?? quote.createdAt, "Imported deposit", quote.depositCollectedAt ?? quote.createdAt);
      added += 1;
    }
    return { added };
  },
});
