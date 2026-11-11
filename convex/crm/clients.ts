import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { canSee, requireBusiness, requireEditor, requireStaff } from "./lib/access";
import { deleteQuote } from "./lib/quoteData";
import { clientInputFields, clientSearchText, normalizeClientInput, opportunitySearchText } from "./lib/clientInput";
import { CLIENT_TAGS, DAY_MS, matchesClientStatusFilter, type ClientStatusFilter } from "./lib/stages";

/* Clients (D-008, D-031): one list per business. Lists are filtered, sorted, counted and cut into a page here, on the
   server, over a bounded read of at most MAX_CLIENTS rows of one business. If a business ever passes that, the list says
   `capped` and this moves to cursor paging plus an aggregate count (guidelines: counts over many rows). */

const MAX_CLIENTS = 5000;

const statusFilter = v.union(
  v.literal("All"),
  v.literal("Leads and Active"),
  v.literal("Leads"),
  v.literal("Active"),
  v.literal("Archived"),
);
const typeFilter = v.union(v.literal("All"), v.literal("homeowner"), v.literal("contractor"));
const sortKey = v.union(v.literal("name"), v.literal("lastActivity"));
const direction = v.union(v.literal("asc"), v.literal("desc"));

const filterArgs = {
  businessId: v.id("businesses"),
  status: statusFilter,
  type: typeFilter,
  search: v.string(),
  /** Only clients with at least one of these tags; empty or left out means every client. */
  tags: v.optional(v.array(v.string())),
  sortKey,
  dir: direction,
};

type FilterArgs = {
  businessId: Id<"businesses">;
  status: ClientStatusFilter;
  type: "All" | "homeowner" | "contractor";
  search: string;
  tags?: string[];
  sortKey: "name" | "lastActivity";
  dir: "asc" | "desc";
};

async function matching(ctx: QueryCtx, a: FilterArgs) {
  const text = a.search.trim();
  // A text search comes back in relevance order, so the sort choice only applies when there is no search.
  const docs: Doc<"clients">[] = text
    ? await ctx.db
        .query("clients")
        .withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", a.businessId))
        .take(MAX_CLIENTS)
    : await ctx.db
        .query("clients")
        .withIndex(a.sortKey === "name" ? "by_business_and_nameKey" : "by_business_and_lastActivityAt", (q) => q.eq("businessId", a.businessId))
        .order(a.dir)
        .take(MAX_CLIENTS);
  // Clients with the same last activity (such as a batch imported on one day) come out by name, not in whatever order they were stored.
  if (!text && a.sortKey === "lastActivity") {
    const sign = a.dir === "asc" ? 1 : -1;
    docs.sort((x, y) => sign * (x.lastActivityAt - y.lastActivityAt) || x.nameKey.localeCompare(y.nameKey));
  }
  const rows = docs.filter((c) => matchesClientStatusFilter(c.status, a.status) && (a.type === "All" || c.type === a.type) && (!a.tags?.length || a.tags.some((t) => c.tags?.includes(t))));
  return { rows, capped: docs.length >= MAX_CLIENTS };
}

/** One page of a business's clients, with the total for the "1–10 of 73" line. */
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

/** Every client the filters match, for the CSV export. */
export const exportRows = query({
  args: filterArgs,
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    return (await matching(ctx, args)).rows;
  },
});

