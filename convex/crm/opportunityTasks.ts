import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireAdmin, requireBusiness, requireEditor } from "./lib/access";
import { checkAssignee } from "./lib/assignees";
import { attachmentLinks, checkNoteFiles, noteFilesArg } from "./lib/noteFiles";
import { mirrorChanged, mirrorRemoved } from "./lib/mirror";
import { toggleCheckbox } from "./lib/noteText";
import { notifyMentions } from "./lib/mentionNotify";

/** Tasks and notes on a project: the pipeline card panel and the Tasks tab (D-061). */

const MAX_TASKS = 2000;

function cleanTitle(raw: string): string {
  const title = raw.trim();
  if (title.length < 1 || title.length > 200) throw new ConvexError("A task title needs 1 to 200 characters.");
  return title;
}

export const listForProject = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) return { tasks: [], notes: [] };
    await requireBusiness(ctx, project.businessId);
    const tasks = await ctx.db.query("opportunityTasks").withIndex("by_opportunity", (q) => q.eq("opportunityId", args.id)).take(200);
    const notes = await ctx.db.query("opportunityNotes").withIndex("by_opportunity", (q) => q.eq("opportunityId", args.id)).take(200);
    // Open tasks first, soonest due first (undated last); notes newest first.
    tasks.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt);
    notes.sort((a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime);
    const shaped = [];
    for (const n of notes) shaped.push({ _id: n._id, text: n.text, author: n.author, createdAt: n.createdAt, files: await attachmentLinks(ctx, n.attachments) });
    return { tasks, notes: shaped };
  },
});

export const addTask = mutation({
  args: { id: v.id("opportunities"), title: v.string(), assigneeId: v.optional(v.id("users")), dueAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireEditor(ctx, project.businessId);
    const title = cleanTitle(args.title);
    await checkAssignee(ctx, args.assigneeId, project.businessId);
    return ctx.db.insert("opportunityTasks", {
      opportunityId: args.id, businessId: project.businessId, title, assigneeId: args.assigneeId, dueAt: args.dueAt, done: false, createdAt: Date.now(),
    });
  },
});

/** An Admin makes a task that belongs to no project and gives it to anyone on the business (the Tasks page's New task). */
export const createTask = mutation({
  args: { businessId: v.id("businesses"), title: v.string(), assigneeId: v.optional(v.id("users")), dueAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if ((await ctx.db.get(args.businessId)) === null) throw new ConvexError("That business no longer exists.");
    const title = cleanTitle(args.title);
    await checkAssignee(ctx, args.assigneeId, args.businessId);
    return ctx.db.insert("opportunityTasks", { businessId: args.businessId, title, assigneeId: args.assigneeId, dueAt: args.dueAt, done: false, createdAt: Date.now() });
  },
});

/** Gives a task a start and an end so it shows on the Schedule, or clears them (both null) so it is unscheduled again.
 *  `assigneeId`, when sent, gives the task to that person (or to nobody, when null). A task has one assignee. */
export const setTime = mutation({
  args: {
    taskId: v.id("opportunityTasks"),
    startAt: v.union(v.number(), v.null()),
    endAt: v.union(v.number(), v.null()),
    assigneeId: v.optional(v.union(v.id("users"), v.null())),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw new ConvexError("That task no longer exists.");
    await requireEditor(ctx, task.businessId);
    const who: { assigneeId?: Id<"users"> } = {};
    if (args.assigneeId !== undefined) {
      who.assigneeId = args.assigneeId ?? undefined;
      await checkAssignee(ctx, who.assigneeId, task.businessId);
    }
    if (args.startAt === null && args.endAt === null) {
      await ctx.db.patch(args.taskId, { ...who, startAt: undefined, endAt: undefined, updatedAt: Date.now() });
      await mirrorRemoved(ctx, "task", args.taskId);
      return;
    }
    if (args.startAt === null || args.endAt === null) throw new ConvexError("Give the task a start and an end.");
    if (args.endAt <= args.startAt) throw new ConvexError("The end has to be after the start.");
    await ctx.db.patch(args.taskId, { ...who, startAt: args.startAt, endAt: args.endAt, updatedAt: Date.now() });
    await mirrorChanged(ctx, "task", args.taskId);
  },
});

