import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { zonedToInstant, zonedWallClock } from "../shared/zonedTime";
import { queueBookingEmail } from "./lib/bookingEmailQueue";
import { mirrorChanged, mirrorRemoved } from "./lib/mirror";
import { systemMove } from "./lib/systemMove";
import { busyFor, checkConflicts } from "./schedule";
import { businessZone } from "./settings";

/* The sales form (forms app, /visit) books its consultations and follow-up visits on the CRM calendar, not in Jobber (D-126; Jobber is
   ending, D-123). The forms' actions in convex/projects/consultation.ts call these; they never read a session themselves, the forms action has
   already checked who is signed in and that the lead is theirs. A booking lands on the Schedule at once, goes to the person's Zoho Calendar
   when they are connected, and moves the project to Onsite Consultation, the same as a booking made in the CRM. */

/** The CRM project made from this forms record (D-045), if any. */
const projectOf = (ctx: QueryCtx, formsProjectId: Id<"projects">) =>
  ctx.db.query("opportunities").withIndex("by_sourceProjectId", (q) => q.eq("sourceProjectId", formsProjectId)).first();

/** The CRM user with this email who works in the business, if any. */
async function personFor(ctx: QueryCtx, email: string, businessId: Id<"businesses">): Promise<Doc<"users"> | null> {
  const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase())).unique();
  if (user === null || (user.status !== "active" && user.status !== "invited")) return null;
  return user.roles.includes("admin") || user.businessIds.includes(businessId) ? user : null;
}

/** What the salesperson already has on the CRM calendar that day, as minutes from midnight, for the sales form's clash check and its list. */
export const busyOn = internalQuery({
  args: { formsProjectId: v.id("projects"), email: v.string(), date: v.string(), exceptEventId: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const project = await projectOf(ctx, a.formsProjectId);
    if (project === null) return [];
    const person = await personFor(ctx, a.email, project.businessId);
    if (person === null) return [];
    const tz = await businessZone(ctx);
    const dayStart = zonedToInstant(a.date, "00:00", tz).getTime();
    const items = await busyFor(ctx, project.businessId, [person._id], dayStart, dayStart + 2 * 86_400_000);
    return items
      .filter((b) => b.id !== a.exceptEventId)
      .map((b) => ({ id: b.id as string, start: Math.round((b.start - dayStart) / 60_000), end: Math.round((b.end - dayStart) / 60_000), title: b.title, external: b.external }));
  },
});

/** Books, or moves, the sales form's visit on the CRM calendar. Returns the CRM item's id, or null when the record has no CRM project. */
export const book = internalMutation({
  args: {
    formsProjectId: v.id("projects"), email: v.string(), name: v.string(), date: v.string(), time: v.string(), minutes: v.number(), instructions: v.string(),
    /** 0 is the consultation; 1 and up are follow-up visits. */
    visit: v.number(),
    /** The item this visit is already booked as (the forms' stored id), to move it rather than add a second. */
    existingId: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<Id<"calendarEvents"> | null> => {
    const project = await projectOf(ctx, a.formsProjectId);
    if (project === null) return null;
    const tz = await businessZone(ctx);
    const start = zonedToInstant(a.date, a.time, tz).getTime();
    const end = start + a.minutes * 60_000;
    const person = await personFor(ctx, a.email, project.businessId);
    const assigneeIds = person ? [person._id] : [];
    const now = Date.now();
    const existingId = a.existingId ? ctx.db.normalizeId("calendarEvents", a.existingId) : null;
    const existing = existingId ? await ctx.db.get(existingId) : null;
    const type = a.visit === 0 ? ("consultation" as const) : ("visit" as const);
    await checkConflicts(ctx, project.businessId, { type, start, end, anytime: false, assigneeIds, repeat: "none" }, existing?._id);

    let id: Id<"calendarEvents">;
    if (existing && existing.opportunityId === project._id && existing.status !== "lost") {
      await ctx.db.patch(existing._id, { start, end, anytime: false, assigneeIds, notes: a.instructions, status: "upcoming", updatedAt: now });
      id = existing._id;
    } else {
      const creator = person?._id ?? project.salespersonId ?? (await ctx.db.query("users").first())?._id;
      if (!creator) return null;
      id = await ctx.db.insert("calendarEvents", {
        businessId: project.businessId, type, title: `${a.visit === 0 ? "Consultation" : `Follow-up visit ${a.visit}`}: ${project.title}`,
        opportunityId: project._id, clientId: project.clientId, start, end, anytime: false, assigneeIds, status: "upcoming", notes: a.instructions,
        repeat: "none", createdBy: creator, createdAt: now, updatedAt: now,
      });
    }
    await mirrorChanged(ctx, "event", id);
    // A consultation booked for a project still at the start of the pipeline moves it on, as a booking made in the CRM does (D-085).
    if (type === "consultation" && project.pipeline === "Sales" && (project.stage === "New Request" || project.stage === "Schedule Onsite Consultation")) {
      await systemMove(ctx, project, "Onsite Consultation", a.name, now, { onlyForward: true, ...(person ? { byUserId: person._id } : {}) });
    }
    if (type === "consultation") await queueBookingEmail(ctx, id);
    return id;
  },
});

/** The sales form cancelled its booking: the CRM item goes too (and its Zoho copy). Ids that are not CRM items (old Jobber bookings) are ignored. */
export const cancel = internalMutation({
  args: { existingId: v.string() },
  handler: async (ctx, a) => {
    const id = ctx.db.normalizeId("calendarEvents", a.existingId);
    const event = id ? await ctx.db.get(id) : null;
    if (event === null || event.status === "completed") return;
    await mirrorRemoved(ctx, "event", event._id);
    await ctx.db.delete(event._id);
  },
});

/** Where the sales form's booking stands on the CRM calendar now: its wall-clock date, time and length, gone, or not a CRM item at all. */
export const where = internalQuery({
  args: { existingId: v.string() },
  handler: async (ctx, a) => {
    const id = ctx.db.normalizeId("calendarEvents", a.existingId);
    if (id === null) return { state: "unknown" as const };
    const event = await ctx.db.get(id);
    if (event === null || event.status === "lost") return { state: "missing" as const };
    const tz = await businessZone(ctx);
    const begins = zonedWallClock(new Date(event.start), tz);
    return { state: "scheduled" as const, date: begins.date, time: begins.time, minutes: Math.max(15, Math.round((event.end - event.start) / 60_000)) };
  },
});