/** The three cards on the Clients page. `today` is the start of the caller's day (queries must not read the clock). */
export const stats = query({
  args: { businessId: v.id("businesses"), today: v.number() },
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    const docs = await ctx.db
      .query("clients")
      .withIndex("by_business_and_lastActivityAt", (q) => q.eq("businessId", args.businessId))
      .take(MAX_CLIENTS);
    // The cards leave out archived clients.
    const live = docs.filter((c) => c.status !== "archived");
    const since = args.today - 30 * DAY_MS;
    const before = args.today - 60 * DAY_MS;
    const recent = live.filter((c) => c.createdAt >= since);
    const earlier = live.filter((c) => c.createdAt >= before && c.createdAt < since);
    // Like Jobber, a new "lead" is a new client nobody has quoted yet (imported clients are all Active, so the status alone cannot tell).
    const quoted = async (c: Doc<"clients">) => (await ctx.db.query("quotes").withIndex("by_clientId", (q) => q.eq("clientId", c._id)).first()) !== null;
    const leads = async (list: Doc<"clients">[]) => (await Promise.all(list.map(async (c) => ((await quoted(c)) ? 0 : 1)))).reduce<number>((n, x) => n + x, 0);
    return {
      newLeads: await leads(recent),
      newLeadsBefore: await leads(earlier),
      newClients: recent.length,
      newClientsBefore: earlier.length,
      total: live.length,
      // "Total new clients, year to date" (Jobber's third card).
      newThisYear: live.filter((c) => c.createdAt >= new Date(new Date(args.today).getFullYear(), 0, 1).getTime()).length,
    };
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx);
    const id = ctx.db.normalizeId("clients", args.id);
    const client = id === null ? null : await ctx.db.get(id);
    // A client in a business the person does not belong to looks the same as one that does not exist.
    return client && canSee(staff, client.businessId) ? client : null;
  },
});

export const create = mutation({
  args: { businessId: v.id("businesses"), ...clientInputFields },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.businessId);
    if ((await ctx.db.get(args.businessId)) === null) throw new ConvexError("That business does not exist.");
    const { businessId, first, last, ...rest } = args;
    const fields = normalizeClientInput({ ...rest, first, last });
    const now = Date.now();
    return await ctx.db.insert("clients", {
      businessId,
      ...fields,
      status: "lead",
      tags: fields.type === "homeowner" ? ["Homeowner"] : fields.company ? ["Company"] : [],
      createdAt: now,
      lastActivityAt: now,
      searchText: clientSearchText(fields),
    });
  },
});

export const update = mutation({
  args: { id: v.id("clients"), businessId: v.id("businesses"), ...clientInputFields },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (existing === null) throw new ConvexError("That client no longer exists.");
    // Changing a client needs the editor role in its business, and moving it needs the same in the business it goes to.
    await requireEditor(ctx, existing.businessId);
    await requireEditor(ctx, args.businessId);
    if ((await ctx.db.get(args.businessId)) === null) throw new ConvexError("That business does not exist.");
    const { id, businessId, first, last, ...rest } = args;
    const fields = normalizeClientInput({ ...rest, first, last });
    // The first phone and email on the client page follow the form's single phone and email; any others are kept as they were.
    const phones = (existing.phones ?? []).slice(fields.phone ? 0 : 1);
    if (fields.phone) phones[0] = { number: fields.phone, description: existing.phones?.[0]?.description ?? "Main" };
    const emails = (existing.emails ?? []).slice(fields.email ? 0 : 1);
    if (fields.email) emails[0] = { address: fields.email, description: existing.emails?.[0]?.description ?? "Main" };
    await ctx.db.patch(id, { businessId, ...fields, ...(existing.phones || fields.phone ? { phones } : {}), ...(existing.emails || fields.email ? { emails } : {}), lastActivityAt: Date.now(), searchText: clientSearchText(fields) });

    // Projects follow their client's business (D-031), and their search copy of the client's details is rebuilt.
    const projects = await ctx.db.query("opportunities").withIndex("by_clientId", (q) => q.eq("clientId", id)).take(200);
    for (const p of projects) {
      await ctx.db.patch(p._id, { businessId, searchText: opportunitySearchText(fields, p) });
    }
    return id;
  },
});

/** Replaces a client's tags (the Edit tags pop-up on the list). Unknown tags are refused. */
export const setTags = mutation({
  args: { id: v.id("clients"), tags: v.array(v.string()) },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (client === null) throw new ConvexError("That client no longer exists.");
    await requireEditor(ctx, client.businessId);
    const known: readonly string[] = CLIENT_TAGS;
    const tags = [...new Set(args.tags)];
    if (tags.some((t) => !known.includes(t))) throw new ConvexError("One of those tags does not exist.");
    await ctx.db.patch(args.id, { tags });
    return tags;
  },
});

