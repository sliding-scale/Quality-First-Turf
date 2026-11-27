import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { newShortCode } from "../projects/shortCode";
import { requireModule, requireProject } from "./lib/access";
import { checkAssignee } from "./lib/assignees";
import { checkNoteFiles, noteFilesArg } from "./lib/noteFiles";
import { opportunitySearchText } from "./lib/clientInput";
import { linesFromForm } from "./lib/formLines";
import { DAY_MS, PIPELINE_GROUPS, REQUEST_STATUSES, SALES_STAGES, isRequest, requestStatus, type RequestListStatus, type RequestStatus } from "./lib/stages";
import { logActivity } from "./lib/activity";
import { mirrorRemoved } from "./lib/mirror";
import { deleteVisitSheets } from "./lib/visitSheets";
import { notifyMentions } from "./lib/mentionNotify";

/* Requests (D-039): not a table. A request is a project (`opportunities`) seen through its stage, and its status is worked out from the stage
   and age here. A won project stays in this list after it moves on to Preplanning or Construction, as Converted (D-080). Same bounded-read approach as clients.ts. */

const MAX_REQUESTS = 2000;

const statusFilter = v.union(
  v.literal("All"),
  v.literal("New"),
  v.literal("Overdue"),
  v.literal("Consultation"),
  v.literal("Converted"),
  v.literal("Lost"),
  v.literal("Archived"),
);
const sortKey = v.union(v.literal("client"), v.literal("title"), v.literal("requestedAt"), v.literal("status"));
const direction = v.union(v.literal("asc"), v.literal("desc"));

const filterArgs = {
  businessId: v.id("businesses"),
  status: statusFilter,
  /** Inclusive range of request dates, in ms. null is open-ended. */
  from: v.union(v.number(), v.null()),
  to: v.union(v.number(), v.null()),
  search: v.string(),
  sortKey,
  dir: direction,
  /** The start of the caller's day. Queries must not read the clock, and "Overdue" depends on it. */
  today: v.number(),
};

type FilterArgs = {
  businessId: Id<"businesses">;
  status: "All" | RequestListStatus;
  from: number | null;
  to: number | null;
  search: string;
  sortKey: "client" | "title" | "requestedAt" | "status";
  dir: "asc" | "desc";
  today: number;
};

/** Archived either way: off the boards too (`archivedAt`), or off this list only (`requestArchivedAt`, a quoted or won one). */
const isArchived = (o: Doc<"opportunities">) => o.archivedAt !== undefined || o.requestArchivedAt !== undefined;

/** The business's requests that are live, or (with `archived`) the ones that were archived. */
async function loadSales(ctx: QueryCtx, a: Pick<FilterArgs, "businessId" | "from" | "to" | "search">, archived = false): Promise<Doc<"opportunities">[]> {
  const text = a.search.trim();
  if (text) {
    const found = await ctx.db
      .query("opportunities")
      .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", a.businessId))
      .take(MAX_REQUESTS);
    return found.filter((o) => isRequest(o) && isArchived(o) === archived && (a.from === null || o.requestedAt >= a.from) && (a.to === null || o.requestedAt <= a.to));
  }
  return await ctx.db
    .query("opportunities")
    .withIndex("by_business_and_requestedAt", (q) => {
      const base = q.eq("businessId", a.businessId);
      if (a.from !== null && a.to !== null) return base.gte("requestedAt", a.from).lte("requestedAt", a.to);
      if (a.from !== null) return base.gte("requestedAt", a.from);
      if (a.to !== null) return base.lte("requestedAt", a.to);
      return base;
    })
    .filter((q) => {
      const live = q.and(q.eq(q.field("archivedAt"), undefined), q.eq(q.field("requestArchivedAt"), undefined));
      return q.and(q.or(q.eq(q.field("pipeline"), "Sales"), q.eq(q.field("outcome"), "won")), archived ? q.not(live) : live);
    })
    .order("desc")
    .take(MAX_REQUESTS);
}

