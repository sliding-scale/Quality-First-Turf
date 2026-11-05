"use client";

import { createContext, useContext } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { EDIT_ROLES, type Role } from "@/convex/crm/lib/stages";

/** The signed-in, invited person. Used only to decide what to show: the backend checks every call again (rule 3). */
export type StaffMember = {
  _id: Id<"users">;
  name: string;
  email: string;
  roles: Role[];
  isAdmin: boolean;
  businessIds: Id<"businesses">[];
};

const Ctx = createContext<StaffMember | null>(null);
export const StaffProvider = Ctx.Provider;

export function useStaff(): StaffMember & { canEdit: boolean } {
  const staff = useContext(Ctx);
  if (!staff) throw new Error("useStaff must be used inside the signed-in app");
  return { ...staff, canEdit: staff.roles.some((r) => EDIT_ROLES.includes(r)) };
}