/** Archives clients (the list's three-dot menu). They stay in the database and show under the Archived status filter. */
export const archive = mutation({
  args: { ids: v.array(v.id("clients")) },
  handler: async (ctx, args) => {
    if (args.ids.length > 100) throw new ConvexError("Archive up to 100 clients at a time.");
    let archived = 0;
    for (const id of new Set(args.ids)) {
      const client = await ctx.db.get(id);
      if (client === null || client.status === "archived") continue;
      await requireEditor(ctx, client.businessId);
      await ctx.db.patch(id, { status: "archived" });
      archived += 1;
    }
    return archived;
  },
});

/* Deleting clients (D-054). The dialog first asks what would go with them, shows each item as a tick box, and only enables
   Delete once every box is ticked. The server does not rely on that: `remove` deletes exactly what `deletePreview` counted. */

const MAX_DELETE = 100;
const MAX_RELATED = 500;

async function related(ctx: QueryCtx, clientId: Id<"clients">) {
  const projects = await ctx.db.query("opportunities").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(MAX_RELATED + 1);
  const notes = await ctx.db.query("clientNotes").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(MAX_RELATED + 1);
  const quotes = await ctx.db.query("quotes").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(MAX_RELATED + 1);
  const emails = await ctx.db.query("clientMailMessages").withIndex("by_client_and_receivedAt", (q) => q.eq("clientId", clientId)).take(MAX_RELATED + 1);
  return { projects, notes, quotes, emails };
}

/** What deleting these clients would also delete: their projects, quotes and notes. Nothing is changed. */
export const deletePreview = query({
  args: { ids: v.array(v.id("clients")) },
  handler: async (ctx, args) => {
    if (args.ids.length > MAX_DELETE) throw new ConvexError(`Delete up to ${MAX_DELETE} clients at a time.`);
    let projects = 0;
    let notes = 0;
    let quotes = 0;
    let emails = 0;
    const names: string[] = [];
    for (const id of args.ids) {
      const client = await ctx.db.get(id);
      if (client === null) continue;
      await requireEditor(ctx, client.businessId);
      const r = await related(ctx, id);
      projects += r.projects.length;
      notes += r.notes.length;
      quotes += r.quotes.length;
      emails += r.emails.length;
      names.push(client.name);
    }
    return { names, projects, notes, quotes, emails };
  },
});

/** Deletes the clients with their projects and notes. All or nothing: one transaction. */
export const remove = mutation({
  args: { ids: v.array(v.id("clients")) },
  handler: async (ctx, args) => {
    if (args.ids.length > MAX_DELETE) throw new ConvexError(`Delete up to ${MAX_DELETE} clients at a time.`);
    let deleted = 0;
    for (const id of new Set(args.ids)) {
      const client = await ctx.db.get(id);
      if (client === null) continue;
      await requireEditor(ctx, client.businessId);
      const r = await related(ctx, id);
      if (r.projects.length > MAX_RELATED || r.notes.length > MAX_RELATED || r.quotes.length > MAX_RELATED) {
        throw new ConvexError(`${client.name} has too much attached to delete in one go. Archive it instead.`);
      }
      for (const p of r.projects) await ctx.db.delete(p._id);
      for (const n of r.notes) await ctx.db.delete(n._id);
      for (const q of r.quotes) await deleteQuote(ctx, q);
      await ctx.db.delete(id);
      if (r.emails.length > 0) await ctx.scheduler.runAfter(0, internal.crm.clientMail.deleteClientMail, { clientId: id });
      deleted += 1;
    }
    return deleted;
  },
});

export const notes = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (client === null) return [];
    await requireBusiness(ctx, client.businessId);
    return await ctx.db.query("clientNotes").withIndex("by_clientId", (q) => q.eq("clientId", args.clientId)).order("desc").take(100);
  },
});

export const addNote = mutation({
  args: { clientId: v.id("clients"), text: v.string() },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (client === null) throw new ConvexError("That client no longer exists.");
    const staff = await requireEditor(ctx, client.businessId);
    const text = args.text.trim();
    if (!text) throw new ConvexError("Write a note first.");
    if (text.length > 2000) throw new ConvexError("Notes can be up to 2,000 characters.");
    return await ctx.db.insert("clientNotes", { clientId: args.clientId, text, author: staff.name });
  },
});
