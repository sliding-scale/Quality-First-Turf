import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { costsOn } from "./catalogue";
import { requireModule, requireProject } from "./lib/access";
import { checkAssignee } from "./lib/assignees";
import { signedQuoteOf } from "./lib/billing";
import { laborCostCents, lineCostCents, minutesBetween } from "./lib/jobCosts";
import { nameKeyOf } from "./lib/catalogue";
import { allows } from "./lib/permissions";

/** What a job costs (plan 2026-11-19-jobs-costs): the catalogue cost of its lines, the Labor logged on it and its Expenses. Costs are prices, so
 *  reading or changing any of them also needs the "Show pricing" module at View. Everything is worked out from the records, never typed. */

const MAX_CENTS = 100_000_000_00;
const DAY_MS = 24 * 60 * 60 * 1000;

async function jobFor(ctx: QueryCtx, id: Id<"opportunities">, need: "view" | "edit") {
  const p = await ctx.db.get(id);
  if (p === null || p.outcome !== "won" || p.jobNumber === undefined) throw new ConvexError("That job no longer exists.");
  const staff = await requireProject(ctx, p, "jobs", need);
  if (!allows(staff.levels.prices, "view")) throw new ConvexError("You do not have access to this.");
  return { p, staff };
}

/** Everything cost-related on one job, or null for someone who cannot see prices. */
export const get = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null || p.outcome !== "won" || p.jobNumber === undefined) return null;
    const staff = await requireProject(ctx, p, "jobs", "view");
    if (!allows(staff.levels.prices, "view")) return null;

    // A line's unit cost is the catalogue item's, matched by name, while the business has the catalogue costs switch on.
    const signed = await signedQuoteOf(ctx, p._id);
    const lines = signed ? signed.lines : (p.lines ?? []);
    const useCatalogue = await costsOn(ctx, p.businessId);
    const unitCosts: (number | null)[] = [];
    let linesCostCents = 0;
    for (const l of lines) {
      let unit: number | null = null;
      if (useCatalogue) {
        const item = await ctx.db.query("catalogueItems").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", p.businessId).eq("nameKey", nameKeyOf(l.name))).first();
        unit = item?.costCents ?? null;
      }
      unitCosts.push(unit);
      linesCostCents += lineCostCents(l.quantity, unit) ?? 0;
    }

    const names = new Map<Id<"users">, string>();
    const nameOf = async (id: Id<"users">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get(id))?.name ?? "");
      return names.get(id)!;
    };
    const entries = await ctx.db.query("jobTimeEntries").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(500);
    const time = [];
    const lastRates: Record<string, number> = {};
    let laborCents = 0;
    for (const e of entries) {
      const costCents = laborCostCents(e.minutes, e.costPerHourCents);
      laborCents += costCents;
      lastRates[e.employeeId] = e.costPerHourCents;
      time.push({ id: e._id, employeeId: e.employeeId, employeeName: await nameOf(e.employeeId), startAt: e.startAt, endAt: e.endAt, minutes: e.minutes, costPerHourCents: e.costPerHourCents, costCents, notes: e.notes });
    }
    const spent = await ctx.db.query("jobExpenses").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(500);
    const expenses = [];
    let expensesCents = 0;
    for (const x of spent) {
      expensesCents += x.totalCents;
      expenses.push({
        id: x._id, date: x.date, name: x.name, description: x.description, totalCents: x.totalCents, accountingCode: x.accountingCode,
        reimburseToId: x.reimburseToId ?? null, reimburseToName: x.reimburseToId ? await nameOf(x.reimburseToId) : null,
        receiptUrl: x.receiptId ? await ctx.storage.getUrl(x.receiptId) : null,
      });
    }
    return { unitCosts, linesCostCents, laborCents, expensesCents, costCents: linesCostCents + laborCents + expensesCents, time, expenses, lastRates };
  },
});

const timeFields = { employeeId: v.id("users"), costPerHourCents: v.number(), startAt: v.number(), endAt: v.number(), notes: v.string() };

