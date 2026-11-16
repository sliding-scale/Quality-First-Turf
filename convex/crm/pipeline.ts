import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireBusiness, requireEditor, requireMover, type Staff } from "./lib/access";
import { stageList } from "./lib/pipelineStages";
import { checkFile } from "./quoteDraft";
import { quoteTotals } from "./lib/quoteMath";
import { quoteMoneyOptions } from "./lib/quoteOptions";
import { checkMove, checkWorkMove, CLOSED_STAGES, COMPLETION_STAGE, CONSTRUCTION_STAGES, LEAD_SOURCES, NO_SOURCE, PREPLANNING_STAGES, SALES_STAGES, timeInStage, type BoardGroup } from "./lib/stages";
import { notifyStage } from "./lib/mentionNotify";
import { completionBlock, completionState } from "./lib/construction";

/** The pipeline boards (D-061, D-080). `moveStage` changes a stage inside the project's current pipeline.
 *  `startPreplanning`, `startConstruction`, `returnToSales` and `returnToPreplanning` are the only moves between pipelines. */

/** What Closed Won needs (D-063): the signed contract, either the project's quote approved and signed or a signed contract uploaded to the project,
 *  and, when a signed quote asks for a deposit, the deposit received. An invoice may be uploaded too, but it is never required. Nobody can skip
 *  the contract, an Admin included. */
async function requirements(ctx: QueryCtx, project: Doc<"opportunities">) {
  const quotes = await ctx.db.query("quotes").withIndex("by_opportunityId", (q) => q.eq("opportunityId", project._id)).take(50);
  const signed = quotes
    .filter((q) => (q.status === "Approved" || q.status === "Converted") && q.signatureImageId !== undefined && q.signedAt !== undefined)
    .sort((a, b) => (b.signedAt ?? 0) - (a.signedAt ?? 0))[0];
  const latest = quotes.filter((q) => q.status !== "Archived" && q.status !== "Rejected").sort((a, b) => b.createdAt - a.createdAt)[0];
  const uploaded = project.signedContractId !== undefined;
  let deposit = { required: false, ok: true, outstandingCents: 0, quoteId: undefined as Id<"quotes"> | undefined };
  if (signed) {
    const lines = await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", signed._id)).take(500);
    const totals = quoteTotals(lines.map((l) => ({ ...l })), quoteMoneyOptions(signed), signed.depositCollectedCents ?? 0);
    if (totals.depositCents > 0) deposit = { required: true, ok: totals.depositOutstandingCents === 0, outstandingCents: totals.depositOutstandingCents, quoteId: signed._id };
  }
  const contract = signed
    ? { ok: true, via: "quote" as const, name: null as string | null, url: null as string | null, quoteId: signed._id as Id<"quotes"> | undefined, quoteNumber: signed.number as number | null }
    : uploaded
      ? { ok: true, via: "upload" as const, name: project.signedContractName ?? "Signed contract", url: await ctx.storage.getUrl(project.signedContractId!), quoteId: undefined, quoteNumber: null }
      : { ok: false, via: null, name: null, url: null, quoteId: latest?._id as Id<"quotes"> | undefined, quoteNumber: (latest?.number ?? null) as number | null };
  const invoice = project.invoiceId ? { name: project.invoiceName ?? "Invoice", url: await ctx.storage.getUrl(project.invoiceId) } : null;
  return { contract, deposit, invoice, canClose: contract.ok && deposit.ok };
}

/** Throws the reason Closed Won is refused (a code, a message, and the quote to open when there is one); returns the history note otherwise. */
async function checkWon(ctx: MutationCtx, project: Doc<"opportunities">): Promise<string> {
  const r = await requirements(ctx, project);
  if (!r.contract.ok) {
    throw new ConvexError(
      r.contract.quoteId
        ? { code: "needs_signature", message: "Closed Won needs the signed contract. Upload it, or open the quote to collect the signature.", quoteId: r.contract.quoteId }
        : { code: "needs_quote", message: "Closed Won needs the signed contract. Upload it, or make a quote for this project and have it signed." },
    );
  }
  if (!r.deposit.ok) {
    throw new ConvexError({ code: "needs_deposit", message: "Closed Won needs the deposit marked as received. Open the quote to record it.", quoteId: r.deposit.quoteId });
  }
  return r.contract.via === "quote" ? `Quote #${r.contract.quoteNumber} approved and signed` : "Signed contract uploaded";
}

