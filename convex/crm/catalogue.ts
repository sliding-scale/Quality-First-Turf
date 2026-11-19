import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "../_generated/server";
import { requireModule } from "./lib/access";
import { itemProblem, markupFromPrice, nameKeyOf, type CatalogueInput } from "./lib/catalogue";
import { allows } from "./lib/permissions";

/** Products and services (design 2026-11-19-jobs): Jobber's Settings > Products & Services. Each business has its own list. Reading needs the
 *  "Disclaimers and invoice settings" module at View (Sales, Office, Admin), changing it needs Edit, deleting needs Edit and delete. Costs and
 *  markups are shown only to someone who can see prices (the "Show pricing" module). */

const PAGE_SIZES = [25, 50, 100] as const;
/** The most items one business's list reads at once. A business with more than this would need paging in the index; Jobber's own account has 617. */
const LIST_CAP = 5000;

const kindV = v.union(v.literal("service"), v.literal("product"));
const inputV = {
  name: v.string(),
  description: v.string(),
  kind: kindV,
  costCents: v.optional(v.number()),
  markupPercent: v.optional(v.number()),
  unitPriceCents: v.number(),
  taxExempt: v.boolean(),
  available: v.boolean(),
  durationMinutes: v.optional(v.number()),
  customersSelectQuantity: v.boolean(),
};

const searchTextOf = (name: string, description: string) => `${name} ${description}`.slice(0, 2000);

/** Jobber's "Product & Services costs" switch for a business. On unless someone turned it off. */
async function costsOn(ctx: QueryCtx, businessId: Id<"businesses">): Promise<boolean> {
  const s = await ctx.db.query("catalogueSettings").withIndex("by_business", (q) => q.eq("businessId", businessId)).unique();
  return s?.costsOn ?? true;
}
/** Costs and markups are used and shown only when the business has them on and the person may see prices. */
async function costsShownTo(ctx: QueryCtx, levels: { prices: Parameters<typeof allows>[0] }, businessId: Id<"businesses">): Promise<boolean> {
  return allows(levels.prices, "view") && (await costsOn(ctx, businessId));
}

async function itemsOf(ctx: QueryCtx, businessId: Id<"businesses">) {
  return ctx.db.query("catalogueItems").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", businessId)).take(LIST_CAP);
}

export const list = query({
  args: {
    businessId: v.id("businesses"), search: v.string(), page: v.number(),
    /** Jobber sorts by Name or Type, and shows 25, 50 or 100 to a page. Absent: Name, ascending, 25. */
    sortKey: v.optional(v.union(v.literal("name"), v.literal("type"))), dir: v.optional(v.union(v.literal("asc"), v.literal("desc"))), size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "templates", "view");
    const term = args.search.trim();
    const docs = term
      ? await ctx.db.query("catalogueItems").withSearchIndex("search_text", (q) => q.search("searchText", term).eq("businessId", args.businessId)).take(200)
      : await itemsOf(ctx, args.businessId);
    const size = (PAGE_SIZES as readonly number[]).includes(args.size ?? 25) ? (args.size ?? 25) : 25;
    // The list is read in name order; a search comes back by relevance, so both are sorted here. Type sorts by type, then name.
    const sign = args.dir === "desc" ? -1 : 1;
    const byName = (a: Doc<"catalogueItems">, b: Doc<"catalogueItems">) => (a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : 0);
    const sorted = [...docs].sort((a, b) => sign * (args.sortKey === "type" ? a.kind.localeCompare(b.kind) || byName(a, b) : byName(a, b)));
    const page = Math.max(1, Math.floor(args.page));
    const rows = sorted.slice((page - 1) * size, page * size).map((d) => ({
      id: d._id, name: d.name, kind: d.kind, description: d.description.slice(0, 240), unitPriceCents: d.unitPriceCents, available: d.available,
    }));
    return { rows, total: docs.length, pageSize: size };
  },
});

/** The "Product & Services costs" switch. */
export const settings = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "templates", "view");
    return { costsOn: await costsOn(ctx, args.businessId) };
  },
});

export const setCostsOn = mutation({
  args: { businessId: v.id("businesses"), on: v.boolean() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "templates", "edit");
    const s = await ctx.db.query("catalogueSettings").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).unique();
    if (s) await ctx.db.patch(s._id, { costsOn: args.on });
    else await ctx.db.insert("catalogueSettings", { businessId: args.businessId, costsOn: args.on });
  },
});