type RequestRow = {
  id: Id<"opportunities">;
  clientId: Id<"clients">;
  code: string;
  title: string;
  stage: string;
  status: RequestListStatus;
  requestedAt: number;
  property: string;
  salespersonId: Id<"users"> | undefined;
  salespersonName: string;
  client: { name: string; contactName: string; company: string; phone: string; email: string };
};

async function matching(ctx: QueryCtx, a: FilterArgs) {
  const archived = a.status === "Archived";
  const docs = await loadSales(ctx, a, archived);
  const rows: RequestRow[] = [];
  const people = new Map((await ctx.db.query("users").take(500)).map((u) => [u._id, u.name]));
  for (const o of docs) {
    const status: RequestListStatus = archived ? "Archived" : requestStatus(o.stage, o.requestedAt, a.today);
    if (a.status !== "All" && status !== a.status) continue;
    const client = await ctx.db.get(o.clientId);
    if (client === null) continue;
    rows.push({
      id: o._id,
      clientId: o.clientId,
      code: o.code,
      title: o.title,
      stage: o.stage,
      status,
      requestedAt: o.requestedAt,
      property: client.street1 ? `${client.street1}, ${client.city}, ${client.state} ${client.zip}` : "",
      salespersonId: o.salespersonId,
      salespersonName: o.salespersonId ? (people.get(o.salespersonId) ?? "") : "Unassigned",
      client: { name: client.name, contactName: client.contactName, company: client.company, phone: client.phone, email: client.email },
    });
  }
  // A text search comes back in relevance order; otherwise sort as asked.
  if (!a.search.trim() || a.sortKey !== "requestedAt") {
    const sign = a.dir === "asc" ? 1 : -1;
    const value = (r: RequestRow) =>
      a.sortKey === "client" ? r.client.name.toLowerCase() : a.sortKey === "title" ? r.title.toLowerCase() : a.sortKey === "status" ? r.status : r.requestedAt;
    rows.sort((x, y) => (value(x) < value(y) ? -1 : value(x) > value(y) ? 1 : 0) * sign);
  }
  return { rows, capped: docs.length >= MAX_REQUESTS };
}

/** One page of a business's requests, with the total. */
export const list = query({
  args: { ...filterArgs, page: v.number(), size: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "requests", "view");
    const { rows, capped } = await matching(ctx, args);
    const size = Math.min(Math.max(Math.floor(args.size), 1), 100);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(Math.max(Math.floor(args.page), 1), pages);
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, capped };
  },
});

/** The Overview as Jobber shows a request: "Submitted by the customer" with a labelled answer each. Once someone edits it, their list is what shows.
 *  Until then it is built from the customer form behind the request (name, phone, email, address, services and what was measured), or, for a
 *  request made in the CRM, the one "Service details" answer. */
