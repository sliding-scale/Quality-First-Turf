import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { clockFromMinutes, minutesFromDayStart, overlaps, zonedToInstant, zonedWallClock } from "../../lib/zoned-time";
import { createRequest, jobberGraphql } from "../jobber/client";
import { consultationValidator } from "../schema";
import { salespersonName } from "../sales/accounts";
import { accessTokenFor } from "./actions";
import { saveVisitSnapshot } from "./visits";
import { formatShortCode } from "../../lib/errors";
import { visitLabel } from "../../lib/visits";

type MutationErrors = { userErrors: { message: string }[] };
type Who = { email: string; name: string };
type Booking = { _id: Doc<"projects">["_id"]; consultation: NonNullable<Doc<"projects">["consultation"]> };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Adds minutes to a wall-clock date and time without any time zone maths; Jobber applies the account's zone. */
function endOf(date: string, time: string, minutes: number): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`,
    time: `${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}`,
  };
}

function schedule(date: string, time: string, minutes: number, timezone: string, teamMemberId: string | null) {
  return {
    startAt: { date, time, timezone },
    endAt: { ...endOf(date, time, minutes), timezone },
    notifyTeam: false,
    ...(teamMemberId === null ? {} : { teamMemberIdsToAssign: [teamMemberId] }),
  };
}

function problem(errors: { message: string }[]): string | null {
  return errors.length === 0 ? null : errors.map((error) => error.message).join("; ");
}

/** The title Jobber shows on the request and its calendar entry: which visit, who is going, and for whom. */
function jobberTitle(label: string, salesperson: string, project: Doc<"projects">): string {
  const homeowner = `${project.firstName} ${project.lastName}`.trim();
  const code = formatShortCode(project.shortCode);
  return [label, salesperson, homeowner, code].filter((part) => part !== "").join(" · ").slice(0, 200);
}

/** The appointment notes Jobber shows: the visit and salesperson first, then the project, then whatever was typed. */
function jobberNotes(label: string, salesperson: string, project: Doc<"projects">, notes: string): string {
  const address = [project.street1, project.street2, project.city, project.state, project.zip]
    .filter((part) => part.trim() !== "")
    .join(", ");
  const details = [
    ["Homeowner", `${project.firstName} ${project.lastName}`.trim()],
    ["Project ID", formatShortCode(project.shortCode)],
    ["Address", address],
    ["Phone", project.phone],
    ["Email", project.email],
    ["Services", project.services.join(", ")],
  ]
    .filter(([, value]) => value.trim() !== "")
    .map(([name, value]) => `${name}: ${value}`);
  return [`${label} · Salesperson: ${salesperson}`, details.join("\n"), notes]
    .filter((block) => block !== "")
    .join("\n\n");
}

/** A new Jobber request for a follow-up, because a request holds only one appointment. */
async function createFollowUpRequest(
  accessToken: string,
  project: Doc<"projects">,
  label: string,
  salesperson: string,
): Promise<string> {
  const clientId = project.jobberClientId;
  if (clientId === null) throw new ConvexError("This project has no Jobber client yet, so a follow-up cannot be booked.");
  const found = await jobberGraphql<{ client: { clientProperties: { nodes: { id: string }[] } } | null }>(
    accessToken,
    `query Property($id: EncodedId!) { client(id: $id) { clientProperties(first: 1) { nodes { id } } } }`,
    { id: clientId },
  );
  const propertyId = found.client?.clientProperties.nodes[0]?.id ?? null;
  if (propertyId === null) throw new ConvexError("The Jobber client has no property, so a follow-up cannot be booked.");
  const address = [project.street1, project.street2, project.city, project.state, project.zip]
    .filter((part) => part.trim() !== "")
    .join(", ");
  return await createRequest({
    accessToken,
    clientId,
    propertyId,
    title: jobberTitle(label, salesperson, project),
    details: [
      { label: "Visit", value: label },
      { label: "Salesperson", value: salesperson },
      { label: "Homeowner", value: `${project.firstName} ${project.lastName}`.trim() },
      { label: "Project ID", value: formatShortCode(project.shortCode) },
      { label: "Address", value: address },
      { label: "Phone", value: project.phone },
      { label: "Email", value: project.email },
      { label: "Services", value: project.services.join(", ") },
    ].filter((row) => row.value.trim() !== ""),
  });
}

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
    /** The Jobber request created for a follow-up's appointment. */
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

/** Consultations the app already holds for a salesperson on a day, so a clash is caught even without Jobber. */
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
  if (!project.jobberRequestId) {
    throw new ConvexError("This project has no Jobber request yet, so a consultation cannot be booked.");
  }
  if (project.assignedTo === undefined) {
    throw new ConvexError("Assign this lead to yourself before booking a consultation.");
  }
  if (project.assignedTo !== who.email) {
    throw new ConvexError(`This lead is assigned to ${salespersonName(project.assignedTo)}, so only they can manage it.`);
  }
  return { project, who };
}

/** The Jobber team member with this email, so the appointment lands on their own calendar. */
async function jobberUserFor(accessToken: string, email: string): Promise<string | null> {
  const data = await jobberGraphql<{ users: { nodes: { id: string; email: { raw: string | null } | null }[] } }>(
    accessToken,
    `query Team { users(first: 100) { nodes { id email { raw } } } }`,
    {},
  );
  const wanted = email.trim().toLowerCase();
  return data.users.nodes.find((user) => user.email?.raw?.trim().toLowerCase() === wanted)?.id ?? null;
}

type Busy = { start: number; end: number; title: string; isBreak: boolean };

/** A Jobber calendar event the team has named a break, lunch or time off. */
function isBreakEvent(typename: string | undefined, title: string | null): boolean {
  return typename === "Event" && /break|lunch|time\s*off|day\s*off/i.test(title ?? "");
}

/**
 * What the salesperson already has around `date`, as minutes from midnight in the Jobber account's zone.
 * Combines their Jobber calendar (when they are a Jobber team member) with the app's own bookings.
 */
async function busyOn(
  ctx: ActionCtx,
  accessToken: string,
  args: {
    who: Who;
    jobberUserId: string | null;
    date: string;
    timezone: string;
    projectId: Doc<"projects">["_id"];
    ownAssessmentId: string | null;
  },
): Promise<Busy[]> {
  const busy: Busy[] = [];
  const held = await ctx.runQuery(internal.projects.consultation.heldOn, {
    email: args.who.email,
    date: args.date,
    exceptProjectId: args.projectId,
  });
  // The same appointment can come from both the app and Jobber; count it once.
  const heldIds = new Set(held.map((item) => item.assessmentId));
  for (const item of held) {
    const start = Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3, 5));
    busy.push({ start, end: start + item.minutes, title: item.title, isBreak: false });
  }
  if (args.jobberUserId !== null) {
    // From the start of the day to the end of the next, since a long visit can run past midnight.
    const from = zonedToInstant(args.date, "00:00", args.timezone);
    const next = endOf(args.date, "00:00", 2 * 1440);
    const to = zonedToInstant(next.date, next.time, args.timezone);
    const data = await jobberGraphql<{
      scheduledItems: {
        nodes: { __typename?: string; id: string; title: string | null; startAt: string | null; endAt: string | null; allDay: boolean | null }[];
      };
    }>(
      accessToken,
      `query Busy($filter: ScheduledItemsFilterAttributes!) {
        scheduledItems(first: 100, filter: $filter) { nodes { __typename id title startAt endAt allDay } }
      }`,
      {
        filter: {
          occursWithin: { startAt: from.toISOString(), endAt: to.toISOString() },
          assignedTo: [args.jobberUserId],
        },
      },
    );
    for (const item of data.scheduledItems.nodes) {
      if (item.id === args.ownAssessmentId || heldIds.has(item.id) || item.allDay === true) continue;
      if (item.startAt === null || item.endAt === null) continue;
      busy.push({
        start: minutesFromDayStart(args.date, item.startAt, args.timezone),
        end: minutesFromDayStart(args.date, item.endAt, args.timezone),
        title: item.title?.trim() || (isBreakEvent(item.__typename, item.title) ? "Break" : "Booked in Jobber"),
        isBreak: isBreakEvent(item.__typename, item.title),
      });
    }
  }
  return busy.sort((left, right) => left.start - right.start);
}

async function jobberTimezone(accessToken: string): Promise<string> {
  const zone = await jobberGraphql<{ user: { timezone: string | null } }>(
    accessToken,
    `query Zone { user { timezone } }`,
    {},
  );
  const timezone = zone.user.timezone;
  if (timezone === null || timezone === "") throw new ConvexError("Jobber did not say which time zone to use.");
  return timezone;
}

/** The signed-in salesperson's commitments on a day, for the booking form to show. */
export const busy = action({
  args: { sessionToken: v.string(), projectId: v.id("projects"), date: v.string() },
  returns: v.array(v.object({ start: v.string(), end: v.string(), title: v.string(), isBreak: v.boolean() })),
  handler: async (ctx, args) => {
    if (!datePattern.test(args.date)) return [];
    const { project, who } = await signedInProject(ctx, args.sessionToken, args.projectId);
    const accessToken = await accessTokenFor(ctx);
    const timezone = await jobberTimezone(accessToken);
    const jobberUserId = await jobberUserFor(accessToken, who.email);
    const items = await busyOn(ctx, accessToken, {
      who,
      jobberUserId,
      date: args.date,
      timezone,
      projectId: args.projectId,
      ownAssessmentId: project.consultation?.assessmentId ?? null,
    });
    return items
      .filter((item) => item.end > 0 && item.start < 1440)
      .map((item) => ({
        start: clockFromMinutes(Math.max(item.start, 0)),
        end: clockFromMinutes(item.end),
        title: item.title,
        isBreak: item.isBreak,
      }));
  },
});

/** Books, or moves, the consultation on the project's Jobber request. Jobber emails the homeowner. */
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
  handler: async (ctx, args) => {
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
    const label = visitLabel(visit);
    const accessToken = await accessTokenFor(ctx);
    // A request holds one appointment, so the consultation lives on the project's own request and every
    // follow-up gets a request of its own (null until it is created below, once the time is known to be free).
    let requestId: string | null =
      visit === 0 ? (project.jobberRequestId as string) : advancing ? null : (project.followUpRequestId ?? null);

    // Move the visit's existing appointment rather than adding a second to the same request.
    let assessmentId = requestId === null ? null : (project.consultation?.assessmentId ?? null);
    if (requestId !== null && assessmentId === null) {
      const found = await jobberGraphql<{ request: { assessment: { id: string } | null } | null }>(
        accessToken,
        `query Existing($id: EncodedId!) { request(id: $id) { assessment { id } } }`,
        { id: requestId },
      );
      assessmentId = found.request?.assessment?.id ?? null;
    }

    // Times are the salesperson's wall-clock; they are placed in the connected Jobber user's time zone.
    const timezone = await jobberTimezone(accessToken);
    const teamMemberId = await jobberUserFor(accessToken, who.email);

    // The salesperson cannot be in two places at once.
    const items = await busyOn(ctx, accessToken, {
      who,
      jobberUserId: teamMemberId,
      date: args.date,
      timezone,
      projectId: args.projectId,
      ownAssessmentId: assessmentId,
    });
    const start = Number(args.time.slice(0, 2)) * 60 + Number(args.time.slice(3, 5));
    const clash = items.find((item) => overlaps(start, start + args.minutes, item.start, item.end));
    if (clash !== undefined) {
      throw new ConvexError(
        clash.isBreak
          ? `${who.name} is on a break from ${clockFromMinutes(clash.start)} to ${clockFromMinutes(clash.end)} (${clash.title}). Choose another time.`
          : `${who.name} is already booked from ${clockFromMinutes(clash.start)} to ${clockFromMinutes(clash.end)} (${clash.title}). Choose another time.`,
      );
    }

    const madeRequest = requestId === null;
    if (requestId === null) requestId = await createFollowUpRequest(accessToken, project, label, who.name);

    const input = {
      instructions: jobberNotes(label, who.name, project, instructions),
      schedule: schedule(args.date, args.time, args.minutes, timezone, teamMemberId),
    };
    if (assessmentId === null) {
      const data = await jobberGraphql<{
        assessmentCreate: { assessment: { id: string } | null } & MutationErrors;
      }>(
        accessToken,
        `mutation Book($requestId: EncodedId!, $input: AssessmentCreateInput!) {
          assessmentCreate(requestId: $requestId, input: $input) {
            assessment { id }
            userErrors { message }
          }
        }`,
        { requestId, input },
      );
      const failed = problem(data.assessmentCreate.userErrors);
      if (failed !== null || data.assessmentCreate.assessment === null) {
        throw new ConvexError(failed ?? `Jobber did not book the ${label.toLowerCase()}.`);
      }
      assessmentId = data.assessmentCreate.assessment.id;
    } else {
      const data = await jobberGraphql<{ assessmentEdit: MutationErrors }>(
        accessToken,
        `mutation Move($id: EncodedId!, $input: AssessmentEditInput!) {
          assessmentEdit(assessmentId: $id, input: $input) {
            userErrors { message }
          }
        }`,
        { id: assessmentId, input },
      );
      const failed = problem(data.assessmentEdit.userErrors);
      if (failed !== null) throw new ConvexError(failed);
    }

    // The request's title is what Jobber shows on the calendar entry. A request made for a follow-up is
    // already titled. Otherwise this is best effort: the notes above carry the visit and salesperson,
    // so a title Jobber refuses must not undo the booking.
    if (!madeRequest) {
      try {
        const edited = await jobberGraphql<{ requestEdit: MutationErrors }>(
          accessToken,
          `mutation Title($id: EncodedId!, $input: RequestEditInput!) {
            requestEdit(requestId: $id, input: $input) { userErrors { message } }
          }`,
          { id: requestId, input: { title: jobberTitle(label, who.name, project) } },
        );
        const refused = problem(edited.requestEdit.userErrors);
        if (refused !== null) console.error(`Jobber did not retitle request ${requestId}: ${refused}`);
      } catch (failure) {
        console.error(`Could not retitle Jobber request ${requestId}`, failure);
      }
    }

    const consultation = {
      assessmentId,
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
      followUpRequestId: visit > 0 ? requestId : undefined,
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
    const accessToken = await accessTokenFor(ctx);
    const data = await jobberGraphql<{ assessmentDelete: MutationErrors }>(
      accessToken,
      `mutation Cancel($id: EncodedId!) {
        assessmentDelete(assessmentId: $id) { userErrors { message } }
      }`,
      { id: project.consultation.assessmentId },
    );
    const failed = problem(data.assessmentDelete.userErrors);
    if (failed !== null) throw new ConvexError(failed);
    await ctx.runMutation(internal.projects.consultation.record, {
      projectId: args.projectId,
      consultation: null,
    });
    return null;
  },
});

/** What Jobber says about the appointment now: its times, or that it is gone. */
type Remote = { state: "missing" } | { state: "scheduled"; startAt: string; endAt: string };

async function readAssessment(accessToken: string, assessmentId: string): Promise<Remote> {
  try {
    const data = await jobberGraphql<{ assessment: { startAt: string | null; endAt: string | null } | null }>(
      accessToken,
      `query Read($id: EncodedId!) { assessment(id: $id) { startAt endAt } }`,
      { id: assessmentId },
    );
    const found = data.assessment;
    if (found === null || found.startAt === null || found.endAt === null) return { state: "missing" };
    return { state: "scheduled", startAt: found.startAt, endAt: found.endAt };
  } catch (failure) {
    // Only a clear "it does not exist" counts as removed; a network or auth failure must not wipe a booking.
    if (failure instanceof Error && /not found|does not exist|couldn't find|could not find/i.test(failure.message)) {
      return { state: "missing" };
    }
    throw failure;
  }
}

/** Brings one project's stored consultation in line with Jobber, whoever changed it there. */
async function syncProject(
  ctx: ActionCtx,
  accessToken: string,
  timezone: string,
  project: Booking,
): Promise<"unchanged" | "moved" | "removed"> {
  const remote = await readAssessment(accessToken, project.consultation.assessmentId);
  if (remote.state === "missing") {
    await ctx.runMutation(internal.projects.consultation.record, { projectId: project._id, consultation: null });
    return "removed";
  }
  const begins = zonedWallClock(remote.startAt, timezone);
  const minutes = Math.round((new Date(remote.endAt).getTime() - new Date(remote.startAt).getTime()) / 60_000);
  const current = project.consultation;
  if (begins.date === current.date && begins.time === current.time && minutes === current.minutes) return "unchanged";
  await ctx.runMutation(internal.projects.consultation.record, {
    projectId: project._id,
    consultation: { ...current, date: begins.date, time: begins.time, minutes },
  });
  return "moved";
}

/** Called when a project is opened, so what the salesperson sees matches the Jobber calendar right now. */
export const refresh = action({
  args: { sessionToken: v.string(), projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const signedIn = await ctx.runQuery(internal.sales.queries.active, { sessionToken: args.sessionToken });
    if (!signedIn) return null;
    const loaded = await ctx.runQuery(internal.projects.queries.get, { projectId: args.projectId });
    const consultation = loaded?.project.consultation;
    if (loaded === null || consultation === undefined) return null;
    const accessToken = await accessTokenFor(ctx);
    const timezone = await jobberTimezone(accessToken);
    await syncProject(ctx, accessToken, timezone, { _id: loaded.project._id, consultation });
    return null;
  },
});

export const booked = internalQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("projects"), consultation: consultationValidator })),
  handler: async (ctx) => {
    const recent = await ctx.db.query("projects").order("desc").take(500);
    return recent.flatMap((project) =>
      project.consultation === undefined ? [] : [{ _id: project._id, consultation: project.consultation }],
    );
  },
});

/** Scheduled sweep: edits and removals made by office staff in Jobber flow back into the app. */
export const syncAll = internalAction({
  args: {},
  returns: v.object({ checked: v.number(), moved: v.number(), removed: v.number() }),
  handler: async (ctx) => {
    const bookings: Booking[] = await ctx.runQuery(internal.projects.consultation.booked, {});
    const totals = { checked: 0, moved: 0, removed: 0 };
    if (bookings.length === 0) return totals;
    const accessToken = await accessTokenFor(ctx);
    const timezone = await jobberTimezone(accessToken);
    for (const booking of bookings) {
      try {
        const result = await syncProject(ctx, accessToken, timezone, booking);
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
