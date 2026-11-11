import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { SALES_STAGES } from "./stages";

/** A pipeline move made by the system rather than by a person: a quote being created, sent or answered by the client (D-063). It checks
 *  no role (the caller has already checked who may do the thing that causes it) and never touches a project that is already closed.
 *  With `onlyForward` it leaves a project alone that is already further along. Returns whether it moved. */
export async function systemMove(
  ctx: MutationCtx,
  project: Doc<"opportunities">,
  to: string,
  byName: string,
  now: number,
  opts: { note?: string; onlyForward?: boolean; byUserId?: Doc<"users">["_id"] } = {},
): Promise<boolean> {
  if (project.pipeline !== "Sales" || project.outcome !== undefined || project.stage === to) return false;
  const order = SALES_STAGES as readonly string[];
  if (opts.onlyForward && order.indexOf(project.stage) >= order.indexOf(to) && order.indexOf(project.stage) !== -1) return false;
  const from = project.stage;
  const patch: Partial<Doc<"opportunities">> = {
    stage: to,
    stageEnteredAt: now,
    searchText: project.searchText.endsWith(from) ? project.searchText.slice(0, -from.length) + to : `${project.searchText} ${to}`,
  };
  if (to === "Closed Lost") Object.assign(patch, { outcome: "lost", closedAt: now, lostReason: opts.note ?? "" });
  await ctx.db.patch(project._id, patch);
  await ctx.db.insert("stageHistory", {
    opportunityId: project._id, businessId: project.businessId, from, to, byName, at: now,
    ...(opts.byUserId ? { byUserId: opts.byUserId } : {}), ...(opts.note ? { note: opts.note } : {}),
  });
  return true;
}
