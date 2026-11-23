import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireProject } from "./lib/access";
import { logActivity } from "./lib/activity";
import { allows, pipelineModule } from "./lib/permissions";
import { checkVisit, visitRowOf, workAreasOf } from "./lib/visitData";

/* The Visit tab's work areas and photos (D-114): saved on the project itself, for any business. A project made from the customer form
   starts from that form's work areas. The forms' rows are read here and never changed. */

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const areaV = v.object({
  id: v.string(), label: v.string(), service: v.string(), installType: v.string(),
  length: v.union(v.number(), v.null()), width: v.union(v.number(), v.null()), quantity: v.union(v.number(), v.null()),
  notes: v.string(), photoIds: v.array(v.id("_storage")),
});

export const get = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, a) => {
    const o = await ctx.db.get(a.id);
    if (o === null) return { source: "none" as const, notes: "", visitedAt: null as number | null, canEdit: false, areas: [] };
    const staff = await requireProject(ctx, o, pipelineModule(o.pipeline), "view");
    const row = await visitRowOf(ctx, o._id);
    const read = await workAreasOf(ctx, o);
    const form = !row && o.sourceProjectId ? await ctx.db.get(o.sourceProjectId) : null;
    const areas = [];
    for (const [i, w] of (read ?? []).entries()) {
      const photos: { id: Id<"_storage">; url: string }[] = [];
      for (const pid of w.photoIds.slice(0, 20)) {
        const url = await ctx.storage.getUrl(pid);
        if (url) photos.push({ id: pid, url });
      }
      areas.push({ id: row?.areas[i]?.id ?? `form-${i}`, label: w.label, service: w.service ?? "", installType: w.installType ?? "", length: w.length, width: w.width, quantity: w.quantity, notes: w.notes, photos });
    }
    return {
      source: row ? ("crm" as const) : read ? ("form" as const) : ("none" as const),
      notes: row?.notes ?? form?.notes ?? "",
      visitedAt: row?.visitedAt ?? (null as number | null),
      canEdit: allows(staff.levels[pipelineModule(o.pipeline)], "edit"),
      areas,
    };
  },
});

/** Saves the whole visit (areas, photos and notes) in one go. `complete` stamps the visit date. */
export const save = mutation({
  args: { id: v.id("opportunities"), notes: v.string(), areas: v.array(areaV), complete: v.boolean(), now: v.number() },
  handler: async (ctx, a) => {
    const o = await ctx.db.get(a.id);
    if (o === null) throw new ConvexError("That project no longer exists.");
    const staff = await requireProject(ctx, o, pipelineModule(o.pipeline), "edit");
    const problem = checkVisit({ notes: a.notes, areas: a.areas });
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
    const row = await visitRowOf(ctx, o._id);
    const fields = { notes: a.notes, areas, updatedAt: a.now, updatedByName: staff.name };
    if (row) await ctx.db.patch(row._id, { ...fields, ...(a.complete ? { visitedAt: a.now } : {}) });
    else await ctx.db.insert("opportunityVisits", { businessId: o.businessId, opportunityId: o._id, ...fields, ...(a.complete ? { visitedAt: a.now } : {}) });

    // A photo taken out of the visit is deleted, unless the customer form's work areas also use it.
    if (row) {
      const kept = new Set(areas.flatMap((x) => x.photoIds));
      const removed = row.areas.flatMap((x) => x.photoIds).filter((pid) => !kept.has(pid));
      if (removed.length > 0) {
        const projectId = o.sourceProjectId;
        const formUses = new Set<Id<"_storage">>();
        if (projectId) for (const w of await ctx.db.query("workAreas").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).take(100)) for (const pid of w.photoIds) formUses.add(pid);
        for (const pid of new Set(removed)) if (!formUses.has(pid)) await ctx.storage.delete(pid);
      }
    }
    await logActivity(ctx, {
      businessId: o.businessId, clientId: o.clientId, opportunityId: o._id, staff,
      title: a.complete ? "Site visit completed" : "Site visit saved",
      detail: `${areas.length} work area${areas.length === 1 ? "" : "s"}`,
    });
    return null;
  },
});
