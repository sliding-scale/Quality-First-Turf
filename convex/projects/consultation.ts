import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { clockFromMinutes, overlaps } from "../shared/zonedTime";
import { consultationValidator } from "../schema";
import { salespersonName } from "../sales/accounts";
import { saveVisitSnapshot } from "./visits";

/* The sales form's Schedule consultation (and follow-up visits). Bookings go on the Launchpad CRM's calendar, not in Jobber (D-126 in
   CRM/docs/decisions.md; the Jobber subscription is ending, D-123): the CRM item is made by crm/formsConsultation, shows on the Schedule and
   the person's Zoho Calendar at once, and moves the project to Onsite Consultation. The booking's CRM id is kept in `assessmentId`, the field
   that used to hold Jobber's id, so the rest of the sales form is unchanged. Older bookings still carry a Jobber id and are left as they are. */

type Who = { email: string; name: string };
type Booking = { _id: Doc<"projects">["_id"]; consultation: NonNullable<Doc<"projects">["consultation"]> };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Which visit a booking is for. A project whose current visit is saved complete is waiting for its next
 * follow-up, so booking then starts that follow-up; otherwise it books or moves the current visit.
 */
function targetVisit(project: Doc<"projects">): { visit: number; advancing: boolean } {
  const current = project.visitNumber ?? 0;
  const advancing = project.visitedAt !== undefined;
  return { visit: advancing ? current + 1 : current, advancing };
}

export const record = internalMutation({
  args: {
    projectId: v.id("projects"),
    consultation: v.union(consultationValidator, v.null()),
    /** Starts the next follow-up: the finished visit is kept as its card and the new booking takes its place. */
    advance: v.optional(v.boolean()),
    /** The Jobber request created for a follow-up's appointment (older bookings only). */
    followUpRequestId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.advance === true) {
      const project = await ctx.db.get("projects", args.projectId);
      if (project === null || project.visitedAt === undefined) return null;
      const visit = project.visitNumber ?? 0;
      // Projects finished before visit cards existed get theirs now, before the next visit starts.
      const card = await ctx.db
        .query("visitSnapshots")
        .withIndex("by_projectId_and_visit", (q) => q.eq("projectId", args.projectId).eq("visit", visit))
        .first();
      if (card === null) await saveVisitSnapshot(ctx, args.projectId, undefined);
      await ctx.db.patch("projects", args.projectId, {
        consultation: args.consultation ?? undefined,
        visitNumber: visit + 1,
        visitedAt: undefined,
        followUpRequestId: args.followUpRequestId,
      });
      return null;
    }
    await ctx.db.patch("projects", args.projectId, {
      consultation: args.consultation ?? undefined,
      ...(args.followUpRequestId === undefined ? {} : { followUpRequestId: args.followUpRequestId }),
    });
    return null;
  },
});

/** Consultations the app already holds for a salesperson on a day, so a clash is caught even for a project with no CRM item. */
export const heldOn = internalQuery({
  args: { email: v.string(), date: v.string(), exceptProjectId: v.id("projects") },
  returns: v.array(
    v.object({ time: v.string(), minutes: v.number(), title: v.string(), assessmentId: v.string() }),
  ),
  handler: async (ctx, args) => {
    const recent = await ctx.db.query("projects").order("desc").take(500);
    return recent.flatMap((project) =>
      project._id !== args.exceptProjectId &&
      project.assignedTo === args.email &&
      project.consultation?.date === args.date
        ? [
            {
              time: project.consultation.time,
              minutes: project.consultation.minutes,
              title: `${project.firstName} ${project.lastName}`.trim() || "Another consultation",
              assessmentId: project.consultation.assessmentId,
            },
          ]
        : [],
    );
  },
});

async function signedInProject(
  ctx: ActionCtx,
  sessionToken: string,
  projectId: Doc<"projects">["_id"],
): Promise<{ project: Doc<"projects">; who: Who }> {
  const who = await ctx.runQuery(internal.sales.queries.identity, { sessionToken });
  if (who === null) throw new ConvexError("Sign in again to schedule a consultation.");
  const loaded = await ctx.runQuery(internal.projects.queries.get, { projectId });
  if (loaded === null) throw new ConvexError("Project not found.");
  const project = loaded.project;
  if (project.assignedTo === undefined) {
    throw new ConvexError("Assign this lead to yourself before booking a consultation.");
  }
  if (project.assignedTo !== who.email) {
    throw new ConvexError(`This lead is assigned to ${salespersonName(project.assignedTo)}, so only they can manage it.`);
  }
  return { project, who };
}

