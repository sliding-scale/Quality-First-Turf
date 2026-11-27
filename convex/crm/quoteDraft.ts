import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireModule } from "./lib/access";
import { quoteMoneyOptions } from "./lib/quoteOptions";
import { quoteTotals } from "./lib/quoteMath";
import { systemMove } from "./lib/systemMove";
import { notifyMentions } from "./lib/mentionNotify";
import { checkNoteFiles, noteFilesArg } from "./lib/noteFiles";
import { toggleCheckbox } from "./lib/noteText";
import { newShortCode } from "../projects/shortCode";
import { opportunitySearchText } from "./lib/clientInput";
import { isProductPhotoPath } from "../shared/productPhotos";
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
    const staff = await requireModule(ctx, a.businessId, "quotes", "edit");
    const client = await ctx.db.get(a.clientId);
    if (client === null || client.businessId !== a.businessId) throw new ConvexError("That client is not in this business.");
    let project: Doc<"opportunities"> | null = null;
    if (a.opportunityId) {
      project = await ctx.db.get(a.opportunityId);
      if (project === null || project.businessId !== a.businessId || project.clientId !== a.clientId) throw new ConvexError("That project does not belong to this client.");
      // A request is quoted only after its on-site consultation is booked (user, 2026-11-25, D-129).
      if (project.pipeline === "Sales" && (project.stage === "New Request" || project.stage === "Schedule Onsite Consultation")) {
        throw new ConvexError("Book the on-site consultation for this request before making a quote.");
      }
    }
    const title = a.title.trim();
    if (title.length > 200) throw new ConvexError("A title can be at most 200 characters.");
    const now = a.now ?? Date.now();
    // A quote made on its own gets a project under that client (client request, 2026-11-24), so it has a card on the Sales board and a place for its history.
    let opportunityId = a.opportunityId;
    if (!project) {
      const code = await newShortCode(ctx);
      const stage = "Quote Draft & Site Plan / Design";
      const name = title || "Quote";
      opportunityId = await ctx.db.insert("opportunities", {
        businessId: a.businessId, clientId: client._id, code, title: name, pipeline: "Sales", stage, requestedAt: now, stageEnteredAt: now, owner: "Unassigned",
        searchText: opportunitySearchText(client, { title: name, code, stage }),
      });
      await ctx.db.insert("stageHistory", { opportunityId, businessId: a.businessId, from: "Created by hand", to: stage, byName: staff.name, byUserId: staff.userId, at: now, note: "Project created with a new quote" });
    }
    const defaults = await ctx.db.query("quoteDefaults").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    const number = await nextNumber(ctx, a.businessId);
    const doc = {
      businessId: a.businessId, clientId: a.clientId, opportunityId, number, title, status: "Draft" as const, salesperson: staff.name, createdAt: now,
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
  imagePath: v.optional(v.string()),
  visitPhotoIds: v.optional(v.array(v.id("_storage"))),
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
    await requireModule(ctx, quote.businessId, "quotes", "edit");
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
        position, name: l.name.trim(), description: l.kind === "text" ? "" : l.description, imageId: l.imageId, imagePath: l.imageId || l.imagePath === undefined || !isProductPhotoPath(l.imagePath) ? undefined : l.imagePath, quantity: l.kind === "text" ? 1 : l.quantity,
        visitPhotoIds: l.kind === "text" || !l.visitPhotoIds?.length ? undefined : l.visitPhotoIds.slice(0, 12),
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
    await requireModule(ctx, a.businessId, "quotes", "edit");
    return ctx.storage.generateUploadUrl();
  },
});

export const addAttachment = mutation({
  args: { quoteId: v.id("quotes"), storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.quoteId);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    await requireModule(ctx, quote.businessId, "quotes", "edit");
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
    if (quote) await requireModule(ctx, quote.businessId, "quotes", "edit");
    await ctx.db.delete(a.id);
    await ctx.storage.delete(att.storageId);
  },
});

