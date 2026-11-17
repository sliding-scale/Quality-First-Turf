import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { jobberChanged, jobberRemoved } from "./jobberHooks";

/* The two calls the Schedule and task code make when an item changes (D-069). Both do nothing at all while nobody has connected a Zoho
   Calendar, so a business that does not use it pays nothing. */

type Kind = "event" | "task";

const anyConnection = async (ctx: MutationCtx) => (await ctx.db.query("calendarConnections").first()) !== null;

/** An item was created or changed (or its people changed): send it to the assigned people's Zoho Calendars. */
export async function mirrorChanged(ctx: MutationCtx, kind: Kind, id: Id<"calendarEvents"> | Id<"opportunityTasks">) {
  // A consultation also goes to Jobber (D-085), whether or not anyone uses Zoho.
  if (kind === "event") await jobberChanged(ctx, id as Id<"calendarEvents">);
  if (!(await anyConnection(ctx))) return;
  await ctx.scheduler.runAfter(0, internal.crm.calendarSync.pushItem, { kind, id });
}

/** An item was deleted (or taken off the calendar): delete its Zoho events and forget the links. */
export async function mirrorRemoved(ctx: MutationCtx, kind: Kind, id: Id<"calendarEvents"> | Id<"opportunityTasks">) {
  if (kind === "event") {
    const event = await ctx.db.get(id as Id<"calendarEvents">);
    if (event !== null) await jobberRemoved(ctx, event);
  }
  const links = kind === "event"
    ? await ctx.db.query("calendarLinks").withIndex("by_event", (q) => q.eq("eventId", id as Id<"calendarEvents">)).take(50)
    : await ctx.db.query("calendarLinks").withIndex("by_task", (q) => q.eq("taskId", id as Id<"opportunityTasks">)).take(50);
  if (links.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.crm.calendarSync.pushDelete, { links: links.map((l) => ({ connectionId: l.connectionId, zohoUid: l.zohoUid, etag: l.etag })) });
  for (const l of links) await ctx.db.delete(l._id);
}