/** One item, with everything the edit dialog shows. */
export const get = query({
  args: { id: v.id("catalogueItems") },
  handler: async (ctx, args) => {
    const d = await ctx.db.get(args.id);
    if (d === null) return null;
    const staff = await requireModule(ctx, d.businessId, "templates", "view");
    const costs = await costsShownTo(ctx, staff.levels, d.businessId);
    return {
      id: d._id, businessId: d.businessId, kind: d.kind, name: d.name, description: d.description, unitPriceCents: d.unitPriceCents, taxExempt: d.taxExempt,
      available: d.available, durationMinutes: d.durationMinutes ?? null, customersSelectQuantity: d.customersSelectQuantity, source: d.source,
      costCents: costs ? d.costCents ?? null : null, markupPercent: costs ? d.markupPercent ?? null : null, canSeeCosts: costs,
      imageUrl: d.imageId ? await ctx.storage.getUrl(d.imageId) : null,
    };
  },
});

/** Everything, for the CSV export. */
export const all = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "templates", "view");
    const costs = await costsShownTo(ctx, staff.levels, args.businessId);
    return (await itemsOf(ctx, args.businessId)).map((d) => ({
      name: d.name, description: d.description, kind: d.kind, unitPriceCents: d.unitPriceCents, taxExempt: d.taxExempt, available: d.available,
      customersSelectQuantity: d.customersSelectQuantity, ...(d.durationMinutes !== undefined ? { durationMinutes: d.durationMinutes } : {}),
      ...(costs && d.costCents !== undefined ? { costCents: d.costCents } : {}), ...(costs && d.markupPercent !== undefined ? { markupPercent: d.markupPercent } : {}),
    }));
  },
});

async function nameTaken(ctx: QueryCtx, businessId: Id<"businesses">, nameKey: string, exceptId?: Id<"catalogueItems">) {
  const same = await ctx.db.query("catalogueItems").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", businessId).eq("nameKey", nameKey)).first();
  return same !== null && same._id !== exceptId;
}

/** Jobber keeps cost, markup and price together: given a cost and a markup but a price that does not match, the price you typed wins and the
 *  markup is worked out from it. A cost with no markup gets its markup from the price. */
function settled(i: CatalogueInput): { costCents?: number; markupPercent?: number } {
  if (i.costCents === undefined) return {};
  const markup = markupFromPrice(i.costCents, i.unitPriceCents);
  return markup === undefined ? { costCents: i.costCents } : { costCents: i.costCents, markupPercent: markup };
}

export const save = mutation({
  args: { ...inputV, id: v.optional(v.id("catalogueItems")), businessId: v.id("businesses"), imageId: v.optional(v.union(v.id("_storage"), v.null())) },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "templates", "edit");
    const existing = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && (existing === null || existing.businessId !== args.businessId)) throw new ConvexError("That item no longer exists.");
    const costs = await costsShownTo(ctx, staff.levels, args.businessId);
    const input: CatalogueInput = {
      name: args.name.trim().replace(/\s+/g, " "), description: args.description.trim(), kind: args.kind, unitPriceCents: args.unitPriceCents, taxExempt: args.taxExempt,
      available: args.available, customersSelectQuantity: args.customersSelectQuantity,
      ...(args.durationMinutes !== undefined ? { durationMinutes: args.durationMinutes } : {}),
      // A person who cannot see costs cannot change them: the cost already on the item stays.
      ...(costs ? (args.costCents !== undefined ? { costCents: args.costCents } : {}) : existing?.costCents !== undefined ? { costCents: existing.costCents } : {}),
    };
    const why = itemProblem(input);
    if (why) throw new ConvexError(why);
    const nameKey = nameKeyOf(input.name);
    if (await nameTaken(ctx, args.businessId, nameKey, args.id)) throw new ConvexError("An item with that name already exists.");
    const money = settled(input);
    const fields = {
      kind: input.kind, name: input.name, nameKey, description: input.description, unitPriceCents: input.unitPriceCents, taxExempt: input.taxExempt, available: input.available,
      customersSelectQuantity: input.customersSelectQuantity, searchText: searchTextOf(input.name, input.description), updatedAt: Date.now(),
      costCents: money.costCents, markupPercent: money.markupPercent, durationMinutes: input.durationMinutes,
      ...(args.imageId === null ? { imageId: undefined } : args.imageId ? { imageId: args.imageId } : {}),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("catalogueItems", { businessId: args.businessId, source: "manual", createdAt: Date.now(), ...fields });
  },
});

export const remove = mutation({
  args: { id: v.id("catalogueItems") },
  handler: async (ctx, args) => {
    const d = await ctx.db.get(args.id);
    if (d === null) return;
    await requireModule(ctx, d.businessId, "templates", "full");
    await ctx.db.delete(args.id);
  },
});