/** Changes the words of a note on a quote (the pencil on a note, as in Jobber). The file on it stays. */
export const editNote = mutation({
  args: { noteId: v.id("quoteNotes"), text: v.string() },
  handler: async (ctx, a) => {
    const note = await ctx.db.get(a.noteId);
    if (note === null) throw new ConvexError("That note no longer exists.");
    const quote = await ctx.db.get(note.quoteId);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    await requireModule(ctx, quote.businessId, "quotes", "edit");
    const text = a.text.trim();
    if (!text && !note.attachmentId && !note.attachments?.length) throw new ConvexError("Write something first.");
    if (text.length > 5000) throw new ConvexError("Notes can be up to 5,000 characters.");
    await ctx.db.patch(note._id, { text });
  },
});

/** Ticks or unticks a checkbox line in a saved quote note. */
export const toggleNoteLine = mutation({
  args: { noteId: v.id("quoteNotes"), line: v.number() },
  handler: async (ctx, a) => {
    const note = await ctx.db.get(a.noteId);
    if (note === null) throw new ConvexError("That note no longer exists.");
    const quote = await ctx.db.get(note.quoteId);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    await requireModule(ctx, quote.businessId, "quotes", "edit");
    const next = toggleCheckbox(note.text, a.line);
    if (next === null) throw new ConvexError("That line is not a checkbox.");
    await ctx.db.patch(note._id, { text: next });
  },
});

export const addNote = mutation({
  args: { quoteId: v.id("quotes"), text: v.string(), attachmentId: v.optional(v.id("_storage")), attachmentName: v.optional(v.string()), files: noteFilesArg },
  handler: async (ctx, a) => {
    const quote = await ctx.db.get(a.quoteId);
    if (quote === null) throw new ConvexError("That quote no longer exists.");
    const staff = await requireModule(ctx, quote.businessId, "quotes", "edit");
    const text = a.text.trim();
    if (text.length > 5000) throw new ConvexError("Notes can be up to 5,000 characters.");
    const attachments = await checkNoteFiles(ctx, a.files);
    if (!text && !a.attachmentId && attachments.length === 0) throw new ConvexError("Write something first.");
    if (a.attachmentId) await checkFile(ctx, a.attachmentId, "A note's file");
    const now = Date.now();
    await ctx.db.insert("quoteNotes", { quoteId: quote._id, text, author: staff.name, createdAt: now, attachmentId: a.attachmentId, attachmentName: a.attachmentName, ...(attachments.length ? { attachments } : {}) });
    await notifyMentions(ctx, { businessId: quote.businessId, staff, text, target: { kind: "quote", quoteId: quote._id }, now });
  },
});

/** The quote, for someone who may make quotes in its business, with everything a copy takes along. */
async function copySource(ctx: QueryCtx, id: Id<"quotes">) {
  const quote = await ctx.db.get(id);
  if (quote === null) throw new ConvexError("That quote no longer exists.");
  const staff = await requireModule(ctx, quote.businessId, "quotes", "edit");
  const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", id)).take(500);
  const attachments = await ctx.db.query("quoteAttachments").withIndex("by_quoteId", (q) => q.eq("quoteId", id)).take(200);
  const notes = await ctx.db.query("quoteNotes").withIndex("by_quoteId", (q) => q.eq("quoteId", id)).take(500);
  return { quote, staff, lines, attachments, notes };
}

/** The stored files a copy needs its own of: pictures, attachments and the files on notes. The signature and the proof of a deposit belong to
 *  the original only, and the site visit's photos on a line belong to the project, so the copy points at the same ones. */
