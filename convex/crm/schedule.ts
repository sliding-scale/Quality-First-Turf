import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireBusiness, requireEditor } from "./lib/access";
import { checkAssignee } from "./lib/assignees";
import {
  BLOCKING, BUSINESS_TZ, DEFAULT_HOURS, expandRepeats, overlaps, type ItemType, type Repeat, type WorkingHours,
} from "./lib/schedule";
import { applyMove } from "./pipeline";

/** The Schedule (D-062): bookings with double-booking prevention, the calendar read, the unscheduled list, availability and settings.
 *  Tasks with a start and end also show on the calendar; they are written by opportunityTasks.ts. */

const MAX_ROWS = 2000;
const DAY = 86_400_000;
const REPEAT_HORIZON = 180 * DAY;

const typeV = v.union(v.literal("consultation"), v.literal("visit"), v.literal("event"), v.literal("reminder"));
const statusV = v.union(v.literal("upcoming"), v.literal("completed"), v.literal("confirmed"));
const repeatV = v.union(v.literal("none"), v.literal("daily"), v.literal("weekdays"), v.literal("weekly"), v.literal("monthly"));

const fmt = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);

function checkFields(f: { title: string; start: number; end: number; anytime: boolean }) {
  const title = f.title.trim();
  if (title.length < 1 || title.length > 200) throw new ConvexError("A title needs 1 to 200 characters.");
  if (!Number.isFinite(f.start) || !Number.isFinite(f.end)) throw new ConvexError("Pick a start and an end.");
  if (!f.anytime && f.end <= f.start) throw new ConvexError("The end has to be after the start.");
  return title;
}

type Busy = { id: Id<"calendarEvents">; userId: Id<"users">; title: string; start: number; end: number };

/** The blocking items of the given people in [from, to), repeats expanded. External calendars plug in at `externalBusy`. */
async function busyFor(ctx: QueryCtx, businessId: Id<"businesses">, userIds: readonly Id<"users">[], from: number, to: number): Promise<Busy[]> {
  const rows = await ctx.db.query("calendarEvents").withIndex("by_business_and_start", (q) => q.eq("businessId", businessId).lt("start", to)).order("desc").take(MAX_ROWS);
  const out: Busy[] = [];
  for (const e of rows) {
    if (!(BLOCKING as readonly string[]).includes(e.type) || e.anytime) continue;
    const who = e.assigneeIds.filter((u) => userIds.includes(u));
    if (who.length === 0) continue;
    for (const o of expandRepeats(e, from, to, BUSINESS_TZ)) for (const userId of who) out.push({ id: e._id, userId, title: e.title, start: o.start, end: o.end });
  }
  return out;
}

/** Zoho Calendar's busy times for these people. Not connected yet (a later step), so nothing is added. */
export function externalBusy(): Busy[] {
  return [];
}

/** Throws if any of the people already has a blocking item that overlaps (any occurrence of) the new one. */
async function checkConflicts(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  f: { type: ItemType; start: number; end: number; anytime: boolean; assigneeIds: Id<"users">[]; repeat: Repeat; repeatUntil?: number },
  ignoreId?: Id<"calendarEvents">,
) {
  if (!(BLOCKING as readonly string[]).includes(f.type) || f.anytime || f.assigneeIds.length === 0) return;
  const horizon = f.repeat === "none" ? f.end : Math.min(f.repeatUntil ?? Infinity, f.start + REPEAT_HORIZON);
  const mine = expandRepeats({ start: f.start, end: f.end, repeat: f.repeat, repeatUntil: f.repeatUntil }, f.start, horizon, BUSINESS_TZ);
  const busy = (await busyFor(ctx, businessId, f.assigneeIds, f.start, horizon)).filter((b) => b.id !== ignoreId);
  for (const o of mine) {
    const clash = busy.find((b) => overlaps(o, b));
    if (clash) {
      const who = (await ctx.db.get(clash.userId))?.name ?? "Someone";
      throw new ConvexError(`${who} is busy with "${clash.title}" ${fmt(clash.start)} to ${fmt(clash.end)}.`);
    }
  }
}

async function checkAssignees(ctx: MutationCtx, ids: Id<"users">[], businessId: Id<"businesses">) {
  for (const id of ids) await checkAssignee(ctx, id, businessId);
}