export const setDone = mutation({
  args: { taskId: v.id("opportunityTasks"), done: v.boolean() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (task === null) throw new ConvexError("That task no longer exists.");
    await requireEditor(ctx, task.businessId);
    await ctx.db.patch(args.taskId, { done: args.done, completedAt: args.done ? Date.now() : undefined });
  },
});

export const addNote = mutation({
  args: { id: v.id("opportunities"), text: v.string(), files: noteFilesArg },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireEditor(ctx, project.businessId);
    const text = args.text.trim();
    if (text.length > 5000) throw new ConvexError("Notes can be up to 5,000 characters.");
    const attachments = await checkNoteFiles(ctx, args.files);
    if (!text && attachments.length === 0) throw new ConvexError("Write something first.");
    const now = Date.now();
    const noteId = await ctx.db.insert("opportunityNotes", { opportunityId: args.id, text, author: staff.name, createdAt: now, ...(attachments.length ? { attachments } : {}) });
    await notifyMentions(ctx, { businessId: project.businessId, staff, text, target: { kind: "project", opportunityId: args.id }, now });
    return noteId;
  },
});

/** The Tasks tab. The counts and `rows` cover the open tasks (All, Overdue, Today, Upcoming) for the assignee chosen; `completed` lists the
 *  finished ones, most recently finished first, and stays in the Completed section. */
export const listAll = query({
  args: { businessId: v.id("businesses"), assigneeId: v.optional(v.id("users")), now: v.number(), todayStart: v.number(), todayEnd: v.number() },
  handler: async (ctx, a) => {
    await requireBusiness(ctx, a.businessId);
    const tasks = await ctx.db.query("opportunityTasks").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).take(MAX_TASKS);
    const mine = tasks.filter((t) => a.assigneeId === undefined || t.assigneeId === a.assigneeId);
    const open = mine.filter((t) => !t.done);
    const finished = mine.filter((t) => t.done).sort((x, y) => (y.completedAt ?? 0) - (x.completedAt ?? 0) || y._creationTime - x._creationTime);
    const projects = new Map<Id<"opportunities">, { projectTitle: string; code: string; clientName: string }>();
    const none = { projectTitle: "", code: "", clientName: "" };
    const shape = async (t: (typeof tasks)[number]) => {
      const pid = t.opportunityId;
      if (pid !== undefined && !projects.has(pid)) {
        const p = await ctx.db.get(pid);
        const c = p ? await ctx.db.get(p.clientId) : null;
        projects.set(pid, { projectTitle: p?.title ?? "", code: p?.code ?? "", clientName: c?.name ?? "" });
      }
      return { id: t._id, title: t.title, dueAt: t.dueAt, assigneeId: t.assigneeId, opportunityId: pid, completedAt: t.completedAt, startAt: t.startAt, endAt: t.endAt, ...(pid === undefined ? none : projects.get(pid)!) };
    };
    const rows = [];
    for (const t of open) rows.push(await shape(t));
    rows.sort((x, y) => (x.dueAt ?? Infinity) - (y.dueAt ?? Infinity));
    const completed = [];
    for (const t of finished.slice(0, 200)) completed.push(await shape(t));
    const dated = open.filter((t) => t.dueAt !== undefined);
    return {
      counts: {
        all: open.length,
        overdue: dated.filter((t) => t.dueAt! < a.todayStart).length,
        today: dated.filter((t) => t.dueAt! >= a.todayStart && t.dueAt! <= a.todayEnd).length,
        upcoming: dated.filter((t) => t.dueAt! > a.todayEnd).length,
        completed: finished.length,
      },
      rows,
      completed,
    };
  },
});

/** Ticks or unticks a checkbox in a saved project note. */
export const toggleNoteLine = mutation({
  args: { noteId: v.id("opportunityNotes"), line: v.number() },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (note === null) throw new ConvexError("That note no longer exists.");
    const project = await ctx.db.get(note.opportunityId);
    if (project === null) throw new ConvexError("That project no longer exists.");
    await requireEditor(ctx, project.businessId);
    const next = toggleCheckbox(note.text, args.line);
    if (next === null) throw new ConvexError("That line is not a checkbox.");
    await ctx.db.patch(note._id, { text: next });
    return null;
  },
});
