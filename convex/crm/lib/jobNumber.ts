import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** A project's job number (design 2026-11-19-jobs). It is written once, the first time the project is won, and kept if the project is
 *  reopened and won again. Numbers count up from 1 per business. This is the only place that writes `jobNumber` or `jobCounters`. */
export async function assignJobNumber(ctx: MutationCtx, project: Doc<"opportunities">): Promise<number> {
  if (project.jobNumber !== undefined) return project.jobNumber;
  const counter = await ctx.db.query("jobCounters").withIndex("by_business", (q) => q.eq("businessId", project.businessId)).unique();
  const number = counter?.next ?? 1;
  if (counter) await ctx.db.patch(counter._id, { next: number + 1 });
  else await ctx.db.insert("jobCounters", { businessId: project.businessId, next: number + 1 });
  await ctx.db.patch(project._id, { jobNumber: number });
  return number;
}
