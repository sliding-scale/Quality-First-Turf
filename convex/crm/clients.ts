import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { canSee, requireBusiness, requireEditor, requireStaff } from "./lib/access";
import { clientInputFields, clientSearchText, normalizeClientInput, opportunitySearchText } from "./lib/clientInput";
import { DAY_MS, matchesClientStatusFilter, type ClientStatusFilter } from "./lib/stages";

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
  sortKey,
  dir: direction,
};

type FilterArgs = {
  businessId: Id<"businesses">;
  status: ClientStatusFilter;
  type: "All" | "homeowner" | "contractor";
  search: string;
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
  const rows = docs.filter((c) => matchesClientStatusFilter(c.status, a.status) && (a.type === "All" || c.type === a.type));
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
    return {
      newLeads: recent.filter((c) => c.status === "lead").length,
      newLeadsBefore: earlier.filter((c) => c.status === "lead").length,
      newClients: recent.length,
      newClientsBefore: earlier.length,
      total: live.length,
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
    await ctx.db.patch(id, { businessId, ...fields, lastActivityAt: Date.now(), searchText: clientSearchText(fields) });

    // Projects follow their client's business (D-031), and their search copy of the client's details is rebuilt.
    const projects = await ctx.db.query("opportunities").withIndex("by_clientId", (q) => q.eq("clientId", id)).take(200);
    for (const p of projects) {
      await ctx.db.patch(p._id, { businessId, searchText: opportunitySearchText(fields, p) });
    }
    return id;
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
