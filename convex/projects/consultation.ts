import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action, internalMutation } from "../_generated/server";
import { jobberGraphql } from "../jobber/client";
import { consultationValidator } from "../schema";
import { accessTokenFor } from "./actions";

type MutationErrors = { userErrors: { message: string }[] };

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

function schedule(date: string, time: string, minutes: number, timezone: string) {
  return {
    startAt: { date, time, timezone },
    endAt: { ...endOf(date, time, minutes), timezone },
    notifyTeam: false,
  };
}

function problem(errors: { message: string }[]): string | null {
  return errors.length === 0 ? null : errors.map((error) => error.message).join("; ");
}

export const record = internalMutation({
  args: { projectId: v.id("projects"), consultation: v.union(consultationValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("projects", args.projectId, {
      consultation: args.consultation ?? undefined,
    });
    return null;
  },
});

async function signedInProject(
  ctx: ActionCtx,
  sessionToken: string,
  projectId: Doc<"projects">["_id"],
): Promise<Doc<"projects">> {
  const signedIn = await ctx.runQuery(internal.sales.queries.active, { sessionToken });
  if (!signedIn) throw new ConvexError("Sign in again to schedule a consultation.");
  const loaded = await ctx.runQuery(internal.projects.queries.get, { projectId });
  if (loaded === null) throw new ConvexError("Project not found.");
  if (!loaded.project.jobberRequestId) {
    throw new ConvexError("This project has no Jobber request yet, so a consultation cannot be booked.");
  }
  return loaded.project;
}

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
      throw new ConvexError("Choose how long the consultation will take.");
    }
    if (args.date < new Date(Date.now() - 36 * 3_600_000).toISOString().slice(0, 10)) {
      throw new ConvexError("Choose a date that has not passed.");
    }
    const instructions = args.instructions.trim().slice(0, 1000);
    const project = await signedInProject(ctx, args.sessionToken, args.projectId);
    const accessToken = await accessTokenFor(ctx);
    const requestId = project.jobberRequestId as string;

    // A request holds one appointment; move it rather than adding a second.
    let assessmentId = project.consultation?.assessmentId ?? null;
    if (assessmentId === null) {
      const found = await jobberGraphql<{ request: { assessment: { id: string } | null } | null }>(
        accessToken,
        `query Existing($id: EncodedId!) { request(id: $id) { assessment { id } } }`,
        { id: requestId },
      );
      assessmentId = found.request?.assessment?.id ?? null;
    }

    // Times are the salesperson's wall-clock; they are placed in the connected Jobber user's time zone.
    const zone = await jobberGraphql<{ user: { timezone: string | null } }>(
      accessToken,
      `query Zone { user { timezone } }`,
      {},
    );
    const timezone = zone.user.timezone;
    if (timezone === null || timezone === "") throw new ConvexError("Jobber did not say which time zone to use.");
    const input = { instructions, schedule: schedule(args.date, args.time, args.minutes, timezone) };
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
        throw new ConvexError(failed ?? "Jobber did not book the consultation.");
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

    const consultation = {
      assessmentId,
      date: args.date,
      time: args.time,
      minutes: args.minutes,
      instructions,
    };
    await ctx.runMutation(internal.projects.consultation.record, {
      projectId: args.projectId,
      consultation,
    });
    return consultation;
  },
});

export const cancel = action({
  args: { sessionToken: v.string(), projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await signedInProject(ctx, args.sessionToken, args.projectId);
    if (project.consultation === undefined) return null;
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
