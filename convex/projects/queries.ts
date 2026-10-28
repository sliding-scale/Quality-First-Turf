import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import { activeSalesSession } from "../sales/session";
import schema, { changeValidator, projectStatus } from "../schema";

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
  shortCode: v.union(v.string(), v.null()),
  visitedAt: v.union(v.number(), v.null()),
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
  /** True when the signed-in salesperson holds this lead. */
  assignedToMe: v.boolean(),
  /** True when a different salesperson holds it. */
  assignedToOther: v.boolean(),
});

const listLimit = 200;

export const listForSales = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    signedIn: v.boolean(),
    truncated: v.boolean(),
    projects: v.array(salesProject),
  }),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken);
    if (session === null) {
      return { signedIn: false, truncated: false, projects: [] };
    }
    const found = await ctx.db.query("projects").order("desc").take(listLimit + 1);
    const projects = found.slice(0, listLimit);
    return {
      signedIn: true,
      truncated: found.length > listLimit,
      projects: projects.map((project) => ({
        projectId: project._id,
        shortCode: project.shortCode ?? null,
        visitedAt: project.visitedAt ?? null,
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
        assignedToMe: project.assignedTo !== undefined && project.assignedTo === session.email,
        assignedToOther: project.assignedTo !== undefined && project.assignedTo !== session.email,
      })),
    };
  },
});

/** Lets `/visit/K7M3PQ` work in place of the long database id. */
export const resolveCode = query({
  args: { sessionToken: v.string(), code: v.string() },
  returns: v.union(v.id("projects"), v.null()),
  handler: async (ctx, args) => {
    if ((await activeSalesSession(ctx, args.sessionToken)) === null) return null;
    const code = args.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) return null;
    const project = await ctx.db
      .query("projects")
      .withIndex("by_shortCode", (q) => q.eq("shortCode", code))
      .first();
    return project?._id ?? null;
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
      /** Whether the project has a Jobber request a consultation can be booked on. */
      canSchedule: v.boolean(),
      /** Whether the lead is unassigned, held by the signed-in salesperson, or held by someone else. */
      assignment: v.union(v.literal("none"), v.literal("me"), v.literal("other")),
      project: schema
        .doc("projects")
        .omit(
          "jobberClientId",
          "jobberRequestId",
          "jobberQuoteId",
          "missingMapping",
          "integrationError",
          "draftingUntil",
          "assignedTo",
        ),
      revisions: v.array(
        v.object({
          savedAt: v.number(),
          changes: v.array(changeValidator),
        }),
      ),
      workAreas: v.array(
        v.object({
          label: v.string(),
          length: v.union(v.number(), v.null()),
          width: v.union(v.number(), v.null()),
          quantity: v.union(v.number(), v.null()),
          notes: v.string(),
          photoIds: v.array(v.id("_storage")),
          photoUrls: v.array(v.union(v.string(), v.null())),
          service: v.optional(v.string()),
          installType: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken);
    if (session === null) {
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
        service: area.service,
        installType: area.installType,
      });
    }
    const canSchedule = Boolean(project.jobberRequestId);
    const {
      jobberClientId: _client,
      jobberRequestId: _request,
      jobberQuoteId: _quote,
      missingMapping: _mapping,
      integrationError: _error,
      draftingUntil: _drafting,
      assignedTo,
      ...visible
    } = project;
    const storedRevisions = await ctx.db
      .query("visitRevisions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(30);
    const revisions = storedRevisions.map((revision) => ({
      savedAt: revision.savedAt,
      changes: revision.changes,
    }));
    const assignment =
      assignedTo === undefined ? ("none" as const) : assignedTo === session.email ? ("me" as const) : ("other" as const);
    return { access: "ok" as const, canSchedule, assignment, project: visible, workAreas, revisions };
  },
});
