import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { EDIT_ROLES, type Role } from "./stages";
import { allows, assignedOnlyOf, canSeeRecord, levelsOf, type Level, type Module } from "./permissions";

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
  /** Their level in every module: the roles' presets plus the Admin's overrides (permissions.ts). */
  levels: Record<Module, Level>;
  /** Only the records assigned to them (installerIds, project manager, salesperson). */
  assignedOnly: boolean;
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
    levels: levelsOf(user.roles, user.permissions),
    assignedOnly: assignedOnlyOf(user.roles, user.assignedOnly),
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

/** Moving a card inside Construction is also the Project Manager's job (PRD 4.6: job walks, progress, punch list), so that one move is open to
 *  them. Everything else about a project still needs an editing role. */
export async function requireMover(ctx: QueryCtx | MutationCtx, businessId: Id<"businesses">, pipeline: string): Promise<Staff> {
  const staff = await requireBusiness(ctx, businessId);
  if (!canEdit(staff) && !(pipeline === "Construction" && staff.roles.includes("pm"))) throw new ConvexError("Your role can view this but not change it.");
  return staff;
}

/** Who handles money (design 2026-11-18): Admin and Office Team create, edit and send invoices and record payments. Sales and Project Managers
 *  can look at a business's invoices and payments (requireBusiness) but not change them. */
export const canBill = (staff: Staff) => staff.roles.includes("admin") || staff.roles.includes("office");

/** Like requireBusiness, and the role must allow handling money. */
export async function requireBilling(ctx: QueryCtx | MutationCtx, businessId: Id<"businesses">): Promise<Staff> {
  const staff = await requireBusiness(ctx, businessId);
  if (!canBill(staff)) throw new ConvexError("Your role can view invoices and payments but not change them.");
  return staff;
}

/** The words for a refusal. Money modules keep their own wording; a level of "none" is no access at all. */
const MONEY_MODULES: readonly Module[] = ["invoices", "payments", "pipelineFinance"];
function refusal(module: Module, have: Level, need: Level): string {
  if (have === "none") return "You do not have access to this.";
  if (need === "full") return "Only an Admin can do this.";
  return MONEY_MODULES.includes(module) ? "Your role can view invoices and payments but not change them." : "Your role can view this but not change it.";
}

/** Signed in, active, in this business, and their level in `module` is at least `need` (PRD 5.5, design 2026-11-18-permissions). This is the one
 *  place permissions are enforced; the older helpers above are kept for what has not moved onto it. */
export async function requireModule(ctx: QueryCtx | MutationCtx, businessId: Id<"businesses">, module: Module, need: Level): Promise<Staff> {
  const staff = await requireBusiness(ctx, businessId);
  if (!allows(staff.levels[module], need)) throw new ConvexError(refusal(module, staff.levels[module], need));
  return staff;
}

/** requireModule, and for a person limited to their own records the project must be one of them. Such a project looks like it does not exist. */
export async function requireProject(
  ctx: QueryCtx | MutationCtx,
  project: { businessId: Id<"businesses">; salespersonId?: Id<"users">; projectManagerId?: Id<"users">; installerIds?: Id<"users">[] },
  module: Module,
  need: Level,
): Promise<Staff> {
  const staff = await requireModule(ctx, project.businessId, module, need);
  if (!canSeeRecord({ assignedOnly: staff.assignedOnly, userId: staff.userId }, project)) throw new ConvexError("That project no longer exists.");
  return staff;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Staff> {
  const staff = await requireStaff(ctx);
  if (!staff.isAdmin) throw new ConvexError("Only an Admin can do this.");
  return staff;
}
