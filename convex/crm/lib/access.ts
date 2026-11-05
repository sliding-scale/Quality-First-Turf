import { env, type MutationCtx, type QueryCtx } from "../../_generated/server";

/* Who may call a CRM function (CRM/CLAUDE.md rule 3: access lives in Convex, never only in the UI).
   Every function in convex/crm/ starts with requireStaff(ctx).

   Clerk is not wired yet, so no signed-in identity can exist. Until it is, this FAILS CLOSED: it only lets a call through
   when the deployment sets CRM_ALLOW_ANONYMOUS_DEV to "true", which is for the dev deployment only. A production deploy
   without that variable rejects every CRM call. Roles and per-business access (D-014) are added here when Clerk arrives. */
export async function requireStaff(ctx: QueryCtx | MutationCtx): Promise<{ name: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return { name: identity.name ?? "Staff" };
  if (env.CRM_ALLOW_ANONYMOUS_DEV === "true") return { name: "Sal" };
  throw new Error("Not signed in.");
}