/** A move inside Preplanning or Construction. The same rules as Sales for history and notifications; the outcome of the sale stays. */
async function applyWorkMove(ctx: MutationCtx, project: Doc<"opportunities">, to: string, staff: Staff, now: number) {
  if (project.pipeline !== "Preplanning" && project.pipeline !== "Construction") throw new ConvexError("This pipeline is not open yet.");
  // The last construction stage needs every required punch item verified and the customer's sign-off (PRD 4.6, D-081).
  let signOff = false;
  if (to === COMPLETION_STAGE && project.pipeline === "Construction") {
    const state = await completionState(ctx, project._id);
    if (!state.ready) throw new ConvexError(completionBlock(state));
    signOff = true;
  }
  const verdict = checkWorkMove(project.pipeline, project.stage, to, { signOff });
  if (!verdict.ok) throw new ConvexError(verdict.error);
  const from = project.stage;
  await ctx.db.patch(project._id, {
    stage: to,
    stageEnteredAt: now,
    searchText: project.searchText.endsWith(from) ? project.searchText.slice(0, -from.length) + to : `${project.searchText} ${to}`,
  });
  await ctx.db.insert("stageHistory", {
    opportunityId: project._id, businessId: project.businessId, from, to, byName: staff.name, byUserId: staff.userId, at: now,
  });
  await notifyStage(ctx, { project, from, to, byName: staff.name, byUserId: staff.userId, now });
  return { from, to, handedOff: false };
}

/** One move inside the current pipeline: validates it, updates the project and writes the history row. Shared by moveStage and won/lost. */
export async function applyMove(ctx: MutationCtx, project: Doc<"opportunities">, to: string, staff: Staff, reason: string | undefined, now: number) {
  if (project.pipeline !== "Sales") return applyWorkMove(ctx, project, to, staff, now);
  const stages = await stageList(ctx, project.businessId);
  const open = stages.filter((s) => !s.hidden).map((s) => s.name);
  const custom = stages.filter((s) => s.custom).map((s) => s.name);
  const isClosing = to === "Closed Won" || to === "Closed Lost";
  const known = [...SALES_STAGES, ...custom];
  if (known.includes(to) && !isClosing && !open.includes(to)) throw new ConvexError(`"${to}" is hidden on the board.`);
  const verdict = checkMove(project.stage, to, { isAdmin: staff.isAdmin, reason, custom });
  if (!verdict.ok) throw new ConvexError(verdict.error);
  const wonNote = to === "Closed Won" ? await checkWon(ctx, project) : null;

  const from = project.stage;
  const patch: Partial<Doc<"opportunities">> = {
    stage: to,
    stageEnteredAt: now,
    searchText: project.searchText.endsWith(from) ? project.searchText.slice(0, -from.length) + to : `${project.searchText} ${to}`,
  };
  if (to === "Closed Won") Object.assign(patch, { outcome: "won", closedAt: now, lostReason: undefined });
  else if (to === "Closed Lost") Object.assign(patch, { outcome: "lost", closedAt: now, lostReason: (reason ?? "").trim() });
  else Object.assign(patch, { outcome: undefined, closedAt: undefined, lostReason: undefined });
  await ctx.db.patch(project._id, patch);

  const note = wonNote ?? (to === "Closed Lost" ? (reason ?? "").trim() : undefined);
  await ctx.db.insert("stageHistory", {
    opportunityId: project._id, businessId: project.businessId, from, to, byName: staff.name, byUserId: staff.userId, at: now, ...(note ? { note } : {}),
  });
  await notifyStage(ctx, { project, from, to, byName: staff.name, byUserId: staff.userId, now });
  // Closed Won hands the same project to Preplanning at once (PRD 4.1). The Closed Won move above stays in the history. The Office team and the
  // salesperson were already told by that move ("Ready for Preplanning"), so the handoff itself sends nothing more.
  let handedOff = false;
  if (to === "Closed Won" && project.archivedAt === undefined) {
    const won = await ctx.db.get(project._id);
    if (won !== null) {
      await changePipeline(ctx, won, staff, { from: ["Sales", "Closed Won"], to: ["Preplanning", PREPLANNING_ENTRY], now, note: "Sent to Preplanning automatically", quiet: true });
      handedOff = true;
    }
  }
  return { from, to, handedOff };
}

