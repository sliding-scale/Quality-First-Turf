import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { zonedWallClock } from "../../shared/zonedTime";
import { businessZone } from "../settings";

/* When a CRM consultation changes, the sales form's copy follows at once (D-126). This used to send it to Jobber (D-085); the Jobber
   subscription is ending (D-123), so nothing goes to Jobber any more and the sales form reads the CRM calendar instead. The names are kept so
   the callers (lib/mirror.ts, schedule.setStatus, the pipeline rules) are unchanged. crm/jobberConsultation.ts is no longer called from here.
   Only consultations of a request made through the forms' tables have a sales form copy; items from Zoho and consultations marked done
   offline are left alone. */

const linked = (e: Doc<"calendarEvents">) => e.type === "consultation" && e.opportunityId !== undefined && !e.offline && e.source !== "zoho";

/** The forms record whose sales form shows this consultation, while that form is still on its first visit. */
async function formsOf(ctx: MutationCtx, e: Doc<"calendarEvents">): Promise<Doc<"projects"> | null> {
  const project = e.opportunityId ? await ctx.db.get(e.opportunityId) : null;
  const forms = project?.sourceProjectId ? await ctx.db.get(project.sourceProjectId) : null;
  if (forms === null || forms.visitedAt !== undefined || (forms.visitNumber ?? 0) > 0) return null;
  return forms;
}

/** A consultation was booked, moved or reassigned: the sales form shows the same booking. Completed or lost ones are not changed there. */
export async function jobberChanged(ctx: MutationCtx, id: Id<"calendarEvents">) {
  const event = await ctx.db.get(id);
  if (event === null || !linked(event) || event.anytime || event.status === "completed" || event.status === "lost") return;
  const forms = await formsOf(ctx, event);
  if (forms === null) return;
  const tz = await businessZone(ctx);
  const { date, time } = zonedWallClock(new Date(event.start), tz);
  const minutes = Math.max(15, Math.round((event.end - event.start) / 60_000));
  const person = event.assigneeIds[0] ? await ctx.db.get(event.assigneeIds[0]) : null;
  const current = forms.consultation;
  if (current?.assessmentId === id && current.date === date && current.time === time && current.minutes === minutes) return;
  await ctx.scheduler.runAfter(0, internal.projects.consultation.record, {
    projectId: forms._id,
    consultation: { assessmentId: id, date, time, minutes, instructions: event.notes.trim().slice(0, 1000), salesperson: person?.name ?? current?.salesperson ?? "Unassigned" },
  });
}

/** A consultation is about to be deleted: the sales form's copy goes too, if it is the same booking. */
export async function jobberRemoved(ctx: MutationCtx, event: Doc<"calendarEvents">) {
  if (!linked(event)) return;
  const forms = await formsOf(ctx, event);
  if (forms === null || forms.consultation?.assessmentId !== event._id) return;
  await ctx.scheduler.runAfter(0, internal.projects.consultation.record, { projectId: forms._id, consultation: null });
}
