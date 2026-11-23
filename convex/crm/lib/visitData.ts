/* The site visit kept in the CRM (D-114): one row per project with its work areas (name, service, size, notes, photos) and notes. A project
   made from the customer form starts from that form's work areas; once someone saves a visit here, this row is what the quote pre-fill and
   the takeoff read. The forms' own rows are only ever read, never changed. */

import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

export const MAX_AREAS = 30;
export const MAX_PHOTOS = 20;
export const MAX_NOTES = 3000;
export const MAX_LABEL = 80;
export const MAX_AREA_NOTES = 2000;

export type VisitAreaInput = {
  id: string;
  label: string;
  service: string;
  installType: string;
  length: number | null;
  width: number | null;
  quantity: number | null;
  notes: string;
  photoIds: Id<"_storage">[];
};

const positive = (n: number) => Number.isFinite(n) && n > 0 && n <= 100000;

/** The first thing wrong with a visit, in words for the person who typed it, or null when it can be saved. */
export function checkVisit(v: { notes: string; areas: VisitAreaInput[] }): string | null {
  if (v.notes.length > MAX_NOTES) return "The visit notes are too long.";
  if (v.areas.length > MAX_AREAS) return `A visit can have up to ${MAX_AREAS} work areas.`;
  const seen = new Set<string>();
  for (const a of v.areas) {
    if (seen.has(a.id)) return "A work area is listed twice.";
    seen.add(a.id);
    if (a.label.trim() === "") return "Give every work area a name.";
    if (a.label.length > MAX_LABEL) return `A work area's name can be up to ${MAX_LABEL} characters.`;
    if (a.notes.length > MAX_AREA_NOTES) return "A work area's notes are too long.";
    if (a.photoIds.length > MAX_PHOTOS) return `A work area can have up to ${MAX_PHOTOS} photos.`;
    if (a.length !== null && !positive(a.length)) return "Length must be more than 0.";
    if (a.width !== null && !positive(a.width)) return "Width must be more than 0.";
    if ((a.length === null) !== (a.width === null)) return "Enter both length and width, or neither.";
    if (a.quantity !== null && !positive(a.quantity)) return "Quantity must be more than 0.";
  }
  return null;
}

export const visitRowOf = (ctx: QueryCtx, opportunityId: Id<"opportunities">) =>
  ctx.db.query("opportunityVisits").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).unique();

export type ReadArea = {
  label: string; length: number | null; width: number | null; quantity: number | null; notes: string; service?: string; installType?: string; photoIds: Id<"_storage">[];
};

/** The project's work areas: the CRM visit if one was saved, otherwise the customer form's. Null when neither exists. */
export async function workAreasOf(ctx: QueryCtx, o: Doc<"opportunities">): Promise<ReadArea[] | null> {
  const row = await visitRowOf(ctx, o._id);
  if (row !== null) {
    return row.areas.map((a) => ({ label: a.label, length: a.length, width: a.width, quantity: a.quantity, notes: a.notes, service: a.service || undefined, installType: a.installType || undefined, photoIds: a.photoIds }));
  }
  if (!o.sourceProjectId) return null;
  const projectId = o.sourceProjectId;
  const rows = await ctx.db.query("workAreas").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(100);
  return rows.map((a) => ({ label: a.label, length: a.length, width: a.width, quantity: a.quantity, notes: a.notes, service: a.service, installType: a.installType, photoIds: a.photoIds }));
}