async function overviewOf(ctx: QueryCtx, o: Doc<"opportunities">, client: Doc<"clients">): Promise<{ source: string; heading: string; fields: { label: string; value: string }[]; edited: boolean }> {
  const business = await ctx.db.get(o.businessId);
  const source = `Details from ${business?.name ?? "the customer"}`;
  const heading = "Submitted by the customer";
  if (o.overviewFields) return { source, heading, fields: o.overviewFields, edited: true };
  const project = o.sourceProjectId ? await ctx.db.get(o.sourceProjectId) : null;
  if (!project) {
    // A request made in the CRM: the same categories, taken from the client and the request.
    const address = [client.street1, client.street2, [client.city, client.state].filter(Boolean).join(", "), client.zip].filter(Boolean).join(", ");
    const services = (o.lines ?? []).map((l) => l.name).join(", ") || o.title;
    return {
      source, heading, edited: false,
      fields: [
        { label: "Name", value: client.name },
        { label: "Phone", value: client.phone },
        { label: "Email", value: client.email },
        { label: "Property address", value: address },
        { label: "Services", value: services },
        { label: "Customer type", value: client.type === "contractor" ? "Contractor" : "Homeowner" },
        { label: "Service details", value: o.details ?? "" },
        { label: "How did you hear about us?", value: o.leadSource ?? "" },
      ],
    };
  }
  const address = [project.street1, project.street2, [project.city, project.state].filter(Boolean).join(", "), project.zip].filter(Boolean).join(", ");
  const fields = [
    { label: "Name", value: `${project.firstName} ${project.lastName}`.trim() },
    { label: "Phone", value: project.phone },
    { label: "Email", value: project.email },
    { label: "Property address", value: address },
    { label: "Services", value: project.services.join(", ") },
    { label: "Customer type", value: client.type === "contractor" ? "Contractor" : "Homeowner" },
  ];
  // The project questions (D-087): what the customer wants to transform, how big, why, when and the budget, then where each service goes.
  const asked = (question: string) => project.answers.filter((x) => x.question === question).map((x) => x.value);
  for (const [label, question] of [["Contact preference", "Contact preference"], ["Project type", "Project type"], ["Project scope", "Project scope"], ["Space size", "Space size"], ["Main goal", "Main goal"], ["Timeline", "Timeline"], ["Investment range", "Investment range"]] as const) {
    const values = asked(question);
    if (values.length) fields.push({ label, value: values.join(", ") });
  }
  const places = new Map<string, string[]>();
  for (const x of project.answers) if (x.question.endsWith(" location")) places.set(x.question.slice(0, -" location".length), [...(places.get(x.question.slice(0, -" location".length)) ?? []), x.value]);
  for (const [service, where] of places) fields.push({ label: `${service === "Demo" ? "Demolition" : service} location`, value: where.join(", ") });
  if (project.products.length) fields.push({ label: "Products", value: project.products.join(", ") });
  if (project.addOns.length) fields.push({ label: "Add-ons", value: project.addOns.join(", ") });
  for (const m of project.measurements.slice(0, 12)) {
    const size = m.unmeasured ? "Not measured" : m.squareFeet !== null ? `${m.squareFeet} sq ft` : m.linearFeet !== null ? `${m.linearFeet} ft` : "";
    fields.push({ label: `${m.service ? `${m.service} · ` : ""}${m.label}`, value: size });
  }
  if (project.notes.trim()) fields.push({ label: "Customer notes", value: project.notes });
  fields.push({ label: "Service details", value: o.details ?? "" });
  fields.push({ label: "How did you hear about us?", value: o.leadSource ?? "" });
  return { source, heading, fields, edited: false };
}

/** One request, for its own page (laid out like Jobber's request page). null when it does not exist, is not a request (a Sales or won project), or the caller has no access. */
export const get = query({
  args: { id: v.id("opportunities"), today: v.number() },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || !isRequest(o)) return null;
    await requireModule(ctx, o.businessId, "requests", "view");
    const client = await ctx.db.get(o.clientId);
    if (client === null) return null;
    const person = o.salespersonId ? await ctx.db.get(o.salespersonId) : null;
    // The assessment is the project's consultation: the next one booked, or else the latest.
    const events = await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(50);
    const mine = events.filter((e) => e.type === "consultation");
    const consults = mine.map((e) => e.start);
    const upcoming = consults.filter((s) => s >= args.today).sort((a, b) => a - b)[0];
    const shownAt = upcoming ?? [...consults].sort((a, b) => b - a)[0];
    const shown = mine.find((e) => e.start === shownAt);
    return {
      id: o._id,
      businessId: o.businessId,
      clientId: o.clientId,
      code: o.code,
      title: o.title,
      stage: o.stage,
      status: (isArchived(o) ? "Archived" : requestStatus(o.stage, o.requestedAt, args.today)) as RequestListStatus,
      requestedAt: o.requestedAt,
      leadSource: o.leadSource ?? "",
      details: o.details ?? "",
      overview: await overviewOf(ctx, o, client),
      archivedAt: o.archivedAt ?? o.requestArchivedAt ?? null,
      archivedReason: o.archivedReason ?? "",
      salespersonId: o.salespersonId,
      salespersonName: person ? person.name : "Unassigned",
      assessmentAt: shownAt ?? null,
      /** The booked on-site assessment (a consultation on the Schedule), with the instructions kept in its notes. */
      assessment: shown
        ? { id: shown._id, start: shown.start, end: shown.end, anytime: shown.anytime, assigneeIds: shown.assigneeIds, status: shown.status, instructions: o.assessmentInstructions ?? shown.notes,
            offline: shown.offline ?? false, confirmEmail: shown.confirmEmail && shown.confirmEmail.start === shown.start ? { status: shown.confirmEmail.status, detail: shown.confirmEmail.detail } : null }
        : null,
      /** The instructions with or without a booked assessment. */
      assessmentInstructions: o.assessmentInstructions ?? shown?.notes ?? "",
      lines: o.lines ?? [],
      client: { name: client.name, street1: client.street1, city: client.city, state: client.state, zip: client.zip, phone: client.phone, email: client.email },
    };
  },
});