export const uploadUrl = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "templates", "edit");
    return ctx.storage.generateUploadUrl();
  },
});

const rowV = v.object({ ...inputV, line: v.number() });
const MAX_ROWS = 100;

/** Imports one batch of rows from a file the screen has already read (design: a dry run first, per-row errors, nothing dropped silently, CRM
 *  rule 6). An item whose name is already in the list is updated when `update` is on, and otherwise reported as skipped. The screen sends the
 *  file in batches of up to 100 rows. With `dryRun` nothing is written. */
export const importRows = mutation({
  args: { businessId: v.id("businesses"), rows: v.array(rowV), dryRun: v.boolean(), update: v.boolean() },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "templates", "edit");
    if (args.rows.length > MAX_ROWS) throw new ConvexError(`Send up to ${MAX_ROWS} rows at a time.`);
    const costs = await costsShownTo(ctx, staff.levels, args.businessId);
    let created = 0;
    let updated = 0;
    const skipped: { line: number; name: string; message: string }[] = [];
    const errors: { line: number; name: string; message: string }[] = [];
    const seen = new Set<string>();
    for (const row of args.rows) {
      const { line, ...rest } = row;
      const input: CatalogueInput = { ...rest, name: rest.name.trim().replace(/\s+/g, " "), description: rest.description.trim(), ...(costs ? {} : { costCents: undefined, markupPercent: undefined }) };
      const why = itemProblem(input);
      if (why) { errors.push({ line, name: input.name, message: why }); continue; }
      const nameKey = nameKeyOf(input.name);
      if (seen.has(nameKey)) { errors.push({ line, name: input.name, message: "The same name appears twice in this file." }); continue; }
      seen.add(nameKey);
      const same = await ctx.db.query("catalogueItems").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", args.businessId).eq("nameKey", nameKey)).first();
      if (same && !args.update) { skipped.push({ line, name: input.name, message: "Already in the list." }); continue; }
      const money = settled(input);
      const fields = {
        kind: input.kind, name: input.name, nameKey, description: input.description, unitPriceCents: input.unitPriceCents, taxExempt: input.taxExempt, available: input.available,
        customersSelectQuantity: input.customersSelectQuantity, searchText: searchTextOf(input.name, input.description), updatedAt: Date.now(),
        costCents: costs ? money.costCents : same?.costCents, markupPercent: costs ? money.markupPercent : same?.markupPercent, durationMinutes: input.durationMinutes,
      };
      if (same) {
        updated += 1;
        if (!args.dryRun) await ctx.db.patch(same._id, fields);
      } else {
        created += 1;
        if (!args.dryRun) await ctx.db.insert("catalogueItems", { businessId: args.businessId, source: "csv", createdAt: Date.now(), ...fields });
      }
    }
    return { created, updated, skipped, errors };
  },
});

export type CatalogueDoc = Doc<"catalogueItems">;

/** Used by the quote builder's price list (crm/quotePrices.ts): the business's available items matching every word, or null when the business
 *  has no list of its own yet (the shared price list is used then). */
export async function searchOwn(ctx: QueryCtx, businessId: Id<"businesses">, text: string, limit: number): Promise<CatalogueDoc[] | null> {
  const any = await ctx.db.query("catalogueItems").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", businessId)).first();
  if (any === null) return null;
  const term = text.trim();
  if (!term) return ctx.db.query("catalogueItems").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", businessId)).filter((q) => q.eq(q.field("available"), true)).take(limit);
  return ctx.db.query("catalogueItems").withSearchIndex("search_text", (q) => q.search("searchText", term).eq("businessId", businessId).eq("available", true)).take(limit);
}

/* ---- One-off setup, run from the command line (never from a screen) ---- */

/** A storage upload address, for putting the pictures that came with Jobber's list into storage by hand: `npx convex run crm/catalogue:setupUploadUrl`. */
export const setupUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/** Gives a stored picture to the items whose names start with any of the given prefixes (for example "10.01 RP"). Returns how many it changed. */
export const setupAttachImage = internalMutation({
  args: { businessId: v.id("businesses"), imageId: v.id("_storage"), namePrefixes: v.array(v.string()) },
  handler: async (ctx, args) => {
    const prefixes = args.namePrefixes.map((p) => nameKeyOf(p));
    let changed = 0;
    for (const d of await itemsOf(ctx, args.businessId)) {
      if (prefixes.some((p) => d.nameKey.startsWith(p))) {
        await ctx.db.patch(d._id, { imageId: args.imageId });
        changed += 1;
      }
    }
    return changed;
  },
});
