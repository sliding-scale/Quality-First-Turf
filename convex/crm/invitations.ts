import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { acceptUrl, assertConfigured, clerkUserIdOf, createInvitation, deleteUser, findUserIds, revokeInvitation } from "./lib/clerk";
import { userFields } from "./users";

/* Team invitations (D-055). An Admin invites someone in Manage Team; Clerk emails them a link; they create a password and are signed
   in; the CRM links them to their row by email (users.claim). The link works for 7 days. An Admin can cancel it, send a new one, or
   delete the person (D-057: their row is kept and marked deleted, never removed), and each of those is carried out in Clerk as well as
   here, so the two never disagree. Everything is Admin-only,
   and every action starts by asking the database who is calling (an action cannot read the database itself). */

type Sent = { sent: true; expiresAt: number } | { sent: false; reason: "hasAccount" };

async function adminOf(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not signed in.");
  const admin: { userId: Id<"users">; email: string } = await ctx.runQuery(internal.crm.users.adminFor, { tokenIdentifier: identity.tokenIdentifier });
  return { ...admin, tokenIdentifier: identity.tokenIdentifier };
}

/**
 * Asks Clerk to email the invitation and records it on the person. If the email already has a Clerk login, no invitation can be sent
 * (Clerk refuses), and they are told to sign in with the login they have. `onFailure` says what happens to the row for any other
 * failure: a brand-new person is taken back out, a person being re-sent goes to "expired" because their old link is already gone, and a
 * deleted person being restored simply stays deleted.
 */
async function deliver(ctx: ActionCtx, row: Doc<"users">, redirectUrl: string, onFailure: "discard" | "expire" | "keep"): Promise<Sent> {
  const result = await createInvitation(row.email, redirectUrl);
  if (result.ok) {
    await ctx.runMutation(internal.crm.users.attachInvitation, { id: row._id, invitation: result.body });
    return { sent: true, expiresAt: result.body.expiresAt };
  }
  if (result.code === "form_identifier_exists") {
    await ctx.runMutation(internal.crm.users.attachInvitation, { id: row._id });
    return { sent: false, reason: "hasAccount" };
  }
  if (onFailure === "discard") await ctx.runMutation(internal.crm.users.discard, { id: row._id });
  else if (onFailure === "expire") await ctx.runMutation(internal.crm.users.markExpired, { id: row._id });
  throw new ConvexError(`The invitation could not be sent: ${result.message}`);
}

async function rowOf(ctx: ActionCtx, id: Id<"users">): Promise<Doc<"users">> {
  const row: Doc<"users"> | null = await ctx.runQuery(internal.crm.users.getRow, { id });
  if (!row) throw new ConvexError("That person no longer exists.");
  return row;
}

/** Adds a person and emails them the invitation. `origin` is the address of the Admin's browser, used only when CRM_APP_URL is not set. */
export const send = action({
  args: { email: v.string(), ...userFields, origin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Sent> => {
    const admin = await adminOf(ctx);
    assertConfigured();
    const redirectUrl = acceptUrl(args.origin);
    const id: Id<"users"> = await ctx.runMutation(internal.crm.users.createInvited, {
      email: args.email, name: args.name, roles: args.roles, businessIds: args.businessIds, invitedBy: admin.email,
    });
    return await deliver(ctx, await rowOf(ctx, id), redirectUrl, "discard");
  },
});

/** A new link for someone who has not signed in yet (their invitation ran out, was cancelled, or was never sent), or to restore a deleted person. The old link stops working. */
export const resend = action({
  args: { id: v.id("users"), origin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Sent> => {
    await adminOf(ctx);
    assertConfigured();
    const redirectUrl = acceptUrl(args.origin);
    const row = await rowOf(ctx, args.id);
    if (row.tokenIdentifier && row.status !== "deleted") throw new ConvexError("They have already signed in, so there is nothing to send.");
    if (row.status === "deactivated") throw new ConvexError("Turn on their access first.");
    if (row.clerkInvitationId) {
      const revoked = await revokeInvitation(row.clerkInvitationId);
      if (!revoked.done) throw new ConvexError(`The old invitation could not be cancelled: ${revoked.message}`);
    }
    return await deliver(ctx, row, redirectUrl, row.status === "deleted" ? "keep" : "expire");
  },
});

/** Cancels a pending invitation: the link stops working and the person shows as Expired. */
export const cancel = action({
  args: { id: v.id("users") },
  handler: async (ctx, args): Promise<null> => {
    await adminOf(ctx);
    assertConfigured();
    const row = await rowOf(ctx, args.id);
    if (row.tokenIdentifier || row.status !== "invited") throw new ConvexError("There is no pending invitation to cancel.");
    if (row.clerkInvitationId) {
      const revoked = await revokeInvitation(row.clerkInvitationId);
      if (!revoked.done) throw new ConvexError(`The invitation could not be cancelled: ${revoked.message}`);
    }
    await ctx.runMutation(internal.crm.users.markExpired, { id: args.id });
    return null;
  },
});

/**
 * Deletes a person (D-057): a pending invitation is cancelled and their Clerk login is deleted (which also signs them out), and their row is
 * marked deleted. The row is kept, not removed. Clerk is cleaned up first, so if Clerk fails the person stays as they were and the Admin
 * can try again.
 */
export const deleteMember = action({
  args: { id: v.id("users") },
  handler: async (ctx, args): Promise<{ clerkAccountsDeleted: number }> => {
    const admin = await adminOf(ctx);
    assertConfigured();
    const plan: { email: string; tokenIdentifier: string | null; clerkInvitationId: string | null } = await ctx.runQuery(
      internal.crm.users.deletionPlan,
      { tokenIdentifier: admin.tokenIdentifier, id: args.id },
    );

    if (plan.clerkInvitationId) {
      const revoked = await revokeInvitation(plan.clerkInvitationId);
      if (!revoked.done) throw new ConvexError(`Their invitation could not be cancelled in Clerk: ${revoked.message}`);
    }
    const accounts = new Set<string>();
    if (plan.tokenIdentifier) accounts.add(clerkUserIdOf(plan.tokenIdentifier));
    const found = await findUserIds(plan.email);
    if (!found.ok) throw new ConvexError(`Clerk could not be checked for their login: ${found.message}`);
    for (const id of found.ids) accounts.add(id);
    for (const id of accounts) {
      const deleted = await deleteUser(id);
      if (!deleted.done) throw new ConvexError(`Their login could not be deleted in Clerk: ${deleted.message}`);
    }

    await ctx.runMutation(internal.crm.users.markDeleted, { id: args.id, deletedBy: admin.email });
    return { clerkAccountsDeleted: accounts.size };
  },
});

/** Runs when an invitation's 7 days are up (scheduled when it was sent): cancels the link in Clerk and shows the person as Expired. */
export const expire = internalAction({
  args: { id: v.id("users"), invitationId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const row: Doc<"users"> | null = await ctx.runQuery(internal.crm.users.getRow, { id: args.id });
    // Already accepted, cancelled, replaced by a newer invitation, or removed: nothing to do.
    if (!row || row.tokenIdentifier || row.status !== "invited" || row.clerkInvitationId !== args.invitationId) return null;
    await revokeInvitation(args.invitationId); // best effort: Clerk's own expiry is the same moment
    await ctx.runMutation(internal.crm.users.markExpired, { id: args.id, invitationId: args.invitationId });
    return null;
  },
});