export const filesToCopy = internalQuery({
  args: { id: v.id("quotes") },
  handler: async (ctx, a) => {
    const { quote, lines, attachments, notes } = await copySource(ctx, a.id);
    const ids = [
      quote.introImageId, ...lines.map((l) => l.imageId), ...attachments.map((x) => x.storageId),
      ...notes.flatMap((n) => [n.attachmentId, ...(n.attachments ?? []).map((x) => x.storageId)]),
    ];
    return [...new Set(ids.filter((x): x is Id<"_storage"> => x !== undefined))];
  },
});

/** A new Draft like this quote, with its lines, pictures, attachments and notes (D-134). Each quote keeps files of its own, so deleting one
 *  never takes a picture from the other: they are copied here first (only an action may read and write stored files), then the rows made. */
export const duplicate = action({
  args: { id: v.id("quotes") },
  handler: async (ctx, a): Promise<Id<"quotes">> => {
    const files: Id<"_storage">[] = await ctx.runQuery(internal.crm.quoteDraft.filesToCopy, a);
    const copies: { from: Id<"_storage">; to: Id<"_storage"> }[] = [];
    try {
      for (const from of files) {
        const blob = await ctx.storage.get(from);
        if (blob) copies.push({ from, to: await ctx.storage.store(blob) });
      }
      const id: Id<"quotes"> = await ctx.runMutation(internal.crm.quoteDraft.insertCopy, { id: a.id, copies });
      return id;
    } catch (e) {
      for (const c of copies) await ctx.storage.delete(c.to);
      throw e;
    }
  },
});

export const insertCopy = internalMutation({
  args: { id: v.id("quotes"), copies: v.array(v.object({ from: v.id("_storage"), to: v.id("_storage") })) },
  handler: async (ctx, a) => {
    const { quote, staff, lines, attachments, notes } = await copySource(ctx, a.id);
    const copied = new Map(a.copies.map((c) => [c.from, c.to]));
    /** The copy's own file; none if the original's was already gone. */
    const own = (file: Id<"_storage"> | undefined) => (file ? copied.get(file) : undefined);
    const number = await nextNumber(ctx, quote.businessId);
    const now = Date.now();
    const id = await ctx.db.insert("quotes", {
      businessId: quote.businessId, clientId: quote.clientId, opportunityId: quote.opportunityId, number, title: quote.title, status: "Draft", salesperson: staff.name, createdAt: now,
      introHeading: quote.introHeading, introText: quote.introText, introImageId: own(quote.introImageId), clientMessage: quote.clientMessage, contract: quote.contract, disclaimers: quote.disclaimers, depositPercent: quote.depositPercent,
      totalCents: quote.totalCents, discountKind: quote.discountKind, discountValue: quote.discountValue, taxPercent: quote.taxPercent, depositKind: quote.depositKind,
      depositValue: quote.depositValue, clientView: quote.clientView, searchText: quote.searchText.replace(String(quote.number), String(number)),
    });
    for (const l of lines) {
      const { _id, _creationTime, quoteId, imageId, ...rest } = l;
      void _id; void _creationTime; void quoteId;
      await ctx.db.insert("quoteLineItems", { ...rest, quoteId: id, imageId: own(imageId) });
    }
    for (const x of attachments) {
      const storageId = own(x.storageId);
      if (storageId) await ctx.db.insert("quoteAttachments", { quoteId: id, storageId, name: x.name, contentType: x.contentType, size: x.size, createdAt: x.createdAt });
    }
    // Notes keep who wrote them and when. Nobody is alerted again for a name mentioned in one.
    for (const n of notes) {
      const files = (n.attachments ?? []).flatMap((x) => { const storageId = own(x.storageId); return storageId ? [{ ...x, storageId }] : []; });
      const attachmentId = own(n.attachmentId);
      await ctx.db.insert("quoteNotes", { quoteId: id, text: n.text, author: n.author, createdAt: n.createdAt, ...(attachmentId ? { attachmentId, attachmentName: n.attachmentName } : {}), ...(files.length ? { attachments: files } : {}) });
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
    const staff = await requireModule(ctx, quote.businessId, "quotes", "edit");
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
