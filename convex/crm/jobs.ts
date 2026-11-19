import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireModule, requireProject } from "./lib/access";
import { projectMoney, signedQuoteOf } from "./lib/billing";
import { assignJobNumber } from "./lib/jobNumber";
import { ENDING_SOON, JOB_STATUSES, jobStatusOf, type JobStatus } from "./lib/jobStatus";
import { canSeeRecord } from "./lib/permissions";
import { newShortCode } from "../projects/shortCode";
import { opportunitySearchText } from "./lib/clientInput";
import { PREPLANNING_STAGES } from "./lib/stages";
import { applyMove, changePipeline } from "./pipeline";
import { cleanLines, linesArg } from "./requests";

/** Jobs (design 2026-11-19-jobs): a job is a Closed Won project (`opportunities.outcome === "won"`) seen through the Jobs screens. Nothing is
 *  copied: the job's number is on the project, and its status, total and visits are read from the records every time. */

const PAGE_SIZE = 25;
/** How many of a business's newest jobs the list reads. Statuses are computed, so the list reads, filters and pages on the server.
 *  Revisit (a stored status, or an index per status) if a business passes this. */
const JOB_CAP = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Numbers the won projects of one business that have no job number yet, oldest `closedAt` first. Safe to run again. Returns how many it numbered. */
export const backfillNumbers = internalMutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const projects = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", args.businessId)).collect();
    const unnumbered = projects
      .filter((p) => p.outcome === "won" && p.jobNumber === undefined)
      .sort((a, b) => (a.closedAt ?? a.requestedAt) - (b.closedAt ?? b.requestedAt));
    for (const p of unnumbered) await assignJobNumber(ctx, p);
    return unnumbered.length;
  },
});

export type JobRow = {
  id: Id<"opportunities">;
  jobNumber: number;
  title: string;
  clientId: Id<"clients">;
  clientName: string;
  property: string;
  firstVisitAt: number | null;
  nextVisitAt: number | null;
  lastVisitAt: number | null;
  status: JobStatus;
  totalCents: number;
};

type Line = { name: string; description: string; quantity: number; unitPriceCents: number };
const sumLines = (lines: readonly Line[]) => lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceCents), 0);

/** The client's first property, else the client's own address, as one line. */
export function propertyLine(c: Doc<"clients">): string {
  const p = c.properties?.[0];
  const a = p ?? c;
  const street = [a.street1, a.street2].filter(Boolean).join(" ");
  const place = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, place].filter(Boolean).join(", ");
}

async function visitsOf(ctx: QueryCtx, p: Doc<"opportunities">) {
  const events = await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(200);
  return events.filter((e) => e.type === "visit").sort((a, b) => a.start - b.start);
}

async function rowOf(ctx: QueryCtx, p: Doc<"opportunities">, dayStart: number): Promise<JobRow> {
  const client = await ctx.db.get(p.clientId);
  const visits = await visitsOf(ctx, p);
  const live = visits.filter((e) => e.status !== "lost");
  const money = await projectMoney(ctx, p);
  const open = live.filter((e) => e.status === "upcoming" || e.status === "confirmed");
  const next = open.find((e) => e.start >= dayStart);
  return {
    id: p._id,
    jobNumber: p.jobNumber ?? 0,
    title: p.title,
    clientId: p.clientId,
    clientName: client?.name ?? "",
    property: client ? propertyLine(client) : "",
    firstVisitAt: live[0]?.start ?? null,
    nextVisitAt: next?.start ?? null,
    lastVisitAt: live.length ? live[live.length - 1].start : null,
    status: jobStatusOf({
      archived: p.archivedAt !== undefined,
      closed: p.jobClosedAt !== undefined,
      inFinance: p.pipeline === "Finance",
      invoicesCover: money.covered,
      visits: visits.map((e) => ({ start: e.start, status: e.status })),
      dayStart,
    }),
    /** What the job is billed for (the payment schedule, else the signed quote), else the sum of the project's own lines, else nothing. */
    totalCents: money.billingTotalCents > 0 ? money.billingTotalCents : sumLines(p.lines ?? []),
  };
}