export const moveStage = mutation({
  args: { id: v.id("opportunities"), to: v.string(), reason: v.optional(v.string()), now: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireMover(ctx, project.businessId, project.pipeline);
    return applyMove(ctx, project, args.to, staff, args.reason, args.now);
  },
});

/** A project's moves, newest first. */
export const history = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) return [];
    await requireBusiness(ctx, project.businessId);
    const rows = await ctx.db.query("stageHistory").withIndex("by_opportunity", (q) => q.eq("opportunityId", args.id)).take(500);
    return rows.sort((a, b) => b.at - a.at || b._creationTime - a._creationTime);
  },
});


const MAX_PROJECTS = 2000;
const sortKey = v.union(v.literal("timeInStage"), v.literal("createdDate"), v.literal("value"));
const dir = v.union(v.literal("asc"), v.literal("desc"));

/** The latest quote (its id and total, in cents) for each project in a business. Projects with no quote are absent (their value is 0). */
async function latestQuoteValues(ctx: QueryCtx, businessId: Id<"businesses">) {
  const quotes = await ctx.db.query("quotes").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", businessId)).order("desc").take(MAX_PROJECTS);
  const values = new Map<Id<"opportunities">, { totalCents: number; quoteId: Id<"quotes"> }>();
  for (const q of quotes) if (q.opportunityId && !values.has(q.opportunityId)) values.set(q.opportunityId, { totalCents: q.totalCents, quoteId: q._id }); // newest first
  return values;
}

/** The board: one column per visible stage, each with its cards, count and dollar total, for the given filters and sort. */
export const board = query({
  args: {
    businessId: v.id("businesses"),
    sortKey,
    dir,
    salespersonId: v.optional(v.union(v.id("users"), v.literal("unassigned"))),
    /** [] means all; "No source" matches projects with none. */
    leadSources: v.array(v.string()),
    /** The created-date range (the time the project was requested). */
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.string(),
    now: v.number(),
  },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const text = a.search.trim();
    const docs = text
      ? await ctx.db.query("opportunities").withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", a.businessId).eq("pipeline", "Sales")).take(MAX_PROJECTS)
      : await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_PROJECTS);
    const stages = (await stageList(ctx, a.businessId)).filter((s) => !s.hidden);
    const values = await latestQuoteValues(ctx, a.businessId);
    const people = new Map((await ctx.db.query("users").take(500)).map((u) => [u._id, u.name]));
    // The consultation each project has booked (the next one, or else the latest), for the card's View Schedule.
    const consults = new Map<Id<"opportunities">, number>();
    const booked = await ctx.db.query("calendarEvents").withIndex("by_business_and_start", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_PROJECTS);
    for (const e of booked) {
      if (e.type !== "consultation" || !e.opportunityId) continue;
      const have = consults.get(e.opportunityId);
      if (have === undefined || (e.start >= a.now && (have < a.now || e.start < have))) consults.set(e.opportunityId, e.start);
    }
    const clients = new Map<Id<"clients">, string>();
    const wanted = new Set(a.leadSources);

    const closed = CLOSED_STAGES.map((name) => ({ name, group: "Closed" as BoardGroup, custom: false }));
    const allColumns: { name: string; group: BoardGroup; custom: boolean }[] = [...stages, ...closed];
    const cards = new Map<string, Card[]>(allColumns.map((s) => [s.name, []]));
    const groupOf = new Map(allColumns.map((s) => [s.name, s.group]));
    for (const p of docs) {
      if (p.pipeline !== "Sales" || p.businessId !== a.businessId || p.archivedAt !== undefined) continue; // archived ones (D-065) are off the board
      const column = cards.get(p.stage);
      if (!column) continue;
      if (a.salespersonId === "unassigned" ? p.salespersonId !== undefined : a.salespersonId !== undefined && p.salespersonId !== a.salespersonId) continue;
      if (wanted.size > 0 && !wanted.has(p.leadSource ?? NO_SOURCE)) continue;
      if (a.from !== undefined && p.requestedAt < a.from) continue;
      if (a.to !== undefined && p.requestedAt > a.to) continue;
      if (!clients.has(p.clientId)) clients.set(p.clientId, (await ctx.db.get(p.clientId))?.name ?? "");
      column.push({
        group: groupOf.get(p.stage) ?? "Requests",
        id: p._id, code: p.code, title: p.title, clientId: p.clientId, clientName: clients.get(p.clientId) ?? "", stage: p.stage,
        consultationAt: consults.get(p._id),
        valueCents: values.get(p._id)?.totalCents ?? 0, quoteId: values.get(p._id)?.quoteId, timeInStageMs: timeInStage(p.stageEnteredAt, p.requestedAt, a.now), requestedAt: p.requestedAt,
        salespersonId: p.salespersonId, salespersonName: p.salespersonId ? (people.get(p.salespersonId) ?? "") : "Unassigned", leadSource: p.leadSource ?? NO_SOURCE,
      });
    }
    const sign = a.dir === "asc" ? 1 : -1;
    const by = (c: Card) => (a.sortKey === "value" ? c.valueCents : a.sortKey === "createdDate" ? c.requestedAt : c.timeInStageMs);
    const columns = allColumns.map((s) => {
      const list = (cards.get(s.name) ?? []).sort((x, y) => (by(x) - by(y)) * sign || x.code.localeCompare(y.code));
      return { name: s.name, group: s.group, custom: s.custom, count: list.length, totalCents: list.reduce((n, c) => n + c.valueCents, 0), cards: list };
    });
    const groupCount = (g: BoardGroup) => columns.filter((c) => c.group === g).reduce((n, c) => n + c.count, 0);
    return {
      columns,
      total: columns.reduce((n, c) => n + c.count, 0),
      groups: { Requests: { count: groupCount("Requests") }, Quotes: { count: groupCount("Quotes") }, Closed: { count: groupCount("Closed") } },
      capped: docs.length >= MAX_PROJECTS,
    };
  },
});

