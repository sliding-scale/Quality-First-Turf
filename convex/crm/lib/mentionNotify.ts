import type { Id } from "../../_generated/dataModel";
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
