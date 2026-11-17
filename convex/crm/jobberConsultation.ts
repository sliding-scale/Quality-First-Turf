import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation } from "../_generated/server";
import { jobberGraphql } from "../jobber/client";
import { accessTokenFor } from "../projects/actions";
import { formatShortCode } from "../shared/errors";
import { zonedWallClock } from "../shared/zonedTime";
import { requireEditor } from "./lib/access";
import { jobberChanged } from "./lib/jobberHooks";

/* Consultations booked in the CRM are also booked in Jobber (D-085), as the assessment on the project's Jobber request, the same place the
   sales form books them (forms convex/projects/consultation.ts, whose Jobber calls are copied here rather than edited, D-021 and D-028).
   The forms project's own `consultation` is updated too, so the sales form shows the same booking. Only a request that is in Jobber can be
   sent: one made by the customer form or the New Request flow (it has a forms project with a Jobber request). Other requests are left alone.
   The CRM is the record: a Jobber failure never undoes a CRM booking. It is kept on the item (`jobberError`), shown on the request page, and
   can be sent again. The person is matched to a Jobber user by email; with no match the assessment is booked unassigned. */

type MutationErrors = { userErrors: { message: string }[] };
const LABEL = "Consultation";

function problem(errors: { message: string }[]): string | null {
  return errors.length === 0 ? null : errors.map((e) => e.message).join("; ");
}