export const book = mutation({
  args: {
    businessId: v.id("businesses"), type: typeV, title: v.string(), start: v.number(), end: v.number(), anytime: v.optional(v.boolean()),
    assigneeIds: v.array(v.id("users")), opportunityId: v.optional(v.id("opportunities")), clientId: v.optional(v.id("clients")),
    notes: v.optional(v.string()), repeat: v.optional(repeatV), repeatUntil: v.optional(v.number()), now: v.number(),
  },
  handler: async (ctx, a) => {
    const staff = await requireEditor(ctx, a.businessId);
    const anytime = a.anytime ?? false;
    const title = checkFields({ title: a.title, start: a.start, end: a.end, anytime });
    const assigneeIds = [...new Set(a.assigneeIds)];
    await checkAssignees(ctx, assigneeIds, a.businessId);
    let project: Doc<"opportunities"> | null = null;
    if (a.opportunityId) {
      project = await ctx.db.get(a.opportunityId);
      if (project === null || project.businessId !== a.businessId) throw new ConvexError("That project is not in this business.");
    }
    const repeat = a.repeat ?? "none";
    await checkConflicts(ctx, a.businessId, { type: a.type, start: a.start, end: a.end, anytime, assigneeIds, repeat, repeatUntil: a.repeatUntil });
    const id = await ctx.db.insert("calendarEvents", {
      businessId: a.businessId, type: a.type, title, opportunityId: a.opportunityId, clientId: a.clientId ?? project?.clientId, start: a.start, end: a.end, anytime,
      assigneeIds, status: "upcoming", notes: a.notes ?? "", repeat, repeatUntil: a.repeatUntil, createdBy: staff.userId, createdAt: a.now,
    });
    // Booking a consultation for a project that was waiting for one moves it forward in the pipeline.
    if (a.type === "consultation" && project && project.stage === "Schedule Onsite Consultation") {
      await applyMove(ctx, project, "Onsite Consultation", staff, undefined, a.now);
    }
    return id;
  },
});

type Changes = { title?: string; start?: number; end?: number; anytime?: boolean; assigneeIds?: Id<"users">[]; notes?: string; repeat?: Repeat; repeatUntil?: number | null };

async function saveChanges(ctx: MutationCtx, event: Doc<"calendarEvents">, c: Changes) {
  const next = {
    title: c.title ?? event.title, start: c.start ?? event.start, end: c.end ?? event.end, anytime: c.anytime ?? event.anytime,
    assigneeIds: c.assigneeIds ? [...new Set(c.assigneeIds)] : event.assigneeIds, notes: c.notes ?? event.notes, repeat: c.repeat ?? event.repeat,
    repeatUntil: c.repeatUntil === undefined ? event.repeatUntil : (c.repeatUntil ?? undefined),
  };
  const title = checkFields(next);
  if (c.assigneeIds) await checkAssignees(ctx, next.assigneeIds, event.businessId);
  await checkConflicts(ctx, event.businessId, { type: event.type, ...next }, event._id);
  await ctx.db.patch(event._id, { ...next, title });
}

export const update = mutation({
  args: {
    id: v.id("calendarEvents"), title: v.optional(v.string()), start: v.optional(v.number()), end: v.optional(v.number()), anytime: v.optional(v.boolean()),
    assigneeIds: v.optional(v.array(v.id("users"))), notes: v.optional(v.string()), repeat: v.optional(repeatV), repeatUntil: v.optional(v.union(v.number(), v.null())), now: v.number(),
  },
  handler: async (ctx, { id, now: _now, ...changes }) => {
    const event = await ctx.db.get(id);
    if (event === null) throw new ConvexError("That item no longer exists.");
    await requireEditor(ctx, event.businessId);
    await saveChanges(ctx, event, changes);
  },
});

export const assign = mutation({
  args: { id: v.id("calendarEvents"), assigneeIds: v.array(v.id("users")), now: v.number() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (event === null) throw new ConvexError("That item no longer exists.");
    await requireEditor(ctx, event.businessId);
    await saveChanges(ctx, event, { assigneeIds: args.assigneeIds });
  },
});