/** The business's jobs the caller may see, newest number first, with their statuses worked out. */
async function jobRows(ctx: QueryCtx, businessId: Id<"businesses">, dayStart: number) {
  const staff = await requireModule(ctx, businessId, "jobs", "view");
  const projects = await ctx.db
    .query("opportunities")
    .withIndex("by_business_and_jobNumber", (q) => q.eq("businessId", businessId).gt("jobNumber", 0))
    .order("desc")
    .take(JOB_CAP);
  const mine = projects.filter((p) => p.outcome === "won" && canSeeRecord({ assignedOnly: staff.assignedOnly, userId: staff.userId }, p));
  const rows: JobRow[] = [];
  for (const p of mine) rows.push(await rowOf(ctx, p, dayStart));
  return rows;
}

const endingSoon = (r: JobRow, dayStart: number) => r.status !== "Archived" && r.lastVisitAt !== null && r.lastVisitAt >= dayStart && r.lastVisitAt < dayStart + 30 * DAY_MS;

export const list = query({
  args: { businessId: v.id("businesses"), status: v.optional(v.string()), search: v.optional(v.string()), page: v.number(), dayStart: v.number() },
  handler: async (ctx, args) => {
    let rows = await jobRows(ctx, args.businessId, args.dayStart);
    if (args.status === ENDING_SOON) rows = rows.filter((r) => endingSoon(r, args.dayStart));
    else if (args.status && (JOB_STATUSES as readonly string[]).includes(args.status)) rows = rows.filter((r) => r.status === args.status);
    const term = (args.search ?? "").trim().toLowerCase();
    if (term) {
      rows = rows.filter((r) => `${r.clientName} ${r.title} ${r.property} #${r.jobNumber}`.toLowerCase().includes(term));
    }
    const page = Math.max(1, Math.floor(args.page));
    return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: rows.length, pageSize: PAGE_SIZE };
  },
});

export const counts = query({
  args: { businessId: v.id("businesses"), dayStart: v.number() },
  handler: async (ctx, args) => {
    const rows = await jobRows(ctx, args.businessId, args.dayStart);
    const byStatus = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
    for (const r of rows) byStatus[r.status] += 1;
    const window = async (from: number, to: number) => {
      let count = 0;
      let cents = 0;
      for (const r of rows) {
        const visits = (await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", r.id)).take(200))
          .filter((e) => e.type === "visit" && e.status !== "lost" && e.start >= from && e.start < to);
        if (visits.length) {
          count += visits.length;
          cents += r.totalCents;
        }
      }
      return { count, cents };
    };
    return {
      all: rows.length,
      byStatus,
      endingSoon: rows.filter((r) => endingSoon(r, args.dayStart)).length,
      visitsPast30: await window(args.dayStart - 30 * DAY_MS, args.dayStart + DAY_MS),
      visitsNext30: await window(args.dayStart + DAY_MS, args.dayStart + 31 * DAY_MS),
    };
  },
});

export const get = query({
  args: { id: v.id("opportunities"), dayStart: v.number() },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    // A project that is not (or no longer is) a job reads as missing, so the page can say so instead of failing.
    if (p === null || p.outcome !== "won" || p.jobNumber === undefined) return null;
    await requireProject(ctx, p, "jobs", "view");
    const row = await rowOf(ctx, p, args.dayStart);
    const client = await ctx.db.get(p.clientId);
    const signed = await signedQuoteOf(ctx, p._id);
    const lines: Line[] = signed ? signed.lines : (p.lines ?? []);
    const visits = await visitsOf(ctx, p);
    const money = await projectMoney(ctx, p);
    const names = new Map<Id<"users">, string>();
    for (const e of visits) for (const uid of e.assigneeIds) if (!names.has(uid)) names.set(uid, (await ctx.db.get(uid))?.name ?? "");
    return {
      ...row,
      projectCode: p.code,
      pipeline: p.pipeline,
      stage: p.stage,
      closedAt: p.jobClosedAt ?? null,
      closedByName: p.jobClosedByName ?? null,
      wonAt: p.closedAt ?? null,
      quoteId: signed ? signed.quote._id : null,
      client: { id: p.clientId, name: client?.name ?? "", phone: client?.phone ?? "", email: client?.email ?? "" },
      lines,
      subtotalCents: sumLines(lines),
      invoicedCents: money.sentCents,
      paidCents: money.paidCents,
      hasPaymentPlan: (await ctx.db.query("billingPlans").withIndex("by_opportunityId", (q) => q.eq("opportunityId", p._id)).unique()) !== null,
      visits: visits.map((e) => ({
        id: e._id, start: e.start, end: e.end, anytime: e.anytime, status: e.status, title: e.title, notes: e.notes,
        assignees: e.assigneeIds.map((u) => names.get(u) ?? "").filter(Boolean),
      })),
    };
  },
});

