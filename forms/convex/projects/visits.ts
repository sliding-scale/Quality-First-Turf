import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const workAreaLimit = 100;

/**
 * Records the project as it stands now as the card for its current visit (the consultation or a
 * follow-up), creating it the first time and rewriting it on later saves of that same visit.
 */
export async function saveVisitSnapshot(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  salesperson: string | undefined,
): Promise<void> {
  const project = await ctx.db.get("projects", projectId);
  if (project === null) return;
  const visit = project.visitNumber ?? 0;
  const areas = await ctx.db
    .query("workAreas")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .take(workAreaLimit);
  const snapshot = {
    projectId,
    visit,
    savedAt: project.visitedAt ?? Date.now(),
    salesperson: salesperson ?? project.consultation?.salesperson,
    booking:
      project.consultation === undefined
        ? undefined
        : {
            date: project.consultation.date,
            time: project.consultation.time,
            minutes: project.consultation.minutes,
          },
    firstName: project.firstName,
    lastName: project.lastName,
    phone: project.phone,
    email: project.email,
    street1: project.street1,
    street2: project.street2,
    city: project.city,
    state: project.state,
    zip: project.zip,
    services: project.services,
    products: project.products,
    addOns: project.addOns,
    answers: project.answers,
    notes: project.notes,
    measurements: project.measurements,
    workAreas: areas.map((area) => ({
      label: area.label,
      length: area.length,
      width: area.width,
      quantity: area.quantity,
      notes: area.notes,
      photoIds: area.photoIds,
      service: area.service,
      installType: area.installType,
      sections: area.sections,
    })),
  };
  const existing = await ctx.db
    .query("visitSnapshots")
    .withIndex("by_projectId_and_visit", (q) => q.eq("projectId", projectId).eq("visit", visit))
    .first();
  if (existing === null) await ctx.db.insert("visitSnapshots", snapshot);
  else await ctx.db.replace("visitSnapshots", existing._id, snapshot);
}

/** Photos that earlier visits' cards still show; they must survive later edits that drop them from the live visit. */
export async function photosKeptByEarlierVisits(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  visit: number,
): Promise<Set<Id<"_storage">>> {
  const earlier = await ctx.db
    .query("visitSnapshots")
    .withIndex("by_projectId_and_visit", (q) => q.eq("projectId", projectId).lt("visit", visit))
    .take(100);
  return new Set(earlier.flatMap((card) => card.workAreas.flatMap((area) => area.photoIds)));
}