export const exportRows = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "requests", "view");
    return (await matching(ctx, args)).rows;
  },
});

/** The Overview card and the two stat cards. Counts cover all of the business's requests, whatever the list is filtered to. */
export const stats = query({
  args: { businessId: v.id("businesses"), today: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "requests", "view");
    const docs = await loadSales(ctx, { businessId: args.businessId, from: null, to: null, search: "" });
    const counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
    const since = args.today - 30 * DAY_MS;
    const before = args.today - 60 * DAY_MS;
    const windows = { now: { total: 0, converted: 0 }, earlier: { total: 0, converted: 0 } };
    for (const o of docs) {
      const status = requestStatus(o.stage, o.requestedAt, args.today);
      counts[status] += 1;
      const w = o.requestedAt >= since ? windows.now : o.requestedAt >= before ? windows.earlier : null;
      if (w) {
        w.total += 1;
        if (status === "Converted") w.converted += 1;
      }
    }
    // A converted request that was only tidied off the list still counts toward the past 30 days.
    for (const o of await loadSales(ctx, { businessId: args.businessId, from: since - 30 * DAY_MS, to: null, search: "" }, true)) {
      if (o.requestArchivedAt === undefined) continue;
      const w = o.requestedAt >= since ? windows.now : o.requestedAt >= before ? windows.earlier : null;
      if (w) { w.total += 1; w.converted += 1; }
    }
    const rate = (w: { total: number; converted: number }) => (w.total ? Math.round((w.converted / w.total) * 100) : 0);
    return {
      counts,
      newRequests: windows.now.total,
      newRequestsBefore: windows.earlier.total,
      conversionRate: rate(windows.now),
      conversionRateBefore: rate(windows.earlier),
    };
  },
});

export const linesArg = v.array(v.object({ name: v.string(), description: v.string(), quantity: v.number(), unitPriceCents: v.number() }));

const MAX_LINES = 50;

/** Trims and checks the Product / Service lines. A line with no name and no price is a blank row and is dropped. */
export function cleanLines(lines: { name: string; description: string; quantity: number; unitPriceCents: number }[]) {
  if (lines.length > MAX_LINES) throw new ConvexError(`A request can have up to ${MAX_LINES} lines.`);
  const out = [];
  for (const l of lines) {
    const name = l.name.trim();
    const description = l.description.trim().slice(0, 2000);
    if (!name && !description && l.unitPriceCents === 0) continue;
    if (!name) throw new ConvexError("Give every line a name.");
    if (name.length > 200) throw new ConvexError("A line name is too long.");
    if (!Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 100000) throw new ConvexError(`Check the quantity on "${name}".`);
    if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0 || l.unitPriceCents > 100_000_000_00) throw new ConvexError(`Check the price on "${name}".`);
    out.push({ name, description, quantity: l.quantity, unitPriceCents: l.unitPriceCents });
  }
  return out;
}

