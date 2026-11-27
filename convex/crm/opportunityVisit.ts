import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { requireProject, requireStaff } from "./lib/access";
import { logActivity } from "./lib/activity";
import { allows, pipelineModule } from "./lib/permissions";
import { checkVisit, MAX_NOTES, visitRowOf, type VisitAreaInput } from "./lib/visitData";
import { projectVisits, resolveVisits, startingAreas } from "./lib/visitSheets";

/* The Visit tab (D-114, redone in D-133): every visit of a project (the consultation and the follow-up visits on the Schedule) has its own
   work areas and photos, kept in `visitSheets`. A visit not saved yet shows what the visit before it holds. The project's own visit row
   (`opportunityVisits`) keeps the notes and a copy of the areas the quote and the takeoff read: the latest saved visit's. The forms' rows
   are read here and never changed. */

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const areaV = v.object({
  id: v.string(), label: v.string(), service: v.string(), installType: v.string(),
  length: v.union(v.number(), v.null()), width: v.union(v.number(), v.null()), quantity: v.union(v.number(), v.null()),
  notes: v.string(), photoIds: v.array(v.id("_storage")),
});

async function withPhotoUrls(ctx: QueryCtx, areas: VisitAreaInput[], urls: Map<Id<"_storage">, string | null>) {
  const out = [];
  for (const a of areas) {
    const photos: { id: Id<"_storage">; url: string }[] = [];
    for (const pid of a.photoIds.slice(0, 20)) {
      if (!urls.has(pid)) urls.set(pid, await ctx.storage.getUrl(pid));
      const url = urls.get(pid);
      if (url) photos.push({ id: pid, url });
    }
    out.push({ id: a.id, label: a.label, service: a.service, installType: a.installType, length: a.length, width: a.width, quantity: a.quantity, notes: a.notes, photos });
  }
  return out;
}

/** Everything the Visit tab shows: where the property is, the notes, and each visit with its work areas, oldest first. The address is the one
 *  the customer form gave when the project came from it, otherwise the client's. */
export const tab = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const o = await ctx.db.get(a.id);
    if (o === null) return null;
    await requireProject(ctx, o, pipelineModule(o.pipeline), "view");
    const staff = await requireStaff(ctx);
    const [client, form, row] = await Promise.all([ctx.db.get(o.clientId), o.sourceProjectId ? ctx.db.get(o.sourceProjectId) : null, visitRowOf(ctx, o._id)]);
    const from = form?.street1 ? form : client;
    const urls = new Map<Id<"_storage">, string | null>();
    const visits = [];
    for (const r of await resolveVisits(ctx, o)) {
      const e = r.event;
      visits.push({
        id: e._id, type: e.type as "consultation" | "visit", title: e.title, start: e.start, end: e.end, anytime: e.anytime, status: e.status, bookingNotes: e.notes,
        assigneeIds: e.assigneeIds, offline: e.offline ?? false, saved: r.sheet !== null, completedAt: r.sheet?.completedAt ?? null,
        areas: await withPhotoUrls(ctx, r.areas, urls),
      });
    }
    return {
      address: from ? [from.street1, from.city, [from.state, from.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "",
      notes: row?.notes ?? form?.notes ?? "",
      canEdit: allows(staff.levels[pipelineModule(o.pipeline)], "edit"),
      canBook: allows(staff.levels.schedule, "edit"),
      canQuote: allows(staff.levels.quotes, "edit"),
      products: form?.products ?? [],
      addOns: form?.addOns ?? [],
      visits,
    };
  },
});

/** The photos of the project that something still uses: any visit's, the project's own copy, the customer form's, and quote lines'. */
async function photosInUse(ctx: QueryCtx, o: Doc<"opportunities">) {
  const used = new Set<Id<"_storage">>();
  const add = (areas: { photoIds: Id<"_storage">[] }[]) => { for (const a of areas) for (const pid of a.photoIds) used.add(pid); };
  for (const s of await ctx.db.query("visitSheets").withIndex("by_opportunity", (q) => q.eq("opportunityId", o._id)).take(100)) add(s.areas);
  const row = await visitRowOf(ctx, o._id);
  if (row) add(row.areas);
  const projectId = o.sourceProjectId;
  if (projectId) add(await ctx.db.query("workAreas").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(100));
  for (const quote of await ctx.db.query("quotes").withIndex("by_opportunityId", (q) => q.eq("opportunityId", o._id)).take(50)) {
    for (const line of await ctx.db.query("quoteLineItems").withIndex("by_quoteId_and_position", (q) => q.eq("quoteId", quote._id)).take(200)) {
      for (const pid of line.visitPhotoIds ?? []) used.add(pid);
    }
  }
  return used;
}

/** Saves one visit's work areas and photos. `complete` marks the visit done (on the Schedule too); `approve`, allowed on the latest visit
 *  only (D-134), also makes its areas the ones the next quote starts from. */
