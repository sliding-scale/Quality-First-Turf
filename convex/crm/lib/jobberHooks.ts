import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

/* When a CRM consultation changes, Jobber is told (D-085, crm/jobberConsultation.ts). Only consultations of a request that came through the
   forms' tables can reach Jobber; the action itself checks that and does nothing for the rest. Items from Zoho and consultations marked done
   offline are never sent. */

const sendable = (e: Doc<"calendarEvents">) => e.type === "consultation" && e.opportunityId !== undefined && !e.offline && e.source !== "zoho";

/** A consultation was booked, moved, reassigned or completed. */
export async function jobberChanged(ctx: MutationCtx, id: Id<"calendarEvents">) {
  const event = await ctx.db.get(id);
  if (event === null || !sendable(event)) return;
  await ctx.scheduler.runAfter(0, internal.crm.jobberConsultation.push, { eventId: id });
}

/** A consultation is about to be deleted: cancel its Jobber assessment. */
export async function jobberRemoved(ctx: MutationCtx, event: Doc<"calendarEvents">) {
  if (!sendable(event) || !event.jobberAssessmentId) return;
  const project = event.opportunityId ? await ctx.db.get(event.opportunityId) : null;
  await ctx.scheduler.runAfter(0, internal.crm.jobberConsultation.removeAssessment, {
    assessmentId: event.jobberAssessmentId,
    ...(project?.sourceProjectId ? { formsProjectId: project.sourceProjectId } : {}),
  });
}
