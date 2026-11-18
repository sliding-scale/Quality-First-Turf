import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { requireProject, type Staff } from "./access";
import { deleteNoteFiles } from "./noteFiles";

/* Construction management (PRD 4.6, D-081): shared rules for the project's team, progress, punch list and completion sign-off.
   The functions are in crm/construction.ts (staff) and crm/clientSignoff.ts (the customer's link). */

export const MAX_PUNCH = 200;
export const MAX_PROGRESS = 200;
const MAX_SIGNOFFS = 50;

/** Who may work on a project's construction: a level of Edit in Pipeline: Construction (Admin, Office, Project Manager, or an Installer on the
 *  project's work team). The project must be in Construction. */
export async function requireSite(ctx: QueryCtx | MutationCtx, project: Doc<"opportunities">): Promise<Staff> {
  const staff = await requireProject(ctx, project, "pipelineConstruction", "edit");
  if (project.pipeline !== "Construction") throw new ConvexError("This project is not in Construction.");
  return staff;
}

export async function punchItemsOf(ctx: QueryCtx | MutationCtx, opportunityId: Id<"opportunities">) {
  return await ctx.db.query("punchItems").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(MAX_PUNCH);
}

export async function signoffsOf(ctx: QueryCtx | MutationCtx, opportunityId: Id<"opportunities">) {
  return await ctx.db.query("signoffs").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(MAX_SIGNOFFS);
}

/** What the last construction stage needs (PRD 4.6): every required punch item verified, and the customer's signed sign-off. */
export async function completionState(ctx: QueryCtx | MutationCtx, opportunityId: Id<"opportunities">) {
  const items = await punchItemsOf(ctx, opportunityId);
  const openRequired = items.filter((i) => i.required && i.status !== "verified").length;
  const signed = (await signoffsOf(ctx, opportunityId)).find((s) => s.status === "signed") ?? null;
  return { openRequired, signed, ready: openRequired === 0 && signed !== null };
}

/** Why the last stage is refused, in words. */
export function completionBlock(state: { openRequired: number; signed: unknown }): string {
  if (state.openRequired > 0) {
    return `${state.openRequired} required punch item${state.openRequired === 1 ? " still needs" : "s still need"} to be verified before the project can be signed off.`;
  }
  return "The customer has not signed off yet. Get their sign-off from the project's Construction tab.";
}

/** Tells one person through the bell, unless they did it themselves. */
export async function tellPerson(ctx: MutationCtx, a: { project: Doc<"opportunities">; userId: Id<"users">; by: Staff | { name: string }; text: string; now: number }) {
  const byUserId = "userId" in a.by ? a.by.userId : undefined;
  if (a.userId === byUserId) return;
  await ctx.db.insert("noteMentions", {
    businessId: a.project.businessId, userId: a.userId, byName: a.by.name, ...(byUserId ? { byUserId } : {}), kind: "construction",
    opportunityId: a.project._id, excerpt: a.text.slice(0, 200), at: a.now,
  });
}

/** Tells the Office team of the project's business (and Admins), as the stage handoffs do. */
export async function tellOffice(ctx: MutationCtx, a: { project: Doc<"opportunities">; by: Staff | { name: string }; text: string; now: number }) {
  const users = await ctx.db.query("users").take(500);
  for (const u of users) {
    if (u.status === "active" && u.roles.includes("office") && (u.businessIds.includes(a.project.businessId) || u.roles.includes("admin"))) {
      await tellPerson(ctx, { project: a.project, userId: u._id, by: a.by, text: a.text, now: a.now });
    }
  }
}

/** Removes a project's construction records and their files (used when its client is deleted). */
export async function deleteConstruction(ctx: MutationCtx, opportunityId: Id<"opportunities">) {
  for (const u of await ctx.db.query("progressUpdates").withIndex("by_opportunity_and_at", (q) => q.eq("opportunityId", opportunityId)).take(MAX_PROGRESS)) {
    await deleteNoteFiles(ctx, u.attachments);
    await ctx.db.delete(u._id);
  }
  for (const p of await punchItemsOf(ctx, opportunityId)) {
    await deleteNoteFiles(ctx, p.attachments);
    await deleteNoteFiles(ctx, p.fixAttachments);
    await ctx.db.delete(p._id);
  }
  for (const s of await signoffsOf(ctx, opportunityId)) {
    if (s.signatureImageId) await ctx.storage.delete(s.signatureImageId);
    await ctx.db.delete(s._id);
  }
}
