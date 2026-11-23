/* The activities table (D-007, D-113): an append-only record of significant changes to a client, such as who edited it and when. It holds
   field NAMES, never their contents, so a phone number or an address is not copied into a log. Stage moves, quote events and invoice
   events keep their own logs and are read from there, not copied here (crm/clientActivity.ts). */

import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/** The client fields worth naming in an "edited" entry, in the order they are listed. */
const CLIENT_FIELD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["name", "Name"], ["type", "Type"], ["company", "Company"], ["phone", "Phone"], ["email", "Email"],
  ["street1", "Street"], ["street2", "Street line 2"], ["city", "City"], ["state", "State"], ["zip", "ZIP"], ["notes", "Notes"], ["businessId", "Business"],
];

/** Labels of the fields whose value differs between two versions of a client. */
export function changedClientFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return CLIENT_FIELD_LABELS.filter(([key]) => before[key] !== after[key]).map(([, label]) => label);
}

export type ActivityInput = {
  businessId: Id<"businesses">;
  clientId?: Id<"clients">;
  opportunityId?: Id<"opportunities">;
  title: string;
  detail?: string;
  staff: { userId: Id<"users">; name: string };
};

export async function logActivity(ctx: MutationCtx, a: ActivityInput): Promise<void> {
  await ctx.db.insert("activities", {
    businessId: a.businessId,
    ...(a.clientId ? { clientId: a.clientId } : {}),
    ...(a.opportunityId ? { opportunityId: a.opportunityId } : {}),
    title: a.title,
    detail: a.detail ?? "",
    byName: a.staff.name,
    byUserId: a.staff.userId,
    at: Date.now(),
  });
}
