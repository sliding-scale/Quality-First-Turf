import { ConvexError, v } from "convex/values";
import { salespersonName } from "../sales/accounts";
import { contactProblems, type ContactFields } from "../../lib/discovery";
import { planQuoteLines } from "../../lib/quote-lines";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import { activeSalesSession } from "../sales/session";
import { newShortCode } from "./shortCode";
import { photosKeptByEarlierVisits, saveVisitSnapshot } from "./visits";
import {
  answerValidator,
  changeValidator,
  measurementValidator,
  projectStatus,
  workAreaInput,
} from "../schema";

const workAreaLimit = 100;
const maxPhotoBytes = 15 * 1024 * 1024;

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
  const squareFeet = measurement.unmeasured
    ? null
    : measurement.squareFeet !== null && measurement.squareFeet > 0
      ? measurement.squareFeet
      : measurement.length !== null &&
          measurement.width !== null &&
          measurement.length > 0 &&
          measurement.width > 0
        ? measurement.length * measurement.width
        : null;
  return {
    ...measurement,
    squareFeet,
    areaBand: squareFeet === null ? null : areaBandFor(squareFeet),
  };
}

async function assertPhotos(
  ctx: MutationCtx,
  workAreas: { photoIds: Id<"_storage">[] }[],
) {
  for (const area of workAreas) {
    if (area.photoIds.length > 30) throw new Error("Too many photos on one area.");
    for (const photoId of area.photoIds) {
      const file = await ctx.db.system.get("_storage", photoId);
      if (file === null || !(file.contentType ?? "").startsWith("image/")) {
        throw new Error("One of the photos is not a valid image.");
      }
      if (file.size > maxPhotoBytes) throw new Error("A photo is larger than 15 MB.");
    }
  }
}

function assertContact(input: ContactFields) {
  const problem = Object.values(contactProblems(input))[0];
  if (problem !== undefined) throw new Error(problem);
}