/** Adds minutes to a wall-clock date and time; Jobber applies the account's zone. (Copied from the forms.) */
function endOf(date: string, time: string, minutes: number): { date: string; time: string } {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day, hour, minute + minutes));
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`, time: `${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}` };
}

function jobberTitle(person: string, p: Doc<"projects">): string {
  return [LABEL, person, `${p.firstName} ${p.lastName}`.trim(), formatShortCode(p.shortCode)].filter((x) => x !== "").join(" · ").slice(0, 200);
}

function jobberNotes(person: string, p: Doc<"projects">, notes: string): string {
  const address = [p.street1, p.street2, p.city, p.state, p.zip].filter((x) => x.trim() !== "").join(", ");
  const details = [
    ["Homeowner", `${p.firstName} ${p.lastName}`.trim()],
    ["Project ID", formatShortCode(p.shortCode)],
    ["Address", address],
    ["Phone", p.phone],
    ["Email", p.email],
    ["Services", p.services.join(", ")],
  ].filter(([, value]) => value.trim() !== "").map(([name, value]) => `${name}: ${value}`);
  return [`${LABEL} · Salesperson: ${person}`, details.join("\n"), notes].filter((b) => b !== "").join("\n\n");
}

async function jobberUserFor(accessToken: string, email: string): Promise<string | null> {
  if (email.trim() === "") return null;
  const data = await jobberGraphql<{ users: { nodes: { id: string; email: { raw: string | null } | null }[] } }>(
    accessToken, `query Team { users(first: 100) { nodes { id email { raw } } } }`, {},
  );
  const wanted = email.trim().toLowerCase();
  return data.users.nodes.find((u) => u.email?.raw?.trim().toLowerCase() === wanted)?.id ?? null;
}

async function jobberTimezone(accessToken: string): Promise<string> {
  const zone = await jobberGraphql<{ user: { timezone: string | null } }>(accessToken, `query Zone { user { timezone } }`, {});
  if (!zone.user.timezone) throw new ConvexError("Jobber did not say which time zone to use.");
  return zone.user.timezone;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300) || "Jobber could not be reached.";

/** Everything the send needs, read in one go. Null when the item is gone or is not a CRM consultation of a request. */
export const context = internalQuery({
  args: { eventId: v.id("calendarEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (event === null || event.type !== "consultation" || event.opportunityId === undefined || event.offline || event.status === "lost" || event.source === "zoho") return null;
    const opportunity = await ctx.db.get(event.opportunityId);
    if (opportunity === null || opportunity.sourceProjectId === undefined) return null;
    const forms = await ctx.db.get(opportunity.sourceProjectId);
    if (forms === null) return null;
    const person = event.assigneeIds[0] ? await ctx.db.get(event.assigneeIds[0]) : null;
    return { event, forms, personName: person?.name ?? "Unassigned", personEmail: person?.email ?? "" };
  },
});

export const saveResult = internalMutation({
  args: { eventId: v.id("calendarEvents"), assessmentId: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const event = await ctx.db.get(a.eventId);
    if (event === null) return;
    await ctx.db.patch(a.eventId, { ...(a.assessmentId ? { jobberAssessmentId: a.assessmentId } : {}), jobberError: a.error });
  },
});

/** Books, moves or completes one consultation in Jobber, to match the CRM item. */
export const push = internalAction({
  args: { eventId: v.id("calendarEvents") },
  handler: async (ctx, { eventId }): Promise<void> => {
    const c: { event: Doc<"calendarEvents">; forms: Doc<"projects">; personName: string; personEmail: string } | null =
      await ctx.runQuery(internal.crm.jobberConsultation.context, { eventId });
    if (c === null) return;
    const { event, forms } = c;
    const fail = async (error: string): Promise<void> => { await ctx.runMutation(internal.crm.jobberConsultation.saveResult, { eventId, error }); };
    try {
      if (!forms.jobberRequestId) return await fail("The request is not in Jobber yet, so the consultation could not be sent.");
      const accessToken = await accessTokenFor(ctx);

      if (event.status === "completed") {
        if (event.jobberAssessmentId) await completeAssessment(accessToken, event.jobberAssessmentId);
        await ctx.runMutation(internal.crm.jobberConsultation.saveResult, { eventId });
        return;
      }
      if (event.anytime) return await fail("A consultation with no time of day cannot be booked in Jobber. Give it a start time.");
      // The sales form has moved on to follow-up visits on this request; the consultation there is finished and is not changed from here.
      if (forms.visitedAt !== undefined || (forms.visitNumber ?? 0) > 0) {
        return await fail("The sales form has already finished this consultation, so Jobber was not changed.");
      }

      let assessmentId = event.jobberAssessmentId ?? forms.consultation?.assessmentId ?? null;
      if (assessmentId === null) {
        const found = await jobberGraphql<{ request: { assessment: { id: string } | null } | null }>(
          accessToken, `query Existing($id: EncodedId!) { request(id: $id) { assessment { id } } }`, { id: forms.jobberRequestId },
        );
        assessmentId = found.request?.assessment?.id ?? null;
      }
      const timezone = await jobberTimezone(accessToken);
      const teamMemberId = await jobberUserFor(accessToken, c.personEmail);
      const { date, time } = zonedWallClock(new Date(event.start), timezone);
      const minutes = Math.max(15, Math.round((event.end - event.start) / 60_000));
      const instructions = event.notes.trim().slice(0, 1000);
      const input = {
        instructions: jobberNotes(c.personName, forms, instructions),
        schedule: {
          startAt: { date, time, timezone },
          endAt: { ...endOf(date, time, minutes), timezone },
          notifyTeam: false,
          ...(teamMemberId === null ? {} : { teamMemberIdsToAssign: [teamMemberId] }),
        },
      };
      if (assessmentId === null) {
        const data = await jobberGraphql<{ assessmentCreate: { assessment: { id: string } | null } & MutationErrors }>(
          accessToken,
          `mutation Book($requestId: EncodedId!, $input: AssessmentCreateInput!) {
            assessmentCreate(requestId: $requestId, input: $input) { assessment { id } userErrors { message } }
          }`,
          { requestId: forms.jobberRequestId, input },
        );
        const failed = problem(data.assessmentCreate.userErrors);
        if (failed !== null || data.assessmentCreate.assessment === null) return await fail(failed ?? "Jobber did not book the consultation.");
        assessmentId = data.assessmentCreate.assessment.id;
      } else {
        const data = await jobberGraphql<{ assessmentEdit: MutationErrors }>(
          accessToken,
          `mutation Move($id: EncodedId!, $input: AssessmentEditInput!) { assessmentEdit(assessmentId: $id, input: $input) { userErrors { message } } }`,
          { id: assessmentId, input },
        );
        const failed = problem(data.assessmentEdit.userErrors);
        if (failed !== null) return await fail(failed);
      }
      // The request's title is what Jobber's calendar shows. Best effort, as in the forms: a refused title must not undo the booking.
      try {
        await jobberGraphql<{ requestEdit: MutationErrors }>(
          accessToken,
          `mutation Title($id: EncodedId!, $input: RequestEditInput!) { requestEdit(requestId: $id, input: $input) { userErrors { message } } }`,
          { id: forms.jobberRequestId, input: { title: jobberTitle(c.personName, forms) } },
        );
      } catch (e) {
        console.error(`Could not retitle Jobber request ${forms.jobberRequestId}`, e);
      }
      // The sales form reads the booking from its own project, so it shows the same consultation.
      await ctx.runMutation(internal.projects.consultation.record, {
        projectId: forms._id,
        consultation: { assessmentId, date, time, minutes, instructions, salesperson: c.personName },
      });
      await ctx.runMutation(internal.crm.jobberConsultation.saveResult, { eventId, assessmentId });
    } catch (e) {
      console.error(`Could not send consultation ${eventId} to Jobber`, e);
      await fail(message(e));
    }
  },
});

async function completeAssessment(accessToken: string, assessmentId: string) {
  const data = await jobberGraphql<{ assessmentComplete: MutationErrors }>(
    accessToken,
    `mutation Done($id: EncodedId!) { assessmentComplete(assessmentId: $id) { userErrors { message } } }`,
    { id: assessmentId },
  );
  const failed = problem(data.assessmentComplete.userErrors);
  if (failed !== null) throw new ConvexError(failed);
}

/** The CRM consultation was deleted: cancel it in Jobber and clear the sales form's copy if it is the same booking. */
export const removeAssessment = internalAction({
  args: { assessmentId: v.string(), formsProjectId: v.optional(v.id("projects")) },
  handler: async (ctx, a) => {
    try {
      const accessToken = await accessTokenFor(ctx);
      const data = await jobberGraphql<{ assessmentDelete: MutationErrors }>(
        accessToken, `mutation Cancel($id: EncodedId!) { assessmentDelete(assessmentId: $id) { userErrors { message } } }`, { id: a.assessmentId },
      );
      const failed = problem(data.assessmentDelete.userErrors);
      if (failed !== null) throw new ConvexError(failed);
    } catch (e) {
      // The CRM item is already gone, so there is nothing to show the error on; the log keeps it.
      console.error(`Could not cancel Jobber assessment ${a.assessmentId}`, e);
      return;
    }
    if (a.formsProjectId) {
      const forms = await ctx.runQuery(internal.projects.queries.get, { projectId: a.formsProjectId });
      if (forms?.project.consultation?.assessmentId === a.assessmentId) {
        await ctx.runMutation(internal.projects.consultation.record, { projectId: a.formsProjectId, consultation: null });
      }
    }
  },
});

/** A project moved past the request stages: the consultation the sales form booked in Jobber (with no CRM item of its own) is completed too. */
export const completeFormsConsultation = internalAction({
  args: { formsProjectId: v.id("projects"), skip: v.array(v.string()) },
  handler: async (ctx, a) => {
    const forms = await ctx.runQuery(internal.projects.queries.get, { projectId: a.formsProjectId });
    const assessmentId = forms?.project.consultation?.assessmentId;
    if (!assessmentId || a.skip.includes(assessmentId) || forms?.project.visitedAt !== undefined) return;
    try {
      await completeAssessment(await accessTokenFor(ctx), assessmentId);
    } catch (e) {
      console.error(`Could not complete Jobber assessment ${assessmentId}`, e);
    }
  },
});

/** "Send to Jobber" on the request page, after a failed send. */
export const resend = mutation({
  args: { id: v.id("calendarEvents") },
  handler: async (ctx, { id }) => {
    const event = await ctx.db.get(id);
    if (event === null) throw new ConvexError("That consultation no longer exists.");
    await requireEditor(ctx, event.businessId);
    await jobberChanged(ctx, id as Id<"calendarEvents">);
  },
});