const workPipeline = v.union(v.literal("Preplanning"), v.literal("Construction"));

/** The Preplanning or Construction board (D-080): one column per PRD stage, on the same project record. */
export const workBoard = query({
  args: {
    businessId: v.id("businesses"),
    pipeline: workPipeline,
    sortKey,
    dir,
    salespersonId: v.optional(v.union(v.id("users"), v.literal("unassigned"))),
    leadSources: v.array(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.string(),
    now: v.number(),
  },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const text = a.search.trim();
    const docs = text
      ? await ctx.db.query("opportunities").withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", a.businessId).eq("pipeline", a.pipeline)).take(MAX_PROJECTS)
      : await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_PROJECTS);
    const stageNames = a.pipeline === "Preplanning" ? PREPLANNING_STAGES : CONSTRUCTION_STAGES;
    const values = await latestQuoteValues(ctx, a.businessId);
    const people = new Map((await ctx.db.query("users").take(500)).map((u) => [u._id, u.name]));
    const clients = new Map<Id<"clients">, string>();
    const wanted = new Set(a.leadSources);
    const cards = new Map<string, WorkCard[]>(stageNames.map((name) => [name, []]));
    for (const p of docs) {
      if (p.pipeline !== a.pipeline || p.businessId !== a.businessId || p.archivedAt !== undefined) continue;
      const column = cards.get(p.stage);
      if (!column) continue;
      if (a.salespersonId === "unassigned" ? p.salespersonId !== undefined : a.salespersonId !== undefined && p.salespersonId !== a.salespersonId) continue;
      if (wanted.size > 0 && !wanted.has(p.leadSource ?? NO_SOURCE)) continue;
      if (a.from !== undefined && p.requestedAt < a.from) continue;
      if (a.to !== undefined && p.requestedAt > a.to) continue;
      if (!clients.has(p.clientId)) clients.set(p.clientId, (await ctx.db.get(p.clientId))?.name ?? "");
      column.push({
        id: p._id, code: p.code, title: p.title, clientId: p.clientId, clientName: clients.get(p.clientId) ?? "", stage: p.stage,
        valueCents: values.get(p._id)?.totalCents ?? 0, quoteId: values.get(p._id)?.quoteId, timeInStageMs: timeInStage(p.stageEnteredAt, p.requestedAt, a.now), requestedAt: p.requestedAt,
        salespersonId: p.salespersonId, salespersonName: p.salespersonId ? (people.get(p.salespersonId) ?? "") : "Unassigned", leadSource: p.leadSource ?? NO_SOURCE,
        outcome: p.outcome ?? null,
      });
    }
    const sign = a.dir === "asc" ? 1 : -1;
    const by = (c: WorkCard) => (a.sortKey === "value" ? c.valueCents : a.sortKey === "createdDate" ? c.requestedAt : c.timeInStageMs);
    const columns = stageNames.map((name) => {
      const list = (cards.get(name) ?? []).sort((x, y) => (by(x) - by(y)) * sign || x.code.localeCompare(y.code));
      return { name, count: list.length, totalCents: list.reduce((n, c) => n + c.valueCents, 0), cards: list };
    });
    return { columns, total: columns.reduce((n, c) => n + c.count, 0), capped: docs.length >= MAX_PROJECTS };
  },
});

