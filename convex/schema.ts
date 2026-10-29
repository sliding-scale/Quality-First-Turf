import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const projectStatus = v.union(
  v.literal("discovery saved"),
  v.literal("on-site saved"),
  v.literal("quote drafted"),
  v.literal("needs attention"),
);

export const answerValidator = v.object({
  question: v.string(),
  value: v.string(),
});

export const measurementValidator = v.object({
  label: v.string(),
  length: v.union(v.number(), v.null()),
  width: v.union(v.number(), v.null()),
  squareFeet: v.union(v.number(), v.null()),
  linearFeet: v.union(v.number(), v.null()),
  unmeasured: v.boolean(),
  areaBand: v.optional(v.union(v.string(), v.null())),
  /** Which service and installation type the size is for, so two areas with the same name stay apart. */
  service: v.optional(v.string()),
  installType: v.optional(v.string()),
});

export const workAreaInput = v.object({
  label: v.string(),
  length: v.union(v.number(), v.null()),
  width: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
  notes: v.string(),
  photoIds: v.array(v.id("_storage")),
  /** Which service card and installation type the area belongs to; quoting uses these, not the name. */
  service: v.optional(v.string()),
  installType: v.optional(v.string()),
});

/** What the customer submitted, frozen when the project is created and never edited afterwards. */
export const submittedValidator = v.object({
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
});

/** One difference recorded by a salesperson's save: what the record said, and what it says now. */
export const changeValidator = v.object({
  label: v.string(),
  before: v.string(),
  after: v.string(),
});

/** A consultation booked on the project's Jobber request; date and time are the wall-clock values entered. */
export const consultationValidator = v.object({
  assessmentId: v.string(),
  date: v.string(),
  time: v.string(),
  minutes: v.number(),
  instructions: v.string(),
  /** Name of the salesperson who booked it, as shown in Jobber. */
  salesperson: v.optional(v.string()),
});

export default defineSchema({
  projects: defineTable({
    status: projectStatus,
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
    addOns: v.array(v.string()),
    answers: v.array(answerValidator),
    notes: v.string(),
    measurements: v.array(measurementValidator),
    jobberClientId: v.union(v.string(), v.null()),
    jobberRequestId: v.optional(v.union(v.string(), v.null())),
    jobberQuoteId: v.union(v.string(), v.null()),
    missingMapping: v.union(v.string(), v.null()),
    integrationError: v.union(v.string(), v.null()),
    shortCode: v.optional(v.string()),
    submitted: v.optional(submittedValidator),
    /** Set when a salesperson has completed the on-site visit. */
    visitedAt: v.optional(v.number()),
    draftingUntil: v.optional(v.number()),
    consultation: v.optional(consultationValidator),
    /** Email of the salesperson who has claimed this lead; unset when unassigned. */
    assignedTo: v.optional(v.string()),
  }).index("by_shortCode", ["shortCode"]),
  visitRevisions: defineTable({
    projectId: v.id("projects"),
    savedAt: v.number(),
    changes: v.array(changeValidator),
  }).index("by_projectId", ["projectId"]),
  workAreas: defineTable({
    projectId: v.id("projects"),
    label: v.string(),
    length: v.union(v.number(), v.null()),
    width: v.union(v.number(), v.null()),
    quantity: v.union(v.number(), v.null()),
    notes: v.string(),
    photoIds: v.array(v.id("_storage")),
    service: v.optional(v.string()),
    installType: v.optional(v.string()),
  }).index("by_projectId", ["projectId"]),
  salesSessions: defineTable({
    token: v.string(),
    expiresAt: v.number(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_expiresAt", ["expiresAt"]),
  jobberConnections: defineTable({
    singleton: v.literal("default"),
    refreshToken: v.union(v.string(), v.null()),
    accessToken: v.union(v.string(), v.null()),
    accessTokenExpiresAt: v.union(v.number(), v.null()),
    accountId: v.union(v.string(), v.null()),
    accountName: v.union(v.string(), v.null()),
    oauthState: v.union(v.string(), v.null()),
    codeVerifier: v.union(v.string(), v.null()),
  }).index("by_singleton", ["singleton"]),
});
