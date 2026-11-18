import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { balanceOf, splitSchedule, type StoredInvoiceStatus } from "./invoiceMath";

export { spreadDue } from "./invoiceMath";
import { notifyStage } from "./mentionNotify";
import { FINANCE_PAID_STAGE, FINANCE_STAGES } from "./stages";

/* Shared money plumbing for invoices, payments and the Finance board (design 2026-11-18-finance). Everything that changes an invoice's
   lines or allocations goes through here, so the labelled copies (`totalCents`, `paidCents`, `status`) and the project's Finance stage can
   never drift from the records they summarise. */

export const MAX_LINES = 200;
const MAX_ROWS = 500;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const startOfDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

export const DEFAULT_INVOICE_CONTRACT = "Thank you for your business. Please contact us with any questions regarding this invoice.";
export const DEFAULT_INVOICE_SUBJECT = "For Services Rendered";

type Reader = QueryCtx | MutationCtx;

export async function linesOf(ctx: Reader, invoiceId: Id<"invoices">) {
  return ctx.db.query("invoiceLines").withIndex("by_invoiceId_and_position", (q) => q.eq("invoiceId", invoiceId)).take(MAX_LINES + 1);
}

export async function allocationsOfInvoice(ctx: Reader, invoiceId: Id<"invoices">) {
  return ctx.db.query("paymentAllocations").withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId)).take(MAX_ROWS);
}

export async function allocationsOfPayment(ctx: Reader, paymentId: Id<"payments">) {
  return ctx.db.query("paymentAllocations").withIndex("by_paymentId", (q) => q.eq("paymentId", paymentId)).take(MAX_ROWS);
}

export async function logInvoiceEvent(ctx: MutationCtx, invoiceId: Id<"invoices">, kind: string, byName: string, detail: string, at: number) {
  await ctx.db.insert("invoiceEvents", { invoiceId, at, kind, byName, detail });
}

export async function nextInvoiceNumber(ctx: Reader, businessId: Id<"businesses">): Promise<number> {
  const last = await ctx.db.query("invoices").withIndex("by_business_and_number", (q) => q.eq("businessId", businessId)).order("desc").first();
  return (last?.number ?? 0) + 1;
}

export async function invoiceSearchText(ctx: Reader, clientId: Id<"clients">, number: number, subject: string): Promise<string> {
  const c = await ctx.db.get(clientId);
  return [c?.name ?? "", c?.street1 ?? "", c?.city ?? "", c?.state ?? "", c?.zip ?? "", String(number), subject].join(" ");
}

/** What is left on a payment after the invoices it pays. */
export async function unappliedOf(ctx: Reader, payment: Doc<"payments">): Promise<number> {
  const used = (await allocationsOfPayment(ctx, payment._id)).reduce((n, a) => n + a.amountCents, 0);
  return Math.max(0, payment.amountCents - used);
}

/** Recomputes an invoice's paid amount and its Paid / Sent status from its allocations. A Draft, Void or Bad debt invoice keeps its status. */
export async function settleInvoice(ctx: MutationCtx, invoiceId: Id<"invoices">): Promise<Doc<"invoices">> {
  const inv = await ctx.db.get(invoiceId);
  if (inv === null) throw new ConvexError("That invoice no longer exists.");
  const paidCents = (await allocationsOfInvoice(ctx, invoiceId)).reduce((n, a) => n + a.amountCents, 0);
  let status: StoredInvoiceStatus = inv.status;
  if (status === "Sent" || status === "Paid") status = balanceOf(inv.totalCents, paidCents) === 0 ? "Paid" : "Sent";
  if (paidCents !== inv.paidCents || status !== inv.status) await ctx.db.patch(invoiceId, { paidCents, status });
  return { ...inv, paidCents, status };
}

/** Applies part of a payment to an invoice. Refused when the payment and the invoice belong to different clients, when it is more than is left on
 *  the payment, or more than the invoice still owes. This is the only place an allocation is written. */
