import { v } from "convex/values";
import { query } from "../_generated/server";
import schema from "../schema";

const workAreaLimit = 100;

export const get = query({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.null(),
    v.object({
      project: schema.doc("projects"),
      workAreas: v.array(schema.doc("workAreas")),
    }),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (project === null) {
      return null;
    }
    const workAreas = await ctx.db
      .query("workAreas")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(workAreaLimit);
    return { project, workAreas };
  },
});

export const visit = query({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.null(),
    v.object({
      project: schema.doc("projects"),
      workAreas: v.array(
        v.object({
          label: v.string(),
          length: v.union(v.number(), v.null()),
          width: v.union(v.number(), v.null()),
          quantity: v.union(v.number(), v.null()),
          notes: v.string(),
          photoIds: v.array(v.id("_storage")),
          photoUrls: v.array(v.union(v.string(), v.null())),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (project === null) {
      return null;
    }
    const stored = await ctx.db
      .query("workAreas")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(workAreaLimit);
    const workAreas = [];
    for (const area of stored) {
      const photoUrls = [];
      for (const photoId of area.photoIds) {
        photoUrls.push(await ctx.storage.getUrl(photoId));
      }
      workAreas.push({
        label: area.label,
        length: area.length,
        width: area.width,
        quantity: area.quantity,
        notes: area.notes,
        photoIds: area.photoIds,
        photoUrls,
      });
    }
    return { project, workAreas };
  },
});
