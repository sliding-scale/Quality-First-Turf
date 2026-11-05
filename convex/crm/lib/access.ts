import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { EDIT_ROLES, type Role } from "./stages";

export type { Role };

/* Who may call a CRM function (CRM/CLAUDE.md rule 3: access lives in Convex, never only in the UI; D-006, D-014, D-046).
   Every function in convex/crm/ starts with one of these helpers, which check, in order:
     1. there is a signed-in Clerk identity,
     2. that person has an active row in the users table (invite-only: signing up in Clerk gives nothing by itself),
     3. their role allows the action, and
     4. for anything inside a business, they belong to that business (an Admin belongs to all of them). */

export type Staff = {
  userId: Id<"users">;
  name: string;
  email: string;
  roles: Role[];
  isAdmin: boolean;
  /** Which businesses they may work in. An Admin may work in all of them. */
  businessIds: Id<"businesses">[];
};

export async function requireStaff(ctx: QueryCtx | MutationCtx): Promise<Staff> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not signed in.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user || user.status !== "active") throw new ConvexError("No access.");
  return {
    userId: user._id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    isAdmin: user.roles.includes("admin"),
    businessIds: user.businessIds,
  };
}

export const canEdit = (staff: Staff) => staff.roles.some((r) => EDIT_ROLES.includes(r));
export const canSee = (staff: Staff, businessId: Id<"businesses">) => staff.isAdmin || staff.businessIds.includes(businessId);

/** Signed in, active, and a member of this business. */
export async function requireBusiness(ctx: QueryCtx | MutationCtx, businessId: Id<"businesses">): Promise<Staff> {
  const staff = await requireStaff(ctx);
  if (!canSee(staff, businessId)) throw new ConvexError("No access to this business.");
  return staff;
}

/** Like requireBusiness, and the role must allow changes. */
export async function requireEditor(ctx: QueryCtx | MutationCtx, businessId: Id<"businesses">): Promise<Staff> {
  const staff = await requireBusiness(ctx, businessId);
  if (!canEdit(staff)) throw new ConvexError("Your role can view this but not change it.");
  return staff;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Staff> {
  const staff = await requireStaff(ctx);
  if (!staff.isAdmin) throw new ConvexError("Only an Admin can do this.");
  return staff;
}
