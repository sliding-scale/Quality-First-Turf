import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type MutationCtx } from "../_generated/server";
import { requireEditor } from "./lib/access";
import { quoteMoneyOptions } from "./lib/quoteOptions";
import { quoteTotals } from "./lib/quoteMath";
import { systemMove } from "./lib/systemMove";
import { notifyMentions } from "./lib/mentionNotify";
import { MAX_DISCLAIMERS_PER_QUOTE, checkDisclaimer } from "./lib/disclaimers";

/** Building a quote (D-063): create, save, attachments, notes, duplicate, archive. Sending and the client's answers are in quoteFlow.ts and
 *  clientQuote.ts. A quote that is approved, rejected, converted or archived can no longer be edited. */

export const DEFAULT_CONTRACT = "This quote is valid for the next 30 days, after which values may be subject to change.";
const MAX_LINES = 200;
const MAX_FILE = 15 * 1024 * 1024;
const LOCKED = ["Approved", "Rejected", "Converted", "Archived"] as const;

export async function logEvent(ctx: MutationCtx, quoteId: Id<"quotes">, kind: string, byName: string, detail: string, at: number) {
  await ctx.db.insert("quoteEvents", { quoteId, at, kind, byName, detail });
}

async function nextNumber(ctx: MutationCtx, businessId: Id<"businesses">): Promise<number> {
  const last = await ctx.db.query("quotes").withIndex("by_business_and_number", (q) => q.eq("businessId", businessId)).order("desc").first();
  return (last?.number ?? 0) + 1;
}

async function searchTextOf(ctx: MutationCtx, quote: Pick<Doc<"quotes">, "clientId" | "number" | "title">): Promise<string> {
  const c = await ctx.db.get(quote.clientId);
  return [c?.name ?? "", c?.street1 ?? "", c?.city ?? "", c?.state ?? "", c?.zip ?? "", String(quote.number), quote.title].join(" ");
}

/** A stored file must be a PDF or an image and at most 15 MB. */
export async function checkFile(ctx: MutationCtx, storageId: Id<"_storage">, what: string) {
  const meta = await ctx.db.system.get("_storage", storageId);
  if (meta === null) throw new ConvexError("That file was not uploaded.");
  const type = meta.contentType ?? "";
  if (!(type === "application/pdf" || type.startsWith("image/"))) {
    await ctx.storage.delete(storageId);
    throw new ConvexError(`${what} must be a PDF or an image.`);
  }
  if (meta.size > MAX_FILE) {
    await ctx.storage.delete(storageId);
    throw new ConvexError(`${what} can be at most 15 MB.`);
  }
  return { contentType: type, size: meta.size };
}

export const create = mutation({
  args: { businessId: v.id("businesses"), clientId: v.id("clients"), opportunityId: v.optional(v.id("opportunities")), title: v.string(), now: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const staff = await requireEditor(ctx, a.businessId);
    const client = await ctx.db.get(a.clientId);
    if (client === null || client.businessId !== a.businessId) throw new ConvexError("That client is not in this business.");
    let project: Doc<"opportunities"> | null = null;
    if (a.opportunityId) {
      project = await ctx.db.get(a.opportunityId);
      if (project === null || project.businessId !== a.businessId || project.clientId !== a.clientId) throw new ConvexError("That project does not belong to this client.");
    }
    const title = a.title.trim();
    if (title.length > 200) throw new ConvexError("A title can be at most 200 characters.");
    const now = a.now ?? Date.now();
    const defaults = await ctx.db.query("quoteDefaults").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    const number = await nextNumber(ctx, a.businessId);
    const doc = {
      businessId: a.businessId, clientId: a.clientId, opportunityId: a.opportunityId, number, title, status: "Draft" as const, salesperson: staff.name, createdAt: now,
      introHeading: "", introText: "", clientMessage: "", contract: defaults?.contract ?? DEFAULT_CONTRACT, depositPercent: 0, totalCents: 0,
      clientView: { quantities: true, unitPrices: true, lineTotals: true, totals: true }, searchText: "",
    };
    const id = await ctx.db.insert("quotes", { ...doc, searchText: await searchTextOf(ctx, doc) });
    await logEvent(ctx, id, "created", staff.name, "Quote created", now);
    if (project) await systemMove(ctx, project, "Quote Draft & Site Plan / Design", staff.name, now, { onlyForward: true, byUserId: staff.userId });
    return id;
  },
});

const lineV = v.object({
  id: v.optional(v.id("quoteLineItems")),
  kind: v.union(v.literal("item"), v.literal("text")),
  name: v.string(),
  description: v.string(),
  imageId: v.optional(v.id("_storage")),
  quantity: v.number(),
  unitPriceCents: v.number(),
  optional: v.boolean(),
  selected: v.boolean(),
  catalogueName: v.optional(v.string()),
});

