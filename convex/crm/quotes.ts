import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { canSee, requireBusiness, requireEditor, requireStaff } from "./lib/access";
import { deleteQuote } from "./lib/quoteData";
import { DEFAULT_CONTRACT } from "./quoteDraft";
import { quoteTotals } from "./lib/quoteMath";
import { quoteMoneyOptions } from "./lib/quoteOptions";
import { DAY_MS, QUOTE_OPEN_STATUSES, QUOTE_STATUSES, type QuoteStatus } from "./lib/stages";

/* Quotes (D-056): the list, its figures, and one quote with everything on it. Read-only for now; the builder comes later. Same
   bounded-read approach as requests.ts: filtered, sorted, counted and cut into a page here, over at most MAX_QUOTES rows of one
   business. */

const MAX_QUOTES = 2000;

const statusFilter = v.union(
  v.literal("All"),
  v.literal("Draft"),
  v.literal("Awaiting response"),
  v.literal("Changes requested"),
  v.literal("Approved"),
  v.literal("Rejected"),
  v.literal("Converted"),
  v.literal("Archived"),
);
const sortKey = v.union(v.literal("client"), v.literal("number"), v.literal("createdAt"), v.literal("status"), v.literal("total"));
const direction = v.union(v.literal("asc"), v.literal("desc"));

const filterArgs = {
  businessId: v.id("businesses"),
  status: statusFilter,
  /** Inclusive range of created dates, in ms. null is open-ended. */
  from: v.union(v.number(), v.null()),
  to: v.union(v.number(), v.null()),
  /** One salesperson's name, or null for everyone. */
  salesperson: v.union(v.string(), v.null()),
  search: v.string(),
  sortKey,
  dir: direction,
};

type FilterArgs = {
  businessId: Id<"businesses">;
  status: "All" | QuoteStatus;
  from: number | null;
  to: number | null;
  salesperson: string | null;
  search: string;
  sortKey: "client" | "number" | "createdAt" | "status" | "total";
  dir: "asc" | "desc";
};

async function loadQuotes(ctx: QueryCtx, a: Pick<FilterArgs, "businessId" | "from" | "to" | "search">): Promise<Doc<"quotes">[]> {
  const text = a.search.trim();
  if (text) {
    const found = await ctx.db
      .query("quotes")
      .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", a.businessId))
      .take(MAX_QUOTES);
    return found.filter((o) => (a.from === null || o.createdAt >= a.from) && (a.to === null || o.createdAt <= a.to));
  }
  return await ctx.db
    .query("quotes")
    .withIndex("by_business_and_createdAt", (q) => {
      const base = q.eq("businessId", a.businessId);
      if (a.from !== null && a.to !== null) return base.gte("createdAt", a.from).lte("createdAt", a.to);
      if (a.from !== null) return base.gte("createdAt", a.from);
      if (a.to !== null) return base.lte("createdAt", a.to);
      return base;
    })
    .order("desc")
    .take(MAX_QUOTES);
}

type QuoteRow = {
  id: Id<"quotes">;
  clientId: Id<"clients">;
  number: number;
  title: string;
  status: QuoteStatus;
  salesperson: string;
  createdAt: number;
  totalCents: number;
  clientName: string;
  property: string;
};

async function matching(ctx: QueryCtx, a: FilterArgs) {
  const docs = await loadQuotes(ctx, a);
  const rows: QuoteRow[] = [];
  const clients = new Map<Id<"clients">, Doc<"clients"> | null>();
  for (const q of docs) {
    if (a.status !== "All" && q.status !== a.status) continue;
    if (a.salesperson !== null && q.salesperson !== a.salesperson) continue;
    if (!clients.has(q.clientId)) clients.set(q.clientId, await ctx.db.get(q.clientId));
    const client = clients.get(q.clientId);
    if (!client) continue;
    rows.push({
      id: q._id,
      clientId: q.clientId,
      number: q.number,
      title: q.title,
      status: q.status,
      salesperson: q.salesperson,
      createdAt: q.createdAt,
      totalCents: q.totalCents,
      clientName: client.name,
      property: client.street1 ? `${client.street1}, ${client.city}, ${client.state} ${client.zip}` : "",
    });
  }
  // A text search comes back in relevance order; otherwise sort as asked.
  if (!a.search.trim() || a.sortKey !== "createdAt") {
    const sign = a.dir === "asc" ? 1 : -1;
    const value = (r: QuoteRow): string | number =>
      a.sortKey === "client" ? r.clientName.toLowerCase()
      : a.sortKey === "number" ? r.number
      : a.sortKey === "status" ? QUOTE_STATUSES.indexOf(r.status)
      : a.sortKey === "total" ? r.totalCents
      : r.createdAt;
    rows.sort((x, y) => (value(x) < value(y) ? -1 : value(x) > value(y) ? 1 : 0) * sign);
  }
  return { rows, capped: docs.length >= MAX_QUOTES };
}