type Busy = { start: number; end: number; title: string; isBreak: boolean };

/** What the salesperson already has on `date`, as minutes from midnight: the CRM calendar (their bookings and Zoho busy times) and the app's own bookings. */
async function busyOn(
  ctx: ActionCtx,
  args: { who: Who; date: string; projectId: Doc<"projects">["_id"]; ownId: string | null },
): Promise<Busy[]> {
  const busy: Busy[] = [];
  const crm: { id: string; start: number; end: number; title: string; external: boolean }[] = await ctx.runQuery(internal.crm.formsConsultation.busyOn, {
    formsProjectId: args.projectId,
    email: args.who.email,
    date: args.date,
    ...(args.ownId ? { exceptEventId: args.ownId } : {}),
  });
  // Zoho busy times are a warning on the CRM Schedule, never a refusal, so they are left out here.
  for (const item of crm) if (!item.external) busy.push({ start: item.start, end: item.end, title: item.title, isBreak: false });
  const held = await ctx.runQuery(internal.projects.consultation.heldOn, {
    email: args.who.email,
    date: args.date,
    exceptProjectId: args.projectId,
  });
  const onCalendar = new Set(crm.map((item) => item.id));
  for (const item of held) {
    if (onCalendar.has(item.assessmentId)) continue; // booked from here and already on the CRM calendar: count it once
    const start = Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3, 5));
    busy.push({ start, end: start + item.minutes, title: item.title, isBreak: false });
  }
  return busy.sort((left, right) => left.start - right.start);
}

/** The signed-in salesperson's commitments on a day, for the booking form to show. */
export const busy = action({
  args: { sessionToken: v.string(), projectId: v.id("projects"), date: v.string() },
  returns: v.array(v.object({ start: v.string(), end: v.string(), title: v.string(), isBreak: v.boolean() })),
  handler: async (ctx, args) => {
    if (!datePattern.test(args.date)) return [];
    const { project, who } = await signedInProject(ctx, args.sessionToken, args.projectId);
    const items = await busyOn(ctx, { who, date: args.date, projectId: args.projectId, ownId: project.consultation?.assessmentId ?? null });
    return items
      .filter((item) => item.end > 0 && item.start < 1440)
      .map((item) => ({
        start: clockFromMinutes(Math.max(item.start, 0)),
        end: clockFromMinutes(Math.min(item.end, 1440)),
        title: item.title,
        isBreak: item.isBreak,
      }));
  },
});

/** Books, or moves, the consultation (or the next follow-up visit) on the CRM calendar. */
export const book = action({
  args: {
    sessionToken: v.string(),
    projectId: v.id("projects"),
    date: v.string(),
    time: v.string(),
    minutes: v.number(),
    instructions: v.string(),
  },
  returns: consultationValidator,
  handler: async (ctx, args): Promise<Infer<typeof consultationValidator>> => {
    if (!datePattern.test(args.date) || !timePattern.test(args.time)) {
      throw new ConvexError("Choose a date and a time.");
    }
    if (!Number.isInteger(args.minutes) || args.minutes < 15 || args.minutes > 480) {
      throw new ConvexError("Choose how long the visit will take.");
    }
    if (args.date < new Date(Date.now() - 36 * 3_600_000).toISOString().slice(0, 10)) {
      throw new ConvexError("Choose a date that has not passed.");
    }
    const instructions = args.instructions.trim().slice(0, 1000);
    const { project, who } = await signedInProject(ctx, args.sessionToken, args.projectId);
    const { visit, advancing } = targetVisit(project);
    // Moving the current visit keeps its CRM item; starting the next follow-up makes a new one.
    const ownId = advancing ? null : (project.consultation?.assessmentId ?? null);

    // The salesperson cannot be in two places at once. Zoho busy times are only a warning on the CRM Schedule, so they are skipped here too.
    const items = await busyOn(ctx, { who, date: args.date, projectId: args.projectId, ownId });
    const start = Number(args.time.slice(0, 2)) * 60 + Number(args.time.slice(3, 5));
    const clash = items.find((item) => overlaps(start, start + args.minutes, item.start, item.end));
    if (clash !== undefined) {
      throw new ConvexError(
        `${who.name} is already booked from ${clockFromMinutes(clash.start)} to ${clockFromMinutes(Math.min(clash.end, 1440))} (${clash.title}). Choose another time.`,
      );
    }

    // The CRM checks the clash again and refuses it with its own message if someone booked the same time in between.
    const eventId: Id<"calendarEvents"> | null = await ctx.runMutation(internal.crm.formsConsultation.book, {
      formsProjectId: args.projectId,
      email: who.email,
      name: who.name,
      date: args.date,
      time: args.time,
      minutes: args.minutes,
      instructions,
      visit,
      ...(ownId ? { existingId: ownId } : {}),
    });

    const consultation: Infer<typeof consultationValidator> = {
      // A record that has no CRM project yet keeps the booking here only.
      assessmentId: eventId ?? `app-${Date.now()}`,
      date: args.date,
      time: args.time,
      minutes: args.minutes,
      instructions,
      salesperson: who.name,
    };
    await ctx.runMutation(internal.projects.consultation.record, {
      projectId: args.projectId,
      consultation,
      advance: advancing,
    });
    return consultation;
  },
});

