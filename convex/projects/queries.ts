import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { activeSalesSession } from "../sales/session";
import schema, { projectStatus } from "../schema";

const workAreaLimit = 100;

export const get = internalQuery({
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

const salesProject = v.object({
  projectId: v.id("projects"),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  street1: v.string(),
  street2: v.string(),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  phone: v.string(),
  services: v.array(v.string()),
  status: projectStatus,
  createdAt: v.number(),
});

export const listForSales = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    signedIn: v.boolean(),
    projects: v.array(salesProject),
  }),
  handler: async (ctx, args) => {
    if ((await activeSalesSession(ctx, args.sessionToken)) === null) {
      return { signedIn: false, projects: [] };
    }
    const projects = await ctx.db.query("projects").order("desc").take(200);
    return {
      signedIn: true,
      projects: projects.map((project) => ({
        projectId: project._id,
        firstName: project.firstName,
        lastName: project.lastName,
        email: project.email,
        street1: project.street1,
        street2: project.street2,
        city: project.city,
        state: project.state,
        zip: project.zip,
        phone: project.phone,
        services: project.services,
        status: project.status,
        createdAt: project._creationTime,
      })),
    };
  },
});

export const visit = query({
  args: {
    sessionToken: v.string(),
    projectId: v.id("projects"),
  },
  returns: v.union(
    v.object({ access: v.literal("signed-out") }),
    v.null(),
    v.object({
      access: v.literal("ok"),
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
    if ((await activeSalesSession(ctx, args.sessionToken)) === null) {
      return { access: "signed-out" as const };
    }
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
    return { access: "ok" as const, project, workAreas };
  },
});