type WorkCard = {
  id: Id<"opportunities">; code: string; title: string; clientId: Id<"clients">; clientName: string; stage: string; valueCents: number;
  quoteId: Id<"quotes"> | undefined; timeInStageMs: number; requestedAt: number; salespersonId: Id<"users"> | undefined; salespersonName: string;
  leadSource: string; outcome: "won" | "lost" | null;
};

export type Card = {
  /** The board group its column is in. */
  group: BoardGroup;
  id: Id<"opportunities">; code: string; title: string; clientId: Id<"clients">; clientName: string; stage: string; valueCents: number;
  /** When the project's consultation is booked, if one is (the card's "View Schedule"). */
  consultationAt: number | undefined;
  /** The project's latest quote, if it has one (the card's "View Quote"). */
  quoteId: Id<"quotes"> | undefined;
  timeInStageMs: number; requestedAt: number; salespersonId: Id<"users"> | undefined; salespersonName: string; leadSource: string;
};

export const people = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    const users = await ctx.db.query("users").take(500);
    return users
      .filter((u) => u.status === "active" && (u.roles.includes("admin") || u.businessIds.includes(args.businessId)))
      .map((u) => ({ id: u._id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const setSalesperson = mutation({
  args: { id: v.id("opportunities"), salespersonId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireEditor(ctx, project.businessId);
    if (args.salespersonId === null) {
      await ctx.db.patch(args.id, { salespersonId: undefined });
      return;
    }
    const user = await ctx.db.get(args.salespersonId);
    if (user === null || user.status !== "active" || !(user.roles.includes("admin") || user.businessIds.includes(project.businessId))) {
      throw new ConvexError("That person is not on this business team.");
    }
    await ctx.db.patch(args.id, { salespersonId: args.salespersonId });
  },
});

export const setLeadSource = mutation({
  args: { id: v.id("opportunities"), leadSource: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireEditor(ctx, project.businessId);
    if (args.leadSource !== null && !(LEAD_SOURCES as readonly string[]).includes(args.leadSource)) throw new ConvexError("Pick a lead source from the list.");
    await ctx.db.patch(args.id, { leadSource: args.leadSource ?? undefined });
  },
});

/** "Mark as won" and "Mark as lost" on a card. Same rules as moving to Closed Won or Closed Lost. */
export const markOutcome = mutation({
  args: { id: v.id("opportunities"), outcome: v.union(v.literal("won"), v.literal("lost")), reason: v.optional(v.string()), now: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireEditor(ctx, project.businessId);
    return applyMove(ctx, project, args.outcome === "won" ? "Closed Won" : "Closed Lost", staff, args.reason, args.now);
  },
});

const PREPLANNING_ENTRY = PREPLANNING_STAGES[0];
const PREPLANNING_LAST = PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1];
const CONSTRUCTION_ENTRY = CONSTRUCTION_STAGES[0];

type Place = readonly [Doc<"opportunities">["pipeline"], string];

/** Moves the same project into another pipeline and writes one history row. Stage changes do not happen anywhere else.
 *  `quiet` skips the notification, for a move whose reason was already announced. */
async function changePipeline(
  ctx: MutationCtx,
  project: Doc<"opportunities">,
  staff: Staff,
  m: { from: Place; to: Place; now: number; note: string; office?: boolean; quiet?: boolean; refuse?: string },
) {
  const [fromPipeline, fromStage] = m.from;
  const [toPipeline, toStage] = m.to;
  if (project.archivedAt !== undefined) throw new ConvexError("An archived project stays where it was archived.");
  if (project.pipeline !== fromPipeline || project.stage !== fromStage) throw new ConvexError(m.refuse ?? `Only a project at "${fromStage}" can do this.`);
  await ctx.db.patch(project._id, {
    pipeline: toPipeline,
    stage: toStage,
    stageEnteredAt: m.now,
    searchText: project.searchText.endsWith(fromStage) ? project.searchText.slice(0, -fromStage.length) + toStage : `${project.searchText} ${toStage}`,
  });
  await ctx.db.insert("stageHistory", {
    opportunityId: project._id, businessId: project.businessId, from: fromStage, to: toStage, byName: staff.name, byUserId: staff.userId, at: m.now, note: m.note,
  });
  if (!m.quiet) await notifyStage(ctx, { project, from: fromStage, to: toStage, byName: staff.name, byUserId: staff.userId, now: m.now, office: m.office });
  return { from: fromStage, to: toStage };
}

/** The customer's sign-off moves the project to the last construction stage by itself, once nothing else is missing (D-081), the way
 *  Closed Won hands a project to Preplanning. The Office team is told, since billing comes next. Returns whether it moved. */
export async function completeConstruction(ctx: MutationCtx, project: Doc<"opportunities">, by: { name: string; userId?: Id<"users"> }, now: number): Promise<boolean> {
  if (project.pipeline !== "Construction" || project.stage === COMPLETION_STAGE || project.archivedAt !== undefined) return false;
  if (!(await completionState(ctx, project._id)).ready) return false;
  const from = project.stage;
  await ctx.db.patch(project._id, {
    stage: COMPLETION_STAGE,
    stageEnteredAt: now,
    searchText: project.searchText.endsWith(from) ? project.searchText.slice(0, -from.length) + COMPLETION_STAGE : `${project.searchText} ${COMPLETION_STAGE}`,
  });
  await ctx.db.insert("stageHistory", {
    opportunityId: project._id, businessId: project.businessId, from, to: COMPLETION_STAGE, byName: by.name, ...(by.userId ? { byUserId: by.userId } : {}), at: now, note: "Customer signed off",
  });
  await notifyStage(ctx, { project, from, to: COMPLETION_STAGE, byName: by.name, ...(by.userId ? { byUserId: by.userId } : {}), now, office: true });
  return true;
}

/** Closed Won → the first Preplanning stage. Closed Won does this by itself now; this is for a won project that was left on the Sales board
 *  (won before the handoff was automatic, or sent back with Return to Sales). */
export const startPreplanning = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireEditor(ctx, project.businessId);
    return changePipeline(ctx, project, staff, { from: ["Sales", "Closed Won"], to: ["Preplanning", PREPLANNING_ENTRY], now: args.now, note: "Sent to Preplanning", office: true, refuse: 'Only a project at "Closed Won" can start preplanning.' });
  },
});