export async function applyAllocation(ctx: MutationCtx, payment: Doc<"payments">, invoiceId: Id<"invoices">, amountCents: number, now: number) {
  const inv = await ctx.db.get(invoiceId);
  if (inv === null) throw new ConvexError("That invoice no longer exists.");
  if (inv.businessId !== payment.businessId || inv.clientId !== payment.clientId) throw new ConvexError("That payment and invoice belong to different clients.");
  if (inv.status === "Void" || inv.status === "Bad debt") throw new ConvexError(`Invoice #${inv.number} is ${inv.status === "Void" ? "voided" : "written off"}.`);
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new ConvexError("Enter an amount more than zero.");
  if (amountCents > (await unappliedOf(ctx, payment))) throw new ConvexError("That is more than is left on this payment.");
  if (amountCents > balanceOf(inv.totalCents, inv.paidCents)) throw new ConvexError(`That is more than invoice #${inv.number} still owes.`);
  await ctx.db.insert("paymentAllocations", { paymentId: payment._id, invoiceId, amountCents, at: now });
  return settleInvoice(ctx, invoiceId);
}

/** A quote's deposit, as a payment: unapplied money on the client that the project's first invoice can use. The quote keeps its own deposit
 *  fields too (the Closed Won rule reads them), so the two are written together. */
export async function writeQuoteDepositPayment(ctx: MutationCtx, quote: Doc<"quotes">, amountCents: number, paidAt: number, byName: string, now: number) {
  return ctx.db.insert("payments", {
    businessId: quote.businessId, clientId: quote.clientId, ...(quote.opportunityId ? { opportunityId: quote.opportunityId } : {}), quoteId: quote._id,
    method: "Other", paidAt, reference: `Quote #${quote.number}`, details: "Deposit", amountCents, source: "quote deposit", byName, createdAt: now,
  });
}

/** The total the project is billed for: its payment schedule's snapshot, else its latest approved and signed quote, else nothing. */
export async function billingTotalOf(ctx: Reader, project: Doc<"opportunities">): Promise<number> {
  const plan = await ctx.db.query("billingPlans").withIndex("by_opportunityId", (q) => q.eq("opportunityId", project._id)).unique();
  if (plan) return plan.totalCents;
  return (await signedQuoteTotal(ctx, project._id)) ?? 0;
}

/** The latest approved and signed quote of a project, with its included priced lines (what a schedule invoice starts from). */
export async function signedQuoteOf(ctx: Reader, opportunityId: Id<"opportunities">) {
  const quotes = await ctx.db.query("quotes").withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId)).take(50);
  const quote = quotes
    .filter((q) => (q.status === "Approved" || q.status === "Converted") && q.signedAt !== undefined)
    .sort((a, b) => (b.signedAt ?? 0) - (a.signedAt ?? 0))[0];
  if (!quote) return null;
  const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(MAX_LINES);
  return {
    quote,
    lines: lines.filter((l) => (l.kind ?? "item") === "item" && (!l.optional || l.selected)).map((l) => ({ name: l.name, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
  };
}

export async function signedQuoteTotal(ctx: Reader, opportunityId: Id<"opportunities">): Promise<number | null> {
  const quotes = await ctx.db.query("quotes").withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId)).take(50);
  const signed = quotes
    .filter((q) => (q.status === "Approved" || q.status === "Converted") && q.signedAt !== undefined)
    .sort((a, b) => (b.signedAt ?? 0) - (a.signedAt ?? 0))[0];
  return signed ? signed.totalCents : null;
}

export type ProjectMoney = {
  billingTotalCents: number;
  /** What has been invoiced and sent (including anything written off as bad debt). */
  sentCents: number;
  sentCount: number;
  /** What is still owed on sent invoices. */
  outstandingCents: number;
  paidCents: number;
  /** True once the sent invoices cover the billing total (or, for a project with no total, once any invoice is sent). */
  covered: boolean;
};

