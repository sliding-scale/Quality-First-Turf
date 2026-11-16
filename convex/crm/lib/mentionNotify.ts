import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import type { Staff } from "./access";
import { excerpt, mentionedIds } from "./mentions";

/* Tells the people tagged with @ in a new note (D-073): one row each in `noteMentions`, shown behind the top bar's bell. Called by every
   place that saves a note (project, client and quote). Only active people on the note's business can be tagged, and tagging yourself
   tells nobody. */

export type MentionTarget = { kind: "project"; opportunityId: Id<"opportunities"> } | { kind: "client"; clientId: Id<"clients"> } | { kind: "quote"; quoteId: Id<"quotes"> };

export async function notifyMentions(ctx: MutationCtx, a: { businessId: Id<"businesses">; staff: Staff; text: string; target: MentionTarget; now: number }) {
  if (!a.text.includes("@")) return;
  const users = await ctx.db.query("users").take(500);
  const team = users.filter((u) => u.status === "active" && (u.roles.includes("admin") || u.businessIds.includes(a.businessId)));
  const ids = mentionedIds(a.text, team.map((u) => ({ id: u._id, name: u.name }))).filter((id) => id !== a.staff.userId);
  for (const id of ids) {
    await ctx.db.insert("noteMentions", {
      businessId: a.businessId, userId: id as Id<"users">, byName: a.staff.name, byUserId: a.staff.userId, kind: a.target.kind,
      ...(a.target.kind === "project" ? { opportunityId: a.target.opportunityId } : {}),
      ...(a.target.kind === "client" ? { clientId: a.target.clientId } : {}),
      ...(a.target.kind === "quote" ? { quoteId: a.target.quoteId } : {}),
      excerpt: excerpt(a.text), at: a.now,
    });
  }
}

/** Tells the people who should know that a Sales project changed stage (D-076): its salesperson (unless they made the move), and, when it is
 *  Closed Won, the Office team of that business, as the hand-off. Called by every place that moves a project. */
export async function notifyStage(ctx: MutationCtx, a: { project: Doc<"opportunities">; from: string; to: string; byName: string; byUserId?: Id<"users">; now: number }) {
  if (a.from === a.to) return;
  const message = a.to === "Closed Won" ? `${a.from} → Closed Won. Ready for Preplanning.` : `${a.from} → ${a.to}`;
  const who = new Map<Id<"users">, string>();
  if (a.project.salespersonId && a.project.salespersonId !== a.byUserId) who.set(a.project.salespersonId, message);
  if (a.to === "Closed Won") {
    const users = await ctx.db.query("users").take(500);
    for (const u of users) {
      if (u.status === "active" && u.roles.includes("office") && (u.businessIds.includes(a.project.businessId) || u.roles.includes("admin")) && u._id !== a.byUserId) who.set(u._id, message);
    }
  }
  for (const [userId, text] of who) {
    await ctx.db.insert("noteMentions", {
      businessId: a.project.businessId, userId, byName: a.byName, ...(a.byUserId ? { byUserId: a.byUserId } : {}), kind: "stage", opportunityId: a.project._id, excerpt: text, at: a.now,
    });
  }
}