export const saveSheet = mutation({
  args: { id: v.id("opportunities"), eventId: v.id("calendarEvents"), areas: v.array(areaV), complete: v.boolean(), approve: v.optional(v.boolean()), now: v.number() },
  handler: async (ctx, a) => {
    const o = await ctx.db.get(a.id);
    if (o === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireProject(ctx, o, pipelineModule(o.pipeline), "edit");
    const events = await projectVisits(ctx, o._id);
    if (!events.some((e) => e._id === a.eventId)) throw new ConvexError("That visit is no longer on the Schedule. Reload the page.");
    const approve = a.approve === true;
    const complete = a.complete || approve;
    const problem = checkVisit({ notes: "", areas: a.areas });
    if (problem) throw new ConvexError(problem);
    const areas = a.areas.map((x) => ({ ...x, label: x.label.trim() }));
    for (const area of areas) {
      for (const pid of area.photoIds) {
        const meta = await ctx.db.system.get("_storage", pid);
        if (meta === null) throw new ConvexError("A photo was not uploaded. Try again.");
        if (!(meta.contentType ?? "").toLowerCase().startsWith("image/")) throw new ConvexError("A photo has to be an image.");
        if (meta.size > MAX_PHOTO_BYTES) throw new ConvexError("A photo can be at most 15 MB.");
      }
    }

    const before = await resolveVisits(ctx, o);
    const at = before.findIndex((r) => r.event._id === a.eventId);
    const { event, sheet } = before[at];
    if (approve && (event.status === "lost" || before.slice(at + 1).some((r) => r.event.status !== "lost"))) {
      throw new ConvexError("A quote is drafted from the latest visit. Reload the page.");
    }
    const stamp = { updatedAt: a.now, updatedByName: staff.name };
    // Earlier visits that were never saved keep what they showed, so they do not change when the project's copy does.
    for (const earlier of before.slice(0, at)) {
      if (earlier.sheet === null) await ctx.db.insert("visitSheets", { businessId: o.businessId, opportunityId: o._id, eventId: earlier.event._id, areas: earlier.areas, ...stamp });
    }
    const row = await visitRowOf(ctx, o._id);
    const dropped = [...(sheet?.areas ?? []), ...(row?.areas ?? [])].flatMap((x) => x.photoIds);
    const done = complete ? { completedAt: a.now } : {};
    if (sheet) await ctx.db.patch(sheet._id, { areas, ...stamp, ...done });
    else await ctx.db.insert("visitSheets", { businessId: o.businessId, opportunityId: o._id, eventId: event._id, areas, ...stamp, ...done });

    // The project's copy (what the quote and takeoff read) follows the latest saved visit, or the approved one.
    if (approve || !before.slice(at + 1).some((r) => r.sheet !== null)) {
      const notes = row?.notes ?? (o.sourceProjectId ? ((await ctx.db.get(o.sourceProjectId))?.notes ?? "") : "");
      const fields = { areas, notes: notes.slice(0, MAX_NOTES), ...stamp, ...(complete ? { visitedAt: a.now } : {}) };
      if (row) await ctx.db.patch(row._id, fields);
      else await ctx.db.insert("opportunityVisits", { businessId: o.businessId, opportunityId: o._id, ...fields });
    } else if (row && complete) {
      await ctx.db.patch(row._id, { visitedAt: a.now });
    }
    if (complete && event.status !== "completed") await ctx.db.patch(event._id, { status: "completed", updatedAt: a.now });

    // A photo taken out of the visit is deleted once nothing else uses it.
    if (dropped.length > 0) {
      const used = await photosInUse(ctx, o);
      for (const pid of new Set(dropped)) if (!used.has(pid)) await ctx.storage.delete(pid);
    }
    await logActivity(ctx, {
      businessId: o.businessId, clientId: o.clientId, opportunityId: o._id, staff,
      title: approve ? "Site visit approved for a quote" : complete ? "Site visit completed" : "Site visit saved",
      detail: `${event.title} · ${areas.length} work area${areas.length === 1 ? "" : "s"}`,
    });
    return null;
  },
});

/** The visit notes (gate codes, access, pets): one set for the property, beside the visits. */
export const saveNotes = mutation({
  args: { id: v.id("opportunities"), notes: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const o = await ctx.db.get(a.id);
    if (o === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireProject(ctx, o, pipelineModule(o.pipeline), "edit");
    if (a.notes.length > MAX_NOTES) throw new ConvexError("The visit notes are too long.");
    const row = await visitRowOf(ctx, o._id);
    const fields = { notes: a.notes, updatedAt: a.now, updatedByName: staff.name };
    // A new row carries the starting areas along, or saving notes alone would hide the customer form's work areas.
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("opportunityVisits", { businessId: o.businessId, opportunityId: o._id, areas: await startingAreas(ctx, o), ...fields });
    return null;
  },
});
