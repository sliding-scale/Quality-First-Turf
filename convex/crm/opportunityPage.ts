import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireBusiness, requireEditor } from "./lib/access";
import { AUTOMATIONS } from "./lib/automationRules";
import { lineTotalCents } from "./lib/quoteMath";
import { PIPELINE_GROUPS, SALES_STAGES } from "./lib/stages";

/* The opportunity page (D-077): one page per project, at its own address (/opportunities/<id>), with Overview, Quotes, Visit, Files and
   Activity. Everything here reads what already exists (the project, its quotes, the visit behind it from the customer form, its notes
   and stage history); the only new data is the files kept on the project. */

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const kindV = v.union(v.literal("plan"), v.literal("photo"), v.literal("contract"), v.literal("other"));

async function load(ctx: QueryCtx, id: Id<"opportunities">) {
  const o = await ctx.db.get(id);
  if (o === null) return null;
  await requireBusiness(ctx, o.businessId);
  return o;
}

const quotesOf = (ctx: QueryCtx, id: Id<"opportunities">) => ctx.db.query("quotes").withIndex("by_opportunityId", (q) => q.eq("opportunityId", id)).take(50);

/** The header and Overview: the project, its client, its stage, the assessment, what was asked for and what was confirmed. */
export const overview = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const o = await load(ctx, a.id);
    if (!o) return null;
    const client = await ctx.db.get(o.clientId);
    if (client === null) return null;
    const person = o.salespersonId ? await ctx.db.get(o.salespersonId) : null;
    const quotes = await quotesOf(ctx, o._id);
    // The quote that counts: the latest approved or converted one.
    const confirmed = quotes.filter((q) => q.status === "Approved" || q.status === "Converted").sort((x, y) => (y.approvedAt ?? y.createdAt) - (x.approvedAt ?? x.createdAt))[0];
    const lines = confirmed
      ? (await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", confirmed._id)).take(200))
          .filter((l) => l.kind !== "text" && (!l.optional || l.selected))
          .map((l) => ({ name: l.name, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: lineTotalCents(l) }))
      : [];
    const consults = (await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(50)).filter((e) => e.type === "consultation");
    const assessment = consults.sort((x, y) => y.start - x.start)[0];
    const waiting = quotes.some((q) => q.status === "Awaiting response" || q.status === "Changes requested");
    const contract = confirmed?.signedAt !== undefined ? "signed" : o.signedContractId ? "uploaded" : waiting ? "out" : quotes.length ? "none" : "noquote";
    const group = o.stage === "Closed Won" || o.stage === "Closed Lost" ? "Closed" : (PIPELINE_GROUPS.Quotes as readonly string[]).includes(o.stage) ? "Quotes" : "Requests";
    return {
      id: o._id, businessId: o.businessId, clientId: o.clientId, code: o.code, title: o.title, pipeline: o.pipeline, stage: o.stage, group,
      stages: [...SALES_STAGES] as string[], requestedAt: o.requestedAt, stageEnteredAt: o.stageEnteredAt ?? o.requestedAt, leadSource: o.leadSource ?? "", details: o.details ?? "",
      outcome: o.outcome ?? null, lostReason: o.lostReason ?? "", archivedAt: o.archivedAt ?? null, salespersonId: o.salespersonId ?? null, salespersonName: person?.name ?? "Unassigned",
      client: { name: client.name, street1: client.street1, street2: client.street2, city: client.city, state: client.state, zip: client.zip, phone: client.phone, email: client.email },
      assessment: assessment ? { start: assessment.start, anytime: assessment.anytime, status: assessment.status, instructions: assessment.notes } : null,
      requestedLines: (o.lines ?? []).map((l) => ({ ...l, totalCents: lineTotalCents(l) })),
      confirmed: confirmed ? { quoteId: confirmed._id, number: confirmed.number, status: confirmed.status, lines } : null,
      contract: { state: contract as "signed" | "uploaded" | "out" | "none" | "noquote", signedAt: confirmed?.signedAt ?? o.signedContractAt ?? null },
      deposit:
        confirmed && confirmed.depositKind && (confirmed.depositValue ?? 0) > 0
          ? { required: true, collected: confirmed.depositCollectedAt !== undefined, collectedAt: confirmed.depositCollectedAt ?? null }
          : { required: false, collected: false, collectedAt: null },
    };
  },
});

export const quotes = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const o = await load(ctx, a.id);
    if (!o) return [];
    return (await quotesOf(ctx, o._id))
      .sort((x, y) => y.number - x.number)
      .map((q) => ({ id: q._id, number: q.number, title: q.title, status: q.status, totalCents: q.totalCents, createdAt: q.createdAt, sentAt: q.sentAt ?? null, approvedAt: q.approvedAt ?? null, signedAt: q.signedAt ?? null }));
  },
});

/** The visit behind the project: the customer form's services, measurements and work areas with their photos. Only a project that came from
 *  the customer form has one. */
export const visit = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const o = await load(ctx, a.id);
    if (!o) return null;
    if (!o.sourceProjectId) return { available: false as const, reason: "This project was not made from the customer form, so there is no site visit to show." };
    const project = await ctx.db.get(o.sourceProjectId);
    if (project === null) return { available: false as const, reason: "The customer form behind this project is gone." };
    const areas = await ctx.db.query("workAreas").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(100);
    const workAreas = [];
    for (const w of areas) {
      const photos: { url: string }[] = [];
      for (const pid of w.photoIds.slice(0, 20)) {
        const url = await ctx.storage.getUrl(pid);
        if (url) photos.push({ url });
      }
      workAreas.push({ label: w.label, service: w.service ?? "", installType: w.installType ?? "", length: w.length, width: w.width, quantity: w.quantity, notes: w.notes, photos });
    }
    return {
      available: true as const,
      services: project.services, products: project.products, addOns: project.addOns, notes: project.notes, visitedAt: project.visitedAt ?? null,
      measurements: project.measurements.map((m) => ({ label: m.label, squareFeet: m.squareFeet, linearFeet: m.linearFeet, unmeasured: m.unmeasured, service: m.service ?? "" })),
      workAreas,
    };
  },
});

