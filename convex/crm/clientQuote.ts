import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import { checkImage, logEvent } from "./quoteDraft";
import { quoteTotals } from "./lib/quoteMath";
import { quoteMoneyOptions } from "./lib/quoteOptions";
import { systemMove } from "./lib/systemMove";

/** The client's side of a quote (D-063). No sign-in: the secret link (`token`, 64 characters) is the key. Everything here is checked by
 *  that token alone, returns nothing about staff or other quotes (no notes, no other clients), and the answers are rate limited. */

const CLIENT = "Client (quote link)";

async function byToken(ctx: QueryCtx, token: string): Promise<Doc<"quotes"> | null> {
  if (token.length < 32) return null;
  const quote = await ctx.db.query("quotes").withIndex("by_shareToken", (q) => q.eq("shareToken", token)).first();
  return quote === null || quote.status === "Archived" ? null : quote;
}

async function waiting(ctx: MutationCtx, token: string): Promise<Doc<"quotes">> {
  await rateLimiter.limit(ctx, "clientQuoteAnswer", { key: token.slice(0, 16), throws: true });
  const quote = await byToken(ctx, token);
  if (quote === null) throw new ConvexError("This link is not valid.");
  if (quote.status !== "Awaiting response") throw new ConvexError("This quote is no longer waiting for an answer.");
  return quote;
}

async function moveProject(ctx: MutationCtx, quote: Doc<"quotes">, to: string, note?: string, onlyForward = false) {
  if (!quote.opportunityId) return;
  const project = await ctx.db.get(quote.opportunityId);
  if (project) await systemMove(ctx, project, to, CLIENT, Date.now(), { onlyForward, note });
}

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, a) => {
    const quote = await byToken(ctx, a.token);
    if (quote === null) return null;
    const [business, client] = await Promise.all([ctx.db.get(quote.businessId), ctx.db.get(quote.clientId)]);
    const view = quote.clientView ?? { quantities: true, unitPrices: true, lineTotals: true, totals: true };
    const lineDocs = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(200);
    const lines = [];
    for (const l of lineDocs) {
      const text = (l.kind ?? "item") === "text";
      lines.push({
        id: l._id, kind: l.kind ?? ("item" as const), name: l.name, description: l.description, imageUrl: l.imageId ? await ctx.storage.getUrl(l.imageId) : null,
        quantity: !text && view.quantities ? l.quantity : null,
        unitPriceCents: !text && view.unitPrices ? l.unitPriceCents : null,
        totalCents: !text && view.lineTotals ? Math.round(l.quantity * l.unitPriceCents) : null,
        optional: l.optional, selected: l.selected,
      });
    }
    const attachmentDocs = await ctx.db.query("quoteAttachments").withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id)).take(50);
    const attachments = [];
    for (const att of attachmentDocs) attachments.push({ name: att.name, contentType: att.contentType, url: await ctx.storage.getUrl(att.storageId) });
    const totals = quoteTotals(lineDocs.map((l) => ({ ...l })), quoteMoneyOptions(quote), quote.depositCollectedCents ?? 0);
    return {
      businessName: business?.name ?? "",
      clientFirstName: (client?.contactName || client?.name || "").split(" ")[0],
      salesperson: quote.salesperson,
      number: quote.number,
      title: quote.title,
      status: quote.status,
      revision: quote.revision ?? 1,
      canAnswer: quote.status === "Awaiting response",
      introHeading: quote.introHeading,
      introText: quote.introText,
      introImageUrl: quote.introImageId ? await ctx.storage.getUrl(quote.introImageId) : null,
      lines,
      clientView: view,
      totals: view.totals ? totals : null,
      depositCents: view.totals ? totals.depositCents : null,
      clientMessage: quote.clientMessage,
      contract: quote.contract,
      disclaimers: quote.disclaimers ?? [],
      attachments,
      signedBy: quote.signedBy ?? null,
      signedAt: quote.signedAt ?? null,
      changesMessage: quote.status === "Changes requested" ? (quote.changesMessage ?? null) : null,
      rejectedReason: quote.status === "Rejected" ? (quote.rejectedReason ?? null) : null,
    };
  },
});

