"use client";

import { createContext, useContext } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { allows, type Level, type Module } from "@/convex/crm/lib/permissions";
import type { Role } from "@/convex/crm/lib/stages";

/** The signed-in, invited person. Used only to decide what to show: the backend checks every call again (rule 3). */
export type StaffMember = {
  _id: Id<"users">;
  name: string;
  email: string;
  roles: Role[];
  isAdmin: boolean;
  businessIds: Id<"businesses">[];
  /** Their level in every module (the roles' presets plus the Admin's overrides) and whether they only see their own records. */
  levels: Record<Module, Level>;
  assignedOnly: boolean;
};

const Ctx = createContext<StaffMember | null>(null);
export const StaffProvider = Ctx.Provider;

export function useStaff(): StaffMember & { canEdit: boolean; can: (module: Module, level?: Level) => boolean } {
  const staff = useContext(Ctx);
  if (!staff) throw new Error("useStaff must be used inside the signed-in app");
  const can = (module: Module, level: Level = "view") => allows(staff.levels[module], level);
  // "canEdit" is the core records: someone who can change clients, requests or quotes.
  return { ...staff, canEdit: can("clients", "edit") || can("requests", "edit") || can("quotes", "edit"), can };
}