/** Changes a request's title and/or service details (the Overview). Each pencil on the request page sends only its own part. */
export const update = mutation({
  args: {
    id: v.id("opportunities"), title: v.optional(v.string()), details: v.optional(v.string()), assessmentInstructions: v.optional(v.string()),
    /** The whole Overview as labelled answers (the pencil on Overview). */
    overviewFields: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
  },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || !isRequest(o)) throw new ConvexError("That request no longer exists.");
    await requireModule(ctx, o.businessId, "requests", "edit");
    const patch: Partial<Doc<"opportunities">> = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new ConvexError("Give the request a title.");
      if (title.length > 200) throw new ConvexError("The title is too long.");
      const client = await ctx.db.get(o.clientId);
      patch.title = title;
      if (client) patch.searchText = opportunitySearchText(client, { title, code: o.code, stage: o.stage });
    }
    if (args.details !== undefined) {
      const details = args.details.trim();
      if (details.length > 5000) throw new ConvexError("The service details are too long (5,000 characters at most).");
      patch.details = details || undefined;
    }
    if (args.overviewFields !== undefined) {
      if (args.overviewFields.length > 40) throw new ConvexError("The overview can have up to 40 answers.");
      const fields = args.overviewFields.map((f) => ({ label: f.label.trim().slice(0, 100), value: f.value.trim() }));
      if (fields.some((f) => !f.label)) throw new ConvexError("Every answer needs a label.");
      if (fields.some((f) => f.value.length > 5000)) throw new ConvexError("An answer is too long (5,000 characters at most).");
      patch.overviewFields = fields;
      // "Service details" is also kept on the request itself, where the board and the lists read it.
      const sd = fields.find((f) => f.label.toLowerCase() === "service details");
      if (sd) patch.details = sd.value || undefined;
    }
    if (args.assessmentInstructions !== undefined) {
      const text = args.assessmentInstructions.trim();
      if (text.length > 2000) throw new ConvexError("The instructions are too long (2,000 characters at most).");
      patch.assessmentInstructions = text || undefined;
    }
    await ctx.db.patch(o._id, patch);
  },
});

/** Replaces the request's Product / Service lines. */
export const setLines = mutation({
  args: { id: v.id("opportunities"), lines: linesArg },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || !isRequest(o)) throw new ConvexError("That request no longer exists.");
    await requireModule(ctx, o.businessId, "requests", "edit");
    await ctx.db.patch(o._id, { lines: cleanLines(args.lines) });
  },
});

/** Fills an empty Product / Service section from the customer form behind the request (client request, 2026-11-24). Does nothing when the request
 *  already has lines, has no form, or the form gives nothing to plan, so it is safe to call every time the page opens. */
export const fillLinesFromForm = mutation({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || !isRequest(o) || !o.sourceProjectId || (o.lines?.length ?? 0) > 0) return false;
    await requireModule(ctx, o.businessId, "requests", "edit");
    const form = await ctx.db.get(o.sourceProjectId);
    if (form === null) return false;
    const lines = linesFromForm(form);
    if (lines.length === 0) return false;
    await ctx.db.patch(o._id, { lines });
    return true;
  },
});

/** "New Request" (Jobber's form): a new project in the Sales pipeline at the first stage, for an existing client. */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    title: v.string(),
    salespersonId: v.optional(v.id("users")),
    details: v.optional(v.string()),
    lines: v.optional(linesArg),
    note: v.optional(v.string()),
    noteFiles: noteFilesArg,
  },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "requests", "edit");
    const title = args.title.trim();
    if (!title) throw new ConvexError("Give the request a title.");
    if (title.length > 200) throw new ConvexError("The title is too long.");
    const client = await ctx.db.get(args.clientId);
    if (client === null || client.businessId !== args.businessId) throw new ConvexError("Pick a client from this business.");
    await checkAssignee(ctx, args.salespersonId, args.businessId);
    const details = (args.details ?? "").trim().slice(0, 5000);
    const stage = SALES_STAGES[0]; // New Request
    const code = await newShortCode(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("opportunities", {
      businessId: args.businessId,
      clientId: client._id,
      code,
      title,
      pipeline: "Sales",
      stage,
      requestedAt: now,
      stageEnteredAt: now,
      owner: "Unassigned",
      salespersonId: args.salespersonId,
      details: details || undefined,
      ...(args.lines && cleanLines(args.lines).length ? { lines: cleanLines(args.lines) } : {}),
      searchText: opportunitySearchText(client, { title, code, stage }),
    });
    const note = (args.note ?? "").trim().slice(0, 5000);
    const attachments = await checkNoteFiles(ctx, args.noteFiles);
    if (note || attachments.length) await ctx.db.insert("opportunityNotes", { opportunityId: id, text: note, author: staff.name, createdAt: now, ...(attachments.length ? { attachments } : {}) });
    await notifyMentions(ctx, { businessId: args.businessId, staff, text: note, target: { kind: "project", opportunityId: id }, now });
    return id;
  },
});

