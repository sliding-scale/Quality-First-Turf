import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation } from "../_generated/server";
import { requireStaff } from "../crm/lib/access";
import { hashToken } from "./session";

/* The sales form signs in through Clerk, by hand-off from the CRM (D-053). Clerk cannot run on the forms domain without satellite
   domains, so the person signs in on the CRM (Clerk), the CRM checks them here and gets a one-time code, sends them back to the sales
   form with it, and the sales form swaps the code for a normal sales session token. Only an active CRM user with the Sales or Admin
   role gets a code. The session token is the same kind the old password login handed out, so everything that takes a `sessionToken`
   (projects, visits, assignments) is unchanged. The password login and its shared accounts are gone.

   The code is 256 random bits, stored only as a hash, works once, and expires after a minute, so a copy of the link from a browser
   history or a log is useless a moment later. */

const CODE_LIFETIME_MS = 60 * 1000;

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Called by the CRM's sales-access page, for the signed-in Clerk user. Returns the code to put on the redirect back to the form. */
export const issueHandoff = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const staff = await requireStaff(ctx);
    if (!staff.roles.some((role) => role === "sales" || role === "admin")) {
      throw new ConvexError("Your account does not have sales access. Ask an Admin to add the Sales role.");
    }
    const code = randomHex(32);
    const expiresAt = Date.now() + CODE_LIFETIME_MS;
    const id = await ctx.db.insert("salesHandoffs", { code: await hashToken(code), email: staff.email, name: staff.name, expiresAt });
    await ctx.scheduler.runAt(expiresAt, internal.sales.clerk.expireHandoff, { id });
    return code;
  },
});

/** Called by the sales form with the code from the redirect. Needs no sign-in: holding a valid, unused code is the proof. */
export const redeemHandoff = mutation({
  args: { code: v.string() },
  returns: v.object({ token: v.string(), email: v.string(), name: v.string() }),
  handler: async (ctx, args) => {
    const expired = new ConvexError("That sign-in link has expired. Sign in again.");
    if (args.code.length !== 64) throw expired;
    const hashed = await hashToken(args.code);
    const row = await ctx.db.query("salesHandoffs").withIndex("by_code", (q) => q.eq("code", hashed)).unique();
    if (row === null) throw expired;
    await ctx.db.delete(row._id); // single use, whether or not it is still in date
    if (row.expiresAt <= Date.now()) throw expired;
    const token = randomHex(32);
    await ctx.runMutation(internal.sales.mutations.start, { token, email: row.email, name: row.name });
    return { token, email: row.email, name: row.name };
  },
});

export const expireHandoff = internalMutation({
  args: { id: v.id("salesHandoffs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if ((await ctx.db.get(args.id)) !== null) await ctx.db.delete(args.id);
    return null;
  },
});