async function jobOf(ctx: MutationCtx, id: Id<"opportunities">) {
  const p = await ctx.db.get(id);
  if (p === null || p.outcome !== "won" || p.jobNumber === undefined) throw new ConvexError("That job no longer exists.");
  const staff = await requireProject(ctx, p, "jobs", "edit");
  return { p, staff };
}

/** Jobber's Close Job: marks the job closed by hand and records who and when. It shows as Archived. The project stays in its pipeline: closing a
 *  job does not skip the construction sign-off or the Finance guards, which still decide the stage. Closing a closed job changes nothing. */
export const close = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const { p, staff } = await jobOf(ctx, args.id);
    if (p.jobClosedAt !== undefined) return;
    await ctx.db.patch(p._id, { jobClosedAt: args.now, jobClosedByName: staff.name });
    await ctx.db.insert("stageHistory", { opportunityId: p._id, businessId: p.businessId, from: p.stage, to: p.stage, byName: staff.name, byUserId: staff.userId, at: args.now, note: "Job closed" });
  },
});

export const reopen = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const { p, staff } = await jobOf(ctx, args.id);
    if (p.jobClosedAt === undefined) return;
    await ctx.db.patch(p._id, { jobClosedAt: undefined, jobClosedByName: undefined });
    await ctx.db.insert("stageHistory", { opportunityId: p._id, businessId: p.businessId, from: p.stage, to: p.stage, byName: staff.name, byUserId: staff.userId, at: args.now, note: "Job reopened" });
  },
});

/** Jobber's Convert to Job, from a quote or a request: marks the project Closed Won through the usual move, so the same guard applies (the quote
 *  signed, and the deposit when one is asked for) and a refusal reads as it does on the pipeline. A project that is already a job is returned as it is. */
export const convert = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (p === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireProject(ctx, p, "jobs", "edit");
    if (p.outcome === "won" && p.jobNumber !== undefined) return p._id;
    await applyMove(ctx, p, "Closed Won", staff, undefined, args.now);
    return p._id;
  },
});

/** Jobber's New Job: a job made by hand, with no quote. It is a project made already Closed Won (with the next job number), which then goes
 *  to Preplanning as every won project does. The signed-contract and deposit rule belongs to approving a quote, so it does not apply here;
 *  the history says "Job created by hand". Returns the project's id, which is also the job's. */
export const create = mutation({
  args: { businessId: v.id("businesses"), clientId: v.id("clients"), title: v.string(), details: v.optional(v.string()), lines: v.optional(linesArg), now: v.number() },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "jobs", "edit");
    const title = args.title.trim();
    if (!title) throw new ConvexError("Give the job a title.");
    if (title.length > 200) throw new ConvexError("The title is too long.");
    const client = await ctx.db.get(args.clientId);
    if (client === null || client.businessId !== args.businessId) throw new ConvexError("Pick a client from this business.");
    const lines = cleanLines(args.lines ?? []);
    const details = (args.details ?? "").trim().slice(0, 5000);
    const code = await newShortCode(ctx);
    const id = await ctx.db.insert("opportunities", {
      businessId: args.businessId, clientId: client._id, code, title, pipeline: "Sales", stage: "Closed Won", requestedAt: args.now, stageEnteredAt: args.now, owner: "Unassigned",
      outcome: "won", closedAt: args.now, ...(details ? { details } : {}), ...(lines.length ? { lines } : {}),
      searchText: opportunitySearchText(client, { title, code, stage: "Closed Won" }),
    });
    await assignJobNumber(ctx, (await ctx.db.get(id))!);
    await ctx.db.insert("stageHistory", { opportunityId: id, businessId: args.businessId, from: "Created by hand", to: "Closed Won", byName: staff.name, byUserId: staff.userId, at: args.now, note: "Job created by hand" });
    await changePipeline(ctx, (await ctx.db.get(id))!, staff, { from: ["Sales", "Closed Won"], to: ["Preplanning", PREPLANNING_STAGES[0]], now: args.now, note: "Sent to Preplanning automatically", quiet: true });
    return id;
  },
});