export const generateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    if ((await activeSalesSession(ctx, args.sessionToken, true)) === null) {
      throw new Error("Sign in again to open projects.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** Claims a lead for the signed-in salesperson. Refuses a lead someone else already holds. */
export const assign = mutation({
  args: { sessionToken: v.string(), projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken, true);
    if (session === null || session.email === undefined) {
      throw new Error("Sign in again to assign leads.");
    }
    const project = await ctx.db.get("projects", args.projectId);
    if (project === null) throw new Error("This project is no longer available.");
    if (project.assignedTo !== undefined && project.assignedTo !== session.email) {
      throw new Error(`This lead is already assigned to ${salespersonName(project.assignedTo)}.`);
    }
    await ctx.db.patch("projects", args.projectId, { assignedTo: session.email });
    return null;
  },
});

/** Releases a lead the signed-in salesperson holds. */
export const unassign = mutation({
  args: { sessionToken: v.string(), projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken, true);
    if (session === null || session.email === undefined) {
      throw new Error("Sign in again to unassign leads.");
    }
    const project = await ctx.db.get("projects", args.projectId);
    if (project === null) throw new Error("This project is no longer available.");
    if (project.assignedTo !== session.email) {
      throw new Error("Only the assigned salesperson can unassign this lead.");
    }
    await ctx.db.patch("projects", args.projectId, { assignedTo: undefined });
    return null;
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
    await rateLimiter.limit(ctx, "createProject", { throws: true });
    assertContact(args);
    if ((args.workAreas?.length ?? 0) > workAreaLimit) {
      throw new Error("Too many work areas.");
    }
    await assertPhotos(ctx, args.workAreas ?? []);
    if (
      args.services.length > 40 ||
      (args.answers?.length ?? 0) > 400 ||
      (args.measurements?.length ?? 0) > 200 ||
      (args.notes?.length ?? 0) > 10000
    ) {
      throw new Error("The request is too large.");
    }
    const measurements = (args.measurements ?? []).map(withSquareFeet);
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
      measurements,
      submitted: {
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
        answers: args.answers ?? [],
        notes: args.notes ?? "",
        measurements,
      },
      jobberClientId: null,
      jobberRequestId: null,
      jobberQuoteId: null,
      missingMapping: null,
      integrationError: null,
      shortCode: await newShortCode(ctx),
    });

    for (const workArea of args.workAreas ?? []) {
      await ctx.db.insert("workAreas", { projectId, ...workArea });
    }

    return projectId;
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    projectId: v.id("projects"),
    status: v.optional(v.literal("on-site saved")),
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
    /** Differences from the previous record, worked out by the visit screen. */
    changes: v.optional(v.array(changeValidator)),
    /** The on-site visit sets this: the server then refuses to save anything the quote cannot be built from. */
    requireComplete: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await activeSalesSession(ctx, args.sessionToken, true);
    if (session === null) {
      throw new Error("Sign in again to open projects.");
    }
    await assertPhotos(ctx, args.workAreas ?? []);
    if ((args.workAreas?.length ?? 0) > workAreaLimit) {
      throw new Error("Too many work areas.");
    }
    const project = await ctx.db.get("projects", args.projectId);
    if (project === null) throw new Error("Project not found");
    if (project.assignedTo !== session.email) {
      throw new ConvexError(
        project.assignedTo === undefined
          ? "Assign this lead to yourself before editing or saving this visit."
          : `This lead is assigned to ${salespersonName(project.assignedTo)}, so only they can edit it.`,
      );
    }
    if (project.consultation === undefined) {
      throw new ConvexError("Book a consultation before editing or saving this visit.");
    }
    assertContact({
      firstName: args.firstName ?? project.firstName,
      lastName: args.lastName ?? project.lastName,
      phone: args.phone ?? project.phone,
      email: args.email ?? project.email,
      street1: args.street1 ?? project.street1,
      city: args.city ?? project.city,
      state: args.state ?? project.state,
      zip: args.zip ?? project.zip,
    });
    const { projectId, workAreas, measurements, changes, requireComplete, sessionToken: _sessionToken, ...fields } = args;
    if (requireComplete === true) {
      if (workAreas === undefined) throw new ConvexError("The measured areas are missing.");
      const planned = planQuoteLines({
        services: args.services ?? project.services,
        products: args.products ?? project.products,
        answers: args.answers ?? project.answers,
        measurements: project.measurements,
        workAreas,
      });
      // Missing items in the Jobber price list are the office's to fix; they never block a visit.
      const gaps = (planned.missing?.match(/[^.]+\./g) ?? [])
        .map((gap) => gap.trim())
        .filter((gap) => !gap.startsWith("No catalogue item for"));
      // Each lighting item also needs a quantity (or length) from the salesperson; it has no area.
      const answers = args.answers ?? project.answers;
      const lightingTypes = answers
        .filter((answer) => answer.question === "Low Voltage Lighting install type")
        .map((answer) => answer.value);
      for (const type of lightingTypes) {
        const quantity = answers.find(
          (answer) => answer.question === "Low Voltage Lighting quantity" && answer.value.startsWith(`${type}: `),
        );
        if (quantity === undefined) gaps.push(`Enter a quantity for ${type}.`);
      }
      // Every service needs at least one photo taken on site.
      for (const service of args.services ?? project.services) {
        const photos = workAreas.find((area) => area.service === "Service photos" && area.label === `Service photos: ${service}`);
        if ((photos?.photoIds.length ?? 0) === 0) gaps.push(`Add a photo for ${service === "Demo" ? "Demolition" : service}.`);
      }
      if (gaps.length > 0) {
        throw new ConvexError(`This visit is not complete yet. ${gaps.join(" ")}`);
      }
    }
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    if (measurements !== undefined) {
      patch.measurements = measurements.map(withSquareFeet);
    }
    if (requireComplete === true) patch.visitedAt = Date.now();
    await ctx.db.patch("projects", projectId, patch);

    if (changes !== undefined && changes.length > 0) {
      if (changes.length > 300) throw new Error("Too many changes in one save.");
      await ctx.db.insert("visitRevisions", {
        projectId,
        savedAt: Date.now(),
        changes: changes.map((change) => ({
          label: change.label.slice(0, 200),
          before: change.before.slice(0, 500),
          after: change.after.slice(0, 500),
        })),
      });
    }

    if (workAreas !== undefined) {
      const existing = await ctx.db
        .query("workAreas")
        .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
        .take(workAreaLimit + 1);
      // Photos the earlier visits' cards still show stay in storage even when this visit drops them.
      const kept = await photosKeptByEarlierVisits(ctx, projectId, project.visitNumber ?? 0);
      for (const area of workAreas) for (const photoId of area.photoIds) kept.add(photoId);
      for (const workArea of existing) {
        await ctx.db.delete("workAreas", workArea._id);
        for (const photoId of workArea.photoIds) {
          if (!kept.has(photoId)) await ctx.storage.delete(photoId);
        }
      }
      for (const workArea of workAreas) {
        await ctx.db.insert("workAreas", { projectId, ...workArea });
      }
    }

    // A complete save is the card for this visit; earlier visits' cards are never touched.
    if (requireComplete === true) {
      await saveVisitSnapshot(ctx, projectId, session.name ?? salespersonName(session.email ?? ""));
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
      draftingUntil: undefined,
    });
    return null;
  },
});

/** Lets only one Jobber push run per project at a time. */
export const claimDraft = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("projects", args.projectId);
    if (project === null) return false;
    const now = Date.now();
    if (project.draftingUntil !== undefined && project.draftingUntil > now) return false;
    await ctx.db.patch("projects", args.projectId, { draftingUntil: now + 2 * 60 * 1000 });
    return true;
  },
});

export const releaseDraft = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("projects", args.projectId, { draftingUntil: undefined });
    return null;
  },
});

/** One-off for projects created before short codes: `npx convex run projects/mutations:backfillShortCodes`. */
export const backfillShortCodes = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const batch = await ctx.db
      .query("projects")
      .withIndex("by_shortCode", (q) => q.eq("shortCode", undefined))
      .take(100);
    for (const project of batch) {
      await ctx.db.patch("projects", project._id, { shortCode: await newShortCode(ctx) });
    }
    if (batch.length === 100) {
      await ctx.scheduler.runAfter(0, internal.projects.mutations.backfillShortCodes, {});
    }
    return null;
  },
});