export const setStatus = mutation({
  args: { id: v.id("calendarEvents"), status: statusV },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (event === null) throw new ConvexError("That item no longer exists.");
    await requireEditor(ctx, event.businessId);
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const remove = mutation({
  args: { id: v.id("calendarEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.id);
    if (event === null) return;
    await requireEditor(ctx, event.businessId);
    await ctx.db.delete(args.id);
  },
});

/* ---- Reading the calendar ---- */

export type ScheduleItem = {
  key: string;
  id: string;
  kind: ItemType | "task";
  title: string;
  start: number;
  end: number;
  anytime: boolean;
  assigneeIds: Id<"users">[];
  status: "upcoming" | "completed" | "confirmed";
  /** Worked out, never stored: not completed and already over. */
  overdue: boolean;
  repeat: Repeat;
  clientId: Id<"clients"> | undefined;
  clientName: string;
  opportunityId: Id<"opportunities"> | undefined;
  notes: string;
  occurrence: number;
  /** The whole item's first start and end (a repeat is one item), so moving one occurrence can move the series. */
  seriesStart: number;
  seriesEnd: number;
};

const STATUS_KEYS = ["completed", "overdue", "upcoming", "confirmed"] as const;

export const range = query({
  args: {
    businessId: v.id("businesses"), from: v.number(), to: v.number(),
    /** [] means all. Kinds: consultation, visit, event, reminder, task. */
    types: v.array(v.string()),
    /** [] means everyone. */
    assigneeIds: v.array(v.union(v.id("users"), v.literal("unassigned"))),
    /** [] means all: completed, overdue, upcoming, confirmed. */
    statuses: v.array(v.string()),
    now: v.number(),
  },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const events = await ctx.db.query("calendarEvents").withIndex("by_business_and_start", (q) => q.eq("businessId", a.businessId).lt("start", a.to)).order("desc").take(MAX_ROWS);
    const clients = new Map<Id<"clients">, string>();
    const clientName = async (id: Id<"clients"> | undefined) => {
      if (!id) return "";
      if (!clients.has(id)) clients.set(id, (await ctx.db.get(id))?.name ?? "");
      return clients.get(id)!;
    };
    const items: ScheduleItem[] = [];
    for (const e of events) {
      for (const o of expandRepeats(e, a.from, a.to, BUSINESS_TZ)) {
        items.push({
          key: `${e._id}:${o.occurrence}`, id: e._id, kind: e.type, title: e.title, start: o.start, end: o.end, anytime: e.anytime, assigneeIds: e.assigneeIds,
          status: e.status, overdue: e.status !== "completed" && o.end < a.now, repeat: e.repeat, clientId: e.clientId, clientName: await clientName(e.clientId),
          opportunityId: e.opportunityId, notes: e.notes, occurrence: o.occurrence, seriesStart: e.start, seriesEnd: e.end,
        });
      }
    }
    const tasks = await ctx.db.query("opportunityTasks").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_ROWS);
    for (const t of tasks) {
      if (t.startAt === undefined || t.endAt === undefined || !(t.startAt < a.to && t.endAt > a.from)) continue;
      const project = t.opportunityId ? await ctx.db.get(t.opportunityId) : null;
      items.push({
        key: `task:${t._id}`, id: t._id, kind: "task", title: t.title, start: t.startAt, end: t.endAt, anytime: false, assigneeIds: t.assigneeId ? [t.assigneeId] : [],
        status: t.done ? "completed" : "upcoming", overdue: !t.done && t.endAt < a.now, repeat: "none", clientId: project?.clientId, clientName: await clientName(project?.clientId),
        opportunityId: t.opportunityId, notes: "", occurrence: 0, seriesStart: t.startAt, seriesEnd: t.endAt,
      });
    }
    const wantedStatus = new Set(a.statuses.filter((s) => (STATUS_KEYS as readonly string[]).includes(s)));
    const shown = items.filter((i) => {
      if (a.types.length > 0 && !a.types.includes(i.kind)) return false;
      if (a.assigneeIds.length > 0 && !(i.assigneeIds.length === 0 ? a.assigneeIds.includes("unassigned") : i.assigneeIds.some((u) => a.assigneeIds.includes(u)))) return false;
      if (wantedStatus.size > 0) {
        const keys = [i.status === "completed" ? "completed" : "", i.overdue ? "overdue" : "", i.status === "upcoming" && !i.overdue ? "upcoming" : "", i.status === "confirmed" ? "confirmed" : ""];
        if (!keys.some((k) => k && wantedStatus.has(k))) return false;
      }
      return true;
    });
    shown.sort((x, y) => x.start - y.start || x.key.localeCompare(y.key));
    return { items: shown, capped: events.length >= MAX_ROWS };
  },
});

/** The Unscheduled panel: projects waiting for a consultation to be booked, and tasks with no time. */
export const unscheduled = query({
  args: { businessId: v.id("businesses"), sort: v.union(v.literal("oldest"), v.literal("newest")) },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const projects = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_ROWS);
    const rows: { kind: "request" | "task"; id: string; title: string; clientName: string; createdAt: number; opportunityId: Id<"opportunities"> | undefined; clientId: Id<"clients"> | undefined }[] = [];
    for (const p of projects) {
      if (p.pipeline !== "Sales" || p.stage !== "Schedule Onsite Consultation") continue;
      const booked = await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(20);
      if (booked.some((e) => e.type === "consultation")) continue;
      rows.push({ kind: "request", id: p._id, title: p.title, clientName: (await ctx.db.get(p.clientId))?.name ?? "", createdAt: p.requestedAt, opportunityId: p._id, clientId: p.clientId });
    }
    const tasks = await ctx.db.query("opportunityTasks").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_ROWS);
    for (const t of tasks) {
      if (t.done || t.startAt !== undefined) continue;
      const project = t.opportunityId ? await ctx.db.get(t.opportunityId) : null;
      rows.push({ kind: "task", id: t._id, title: t.title, clientName: project ? ((await ctx.db.get(project.clientId))?.name ?? "") : "", createdAt: t.createdAt, opportunityId: t.opportunityId, clientId: project?.clientId });
    }
    rows.sort((x, y) => (a.sort === "oldest" ? x.createdAt - y.createdAt : y.createdAt - x.createdAt));
    return rows;
  },
});

