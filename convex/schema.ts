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

/** One measured piece of an area: its length and width (or a typed size), as the salesperson entered it. */
export const measuredSectionValidator = v.object({
  length: v.string(),
  width: v.string(),
  size: v.string(),
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
  /** The pieces measured on site; `quantity` is their total, which is what quoting reads. */
  sections: v.optional(v.array(measuredSectionValidator)),
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
    /** The visit being scheduled or worked on: 0 is the consultation, 1 and up are follow-ups. Unset means 0. */
    visitNumber: v.optional(v.number()),
    /** The Jobber request holding the current follow-up's appointment; the consultation uses `jobberRequestId`. */
    followUpRequestId: v.optional(v.string()),
  }).index("by_shortCode", ["shortCode"]),
  /**
   * What the project looked like when a visit was saved: the consultation, then each follow-up.
   * The newest one is rewritten by further saves of that visit; once the next visit is scheduled it is frozen.
   */
  visitSnapshots: defineTable({
    projectId: v.id("projects"),
    visit: v.number(),
    savedAt: v.number(),
    /** Name of the salesperson who saved it. */
    salesperson: v.optional(v.string()),
    /** When the visit was booked for, if it was. */
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
    addOns: v.array(v.string()),
    answers: v.array(answerValidator),
    notes: v.string(),
    measurements: v.array(measurementValidator),
    workAreas: v.array(workAreaInput),
  }).index("by_projectId_and_visit", ["projectId", "visit"]),
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
    sections: v.optional(v.array(measuredSectionValidator)),
  }).index("by_projectId", ["projectId"]),
  salesSessions: defineTable({
    token: v.string(),
    expiresAt: v.number(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_expiresAt", ["expiresAt"]),
  /** One-time codes the CRM hands to the sales form after a Clerk sign-in (D-053). Stored hashed, single use, gone within a minute. */
  salesHandoffs: defineTable({
    code: v.string(),
    email: v.string(),
    name: v.string(),
    expiresAt: v.number(),
  }).index("by_code", ["code"]),
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

  // ---------------------------------------------------------------------------------------------------------------
  // CRM tables (convex/crm/). New names only; the forms tables above are not touched (CRM/CLAUDE.md rule 3).
  // ---------------------------------------------------------------------------------------------------------------

  /** The three businesses (D-016). A client and a project each belong to exactly one (D-031). */
  businesses: defineTable({
    name: v.string(),
    slug: v.string(),
  }).index("by_slug", ["slug"]),

  /** A Jobber-style client: homeowner or contractor, in one business's list (D-008, D-031). */
  clients: defineTable({
    businessId: v.id("businesses"),
    type: v.union(v.literal("homeowner"), v.literal("contractor")),
    /** What the lists show: the company for a contractor that has one, otherwise the contact's name. */
    name: v.string(),
    contactName: v.string(),
    company: v.string(),
    phone: v.string(),
    email: v.string(),
    street1: v.string(),
    street2: v.string(),
    city: v.string(),
    state: v.string(),
    zip: v.string(),
    /** The note typed on the client form. Later notes are in clientNotes. */
    notes: v.string(),
    /** Lead: no work won yet. Active: has won work. Archived: hidden by staff. Kept in step with the client's projects. */
    status: v.union(v.literal("lead"), v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    lastActivityAt: v.number(),
    /** Lower-cased `name`, so a list can be sorted by name without regard to case. */
    nameKey: v.string(),
    /** Search only: name, contact, company, phone, email and address in one string. Rebuilt on every save. */
    searchText: v.string(),
  })
    .index("by_business_and_nameKey", ["businessId", "nameKey"])
    .index("by_business_and_lastActivityAt", ["businessId", "lastActivityAt"])
    // Used to tell whether a person who fills the customer form is already a client (D-040): same email, or same phone.
    .index("by_business_and_email", ["businessId", "email"])
    .index("by_business_and_phone", ["businessId", "phone"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["businessId"] }),

  /** The central project record from enquiry to archive (rule 1). A "request" is one in the Sales pipeline (D-039). */
  opportunities: defineTable({
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    /** Short code staff see, such as 7KD-3QM. */
    code: v.string(),
    /** The service requested, such as "Turf installation". */
    title: v.string(),
    pipeline: v.union(v.literal("Sales"), v.literal("Preplanning")),
    /** A stage name from convex/crm/lib/stages.ts. */
    stage: v.string(),
    requestedAt: v.number(),
    owner: v.string(),
    /** Search only, a deliberate labelled copy: client name, phone, email and address plus title, code and stage. */
    searchText: v.string(),
    /** The customer-form submission (a forms `projects` row) this project was created from, if any (D-040). */
    sourceProjectId: v.optional(v.id("projects")),
  })
    .index("by_business_and_requestedAt", ["businessId", "requestedAt"])
    .index("by_clientId", ["clientId"])
    .index("by_sourceProjectId", ["sourceProjectId"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["businessId", "pipeline"] }),

  /** Staff who can sign in to the CRM (D-046). Invite-only: a row exists first (invited), and the person claims it on their first
   *  sign-in with the same verified email. Signing up in Clerk alone gives no access. */
  users: defineTable({
    /** Lower-case, and unique among users. */
    email: v.string(),
    name: v.string(),
    /** A user can hold several roles (D-014). Installers do not log in (D-010). */
    roles: v.array(v.union(v.literal("admin"), v.literal("sales"), v.literal("office"), v.literal("pm"))),
    /** The businesses they can work in (D-016, D-031). An Admin sees all of them whatever this says. */
    businessIds: v.array(v.id("businesses")),
    status: v.union(v.literal("invited"), v.literal("active"), v.literal("deactivated")),
    /** Clerk's stable identity for this person, set when they first sign in. */
    tokenIdentifier: v.optional(v.string()),
    invitedBy: v.optional(v.string()),
    lastSignInAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_tokenIdentifier", ["tokenIdentifier"]),

  /** Internal notes on a client, newest first. */
  clientNotes: defineTable({
    clientId: v.id("clients"),
    text: v.string(),
    author: v.string(),
  }).index("by_clientId", ["clientId"]),
});
