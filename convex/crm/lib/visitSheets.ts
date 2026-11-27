/* One sheet of work areas per visit (D-133). Which Schedule items are visits, what each one holds, and removing them with their project. */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { visitRowOf, type VisitAreaInput } from "./visitData";

/** The one "L x W ft" a customer form answer recorded for this area, or nulls when it had none or had several rectangles. */
function dimensionsFromAnswers(answers: { question: string; value: string }[], m: { label: string; service?: string; installType?: string }): { length: number | null; width: number | null } {
  const none = { length: null, width: null };
  if (!m.service) return none;
  const prefix = `${m.installType ?? ""}: ${m.label}: `;
  const hit = answers.find((a) => a.question === `${m.service} area detail` && a.value.startsWith(prefix));
  const match = hit?.value.slice(prefix.length).match(/^([\d.]+) x ([\d.]+) ft = /);
  if (!match) return none;
  const length = Number(match[1]);
  const width = Number(match[2]);
  return length > 0 && width > 0 ? { length, width } : none;
}

/** What a project's first visit starts from: the project's saved copy, else the customer form's work areas, else the areas the customer
 *  named and sized on the form, so the salesperson confirms them (and adds photos) instead of typing them again (client, 2026-11-24). */
export async function startingAreas(ctx: QueryCtx, o: Doc<"opportunities">): Promise<VisitAreaInput[]> {
  const row = await visitRowOf(ctx, o._id);
  if (row) return row.areas;
  const projectId = o.sourceProjectId;
  if (!projectId) return [];
  const rows = await ctx.db.query("workAreas").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(100);
  if (rows.length > 0) {
    return rows.map((w, i) => ({ id: `form-${i}`, label: w.label, service: w.service ?? "", installType: w.installType ?? "", length: w.length, width: w.width, quantity: w.quantity, notes: w.notes, photoIds: w.photoIds }));
  }
  const form = await ctx.db.get(projectId);
  if (!form) return [];
  return form.measurements.map((m, i) => {
    const size = m.squareFeet ?? m.linearFeet;
    // Requests saved before the form kept length and width only have them in the answers ("Deluxe: Back yard: 20 x 23 ft = 460 sq ft").
    const dims = m.length === null && m.width === null ? dimensionsFromAnswers(form.answers, m) : { length: m.length, width: m.width };
    return {
      id: `form-${i}`, label: m.label, service: m.service ?? "", installType: m.installType ?? "", length: dims.length, width: dims.width,
      quantity: dims.length === null && dims.width === null ? size : null, notes: "", photoIds: [],
    };
  });
}

/** The consultation and the follow-up visits on the Schedule, oldest first. Construction visits have their own tab. */
export async function projectVisits(ctx: QueryCtx, opportunityId: Id<"opportunities">) {
  const events = await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(100);
  return events.filter((e) => e.type === "consultation" || (e.type === "visit" && e.visitKind === undefined)).sort((x, y) => x.start - y.start);
}

/** Each visit with its saved sheet (or null) and the areas it shows: its own, or else those of the visit before it. */
export async function resolveVisits(ctx: QueryCtx, o: Doc<"opportunities">) {
  const sheets = await ctx.db.query("visitSheets").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(100);
  let carried = await startingAreas(ctx, o);
  const out: { event: Doc<"calendarEvents">; sheet: Doc<"visitSheets"> | null; areas: VisitAreaInput[] }[] = [];
  for (const event of await projectVisits(ctx, o._id)) {
    const sheet = sheets.find((s) => s.eventId === event._id) ?? null;
    carried = sheet ? sheet.areas : carried;
    out.push({ event, sheet, areas: carried });
  }
  return out;
}

/** Removes a project's visit sheets (used when the project itself is deleted). */
export async function deleteVisitSheets(ctx: MutationCtx, opportunityId: Id<"opportunities">) {
  for (const s of await ctx.db.query("visitSheets").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(200)) await ctx.db.delete(s._id);
}