type FileItem = {
  key: string; source: "uploaded" | "contract" | "quote"; fileId: Id<"opportunityFiles"> | null; name: string; kind: "plan" | "photo" | "contract" | "other";
  contentType: string; size: number; url: string | null; by: string; at: number; from: string;
};

export const files = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const o = await load(ctx, a.id);
    if (!o) return [];
    const out: FileItem[] = [];
    for (const f of await ctx.db.query("opportunityFiles").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).order("desc").take(200)) {
      out.push({ key: f._id, source: "uploaded", fileId: f._id, name: f.name, kind: f.kind, contentType: f.contentType, size: f.size, url: await ctx.storage.getUrl(f.storageId), by: f.uploadedByName, at: f.createdAt, from: "" });
    }
    if (o.signedContractId) {
      out.push({ key: "contract", source: "contract", fileId: null, name: o.signedContractName ?? "Signed contract", kind: "contract", contentType: "", size: 0, url: await ctx.storage.getUrl(o.signedContractId), by: "", at: o.signedContractAt ?? o.requestedAt, from: "Closed Won checklist" });
    }
    for (const q of await quotesOf(ctx, o._id)) {
      for (const f of await ctx.db.query("quoteAttachments").withIndex("by_quoteId", (x) => x.eq("quoteId", q._id)).take(50)) {
        out.push({ key: f._id, source: "quote", fileId: null, name: f.name, kind: f.contentType.startsWith("image/") ? "photo" : "plan", contentType: f.contentType, size: f.size, url: await ctx.storage.getUrl(f.storageId), by: "", at: f.createdAt, from: `Quote #${q.number}` });
      }
    }
    return out.sort((x, y) => y.at - x.at);
  },
});

/** Adds a file to the project. The browser uploads it to storage first (the same upload address notes use); the file is looked at again here. */
export const addFile = mutation({
  args: { id: v.id("opportunities"), storageId: v.id("_storage"), name: v.string(), kind: kindV, now: v.number() },
  handler: async (ctx, a) => {
    const o = await ctx.db.get(a.id);
    if (o === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireEditor(ctx, o.businessId);
    const meta = await ctx.db.system.get("_storage", a.storageId);
    if (meta === null) throw new ConvexError("The file was not uploaded. Try again.");
    const type = (meta.contentType ?? "").toLowerCase();
    if (!(type === "application/pdf" || type.startsWith("image/"))) throw new ConvexError("A project file has to be a PDF or an image.");
    if (meta.size > MAX_FILE_BYTES) throw new ConvexError("A file can be at most 25 MB.");
    const name = a.name.trim().slice(0, 200) || "File";
    return await ctx.db.insert("opportunityFiles", { businessId: o.businessId, opportunityId: o._id, storageId: a.storageId, name, contentType: type, size: meta.size, kind: a.kind, uploadedByName: staff.name, createdAt: a.now });
  },
});

export const removeFile = mutation({
  args: { fileId: v.id("opportunityFiles") },
  handler: async (ctx, a) => {
    const f = await ctx.db.get(a.fileId);
    if (f === null) return null;
    await requireEditor(ctx, f.businessId);
    await ctx.storage.delete(f.storageId);
    await ctx.db.delete(f._id);
    return null;
  },
});

/** One timeline: stage moves, notes, quote events, automations and the creation of the request, newest first. */
export const activity = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const o = await load(ctx, a.id);
    if (!o) return [];
    type Entry = { key: string; at: number; kind: "stage" | "note" | "quote" | "automation" | "created"; title: string; detail: string; who: string };
    const out: Entry[] = [{ key: "created", at: o.requestedAt, kind: "created", title: "Request created", detail: o.sourceProjectId ? "From the customer form" : "", who: "" }];
    for (const h of await ctx.db.query("stageHistory").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(100)) {
      out.push({ key: h._id, at: h.at, kind: "stage", title: `Moved to ${h.to}`, detail: `From ${h.from}${h.note ? `. ${h.note}` : ""}`, who: h.byName });
    }
    for (const n of await ctx.db.query("opportunityNotes").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(100)) {
      out.push({ key: n._id, at: n.createdAt, kind: "note", title: "Note", detail: n.text.length > 240 ? `${n.text.slice(0, 239)}…` : n.text, who: n.author });
    }
    for (const q of await quotesOf(ctx, o._id)) {
      for (const e of await ctx.db.query("quoteEvents").withIndex("by_quoteId", (x) => x.eq("quoteId", q._id)).take(50)) {
        out.push({ key: e._id, at: e.at, kind: "quote", title: `Quote #${q.number}: ${e.kind}`, detail: e.detail, who: e.byName });
      }
    }
    for (const r of await ctx.db.query("automationRuns").withIndex("by_opportunity_and_key", (q) => q.eq("opportunityId", o._id)).take(50)) {
      out.push({ key: r._id, at: r.at, kind: "automation", title: AUTOMATIONS[r.key].title, detail: r.detail, who: "Automation" });
    }
    return out.sort((x, y) => y.at - x.at).slice(0, 150);
  },
});
