import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { jobberChanged } from "./jobberHooks";
import { stageList } from "./pipelineStages";

/* What a Sales move does to the project's consultations (D-085). Called by every Sales stage change (applyMove, systemMove).
   - Into "Onsite Consultation" with no consultation at all: it happened offline, so a completed consultation is recorded (no time of day,
     on the day it was marked, never sent to Jobber).
   - Out of the request stages to a later one (Quotes, Closed Won and so Preplanning): every consultation and follow-up
     visit that is not complete is marked complete, and so is its Jobber assessment. Construction visits are not touched.
   - To Closed Lost: open consultations and follow-up visits are marked "lost" (a Lost status on the Schedule, never overdue). */

const OFFLINE_NOTE = "Marked done: the consultation happened offline.";

export async function consultationsOnMove(
  ctx: MutationCtx,
  project: Doc<"opportunities">,
  from: string,
  to: string,
  now: number,
  byUserId: Id<"users"> | undefined,
) {
  if (project.pipeline !== "Sales") return;
  const groups = new Map((await stageList(ctx, project.businessId)).map((s) => [s.name, s.group as string]));
  const events = await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", project._id)).take(200);

  if (to === "Onsite Consultation" && byUserId !== undefined && !events.some((e) => e.type === "consultation")) {
    await ctx.db.insert("calendarEvents", {
      businessId: project.businessId, type: "consultation", title: `Consultation: ${project.title}`, opportunityId: project._id, clientId: project.clientId,
      start: now, end: now, anytime: true, assigneeIds: project.salespersonId ? [project.salespersonId] : [], status: "completed", notes: OFFLINE_NOTE,
      repeat: "none", createdBy: byUserId, createdAt: now, updatedAt: now, offline: true,
    });
    return;
  }

  // Closed Lost: the visits will not happen. They are marked lost, not completed, and Jobber is left alone.
  if (to === "Closed Lost") {
    for (const e of events) {
      const isVisit = e.type === "consultation" || (e.type === "visit" && e.visitKind === undefined);
      if (isVisit && e.status !== "completed" && e.status !== "lost" && e.source !== "zoho") await ctx.db.patch(e._id, { status: "lost", updatedAt: now });
    }
    return;
  }

  const leavingRequests = groups.get(from) === "Requests" && groups.get(to) !== "Requests";
  if (!leavingRequests) return;
  for (const e of events) {
    const isVisit = e.type === "consultation" || (e.type === "visit" && e.visitKind === undefined);
    if (!isVisit || e.status === "completed" || e.source === "zoho") continue;
    await ctx.db.patch(e._id, { status: "completed", updatedAt: now });
    await jobberChanged(ctx, e._id);
  }
  // Bookings made from the sales form are CRM items now (D-126), so they are completed above; nothing is sent to Jobber (D-123).
}