export const save = mutation({
  args: {
    id: v.id("quotes"),
    title: v.string(),
    salesperson: v.string(),
    introHeading: v.string(),
    introText: v.string(),
    introImageId: v.optional(v.id("_storage")),
    lines: v.array(lineV),
    discountKind: v.optional(v.union(v.literal("amount"), v.literal("percent"))),
    discountValue: v.optional(v.number()),
    taxPercent: v.optional(v.number()),
    depositKind: v.optional(v.union(v.literal("percent"), v.literal("amount"))),
    depositValue: v.optional(v.number()),
    clientView: v.object({ quantities: v.boolean(), unitPrices: v.boolean(), lineTotals: v.boolean(), totals: v.boolean() }),
    clientMessage: v.string(),
    contract: v.string(),
    applyContractToFuture: v.boolean(),
    /** The saved disclaimers attached (D-075), each a copy of its title and wording. Left out: the quote keeps the ones it has. */
    disclaimers: v.optional(v.array(v.object({ title: v.string(), text: v.string() }))),
  },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.id);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    await requireEditor(ctx, quote.businessId);
    if ((LOCKED as readonly string[]).includes(quote.status)) throw new ConvexError("This quote can no longer be edited.");
    const title = a.title.trim();
    if (title.length < 1 || title.length > 200) throw new ConvexError("A quote title needs 1 to 200 characters.");
    if (a.lines.length > MAX_LINES) throw new ConvexError(`A quote can have at most ${MAX_LINES} lines.`);
    for (const l of a.lines) {
      if (l.name.trim().length < 1 || l.name.length > 1000) throw new ConvexError("Every line needs a name.");
      if (l.kind === "item") {
        if (!Number.isFinite(l.quantity) || l.quantity < 0 || l.quantity > 1_000_000) throw new ConvexError("A quantity has to be between 0 and 1,000,000.");
        if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0 || l.unitPriceCents > 10_000_000_000) throw new ConvexError("A unit price has to be zero or more.");
      }
    }
    if (a.disclaimers !== undefined) {
      if (a.disclaimers.length > MAX_DISCLAIMERS_PER_QUOTE) throw new ConvexError(`A quote can have up to ${MAX_DISCLAIMERS_PER_QUOTE} disclaimers.`);
      for (const d of a.disclaimers) {
        const problem = checkDisclaimer(d);
        if (problem) throw new ConvexError(problem);
      }
      if (new Set(a.disclaimers.map((d) => d.title.trim().toLowerCase())).size !== a.disclaimers.length) throw new ConvexError("A disclaimer can be attached to a quote once.");
    }
    const money = {
      discountKind: a.discountKind, discountValue: a.discountValue, taxPercent: a.taxPercent, depositKind: a.depositKind, depositValue: a.depositValue,
    };
    // Replace the lines, keeping their order. A line that already had a picture keeps it unless a new one is given.
    const old = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(500);
    const keep = new Set(a.lines.map((l) => l.id).filter(Boolean));
    for (const o of old) {
      if (!keep.has(o._id)) {
        await ctx.db.delete(o._id);
        if (o.imageId && !a.lines.some((l) => l.imageId === o.imageId)) await ctx.storage.delete(o.imageId);
      }
    }
    for (const [position, l] of a.lines.entries()) {
      const fields = {
        position, name: l.name.trim(), description: l.kind === "text" ? "" : l.description, imageId: l.imageId, quantity: l.kind === "text" ? 1 : l.quantity,
        unitPriceCents: l.kind === "text" ? 0 : l.unitPriceCents, optional: l.kind === "text" ? false : l.optional, selected: l.selected, kind: l.kind, catalogueName: l.catalogueName,
      };
      const existing = l.id ? old.find((o) => o._id === l.id) : undefined;
      if (existing) await ctx.db.patch(existing._id, fields);
      else await ctx.db.insert("quoteLineItems", { quoteId: quote._id, ...fields });
    }
    const totals = quoteTotals(a.lines.map((l) => ({ ...l })), quoteMoneyOptions({ ...money }), quote.depositCollectedCents ?? 0);
    const next = { ...quote, title };
    if (quote.introImageId && quote.introImageId !== a.introImageId) await ctx.storage.delete(quote.introImageId);
    await ctx.db.patch(quote._id, {
      title, salesperson: a.salesperson.trim() || quote.salesperson, introHeading: a.introHeading, introText: a.introText, introImageId: a.introImageId, ...money,
      depositPercent: a.depositKind === "percent" ? Math.min(100, Math.max(0, a.depositValue ?? 0)) : 0, clientView: a.clientView, clientMessage: a.clientMessage,
      contract: a.contract, ...(a.disclaimers !== undefined ? { disclaimers: a.disclaimers.map((d) => ({ title: d.title.trim(), text: d.text.trim() })) } : {}),
      totalCents: totals.totalCents, searchText: await searchTextOf(ctx, next),
    });
    if (a.applyContractToFuture) {
      const row = await ctx.db.query("quoteDefaults").withIndex("by_business", (q) => q.eq("businessId", quote.businessId)).first();
      if (row) await ctx.db.patch(row._id, { contract: a.contract });
      else await ctx.db.insert("quoteDefaults", { businessId: quote.businessId, contract: a.contract });
    }
  },
});

