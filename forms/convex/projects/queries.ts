import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalQuery, query } from "../_generated/server";
import { salespersonName } from "../sales/accounts";
import { activeSalesSession } from "../sales/session";
import schema, { measuredSectionValidator, projectStatus, answerValidator, measurementValidator } from "../schema";

const workAreaLimit = 100;

const workAreaView = v.object({
  label: v.string(),
  length: v.union(v.number(), v.null()),
  width: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
  notes: v.string(),
  photoIds: v.array(v.id("_storage")),
  photoUrls: v.array(v.union(v.string(), v.null())),
  service: v.optional(v.string()),
  installType: v.optional(v.string()),
  sections: v.optional(v.array(measuredSectionValidator)),
});

/** One saved visit (the consultation or a follow-up) as its read-only card shows it. */
const visitCard = v.object({
  visit: v.number(),
  savedAt: v.number(),
  salesperson: v.optional(v.string()),
  booking: v.optional(v.object({ date: v.string(), time: v.string(), minutes: v.number() })),
  firstName: v.string(),
  lastName: v.string(),
  phone: v.string(),
  email: v.string(),
  street1: v.string(),
  street2: v.string(),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  services: v.array(v.string()),
  products: v.array(v.string()),
  answers: v.array(answerValidator),
  notes: v.string(),
  measurements: v.array(measurementValidator),
  workAreas: v.array(workAreaView),
});

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
  /** Who holds the lead, for every salesperson to see; null when unassigned. */
  assignedToName: v.union(v.string(), v.null()),
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
        assignedToName: project.assignedTo === undefined ? null : salespersonName(project.assignedTo),
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
      /** Display name of whoever holds the lead; null when nobody does. */
      assignedToName: v.union(v.string(), v.null()),
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
      /** Saved visits, oldest first: the consultation, then each follow-up. */
      visits: v.array(visitCard),
      workAreas: v.array(workAreaView),
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
    const withPhotoUrls = async (areas: typeof stored | Doc<"visitSnapshots">["workAreas"]) => {
      const result = [];
      for (const area of areas) {
        const photoUrls = [];
        for (const photoId of area.photoIds) {
          photoUrls.push(await ctx.storage.getUrl(photoId));
        }
        result.push({
          label: area.label,
          length: area.length,
          width: area.width,
          quantity: area.quantity,
          notes: area.notes,
          photoIds: area.photoIds,
          photoUrls,
          service: area.service,
          installType: area.installType,
          sections: area.sections,
        });
      }
      return result;
    };
    const workAreas = await withPhotoUrls(stored);
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
    const savedVisits = await ctx.db
      .query("visitSnapshots")
      .withIndex("by_projectId_and_visit", (q) => q.eq("projectId", args.projectId))
      .take(50);
    const visits = [];
    for (const card of savedVisits) {
      const { _id: _cardId, _creationTime: _cardCreated, projectId: _cardProject, addOns: _cardAddOns, ...shown } = card;
      visits.push({ ...shown, workAreas: await withPhotoUrls(card.workAreas) });
    }
    const assignment =
      assignedTo === undefined ? ("none" as const) : assignedTo === session.email ? ("me" as const) : ("other" as const);
    return {
      access: "ok" as const,
      canSchedule,
      assignment,
      assignedToName: assignedTo === undefined ? null : salespersonName(assignedTo),
      project: visible,
      workAreas,
      visits,
    };
  },
});