async function checkTime(ctx: MutationCtx, businessId: Id<"businesses">, a: { employeeId: Id<"users">; costPerHourCents: number; startAt: number; endAt: number; notes: string }) {
  await checkAssignee(ctx, a.employeeId, businessId);
  if (!Number.isInteger(a.costPerHourCents) || a.costPerHourCents < 0 || a.costPerHourCents > MAX_CENTS) throw new ConvexError("Check the employee cost per hour.");
  const minutes = minutesBetween(a.startAt, a.endAt);
  if (minutes <= 0) throw new ConvexError("The end time has to be after the start time.");
  if (minutes > 24 * 60) throw new ConvexError("A time entry is up to 24 hours long.");
  return { minutes, notes: a.notes.trim().slice(0, 2000) };
}

export const saveTime = mutation({
  args: { id: v.optional(v.id("jobTimeEntries")), opportunityId: v.id("opportunities"), ...timeFields, now: v.number() },
  handler: async (ctx, a) => {
    const { p, staff } = await jobFor(ctx, a.opportunityId, "edit");
    const { minutes, notes } = await checkTime(ctx, p.businessId, a);
    const fields = { employeeId: a.employeeId, costPerHourCents: a.costPerHourCents, startAt: a.startAt, endAt: a.endAt, minutes, notes };
    if (a.id) {
      const e = await ctx.db.get(a.id);
      if (e === null || e.opportunityId !== p._id) throw new ConvexError("That time entry no longer exists.");
      await ctx.db.patch(e._id, fields);
      return e._id;
    }
    return ctx.db.insert("jobTimeEntries", { businessId: p.businessId, opportunityId: p._id, ...fields, createdBy: staff.userId, createdAt: a.now });
  },
});

export const removeTime = mutation({
  args: { id: v.id("jobTimeEntries") },
  handler: async (ctx, a) => {
    const e = await ctx.db.get(a.id);
    if (e === null) return;
    await jobFor(ctx, e.opportunityId, "edit");
    await ctx.db.delete(e._id);
  },
});

export const expenseUploadUrl = mutation({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, a) => {
    await jobFor(ctx, a.opportunityId, "edit");
    return ctx.storage.generateUploadUrl();
  },
});

export const saveExpense = mutation({
  args: {
    id: v.optional(v.id("jobExpenses")), opportunityId: v.id("opportunities"), date: v.number(), name: v.string(), description: v.string(), totalCents: v.number(),
    accountingCode: v.string(), reimburseToId: v.optional(v.id("users")),
    /** A receipt already uploaded to storage. `null` removes the one the expense has. */
    receiptId: v.optional(v.union(v.id("_storage"), v.null())), now: v.number(),
  },
  handler: async (ctx, a) => {
    const { p, staff } = await jobFor(ctx, a.opportunityId, "edit");
    const name = a.name.trim();
    if (!name) throw new ConvexError("Give the expense a name.");
    if (name.length > 200) throw new ConvexError("The name is too long.");
    if (!Number.isInteger(a.totalCents) || a.totalCents < 0 || a.totalCents > MAX_CENTS) throw new ConvexError("Check the total.");
    if (!Number.isFinite(a.date) || a.date % DAY_MS !== 0) throw new ConvexError("Pick the day of the expense.");
    await checkAssignee(ctx, a.reimburseToId, p.businessId);
    const fields = { date: a.date, name, description: a.description.trim().slice(0, 2000), totalCents: a.totalCents, accountingCode: a.accountingCode.trim().slice(0, 100), reimburseToId: a.reimburseToId };
    if (a.id) {
      const x = await ctx.db.get(a.id);
      if (x === null || x.opportunityId !== p._id) throw new ConvexError("That expense no longer exists.");
      if (a.receiptId !== undefined && x.receiptId && x.receiptId !== a.receiptId) await ctx.storage.delete(x.receiptId);
      await ctx.db.patch(x._id, { ...fields, ...(a.receiptId !== undefined ? { receiptId: a.receiptId ?? undefined } : {}) });
      return x._id;
    }
    return ctx.db.insert("jobExpenses", { businessId: p.businessId, opportunityId: p._id, ...fields, ...(a.receiptId ? { receiptId: a.receiptId } : {}), createdBy: staff.userId, createdAt: a.now });
  },
});

export const removeExpense = mutation({
  args: { id: v.id("jobExpenses") },
  handler: async (ctx, a) => {
    const x = await ctx.db.get(a.id);
    if (x === null) return;
    await jobFor(ctx, x.opportunityId, "edit");
    if (x.receiptId) await ctx.storage.delete(x.receiptId);
    await ctx.db.delete(x._id);
  },
});