/** A URL a staff member uploads a file to (an attachment, a picture, a signature, a deposit proof). */
export const uploadUrl = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireEditor(ctx, a.businessId);
    return ctx.storage.generateUploadUrl();
  },
});

export const addAttachment = mutation({
  args: { quoteId: v.id("quotes"), storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.quoteId);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    await requireEditor(ctx, quote.businessId);
    const meta = await checkFile(ctx, a.storageId, "An attachment");
    await ctx.db.insert("quoteAttachments", { quoteId: quote._id, storageId: a.storageId, name: a.name.trim().slice(0, 200) || "Attachment", contentType: meta.contentType, size: meta.size, createdAt: Date.now() });
  },
});

export const removeAttachment = mutation({
  args: { id: v.id("quoteAttachments") },
  handler: async (ctx, a) => {
    const att = await ctx.db.get(a.id);
    if (att === null) return;
    const quote = await ctx.db.get(att.quoteId);
    if (quote) await requireEditor(ctx, quote.businessId);
    await ctx.db.delete(a.id);
    await ctx.storage.delete(att.storageId);
  },
});

export const addNote = mutation({
  args: { quoteId: v.id("quotes"), text: v.string(), attachmentId: v.optional(v.id("_storage")), attachmentName: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.quoteId);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    const staff = await requireEditor(ctx, quote.businessId);
    const text = a.text.trim();
    if (!text && !a.attachmentId) throw new ConvexError("Write something first.");
    if (a.attachmentId) await checkFile(ctx, a.attachmentId, "A note's file");
    const now = Date.now();
    await ctx.db.insert("quoteNotes", { quoteId: quote._id, text, author: staff.name, createdAt: now, attachmentId: a.attachmentId, attachmentName: a.attachmentName });
    await notifyMentions(ctx, { businessId: quote.businessId, staff, text, target: { kind: "quote", quoteId: quote._id }, now });
  },
});

export const duplicate = mutation({
  args: { id: v.id("quotes") },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.id);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    const staff = await requireEditor(ctx, quote.businessId);
    const number = await nextNumber(ctx, quote.businessId);
    const now = Date.now();
    const id = await ctx.db.insert("quotes", {
      businessId: quote.businessId, clientId: quote.clientId, opportunityId: quote.opportunityId, number, title: quote.title, status: "Draft", salesperson: staff.name, createdAt: now,
      introHeading: quote.introHeading, introText: quote.introText, clientMessage: quote.clientMessage, contract: quote.contract, disclaimers: quote.disclaimers, depositPercent: quote.depositPercent,
      totalCents: quote.totalCents, discountKind: quote.discountKind, discountValue: quote.discountValue, taxPercent: quote.taxPercent, depositKind: quote.depositKind,
      depositValue: quote.depositValue, clientView: quote.clientView, searchText: quote.searchText.replace(String(quote.number), String(number)),
    });
    const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(500);
    for (const l of lines) {
      const { _id, _creationTime, quoteId, imageId, ...rest } = l;
      void _id; void _creationTime; void quoteId; void imageId; // pictures are not copied: a deleted copy must not delete the original's file
      await ctx.db.insert("quoteLineItems", { quoteId: id, ...rest });
    }
    await logEvent(ctx, id, "created", staff.name, `Copied from quote #${quote.number}`, now);
    return id;
  },
});

export const archive = mutation({
  args: { id: v.id("quotes") },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.id);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    const staff = await requireEditor(ctx, quote.businessId);
    if (quote.status === "Converted") throw new ConvexError("A converted quote cannot be archived.");
    await ctx.db.patch(a.id, { status: "Archived", shareToken: undefined });
    await logEvent(ctx, a.id, "archived", staff.name, "Quote archived", Date.now());
  },
});

/** A signature picture: an image, at most 2 MB. */
export async function checkImage(ctx: MutationCtx, storageId: Id<"_storage">, what: string, maxBytes = 2 * 1024 * 1024) {
  const meta = await ctx.db.system.get("_storage", storageId);
  if (meta === null) throw new ConvexError("That file was not uploaded.");
  if (!(meta.contentType ?? "").startsWith("image/")) {
    await ctx.storage.delete(storageId);
    throw new ConvexError(`${what} must be an image.`);
  }
  if (meta.size > maxBytes) {
    await ctx.storage.delete(storageId);
    throw new ConvexError(`${what} is too large.`);
  }
}