/** The last Preplanning stage → the first Construction stage, on the same project. */
export const startConstruction = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireEditor(ctx, project.businessId);
    return changePipeline(ctx, project, staff, { from: ["Preplanning", PREPLANNING_LAST], to: ["Construction", CONSTRUCTION_ENTRY], now: args.now, note: "Sent to Construction", refuse: `Only a project at "${PREPLANNING_LAST}" can start construction.` });
  },
});

/** Puts a won project back on the Sales board, at Closed Won. Only from the first Preplanning stage. */
export const returnToSales = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireEditor(ctx, project.businessId);
    if (project.outcome !== "won") throw new ConvexError("Only a won project can go back to Sales.");
    return changePipeline(ctx, project, staff, { from: ["Preplanning", PREPLANNING_ENTRY], to: ["Sales", "Closed Won"], now: args.now, note: "Returned to Sales", refuse: `Only a project at "${PREPLANNING_ENTRY}" can go back to Sales.` });
  },
});

/** Puts a project back on the last Preplanning stage. Only from the first Construction stage. */
export const returnToPreplanning = mutation({
  args: { id: v.id("opportunities"), now: v.number() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireEditor(ctx, project.businessId);
    return changePipeline(ctx, project, staff, { from: ["Construction", CONSTRUCTION_ENTRY], to: ["Preplanning", PREPLANNING_LAST], now: args.now, note: "Returned to Preplanning", refuse: `Only a project at "${CONSTRUCTION_ENTRY}" can go back to Preplanning.` });
  },
});

const outcomeSort = v.union(v.literal("title"), v.literal("name"), v.literal("createdOn"), v.literal("closedOn"), v.literal("total"));

