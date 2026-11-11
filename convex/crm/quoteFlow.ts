import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireBusiness, requireEditor, type Staff } from "./lib/access";
import { checkFile, checkImage, logEvent } from "./quoteDraft";
import { quoteTotals } from "./lib/quoteMath";
import { quoteMoneyOptions } from "./lib/quoteOptions";
import { systemMove } from "./lib/systemMove";

/** Sending a quote and what staff do at the other end of it (D-063): the secret link and revisions, marking it awaiting, collecting a
 *  signature in person, recording a deposit. The client's own answers are in clientQuote.ts. Email and text delivery are not built
 *  (the Zoho connection comes later), so "sending" makes the link and records it. */

const SENDABLE = ["Draft", "Awaiting response", "Changes requested"] as const;

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

async function load(ctx: MutationCtx, id: Id<"quotes">) {
  const quote = await ctx.db.get(id);
  if (quote === null) throw new ConvexError("That quote no longer exists.");
  const staff = await requireEditor(ctx, quote.businessId);
  return { quote, staff };
}

async function linesOf(ctx: MutationCtx, quoteId: Id<"quotes">) {
  return ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quoteId)).take(500);
}

async function moveProject(ctx: MutationCtx, quote: Doc<"quotes">, to: string, staff: Staff, now: number) {
  if (!quote.opportunityId) return;
  const project = await ctx.db.get(quote.opportunityId);
  if (project) await systemMove(ctx, project, to, staff.name, now, { onlyForward: true, byUserId: staff.userId });
}

export const send = mutation({
  args: { id: v.id("quotes"), now: v.number() },
  handler: async (ctx, a) => {
    const { quote, staff } = await load(ctx, a.id);
    if (!(SENDABLE as readonly string[]).includes(quote.status)) throw new ConvexError("This quote cannot be sent now.");
    const lines = await linesOf(ctx, quote._id);
    const totals = quoteTotals(lines.map((l) => ({ ...l })), quoteMoneyOptions(quote), quote.depositCollectedCents ?? 0);
    if (!lines.some((l) => (l.kind ?? "item") === "item" && l.quantity * l.unitPriceCents > 0) || totals.totalCents <= 0) {
      throw new ConvexError("Add at least one line with a price before sending.");
    }
    const first = quote.shareToken === undefined;
    const token = quote.shareToken ?? newToken();
    const revision = (quote.revision ?? 0) + 1;
    await ctx.db.insert("quoteRevisions", {
      quoteId: quote._id, revision, sentAt: a.now,
      snapshot: {
        title: quote.title, totalCents: totals.totalCents,
        lines: lines.map((l) => ({ name: l.name, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, optional: l.optional, selected: l.selected, kind: l.kind ?? "item" })),
      },
    });
    await ctx.db.patch(quote._id, { status: "Awaiting response", sentAt: a.now, shareToken: token, revision, totalCents: totals.totalCents, changesRequestedAt: undefined });
    await logEvent(ctx, quote._id, (quote.revision ?? 0) >= 1 ? "resubmitted" : "sent", staff.name, `Revision ${revision}`, a.now);
    if (first) await logEvent(ctx, quote._id, "link", staff.name, "Client link created", a.now);
    await moveProject(ctx, quote, "Proposal Delivered — Awaiting Response", staff, a.now);
    return { token, revision };
  },
});

/** Jobber's "Mark as Awaiting Response": the quote was given to the client some other way. No link and no new revision. */
export const markAwaitingResponse = mutation({
  args: { id: v.id("quotes"), now: v.number() },
  handler: async (ctx, a) => {
    const { quote, staff } = await load(ctx, a.id);
    if (!(SENDABLE as readonly string[]).includes(quote.status)) throw new ConvexError("This quote cannot be changed now.");
    await ctx.db.patch(quote._id, { status: "Awaiting response", sentAt: quote.sentAt ?? a.now });
    await logEvent(ctx, quote._id, "awaiting", staff.name, "Marked as awaiting response", a.now);
    await moveProject(ctx, quote, "Proposal Delivered — Awaiting Response", staff, a.now);
  },
});

