import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireProject } from "./lib/access";
import { allows } from "./lib/permissions";
import {
  budgetLineProblem,
  budgetTotalCents,
  DEFAULT_LINK_DAYS,
  expiryFrom,
  linkDaysProblem,
  MAX_BUDGET_LINES,
  shareState,
} from "./lib/workPackage";

/** A project's installer work package (PRD 4.3, plan 2026-11-20-work-packages): scope, schedule, site access, the installer budget, the files that
 *  go with it and a secret expiring link to share it. It is Preplanning work, so it follows the Preplanning module. The budget is priced, so it needs
 *  the Prices module as well. The page behind the link is crm/clientWorkPackage.ts. */

async function projectOf(ctx: QueryCtx, id: Id<"opportunities">, need: "view" | "edit") {
  const p = await ctx.db.get(id);
  if (p === null || p.outcome !== "won") throw new ConvexError("A work package starts once the project is Closed Won.");
  const staff = await requireProject(ctx, p, "pipelinePreplanning", need);
  return { p, staff };
}

const packageOf = (ctx: QueryCtx, id: Id<"opportunities">) => ctx.db.query("workPackages").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).unique();

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function text(value: string, max: number, what: string): string {
  const t = value.trim();
  if (t.length > max) throw new ConvexError(`${what} is too long (${max.toLocaleString("en-US")} characters at most).`);
  return t;
}

export const get = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won") return null;
    const staff = await requireProject(ctx, p, "pipelinePreplanning", "view");
    const costs = allows(staff.levels.prices, "view");
    const w = await packageOf(ctx, p._id);
    const files = await ctx.db.query("opportunityFiles").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(200);
    const crewRows = await Promise.all((p.crewIds ?? []).map((id) => ctx.db.get(id)));
    const installerRows = await Promise.all((p.installerIds ?? []).map((id) => ctx.db.get(id)));
    const take = await ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(500);
    const now = Date.now();
    const budgetLines = costs ? (w?.budgetLines ?? []) : [];
    return {
      saved: w !== null,
      scope: w?.scope ?? "",
      targetStartDate: w?.targetStartDate ?? null,
      startDate: w?.startDate ?? null,
      endDate: w?.endDate ?? null,
      scheduleNotes: w?.scheduleNotes ?? "",
      siteAccess: w?.siteAccess ?? "",
      customerAvailability: w?.customerAvailability ?? "",
      installerNotes: w?.installerNotes ?? "",
      includeMaterials: w?.includeMaterials ?? true,
      fileIds: (w?.fileIds ?? []).filter((id) => files.some((f) => f._id === id)),
      files: files.map((f) => ({ id: f._id, name: f.name, kind: f.kind, contentType: f.contentType })),
      budgetLines,
      budgetTotalCents: budgetTotalCents(budgetLines),
      canSeeBudget: costs,
      crews: crewRows.filter((c): c is Doc<"crews"> => c !== null).map((c) => ({ id: c._id, name: c.name, leadName: c.leadName, phone: c.phone, availability: c.availability ?? "", rateCents: costs ? c.rateCents ?? null : null })),
      installers: installerRows.filter((u): u is Doc<"users"> => u !== null).map((u) => ({ id: u._id, name: u.name })),
      materials: take.map((l) => ({ name: l.name, unit: l.unit, qty: l.qtyOverride ?? l.calcQty ?? 0 })),
      share: w ? { state: shareState(w, now), token: shareState(w, now) === "live" ? w.shareToken ?? null : null, expiresAt: w.shareExpiresAt ?? null } : { state: "none" as const, token: null, expiresAt: null },
      updatedAt: w?.updatedAt ?? null,
      updatedByName: w?.updatedByName ?? null,
      defaultLinkDays: DEFAULT_LINK_DAYS,
    };
  },
});

const day = v.optional(v.number());
const budgetLine = v.object({ description: v.string(), quantity: v.number(), unit: v.string(), rateCents: v.number() });

export const save = mutation({
  args: {
    id: v.id("opportunities"),
    scope: v.string(),
    targetStartDate: day,
    startDate: day,
    endDate: day,
    scheduleNotes: v.string(),
    siteAccess: v.string(),
    customerAvailability: v.string(),
    installerNotes: v.string(),
    includeMaterials: v.boolean(),
    fileIds: v.array(v.id("opportunityFiles")),
    /** Ignored for someone who cannot see prices: the lines on the package stay as they were. */
    budgetLines: v.optional(v.array(budgetLine)),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const { p, staff } = await projectOf(ctx, args.id, "edit");
    for (const d of [args.targetStartDate, args.startDate, args.endDate]) if (d !== undefined && (!Number.isFinite(d) || d < 0)) throw new ConvexError("Check the dates.");
    if (args.startDate !== undefined && args.endDate !== undefined && args.endDate < args.startDate) throw new ConvexError("The end date is before the start date.");
    const fileIds = [...new Set(args.fileIds)];
    if (fileIds.length > 50) throw new ConvexError("A work package can carry up to 50 files.");
    for (const id of fileIds) {
      const f = await ctx.db.get(id);
      if (f === null || f.opportunityId !== p._id) throw new ConvexError("One of the files is not on this project.");
    }
    const existing = await packageOf(ctx, p._id);
    let budgetLines = existing?.budgetLines ?? [];
    if (allows(staff.levels.prices, "view") && args.budgetLines !== undefined) {
      if (args.budgetLines.length > MAX_BUDGET_LINES) throw new ConvexError(`A budget can have up to ${MAX_BUDGET_LINES} lines.`);
      for (const l of args.budgetLines) {
        const why = budgetLineProblem(l);
        if (why) throw new ConvexError(why);
      }
      budgetLines = args.budgetLines.map((l) => ({ description: l.description.trim(), quantity: l.quantity, unit: l.unit.trim(), rateCents: l.rateCents }));
    }
    const row = {
      scope: text(args.scope, 10000, "The scope"),
      targetStartDate: args.targetStartDate,
      startDate: args.startDate,
      endDate: args.endDate,
      scheduleNotes: text(args.scheduleNotes, 3000, "The schedule notes"),
      siteAccess: text(args.siteAccess, 3000, "The site access notes"),
      customerAvailability: text(args.customerAvailability, 3000, "The customer availability"),
      installerNotes: text(args.installerNotes, 5000, "The notes for installers"),
      includeMaterials: args.includeMaterials,
      fileIds,
      budgetLines,
      updatedAt: args.now,
      updatedByName: staff.name,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert("workPackages", { businessId: p.businessId, opportunityId: p._id, ...row });
  },
});

async function mustExist(ctx: MutationCtx, id: Id<"opportunities">, need: "edit") {
  const { p, staff } = await projectOf(ctx, id, need);
  const w = await packageOf(ctx, p._id);
  if (w === null) throw new ConvexError("Save the work package first.");
  return { p, staff, w };
}

/** Makes (or replaces) the secret link. The old link stops working. */
export const share = mutation({
  args: { id: v.id("opportunities"), days: v.number(), now: v.number() },
  handler: async (ctx, args) => {
    const { w } = await mustExist(ctx, args.id, "edit");
    const why = linkDaysProblem(args.days);
    if (why) throw new ConvexError(why);
    const token = newToken();
    await ctx.db.patch(w._id, { shareToken: token, shareExpiresAt: expiryFrom(args.now, args.days) });
    return { token };
  },
});

export const revoke = mutation({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const { w } = await mustExist(ctx, args.id, "edit");
    await ctx.db.patch(w._id, { shareToken: undefined, shareExpiresAt: undefined });
  },
});