/** The Sales Outcomes table: won or lost projects closed in a date range. */
export const outcomes = query({
  args: {
    businessId: v.id("businesses"), outcome: v.union(v.literal("won"), v.literal("lost")), from: v.number(), to: v.number(),
    sortKey: outcomeSort, dir, page: v.number(), size: v.number(),
  },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const docs = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_PROJECTS);
    const values = await latestQuoteValues(ctx, a.businessId);
    const clients = new Map<Id<"clients">, string>();
    const rows: { id: Id<"opportunities">; title: string; clientId: Id<"clients">; clientName: string; createdOn: number; closedOn: number; totalCents: number; lostReason: string }[] = [];
    for (const p of docs) {
      if (p.outcome !== a.outcome || p.closedAt === undefined || p.closedAt < a.from || p.closedAt > a.to) continue;
      if (!clients.has(p.clientId)) clients.set(p.clientId, (await ctx.db.get(p.clientId))?.name ?? "");
      rows.push({
        id: p._id, title: p.title, clientId: p.clientId, clientName: clients.get(p.clientId) ?? "", createdOn: p.requestedAt, closedOn: p.closedAt,
        totalCents: values.get(p._id)?.totalCents ?? 0, lostReason: p.lostReason ?? "",
      });
    }
    const sign = a.dir === "asc" ? 1 : -1;
    const key = (r: (typeof rows)[number]) => (a.sortKey === "title" ? r.title.toLowerCase() : a.sortKey === "name" ? r.clientName.toLowerCase() : a.sortKey === "createdOn" ? r.createdOn : a.sortKey === "total" ? r.totalCents : r.closedOn);
    rows.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0) * sign);
    const size = Math.min(Math.max(Math.floor(a.size), 1), 100);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(Math.max(Math.floor(a.page), 1), pages);
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page };
  },
});

/* ---- Edit Stages (D-061): the business's own stages and hiding. The nine PRD stages are locked: they cannot be renamed or deleted. ---- */

const groupV = v.union(v.literal("Requests"), v.literal("Quotes"));
const ALL_PRD_NAMES = [...SALES_STAGES, ...PREPLANNING_STAGES, ...CONSTRUCTION_STAGES].map((s) => s.toLowerCase());

async function projectsIn(ctx: QueryCtx, businessId: Id<"businesses">, stage: string) {
  const docs = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", businessId)).take(MAX_PROJECTS);
  return docs.filter((p) => p.pipeline === "Sales" && p.stage === stage);
}

/** Every board stage for the Edit Stages page, with how many projects sit in it. */
export const stagesForEdit = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireBusiness(ctx, args.businessId);
    const stages = await stageList(ctx, args.businessId);
    const docs = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", args.businessId)).take(MAX_PROJECTS);
    const counts = new Map<string, number>();
    for (const p of docs) if (p.pipeline === "Sales") counts.set(p.stage, (counts.get(p.stage) ?? 0) + 1);
    return stages.map((s) => ({ name: s.name, group: s.group, custom: s.custom, hidden: s.hidden, locked: !s.custom, projects: counts.get(s.name) ?? 0 }));
  },
});

export const addStage = mutation({
  args: { businessId: v.id("businesses"), group: groupV, name: v.string() },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.businessId);
    const name = args.name.trim();
    if (name.length < 1 || name.length > 60) throw new ConvexError("A stage name needs 1 to 60 characters.");
    const stages = await stageList(ctx, args.businessId);
    if (ALL_PRD_NAMES.includes(name.toLowerCase()) || stages.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError(`There is already a stage called "${name}".`);
    }
    const order = Math.max(-1, ...stages.filter((s) => s.group === args.group).map((s) => s.order)) + 1;
    await ctx.db.insert("pipelineStages", { businessId: args.businessId, name, group: args.group, order, hidden: false, custom: true });
  },
});

