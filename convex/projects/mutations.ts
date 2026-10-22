import { v } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import {
  answerValidator,
  measurementValidator,
  projectStatus,
  workAreaInput,
} from "../schema";

const workAreaLimit = 100;

const nullableString = v.union(v.string(), v.null());

function areaBandFor(squareFeet: number): string {
  if (squareFeet <= 299) return "299 SF & under";
  if (squareFeet <= 699) return "300-699";
  if (squareFeet <= 999) return "700-999";
  if (squareFeet <= 1499) return "1000-1499";
  if (squareFeet <= 1999) return "1500-1999";
  return "2000+";
}

function withSquareFeet<
  T extends {
    length: number | null;
    width: number | null;
    unmeasured: boolean;
    squareFeet: number | null;
  },
>(measurement: T): T & { squareFeet: number | null; areaBand: string | null } {
  const squareFeet =
    measurement.unmeasured ||
    measurement.length === null ||
    measurement.width === null
      ? null
      : measurement.length * measurement.width;
  return {
    ...measurement,
    squareFeet,
    areaBand: squareFeet === null ? null : areaBandFor(squareFeet),
  };
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
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
    products: v.optional(v.array(v.string())),
    addOns: v.optional(v.array(v.string())),
    answers: v.optional(v.array(answerValidator)),
    notes: v.optional(v.string()),
    measurements: v.optional(v.array(measurementValidator)),
    workAreas: v.optional(v.array(workAreaInput)),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const projectId = await ctx.db.insert("projects", {
      status: "discovery saved",
      firstName: args.firstName,
      lastName: args.lastName,
      phone: args.phone,
      email: args.email,
      street1: args.street1,
      street2: args.street2,
      city: args.city,
      state: args.state,
      zip: args.zip,
      services: args.services,
      products: args.products ?? [],
      addOns: args.addOns ?? [],
      answers: args.answers ?? [],
      notes: args.notes ?? "",
      measurements: (args.measurements ?? []).map(withSquareFeet),
      jobberClientId: null,
      jobberRequestId: null,
      jobberQuoteId: null,
      missingMapping: null,
      integrationError: null,
    });

    for (const workArea of args.workAreas ?? []) {
      await ctx.db.insert("workAreas", { projectId, ...workArea });
    }

    return projectId;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    status: v.optional(projectStatus),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    street1: v.optional(v.string()),
    street2: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    services: v.optional(v.array(v.string())),
    products: v.optional(v.array(v.string())),
    addOns: v.optional(v.array(v.string())),
    answers: v.optional(v.array(answerValidator)),
    notes: v.optional(v.string()),
    measurements: v.optional(v.array(measurementValidator)),
    workAreas: v.optional(v.array(workAreaInput)),
    jobberClientId: v.optional(nullableString),
    jobberQuoteId: v.optional(nullableString),
    missingMapping: v.optional(nullableString),
    integrationError: v.optional(nullableString),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { projectId, workAreas, measurements, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    if (measurements !== undefined) {
      patch.measurements = measurements.map(withSquareFeet);
    }
    await ctx.db.patch("projects", projectId, patch);

    if (workAreas !== undefined) {
      const existing = await ctx.db
        .query("workAreas")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .take(workAreaLimit);
      for (const workArea of existing) {
        await ctx.db.delete("workAreas", workArea._id);
      }
      for (const workArea of workAreas) {
        await ctx.db.insert("workAreas", { projectId, ...workArea });
      }
    }

    return null;
  },
});

export const recordJobberResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    status: projectStatus,
    jobberClientId: nullableString,
    jobberRequestId: nullableString,
    jobberQuoteId: nullableString,
    missingMapping: nullableString,
    integrationError: nullableString,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("projects", args.projectId, {
      status: args.status,
      jobberClientId: args.jobberClientId,
      jobberRequestId: args.jobberRequestId,
      jobberQuoteId: args.jobberQuoteId,
      missingMapping: args.missingMapping,
      integrationError: args.integrationError,
    });
    return null;
  },
});
