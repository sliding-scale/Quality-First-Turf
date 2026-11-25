import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

/* A consultation was booked or its time changed: the customer is emailed a confirmation (D-127). Called from every place a consultation is
   booked (the Schedule, the pipeline card, the New Request flow, the sales form). It only queues; crm/bookingEmail.ts decides whether and what
   to send, and never sends the same time twice. */

/** True for the items that get a confirmation: a real, timed consultation of a request, not from Zoho and not marked done offline. */
export const wantsConfirmation = (e: Doc<"calendarEvents">) =>
  e.type === "consultation" && e.opportunityId !== undefined && !e.offline && e.source !== "zoho" && !e.anytime && (e.status === "upcoming" || e.status === "confirmed");

export async function queueBookingEmail(ctx: MutationCtx, id: Id<"calendarEvents">) {
  const event = await ctx.db.get(id);
  if (event === null || !wantsConfirmation(event) || event.confirmEmail?.start === event.start) return;
  await ctx.scheduler.runAfter(0, internal.crm.bookingEmail.send, { eventId: id });
}
