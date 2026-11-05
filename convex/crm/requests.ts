import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireBusiness } from "./lib/access";
import { DAY_MS, REQUEST_STATUSES, requestStatus, type RequestStatus } from "./lib/stages";

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
    return found.filter((o) => (a.from === null || o.requestedAt >= a.from) && (a.to === null || o.requestedAt <= a.to));
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
    .filter((q) => q.eq(q.field("pipeline"), "Sales"))
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
  client: { name: string; contactName: string; company: string; phone: string; email: string };
};

async function matching(ctx: QueryCtx, a: FilterArgs) {
  const docs = await loadSales(ctx, a);
  const rows: RequestRow[] = [];
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