async function hoursOf(ctx: QueryCtx, businessId: Id<"businesses">): Promise<WorkingHours> {
  const row = await ctx.db.query("scheduleSettings").withIndex("by_business", (q) => q.eq("businessId", businessId)).first();
  return row ? { days: row.days, startMin: row.startMin, endMin: row.endMin } : DEFAULT_HOURS;
}

/** When the chosen people are busy (blocking items, repeats expanded), and the working hours, for "Show availability". */
export const availability = query({
  args: { businessId: v.id("businesses"), userIds: v.array(v.id("users")), from: v.number(), to: v.number() },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const busy = [...(await busyFor(ctx, a.businessId, a.userIds, a.from, a.to)), ...externalBusy()];
    return { hours: await hoursOf(ctx, a.businessId), busy: busy.map((b) => ({ id: b.id, userId: b.userId, title: b.title, start: b.start, end: b.end })) };
  },
});

export const settings = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    return hoursOf(ctx, a.businessId);
  },
});

export const saveSettings = mutation({
  args: { businessId: v.id("businesses"), days: v.array(v.number()), startMin: v.number(), endMin: v.number() },
  handler: async (ctx, a) => {
    await requireEditor(ctx, a.businessId);
    const days = [...new Set(a.days)].sort();
    if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ConvexError("Pick at least one working day.");
    if (!Number.isInteger(a.startMin) || !Number.isInteger(a.endMin) || a.startMin < 0 || a.endMin > 1440 || a.startMin >= a.endMin) {
      throw new ConvexError("The working day has to end after it starts.");
    }
    const row = await ctx.db.query("scheduleSettings").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    if (row) await ctx.db.patch(row._id, { days, startMin: a.startMin, endMin: a.endMin });
    else await ctx.db.insert("scheduleSettings", { businessId: a.businessId, days, startMin: a.startMin, endMin: a.endMin });
  },
});


/** More menu > Reschedule and reassign: shift several items and/or give them to other people. All or nothing: a clash in any item
 *  (a mutation that throws changes nothing) leaves every item as it was. */
export const bulkReschedule = mutation({
  args: { businessId: v.id("businesses"), ids: v.array(v.id("calendarEvents")), shiftMs: v.optional(v.number()), assigneeIds: v.optional(v.array(v.id("users"))), now: v.number() },
  handler: async (ctx, a) => {
    await requireEditor(ctx, a.businessId);
    if (a.ids.length === 0) throw new ConvexError("Pick at least one item.");
    if ((a.shiftMs ?? 0) === 0 && a.assigneeIds === undefined) throw new ConvexError("Choose a new time or new people.");
    for (const id of new Set(a.ids)) {
      const event = await ctx.db.get(id);
      if (event === null || event.businessId !== a.businessId) throw new ConvexError("One of the items is not in this business.");
      const shift = a.shiftMs ?? 0;
      await saveChanges(ctx, event, { start: event.start + shift, end: event.end + shift, ...(a.assigneeIds ? { assigneeIds: a.assigneeIds } : {}), ...(event.repeatUntil !== undefined && shift ? { repeatUntil: event.repeatUntil + shift } : {}) });
    }
    return a.ids.length;
  },
});

/** For the booking form's project picker: Sales projects of the business, newest first, or the best matches for a search. */
export const projectOptions = query({
  args: { businessId: v.id("businesses"), search: v.string() },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const text = a.search.trim();
    const docs = text
      ? await ctx.db.query("opportunities").withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", a.businessId).eq("pipeline", "Sales")).take(20)
      : await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(20);
    const out = [];
    for (const p of docs) {
      if (p.pipeline !== "Sales" || p.outcome !== undefined) continue;
      out.push({ id: p._id, title: p.title, code: p.code, stage: p.stage, clientId: p.clientId, clientName: (await ctx.db.get(p.clientId))?.name ?? "" });
    }
    return out;
  },
});