/** Deletes a request (client, 2026-11-25): only while it is still a request (New Request, Schedule Onsite Consultation, Onsite Consultation)
 *  or was lost, and only when no quote, invoice or payment was made for it, so no money or signed paperwork is ever lost. Its own
 *  tasks, notes, files, schedule items (and their Zoho copies), visit and history go with it. The customer form's own record, if any, is
 *  left alone (the forms' tables are never changed by the CRM). Needs "Edit and delete" on Requests. */
/** The request page's Archive (D-134). Nothing is deleted and no stage changes, so Restore (crm/automations:restoreRequest) brings it back
 *  exactly. A request not yet quoted, or a lost one, leaves the Requests list and the boards. One that has moved on to a quote or job leaves
 *  the Requests list only: its project is live work and stays on its board. */
export const archive = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || !isRequest(o)) throw new ConvexError("That request no longer exists.");
    const staff = await requireProject(ctx, o, "requests", "edit");
    if (isArchived(o)) return null;
    const archivedReason = `Archived by ${staff.name}`;
    const moved = requestStatus(o.stage, o.requestedAt, args.now) === "Converted";
    await ctx.db.patch(o._id, moved ? { requestArchivedAt: args.now, archivedReason } : { archivedAt: args.now, archivedReason, archivedFromStage: o.stage });
    await logActivity(ctx, { businessId: o.businessId, clientId: o.clientId, opportunityId: o._id, title: `Request archived: ${o.title}`, detail: o.code ? `#${o.code}` : "", staff });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null) return;
    const staff = await requireModule(ctx, o.businessId, "requests", "full");
    if (staff.assignedOnly && o.salespersonId !== staff.userId) throw new ConvexError("You can only delete your own requests.");
    const stillRequest = o.pipeline === "Sales" && ((PIPELINE_GROUPS.Requests as readonly string[]).includes(o.stage) || o.stage === "Closed Lost");
    if (!stillRequest) throw new ConvexError("Only a request that has not been quoted, or one that was lost, can be deleted.");
    const byOpp = (table: "quotes" | "invoices" | "payments") => ctx.db.query(table).withIndex("by_opportunityId", (q) => q.eq("opportunityId", o._id)).first();
    if ((await byOpp("quotes")) !== null) throw new ConvexError("This request has a quote. Delete or move the quote first.");
    if ((await byOpp("invoices")) !== null || (await byOpp("payments")) !== null) throw new ConvexError("This request has an invoice or a payment, so it cannot be deleted.");

    for (const e of await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(500)) {
      await mirrorRemoved(ctx, "event", e._id);
      await ctx.db.delete(e._id);
    }
    for (const t of await ctx.db.query("opportunityTasks").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(500)) {
      if (t.startAt !== undefined) await mirrorRemoved(ctx, "task", t._id);
      await ctx.db.delete(t._id);
    }
    for (const n of await ctx.db.query("opportunityNotes").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(500)) await ctx.db.delete(n._id);
    for (const f of await ctx.db.query("opportunityFiles").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(500)) {
      await ctx.storage.delete(f.storageId);
      await ctx.db.delete(f._id);
    }
    for (const h of await ctx.db.query("stageHistory").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(1000)) await ctx.db.delete(h._id);
    for (const r of await ctx.db.query("opportunityVisits").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(10)) await ctx.db.delete(r._id);
    await deleteVisitSheets(ctx, o._id);
    for (const r of await ctx.db.query("automationRuns").withIndex("by_opportunity_and_key", (q) => q.eq("opportunityId", o._id)).take(500)) await ctx.db.delete(r._id);
    for (const r of await ctx.db.query("activities").withIndex("by_opportunityId", (q) => q.eq("opportunityId", o._id)).take(1000)) await ctx.db.delete(r._id);
    await ctx.db.delete(o._id);
    await logActivity(ctx, { businessId: o.businessId, clientId: o.clientId, title: `Request deleted: ${o.title}`, detail: o.code ? `#${o.code}` : "", staff });
  },
});