/** The first time the client opens the link. */
export const markViewed = mutation({
  args: { token: v.string() },
  handler: async (ctx, a) => {
    await rateLimiter.limit(ctx, "clientQuoteAnswer", { key: a.token.slice(0, 16), throws: true });
    const quote = await byToken(ctx, a.token);
    if (quote === null || quote.viewedAt !== undefined) return;
    const now = Date.now();
    await ctx.db.patch(quote._id, { viewedAt: now });
    await logEvent(ctx, quote._id, "viewed", "Client", "Opened the quote", now);
  },
});

/** A place to upload the signature picture to, only while the quote is waiting for an answer. */
export const uploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, a) => {
    await waiting(ctx, a.token);
    return ctx.storage.generateUploadUrl();
  },
});

export const approve = mutation({
  args: { token: v.string(), signedBy: v.string(), signatureStorageId: v.id("_storage"), selectedLineIds: v.array(v.id("quoteLineItems")) },
  handler: async (ctx, a) => {
    const quote = await waiting(ctx, a.token);
    const name = a.signedBy.trim();
    if (name.length < 1 || name.length > 100) throw new ConvexError("Type your name to sign.");
    const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(200);
    const optionalIds = new Set(lines.filter((l) => l.optional).map((l) => l._id as string));
    if (a.selectedLineIds.some((id) => !optionalIds.has(id))) throw new ConvexError("One of the lines is not an optional line of this quote.");
    await checkImage(ctx, a.signatureStorageId, "The signature");
    const ticked = new Set(a.selectedLineIds as string[]);
    const settled = lines.map((l) => ({ ...l, selected: l.optional ? ticked.has(l._id) : l.selected }));
    for (const l of settled) if (l.optional && l.selected !== lines.find((o) => o._id === l._id)!.selected) await ctx.db.patch(l._id, { selected: l.selected });
    const totals = quoteTotals(settled, quoteMoneyOptions(quote), quote.depositCollectedCents ?? 0);
    const now = Date.now();
    await ctx.db.patch(quote._id, { status: "Approved", approvedAt: now, signedAt: now, signedBy: name, signatureImageId: a.signatureStorageId, totalCents: totals.totalCents });
    await logEvent(ctx, quote._id, "approved", name, `Approved and signed online (revision ${quote.revision ?? 1})`, now);
    await moveProject(ctx, quote, "Quotes Approved — Contract Out for Signature", undefined, true);
  },
});

export const requestChanges = mutation({
  args: { token: v.string(), message: v.string() },
  handler: async (ctx, a) => {
    const quote = await waiting(ctx, a.token);
    const message = a.message.trim();
    if (message.length < 1 || message.length > 2000) throw new ConvexError("Write a message saying what you would like changed (up to 2000 characters).");
    const now = Date.now();
    await ctx.db.patch(quote._id, { status: "Changes requested", changesRequestedAt: now, changesMessage: message });
    await logEvent(ctx, quote._id, "changes", "Client", message, now);
    await moveProject(ctx, quote, "Changes Requested");
  },
});

export const decline = mutation({
  args: { token: v.string(), reason: v.string() },
  handler: async (ctx, a) => {
    const quote = await waiting(ctx, a.token);
    const reason = a.reason.trim();
    if (reason.length < 1 || reason.length > 1000) throw new ConvexError("Give a reason for declining (up to 1000 characters).");
    const now = Date.now();
    await ctx.db.patch(quote._id, { status: "Rejected", rejectedAt: now, rejectedReason: reason });
    await logEvent(ctx, quote._id, "rejected", "Client", reason, now);
    await moveProject(ctx, quote, "Closed Lost", reason);
  },
});

/** The totals if the client ticks exactly these optional lines, so the page can show the new total as they tick (the client never sees how it
 *  is worked out, only the result, and only when the quote lets them see totals). */
export const totalsFor = query({
  args: { token: v.string(), selectedLineIds: v.array(v.id("quoteLineItems")) },
  handler: async (ctx, a) => {
    const quote = await byToken(ctx, a.token);
    if (quote === null) return null;
    if (!(quote.clientView ?? { totals: true }).totals) return null;
    const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(200);
    const ticked = new Set(a.selectedLineIds as string[]);
    const settled = lines.map((l) => ({ ...l, selected: l.optional ? ticked.has(l._id) : l.selected }));
    const t = quoteTotals(settled, quoteMoneyOptions(quote), quote.depositCollectedCents ?? 0);
    return { subtotalCents: t.subtotalCents, discountCents: t.discountCents, taxCents: t.taxCents, totalCents: t.totalCents, depositCents: t.depositCents };
  },
});