export const collectSignature = mutation({
  args: { id: v.id("quotes"), signedBy: v.string(), signatureStorageId: v.id("_storage"), now: v.number() },
  handler: async (ctx, a) => {
    const { quote, staff } = await load(ctx, a.id);
    if (quote.status === "Approved" || quote.status === "Converted") throw new ConvexError("This quote is already approved and signed.");
    if (quote.status === "Rejected" || quote.status === "Archived") throw new ConvexError("This quote cannot be signed now.");
    const name = a.signedBy.trim();
    if (name.length < 1 || name.length > 100) throw new ConvexError("Enter the name of the person who signed.");
    await checkImage(ctx, a.signatureStorageId, "A signature");
    const lines = await linesOf(ctx, quote._id);
    const totals = quoteTotals(lines.map((l) => ({ ...l })), quoteMoneyOptions(quote), quote.depositCollectedCents ?? 0);
    await ctx.db.patch(quote._id, { status: "Approved", approvedAt: a.now, signedAt: a.now, signedBy: name, signatureImageId: a.signatureStorageId, totalCents: totals.totalCents });
    await logEvent(ctx, quote._id, "signed", staff.name, `Signed in person by ${name}`, a.now);
    await moveProject(ctx, quote, "Quotes Approved — Contract Out for Signature", staff, a.now);
  },
});

export const recordDeposit = mutation({
  args: { id: v.id("quotes"), amountCents: v.number(), receivedAt: v.number(), proofStorageId: v.optional(v.id("_storage")), proofName: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const { quote, staff } = await load(ctx, a.id);
    if (quote.status !== "Approved") throw new ConvexError("A deposit can be recorded once the quote is approved.");
    if (!Number.isInteger(a.amountCents) || a.amountCents <= 0) throw new ConvexError("Enter the amount received, more than zero.");
    const lines = await linesOf(ctx, quote._id);
    const totals = quoteTotals(lines.map((l) => ({ ...l })), quoteMoneyOptions(quote), 0);
    const collected = (quote.depositCollectedCents ?? 0) + a.amountCents;
    if (collected > totals.totalCents) throw new ConvexError("That is more than the quote total.");
    if (a.proofStorageId) await checkFile(ctx, a.proofStorageId, "The proof of payment");
    if (a.proofStorageId && quote.depositProofId) await ctx.storage.delete(quote.depositProofId);
    await ctx.db.patch(quote._id, {
      depositCollectedCents: collected, depositCollectedAt: a.receivedAt,
      ...(a.proofStorageId ? { depositProofId: a.proofStorageId, depositProofName: (a.proofName ?? "Proof of payment").slice(0, 200) } : {}),
    });
    await logEvent(ctx, quote._id, "deposit", staff.name, `Deposit received: ${(a.amountCents / 100).toFixed(2)}${a.proofStorageId ? " (with proof)" : ""}`, a.receivedAt);
  },
});

/** What happened to a quote, oldest first. */
export const events = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.id);
    if (quote === null) return [];
    await requireBusiness(ctx, quote.businessId);
    const rows = await ctx.db.query("quoteEvents").withIndex("by_quoteId", (q) => q.eq("quoteId", a.id)).take(500);
    return rows.sort((x, y) => x.at - y.at || x._creationTime - y._creationTime);
  },
});

/** Every version that was sent, newest first. */
export const revisions = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.id);
    if (quote === null) return [];
    await requireBusiness(ctx, quote.businessId);
    const rows = await ctx.db.query("quoteRevisions").withIndex("by_quoteId", (q) => q.eq("quoteId", a.id)).take(200);
    return rows.sort((x, y) => y.revision - x.revision);
  },
});