export async function projectMoney(ctx: Reader, project: Doc<"opportunities">): Promise<ProjectMoney> {
  const invoices = await ctx.db.query("invoices").withIndex("by_opportunityId", (q) => q.eq("opportunityId", project._id)).take(MAX_ROWS);
  const billingTotalCents = await billingTotalOf(ctx, project);
  let sentCents = 0, sentCount = 0, outstandingCents = 0, paidCents = 0;
  for (const i of invoices) {
    if (i.status === "Void") continue;
    paidCents += i.paidCents;
    if (i.status === "Draft") continue;
    sentCents += i.totalCents;
    sentCount += 1;
    if (i.status === "Sent") outstandingCents += balanceOf(i.totalCents, i.paidCents);
  }
  const covered = billingTotalCents > 0 ? sentCents >= billingTotalCents : sentCount > 0;
  return { billingTotalCents, sentCents, sentCount, outstandingCents, paidCents, covered };
}

/** The guard on "Final Payment Received": nothing may still be owed on the project's sent invoices. */
export async function assertPaidUp(ctx: Reader, project: Doc<"opportunities">) {
  const money = await projectMoney(ctx, project);
  if (money.outstandingCents > 0) {
    throw new ConvexError(`${FINANCE_PAID_STAGE} needs the invoices paid: $${(money.outstandingCents / 100).toFixed(2)} is still owed.`);
  }
}

/** One move inside Finance, written with its history row and the usual stage alert. Nothing else changes a Finance stage by itself. */
export async function moveFinance(ctx: MutationCtx, project: Doc<"opportunities">, to: string, by: { name: string; userId?: Id<"users"> }, now: number, note?: string) {
  const from = project.stage;
  await ctx.db.patch(project._id, {
    stage: to,
    stageEnteredAt: now,
    searchText: project.searchText.endsWith(from) ? project.searchText.slice(0, -from.length) + to : `${project.searchText} ${to}`,
  });
  await ctx.db.insert("stageHistory", {
    opportunityId: project._id, businessId: project.businessId, from, to, byName: by.name, ...(by.userId ? { byUserId: by.userId } : {}), at: now, ...(note ? { note } : {}),
  });
  await notifyStage(ctx, { project, from, to, byName: by.name, ...(by.userId ? { byUserId: by.userId } : {}), now });
}

/** Called after anything that changes a project's invoices or payments. Moves a Finance project forward by itself: Send Final Invoice →
 *  Pending Final Payment once the sent invoices cover the billing total, then → Final Payment Received once nothing is owed.
 *  Everything after that (review, files, archive) is moved by hand. */
export async function financeAfterChange(ctx: MutationCtx, opportunityId: Id<"opportunities"> | undefined, by: { name: string; userId?: Id<"users"> }, now: number) {
  if (opportunityId === undefined) return;
  let project = await ctx.db.get(opportunityId);
  if (project === null || project.pipeline !== "Finance" || project.archivedAt !== undefined) return;
  if (project.stage === FINANCE_STAGES[0]) {
    const money = await projectMoney(ctx, project);
    if (!money.covered) return;
    await moveFinance(ctx, project, FINANCE_STAGES[1], by, now, "All invoices sent");
    project = await ctx.db.get(opportunityId);
    if (project === null) return;
  }
  if (project.stage === FINANCE_STAGES[1]) {
    const money = await projectMoney(ctx, project);
    if (money.covered && money.outstandingCents === 0) await moveFinance(ctx, project, FINANCE_STAGES[2], by, now, "Paid in full");
  }
}

/** Each schedule row's amount in cents, in row order, for a project's billing total. */
export async function scheduleAmounts(ctx: Reader, opportunityId: Id<"opportunities">, totalCents: number) {
  const rows = await ctx.db.query("paymentScheduleItems").withIndex("by_opportunityId_and_position", (q) => q.eq("opportunityId", opportunityId)).take(MAX_ROWS);
  const { amounts, remainingCents } = splitSchedule(totalCents, rows.map((r) => ({ kind: r.kind, value: r.value })));
  return { rows, amounts, remainingCents };
}