/** One page of a business's quotes, with the total. */
export const list = query({
  args: { ...filterArgs, page: v.number(), size: v.number() },
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    const { rows, capped } = await matching(ctx, args);
    const size = Math.min(Math.max(Math.floor(args.size), 1), 100);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(Math.max(Math.floor(args.page), 1), pages);
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, capped };
  },
});

export const exportRows = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    return (await matching(ctx, args)).rows;
  },
});

/** The people named on this business's quotes, for the Salesperson filter. */
export const salespeople = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    const docs = await ctx.db.query("quotes").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", args.businessId)).order("desc").take(MAX_QUOTES);
    return [...new Set(docs.map((q) => q.salesperson).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  },
});

/**
 * The Overview card and the three figure cards. Counts cover all of the business's quotes, whatever the list is filtered to. "Sent" and
 * "Converted" are the quotes sent or converted in the last 30 days (with their value), against the 30 days before that. The conversion
 * rate is, of the quotes sent in a period, the share that has been converted.
 */
export const stats = query({
  args: { businessId: v.id("businesses"), today: v.number() },
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    const docs = await loadQuotes(ctx, { businessId: args.businessId, from: null, to: null, search: "" });
    const counts = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, 0])) as Record<QuoteStatus, number>;
    const since = args.today - 30 * DAY_MS;
    const before = args.today - 60 * DAY_MS;
    const inNow = (t: number | undefined) => t !== undefined && t >= since;
    const inEarlier = (t: number | undefined) => t !== undefined && t >= before && t < since;

    const sent = { now: { count: 0, cents: 0, converted: 0 }, earlier: { count: 0, cents: 0, converted: 0 } };
    const converted = { now: { count: 0, cents: 0 }, earlier: { count: 0, cents: 0 } };
    for (const q of docs) {
      counts[q.status] += 1;
      const s = inNow(q.sentAt) ? sent.now : inEarlier(q.sentAt) ? sent.earlier : null;
      if (s) {
        s.count += 1;
        s.cents += q.totalCents;
        if (q.convertedAt !== undefined) s.converted += 1;
      }
      // "Approved / Converted": the day a quote was converted, or else the day it was approved.
      const doneAt = q.convertedAt ?? q.approvedAt;
      const c = inNow(doneAt) ? converted.now : inEarlier(doneAt) ? converted.earlier : null;
      if (c) {
        c.count += 1;
        c.cents += q.totalCents;
      }
    }
    const rate = (w: { count: number; converted: number }) => (w.count ? Math.round((w.converted / w.count) * 100) : 0);
    return {
      counts,
      /** Open quotes: Draft, Awaiting response and Changes requested (the PRD's "Pending"). */
      pending: counts.Draft + counts["Awaiting response"] + counts["Changes requested"],
      open: QUOTE_OPEN_STATUSES,
      conversionRate: rate(sent.now),
      conversionRateBefore: rate(sent.earlier),
      sent: { count: sent.now.count, cents: sent.now.cents, countBefore: sent.earlier.count },
      converted: { count: converted.now.count, cents: converted.now.cents, countBefore: converted.earlier.count },
    };
  },
});

/** A client's quotes, newest first, for the Work overview card on the client page. */
export const byClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (client === null) return [];
    await requireBusiness(ctx, client.businessId);
    const rows = await ctx.db.query("quotes").withIndex("by_clientId", (q) => q.eq("clientId", args.clientId)).take(100);
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((q) => ({ _id: q._id, number: q.number, title: q.title, status: q.status, createdAt: q.createdAt, totalCents: q.totalCents }));
  },
});

