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
});

export const workAreaInput = v.object({
  label: v.string(),
  length: v.union(v.number(), v.null()),
  width: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
  notes: v.string(),
  photoIds: v.array(v.id("_storage")),
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
  }),
  workAreas: defineTable({
    projectId: v.id("projects"),
    label: v.string(),
    length: v.union(v.number(), v.null()),
    width: v.union(v.number(), v.null()),
    quantity: v.union(v.number(), v.null()),
    notes: v.string(),
    photoIds: v.array(v.id("_storage")),
  }).index("by_projectId", ["projectId"]),
  salesSessions: defineTable({
    token: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),
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