export const cancel = action({
  args: { sessionToken: v.string(), projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await signedInProject(ctx, args.sessionToken, args.projectId);
    // A finished visit has nothing booked to cancel; its next follow-up has not been scheduled yet.
    if (project.consultation === undefined || project.visitedAt !== undefined) return null;
    await ctx.runMutation(internal.crm.formsConsultation.cancel, { existingId: project.consultation.assessmentId });
    await ctx.runMutation(internal.projects.consultation.record, {
      projectId: args.projectId,
      consultation: null,
    });
    return null;
  },
});

/** Brings one project's stored booking in line with the CRM calendar, whoever moved or removed it there. */
async function syncProject(ctx: ActionCtx, project: Booking): Promise<"unchanged" | "moved" | "removed"> {
  const remote: { state: "unknown" } | { state: "missing" } | { state: "scheduled"; date: string; time: string; minutes: number } = await ctx.runQuery(internal.crm.formsConsultation.where, { existingId: project.consultation.assessmentId });
  if (remote.state === "unknown") return "unchanged"; // an older Jobber booking, or one kept here only
  if (remote.state === "missing") {
    await ctx.runMutation(internal.projects.consultation.record, { projectId: project._id, consultation: null });
    return "removed";
  }
  const current = project.consultation;
  if (remote.date === current.date && remote.time === current.time && remote.minutes === current.minutes) return "unchanged";
  await ctx.runMutation(internal.projects.consultation.record, {
    projectId: project._id,
    consultation: { ...current, date: remote.date, time: remote.time, minutes: remote.minutes },
  });
  return "moved";
}

/** Called when a project is opened, so what the salesperson sees matches the CRM calendar right now. */
export const refresh = action({
  args: { sessionToken: v.string(), projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const signedIn = await ctx.runQuery(internal.sales.queries.active, { sessionToken: args.sessionToken });
    if (!signedIn) return null;
    const loaded = await ctx.runQuery(internal.projects.queries.get, { projectId: args.projectId });
    const consultation = loaded?.project.consultation;
    if (loaded === null || consultation === undefined || loaded.project.visitedAt !== undefined) return null;
    await syncProject(ctx, { _id: loaded.project._id, consultation });
    return null;
  },
});

export const booked = internalQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("projects"), consultation: consultationValidator })),
  handler: async (ctx) => {
    const recent = await ctx.db.query("projects").order("desc").take(500);
    return recent.flatMap((project) =>
      project.consultation === undefined || project.visitedAt !== undefined ? [] : [{ _id: project._id, consultation: project.consultation }],
    );
  },
});

/** Scheduled sweep (kept as a safety net): bookings moved or removed on the CRM calendar flow back into the app. */
export const syncAll = internalAction({
  args: {},
  returns: v.object({ checked: v.number(), moved: v.number(), removed: v.number() }),
  handler: async (ctx) => {
    const bookings: Booking[] = await ctx.runQuery(internal.projects.consultation.booked, {});
    const totals = { checked: 0, moved: 0, removed: 0 };
    for (const booking of bookings) {
      try {
        const result = await syncProject(ctx, booking);
        totals.checked += 1;
        if (result === "moved") totals.moved += 1;
        if (result === "removed") totals.removed += 1;
      } catch (failure) {
        console.error(`Could not sync consultation for ${booking._id}`, failure);
      }
    }
    return totals;
  },
});