/** One quote with everything on its page, or null if it does not exist (or belongs to a business the caller cannot see). */
export const get = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const quote = await ctx.db.get(args.id);
    if (quote === null || !canSee(staff, quote.businessId)) return null;
    const client = await ctx.db.get(quote.clientId);
    if (client === null) return null;
    const opportunity = quote.opportunityId ? await ctx.db.get(quote.opportunityId) : null;

    const lineDocs = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(200);
    const lines = [];
    for (const l of lineDocs) {
      lines.push({
        id: l._id,
        name: l.name,
        description: l.description,
        imageUrl: l.imageId ? await ctx.storage.getUrl(l.imageId) : null,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        optional: l.optional,
        selected: l.selected,
        kind: l.kind ?? ("item" as const),
        catalogueName: l.catalogueName ?? null,
      });
    }
    const attachmentDocs = await ctx.db.query("quoteAttachments").withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id)).take(100);
    const attachments = [];
    for (const att of attachmentDocs) attachments.push({ id: att._id, name: att.name, contentType: att.contentType, size: att.size, url: await ctx.storage.getUrl(att.storageId) });
    const noteDocs = await ctx.db.query("quoteNotes").withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id)).take(100);
    const notes = [];
    for (const n of noteDocs.sort((a, b) => b.createdAt - a.createdAt)) {
      notes.push({
        id: n._id,
        text: n.text,
        author: n.author,
        createdAt: n.createdAt,
        attachmentName: n.attachmentName ?? null,
        attachmentUrl: n.attachmentId ? await ctx.storage.getUrl(n.attachmentId) : null,
      });
    }

    return {
      id: quote._id,
      businessId: quote.businessId,
      number: quote.number,
      title: quote.title,
      status: quote.status,
      salesperson: quote.salesperson,
      createdAt: quote.createdAt,
      sentAt: quote.sentAt ?? null,
      viewedAt: quote.viewedAt ?? null,
      approvedAt: quote.approvedAt ?? null,
      convertedAt: quote.convertedAt ?? null,
      introHeading: quote.introHeading,
      introText: quote.introText,
      introImageUrl: quote.introImageId ? await ctx.storage.getUrl(quote.introImageId) : null,
      clientMessage: quote.clientMessage,
      contract: quote.contract,
      disclaimers: quote.disclaimers ?? [],
      depositPercent: quote.depositPercent,
      discountKind: quote.discountKind ?? null,
      discountValue: quote.discountValue ?? 0,
      taxPercent: quote.taxPercent ?? 0,
      depositKind: quote.depositKind ?? (quote.depositPercent > 0 ? ("percent" as const) : null),
      depositValue: quote.depositValue ?? quote.depositPercent,
      clientView: quote.clientView ?? { quantities: true, unitPrices: true, lineTotals: true, totals: true },
      revision: quote.revision ?? 0,
      shareToken: quote.shareToken ?? null,
      rejectedAt: quote.rejectedAt ?? null,
      rejectedReason: quote.rejectedReason ?? null,
      changesRequestedAt: quote.changesRequestedAt ?? null,
      changesMessage: quote.changesMessage ?? null,
      depositProofName: quote.depositProofName ?? null,
      depositProofUrl: quote.depositProofId ? await ctx.storage.getUrl(quote.depositProofId) : null,
      depositCollectedAt: quote.depositCollectedAt ?? null,
      signedBy: quote.signedBy ?? null,
      signatureUrl: quote.signatureImageId ? await ctx.storage.getUrl(quote.signatureImageId) : null,
      signedAt: quote.signedAt ?? null,
      // Worked out from the lines every time, so the page can never show a total the lines do not add up to.
      totals: quoteTotals(lines, quoteMoneyOptions(quote), quote.depositCollectedCents ?? 0),
      lines,
      attachments,
      notes,
      client: {
        id: client._id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        street1: client.street1,
        street2: client.street2,
        city: client.city,
        state: client.state,
        zip: client.zip,
      },
      request: opportunity ? { id: opportunity._id, clientId: opportunity.clientId, requestedAt: opportunity.requestedAt, title: opportunity.title } : null,
    };
  },
});

/** Deletes a quote for good, with its lines, notes and stored files. Anyone who may edit in that business can; the page asks first. */
export const remove = mutation({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.id);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    await requireEditor(ctx, quote.businessId);
    await deleteQuote(ctx, quote);
    return quote.number;
  },
});

/** The contract text a new quote starts with: the business's saved default ("Apply to all future quotes"), else Jobber's wording. */
export const contractDefault = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const row = await ctx.db.query("quoteDefaults").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    return row?.contract ?? DEFAULT_CONTRACT;
  },
});