export const renameStage = mutation({
  args: { businessId: v.id("businesses"), name: v.string(), newName: v.string() },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.businessId);
    const stages = await stageList(ctx, args.businessId);
    const stage = stages.find((s) => s.name === args.name && s.custom);
    if (!stage?.rowId) throw new ConvexError("Only your own stages can be renamed.");
    const newName = args.newName.trim();
    if (newName.length < 1 || newName.length > 60) throw new ConvexError("A stage name needs 1 to 60 characters.");
    if (newName !== args.name && (ALL_PRD_NAMES.includes(newName.toLowerCase()) || stages.some((s) => s.name.toLowerCase() === newName.toLowerCase()))) {
      throw new ConvexError(`There is already a stage called "${newName}".`);
    }
    for (const p of await projectsIn(ctx, args.businessId, args.name)) {
      const searchText = p.searchText.endsWith(args.name) ? p.searchText.slice(0, -args.name.length) + newName : p.searchText;
      await ctx.db.patch(p._id, { stage: newName, searchText });
    }
    await ctx.db.patch(stage.rowId, { name: newName });
  },
});

export const setStageHidden = mutation({
  args: { businessId: v.id("businesses"), name: v.string(), hidden: v.boolean() },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.businessId);
    const stages = await stageList(ctx, args.businessId);
    const stage = stages.find((s) => s.name === args.name);
    if (!stage) throw new ConvexError("That stage does not exist.");
    if (args.hidden && (await projectsIn(ctx, args.businessId, args.name)).length > 0) {
      throw new ConvexError("Move the projects out of this stage before hiding it. It still holds projects.");
    }
    if (stage.rowId) await ctx.db.patch(stage.rowId, { hidden: args.hidden });
    else await ctx.db.insert("pipelineStages", { businessId: args.businessId, name: stage.name, group: stage.group, order: stage.order, hidden: args.hidden, custom: false });
  },
});

export const reorderStages = mutation({
  args: { businessId: v.id("businesses"), group: groupV, names: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.businessId);
    const stages = (await stageList(ctx, args.businessId)).filter((s) => s.group === args.group);
    const same = args.names.length === stages.length && stages.every((s) => args.names.includes(s.name)) && new Set(args.names).size === args.names.length;
    if (!same) throw new ConvexError("Send every stage in the group, once each.");
    for (const [order, name] of args.names.entries()) {
      const stage = stages.find((s) => s.name === name)!;
      if (stage.rowId) await ctx.db.patch(stage.rowId, { order });
      else await ctx.db.insert("pipelineStages", { businessId: args.businessId, name, group: stage.group, order, hidden: stage.hidden, custom: false });
    }
  },
});

export const deleteStage = mutation({
  args: { businessId: v.id("businesses"), name: v.string() },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.businessId);
    const stage = (await stageList(ctx, args.businessId)).find((s) => s.name === args.name && s.custom);
    if (!stage?.rowId) throw new ConvexError("Only your own stages can be deleted.");
    if ((await projectsIn(ctx, args.businessId, args.name)).length > 0) throw new ConvexError("Move the projects out of this stage before deleting it. It still holds projects.");
    await ctx.db.delete(stage.rowId);
  },
});

/** What a project still needs before it can close as won, with the files already uploaded (the "Close as won" pop-up). */
export const wonRequirements = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const project = await ctx.db.get(a.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireBusiness(ctx, project.businessId);
    return requirements(ctx, project);
  },
});

/** Upload the signed contract (a PDF or an image, at most 15 MB). It replaces an earlier upload. */
export const attachContract = mutation({
  args: { id: v.id("opportunities"), storageId: v.id("_storage"), name: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const project = await ctx.db.get(a.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireEditor(ctx, project.businessId);
    await checkFile(ctx, a.storageId, "The signed contract");
    if (project.signedContractId) await ctx.storage.delete(project.signedContractId);
    await ctx.db.patch(a.id, { signedContractId: a.storageId, signedContractName: a.name.trim().slice(0, 200) || "Signed contract", signedContractAt: a.now });
  },
});

/** Upload an invoice (a PDF or an image, at most 15 MB). Optional: nothing waits for it. */
export const attachInvoice = mutation({
  args: { id: v.id("opportunities"), storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, a) => {
    const project = await ctx.db.get(a.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireEditor(ctx, project.businessId);
    await checkFile(ctx, a.storageId, "The invoice");
    if (project.invoiceId) await ctx.storage.delete(project.invoiceId);
    await ctx.db.patch(a.id, { invoiceId: a.storageId, invoiceName: a.name.trim().slice(0, 200) || "Invoice" });
  },
});

/** A place to upload a project's contract or invoice to. */
export const uploadUrl = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireEditor(ctx, a.businessId);
    return ctx.storage.generateUploadUrl();
  },
});
