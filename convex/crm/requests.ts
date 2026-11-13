import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { newShortCode } from "../projects/shortCode";
import { requireBusiness, requireEditor } from "./lib/access";
import { checkAssignee } from "./lib/assignees";
import { checkNoteFiles, noteFilesArg } from "./lib/noteFiles";
import { opportunitySearchText } from "./lib/clientInput";
import { DAY_MS, REQUEST_STATUSES, SALES_STAGES, requestStatus, type RequestStatus } from "./lib/stages";
import { notifyMentions } from "./lib/mentionNotify";

/* Requests (D-039): not a table. A request is a Sales-pipeline project (`opportunities`) seen through its stage, and its
   status is worked out from the stage and age here. Same bounded-read approach as clients.ts. */

const MAX_REQUESTS = 2000;

const statusFilter = v.union(
  v.literal("All"),
  v.literal("New"),
  v.literal("Overdue"),
  v.literal("Consultation"),
  v.literal("Converted"),
  v.literal("Lost"),
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
  status: "All" | RequestStatus;
  from: number | null;
  to: number | null;
  search: string;
  sortKey: "client" | "title" | "requestedAt" | "status";
  dir: "asc" | "desc";
  today: number;
};

async function loadSales(ctx: QueryCtx, a: Pick<FilterArgs, "businessId" | "from" | "to" | "search">): Promise<Doc<"opportunities">[]> {
  const text = a.search.trim();
  if (text) {
    const found = await ctx.db
      .query("opportunities")
      .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", a.businessId).eq("pipeline", "Sales"))
      .take(MAX_REQUESTS);
    return found.filter((o) => o.archivedAt === undefined && (a.from === null || o.requestedAt >= a.from) && (a.to === null || o.requestedAt <= a.to));
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
    .filter((q) => q.and(q.eq(q.field("pipeline"), "Sales"), q.eq(q.field("archivedAt"), undefined)))
    .order("desc")
    .take(MAX_REQUESTS);
}

type RequestRow = {
  id: Id<"opportunities">;
  clientId: Id<"clients">;
  code: string;
  title: string;
  stage: string;
  status: RequestStatus;
  requestedAt: number;
  property: string;
  salespersonId: Id<"users"> | undefined;
  salespersonName: string;
  client: { name: string; contactName: string; company: string; phone: string; email: string };
};

async function matching(ctx: QueryCtx, a: FilterArgs) {
  const docs = await loadSales(ctx, a);
  const rows: RequestRow[] = [];
  const people = new Map((await ctx.db.query("users").take(500)).map((u) => [u._id, u.name]));
  for (const o of docs) {
    const status = requestStatus(o.stage, o.requestedAt, a.today);
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
    await requireBusiness(ctx, args.businessId);
    const { rows, capped } = await matching(ctx, args);
    const size = Math.min(Math.max(Math.floor(args.size), 1), 100);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(Math.max(Math.floor(args.page), 1), pages);
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, capped };
  },
});

/** One request, for its own page (laid out like Jobber's request page). null when it does not exist, is not in the Sales pipeline, or the caller has no access. */
export const get = query({
  args: { id: v.id("opportunities"), today: v.number() },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || o.pipeline !== "Sales") return null;
    await requireBusiness(ctx, o.businessId);
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
      status: requestStatus(o.stage, o.requestedAt, args.today),
      requestedAt: o.requestedAt,
      leadSource: o.leadSource ?? "",
      details: o.details ?? "",
      archivedAt: o.archivedAt ?? null,
      archivedReason: o.archivedReason ?? "",
      salespersonId: o.salespersonId,
      salespersonName: person ? person.name : "Unassigned",
      assessmentAt: shownAt ?? null,
      /** The booked on-site assessment (a consultation on the Schedule), with the instructions kept in its notes. */
      assessment: shown
        ? { id: shown._id, start: shown.start, end: shown.end, anytime: shown.anytime, assigneeIds: shown.assigneeIds, status: shown.status, instructions: shown.notes }
        : null,
      lines: o.lines ?? [],
      client: { name: client.name, street1: client.street1, city: client.city, state: client.state, zip: client.zip, phone: client.phone, email: client.email },
    };
  },
});

export const exportRows = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    return (await matching(ctx, args)).rows;
  },
});

/** The Overview card and the two stat cards. Counts cover all of the business's requests, whatever the list is filtered to. */
export const stats = query({
  args: { businessId: v.id("businesses"), today: v.number() },
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
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

const linesArg = v.array(v.object({ name: v.string(), description: v.string(), quantity: v.number(), unitPriceCents: v.number() }));

const MAX_LINES = 50;

/** Trims and checks the Product / Service lines. A line with no name and no price is a blank row and is dropped. */
function cleanLines(lines: { name: string; description: string; quantity: number; unitPriceCents: number }[]) {
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
  args: { id: v.id("opportunities"), title: v.optional(v.string()), details: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || o.pipeline !== "Sales") throw new ConvexError("That request no longer exists.");
    await requireEditor(ctx, o.businessId);
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
    await ctx.db.patch(o._id, patch);
  },
});

/** Replaces the request's Product / Service lines. */
export const setLines = mutation({
  args: { id: v.id("opportunities"), lines: linesArg },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.id);
    if (o === null || o.pipeline !== "Sales") throw new ConvexError("That request no longer exists.");
    await requireEditor(ctx, o.businessId);
    await ctx.db.patch(o._id, { lines: cleanLines(args.lines) });
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
    const staff = await requireEditor(ctx, args.businessId);
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
