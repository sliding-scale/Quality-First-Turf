import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Photos, voice notes and attached files on a client or project note (D-067). Checked when saved by convex/crm/lib/noteFiles.ts. */
const noteAttachments = v.optional(
  v.array(v.object({ storageId: v.id("_storage"), kind: v.union(v.literal("image"), v.literal("audio"), v.literal("file")), name: v.string(), contentType: v.string(), size: v.number() })),
);

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

const levelValidator = v.union(v.literal("none"), v.literal("view"), v.literal("edit"), v.literal("full"));
/** A level per permission module (convex/crm/lib/permissions.ts). Every module is optional: an absent one follows the person's roles. */
export const permissionsValidator = v.object({
  clients: v.optional(levelValidator), requests: v.optional(levelValidator), quotes: v.optional(levelValidator), schedule: v.optional(levelValidator), tasks: v.optional(levelValidator),
  pipelineSales: v.optional(levelValidator), pipelinePreplanning: v.optional(levelValidator), pipelineConstruction: v.optional(levelValidator), pipelineFinance: v.optional(levelValidator),
  invoices: v.optional(levelValidator), payments: v.optional(levelValidator), prices: v.optional(levelValidator), templates: v.optional(levelValidator), settings: v.optional(levelValidator),
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
    /* What Jobber's client page shows (copied from Jobber on 2026-11-09, D-060). All optional: a client made in the CRM has only the
       basic fields above until someone adds more. */
    isCompany: v.optional(v.boolean()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    /** Every phone number, shown as "Main phone", "Other phone"... The first is the same as `phone`. */
    phones: v.optional(v.array(v.object({ number: v.string(), description: v.string() }))),
    emails: v.optional(v.array(v.object({ address: v.string(), description: v.string() }))),
    /** Properties (service addresses). The first is the same address as street1..zip above. */
    properties: v.optional(v.array(v.object({
      street1: v.string(),
      street2: v.string(),
      city: v.string(),
      state: v.string(),
      zip: v.string(),
      country: v.string(),
      lawnSize: v.string(),
      lockedGate: v.boolean(),
    }))),
    /** Other people at a company client (the Contacts card). */
    contacts: v.optional(v.array(v.object({ name: v.string(), role: v.string(), phone: v.string(), email: v.string() }))),
    /** The Billing card: deposits and payments taken, in whole cents (a deposit is negative against the balance). */
    billing: v.optional(v.array(v.object({ kind: v.string(), appliedTo: v.string(), at: v.number(), cents: v.number() }))),
    /** The Client schedule card. */
    scheduleItems: v.optional(v.array(v.object({ kind: v.string(), title: v.string(), at: v.number(), status: v.string(), assigned: v.string() }))),
    lastCommunication: v.optional(v.object({ at: v.number(), text: v.string() })),
    lifetimeValueCents: v.optional(v.number()),
    balanceCents: v.optional(v.number()),
    /** Jobber-style tags (Company, Homeowner, Partner Contractor, Sub-Contractor), shown in the list's Tags column. Older rows have none. */
    tags: v.optional(v.array(v.string())),
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
    pipeline: v.union(v.literal("Sales"), v.literal("Preplanning"), v.literal("Construction"), v.literal("Finance")),
    /** A stage name from convex/crm/lib/stages.ts. */
    stage: v.string(),
    requestedAt: v.number(),
    owner: v.string(),
    /** Search only, a deliberate labelled copy: client name, phone, email and address plus title, code and stage. */
    searchText: v.string(),
    /** The customer-form submission (a forms `projects` row) this project was created from, if any (D-040). */
    sourceProjectId: v.optional(v.id("projects")),
    /** Pipeline board (D-061). `stageEnteredAt` is when it reached its stage; absent on older rows, which count from `requestedAt`. */
    stageEnteredAt: v.optional(v.number()),
    leadSource: v.optional(v.string()),
    salespersonId: v.optional(v.id("users")),
    /** "Service details" typed on a request made in the CRM (Jobber's New Request form). Requests from the customer form have none. */
    details: v.optional(v.string()),
    /** The on-site assessment's instructions (Jobber's request page). Kept here so they survive an assessment with no date yet ("Schedule later"). */
    assessmentInstructions: v.optional(v.string()),
    /** The Overview as labelled answers (Jobber's request form), once someone has edited it. Until then the page builds it from the customer form
     *  behind the request, or from `details`. Edits never touch the customer form's own rows. */
    overviewFields: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
    /** The request's Product / Service lines (Jobber's request page): what the client asked for, with a price to start from. Written only by crm/requests.ts. */
    lines: v.optional(v.array(v.object({ name: v.string(), description: v.string(), quantity: v.number(), unitPriceCents: v.number() }))),
    outcome: v.optional(v.union(v.literal("won"), v.literal("lost"))),
    closedAt: v.optional(v.number()),
    lostReason: v.optional(v.string()),
    /** The signed contract, uploaded as a PDF or an image (one way to meet the Closed Won rule), and an optional invoice (D-063). */
    signedContractId: v.optional(v.id("_storage")),
    signedContractName: v.optional(v.string()),
    signedContractAt: v.optional(v.number()),
    invoiceId: v.optional(v.id("_storage")),
    invoiceName: v.optional(v.string()),
    /** Archived (D-065): set by the Auto-archive Requests automation, which also closes the project as lost. An archived project leaves the
     *  board and the request list but stays searchable and can be restored; `archivedFromStage` is where Restore puts it back. */
    archivedAt: v.optional(v.number()),
    archivedReason: v.optional(v.string()),
    archivedFromStage: v.optional(v.string()),
    /** Construction (PRD 4.6, D-081): the project manager (a CRM user) and the crews (records, not logins, D-010) on this project. */
    projectManagerId: v.optional(v.id("users")),
    crewIds: v.optional(v.array(v.id("crews"))),
    /** The Installers (users) on the project's work team: the records an assigned-only person may see (PRD 5.5). */
    installerIds: v.optional(v.array(v.id("users"))),
    /** Jobs (design 2026-11-19-jobs): a Closed Won project is a job. The number is written once, the first time it is won, and counts up per business. */
    jobNumber: v.optional(v.number()),
    /** The job was closed by hand (Jobber's Close Job). Closing does not move the project between pipelines. */
    jobClosedAt: v.optional(v.number()),
    jobClosedByName: v.optional(v.string()),
    /** One-off (absent) or recurring. A recurring job's visits are one repeating series on the Schedule. */
    jobType: v.optional(v.union(v.literal("oneoff"), v.literal("recurring"))),
  })
    .index("by_business_and_requestedAt", ["businessId", "requestedAt"])
    .index("by_clientId", ["clientId"])
    .index("by_sourceProjectId", ["sourceProjectId"])
    .index("by_business_and_jobNumber", ["businessId", "jobNumber"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["businessId", "pipeline"] }),

  /** Products and services (design 2026-11-19-jobs, Jobber's Settings > Products & Services): the business's own list that the line pickers
   *  read. Written only by crm/catalogue.ts. Money is whole cents. `searchText` is a labelled copy (name and description) for the search index. */
  catalogueItems: defineTable({
    businessId: v.id("businesses"),
    kind: v.union(v.literal("service"), v.literal("product")),
    name: v.string(),
    /** The name in lower case with single spaces: two items cannot share it. */
    nameKey: v.string(),
    description: v.string(),
    costCents: v.optional(v.number()),
    markupPercent: v.optional(v.number()),
    unitPriceCents: v.number(),
    taxExempt: v.boolean(),
    /** Offered on quotes, jobs and invoices. Off: kept in the list but not offered. */
    available: v.boolean(),
    durationMinutes: v.optional(v.number()),
    customersSelectQuantity: v.boolean(),
    imageId: v.optional(v.id("_storage")),
    source: v.union(v.literal("jobber"), v.literal("manual"), v.literal("csv")),
    searchText: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_business_and_nameKey", ["businessId", "nameKey"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["businessId", "available"] }),

  /** Jobber's "Product & Services costs" switch: whether costs and markups are used on the list at all. Absent: on. Written only by crm/catalogue.ts. */
  catalogueSettings: defineTable({
    businessId: v.id("businesses"),
    costsOn: v.boolean(),
  }).index("by_business", ["businessId"]),

  /** Labor on a job (plan 2026-11-19-jobs-costs, Jobber's "New time entry"): who worked, at what hourly cost, and when. `minutes` is a labelled copy of
   *  the end less the start. Written only by crm/jobCosts.ts. */
  jobTimeEntries: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    employeeId: v.id("users"),
    costPerHourCents: v.number(),
    startAt: v.number(),
    endAt: v.number(),
    minutes: v.number(),
    notes: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_opportunity", ["opportunityId", "startAt"]),

  /** An expense on a job (Jobber's "New expense"). A receipt is a stored file removed with the expense. Written only by crm/jobCosts.ts. */
  jobExpenses: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    /** The day, as UTC midnight. */
    date: v.number(),
    name: v.string(),
    description: v.string(),
    totalCents: v.number(),
    accountingCode: v.string(),
    reimburseToId: v.optional(v.id("users")),
    receiptId: v.optional(v.id("_storage")),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_opportunity", ["opportunityId", "date"]),

  /** Jobber's Collect Signature on a job: who signed, the picture, and who collected it. Written only by crm/jobs.ts. */
  jobSignatures: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    signedBy: v.string(),
    imageId: v.id("_storage"),
    byName: v.string(),
    at: v.number(),
  }).index("by_opportunity", ["opportunityId", "at"]),

  /** Checklist templates (Jobber's Settings > Checklists): a name and the things to do. Written only by crm/checklists.ts. */
  checklistTemplates: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    items: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_business", ["businessId"]),

  /** One item of a checklist on a job: a copy of the template's item, so later edits to the template leave the job alone. */
  jobChecklistItems: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    templateId: v.optional(v.id("checklistTemplates")),
    listName: v.string(),
    text: v.string(),
    position: v.number(),
    done: v.boolean(),
    doneByName: v.optional(v.string()),
    doneAt: v.optional(v.number()),
  }).index("by_opportunity", ["opportunityId", "listName", "position"]),

  /** A business's numbers for texting (PRD 5.3). Written only by crm/phoneNumbers.ts. A number (E.164) belongs to one business. */
  phoneNumbers: defineTable({
    businessId: v.id("businesses"),
    number: v.string(),
    label: v.string(),
    createdAt: v.number(),
  }).index("by_business", ["businessId"]).index("by_number", ["number"]),

  /** The text log (plan 2026-11-19-messages): every text to or from a client, against the client, the job it came from and the person who sent it.
   *  `phone` is the other party's number (E.164). Status: queued (waiting for Twilio), sent, failed, manual (sent by hand from a phone) or received.
   *  Written only by crm/messages.ts. */
  messages: defineTable({
    businessId: v.id("businesses"),
    clientId: v.optional(v.id("clients")),
    opportunityId: v.optional(v.id("opportunities")),
    phone: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    body: v.string(),
    userId: v.optional(v.id("users")),
    userName: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("manual"), v.literal("received")),
    error: v.optional(v.string()),
    providerSid: v.optional(v.string()),
    /** Our number the text went from, or came to. */
    fromNumber: v.optional(v.string()),
    at: v.number(),
    /** Inbound only: when someone opened the conversation. Absent: unread. */
    readAt: v.optional(v.number()),
    /** "sms" when absent. A "whatsapp" row is a work package (or other message) sent through WhatsApp, written only by crm/whatsapp.ts. */
    channel: v.optional(v.union(v.literal("sms"), v.literal("whatsapp"))),
  })
    .index("by_business_and_at", ["businessId", "at"])
    .index("by_client_and_at", ["clientId", "at"])
    .index("by_providerSid", ["providerSid"]),

  /** The call log (plan 2026-11-20-calls-whatsapp, PRD 5.3): a call to or from a client, logged by a person (a voice provider can write the same rows
   *  later). `phone` is the other party's number (E.164). Written only by crm/calls.ts. */
  calls: defineTable({
    businessId: v.id("businesses"),
    clientId: v.optional(v.id("clients")),
    opportunityId: v.optional(v.id("opportunities")),
    phone: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    outcome: v.union(v.literal("answered"), v.literal("no_answer"), v.literal("voicemail"), v.literal("busy")),
    durationSeconds: v.optional(v.number()),
    notes: v.string(),
    userId: v.id("users"),
    userName: v.string(),
    /** When the call happened. */
    at: v.number(),
    createdAt: v.number(),
  })
    .index("by_business_and_at", ["businessId", "at"])
    .index("by_client_and_at", ["clientId", "at"]),

  /** The business's materials (PRD 4.2, plan 2026-11-19-takeoff): what is ordered for a project, in the unit it is sold in, with the formula that works out
   *  how much a project needs from its measurements. Everything is editable data (CRM rule 8). Written only by crm/materials.ts. */
  materials: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    nameKey: v.string(),
    sku: v.string(),
    category: v.string(),
    /** What it is ordered in: roll, bag, ton, cubic yard, linear ft... */
    unit: v.string(),
    costCents: v.optional(v.number()),
    supplier: v.string(),
    leadTimeDays: v.optional(v.number()),
    /** How much is on hand, in `unit`. Absent: not tracked. */
    inStock: v.optional(v.number()),
    sizeDetails: v.string(),
    /** See crm/lib/formula.ts: for example `ceil(area / 1500)`. */
    formula: v.string(),
    wastagePercent: v.number(),
    rounding: v.union(v.literal("up"), v.literal("nearest"), v.literal("none")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_business_and_nameKey", ["businessId", "nameKey"]),

  /** A named list of materials that go on a takeoff together (D-104): "Turf: Standard install", "Underground: 3 in. drain". Adding a kit to a project's
   *  takeoff adds each of its materials as a line (a snapshot, like any line). It holds no rates: each material has its own formula. */
  materialKits: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    nameKey: v.string(),
    /** Only for grouping the list: "Turf installation", "Underground"... */
    group: v.string(),
    description: v.string(),
    materialIds: v.array(v.id("materials")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_business_and_nameKey", ["businessId", "nameKey"]),

  /** A project's installer work package (PRD 4.3): scope, schedule, site access, the installer budget, which files go with it, and the secret
   *  expiring link it is shared by. One row per project. Written only by crm/workPackages.ts; the link's page reads it in crm/clientWorkPackage.ts. */
  workPackages: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    scope: v.string(),
    /** UTC midnight, or unset. */
    targetStartDate: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    scheduleNotes: v.string(),
    siteAccess: v.string(),
    customerAvailability: v.string(),
    installerNotes: v.string(),
    budgetLines: v.array(v.object({ description: v.string(), quantity: v.number(), unit: v.string(), rateCents: v.number() })),
    fileIds: v.array(v.id("opportunityFiles")),
    includeMaterials: v.boolean(),
    shareToken: v.optional(v.string()),
    shareExpiresAt: v.optional(v.number()),
    updatedAt: v.number(),
    updatedByName: v.string(),
  })
    .index("by_opportunity", ["opportunityId"])
    .index("by_shareToken", ["shareToken"]),

  /** A purchase order on a project (PRD 4.4): what is bought from one supplier, its status and the expected and actual delivery dates. Lines copy the
   *  takeoff line they came from (a labelled snapshot, so editing the takeoff later changes no order). Written only by crm/purchaseOrders.ts. */
  purchaseOrders: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    number: v.string(),
    supplier: v.string(),
    status: v.union(v.literal("draft"), v.literal("ordered"), v.literal("delivered"), v.literal("cancelled")),
    lines: v.array(v.object({ takeoffLineId: v.optional(v.id("takeoffLines")), name: v.string(), unit: v.string(), qty: v.number(), unitCostCents: v.optional(v.number()) })),
    notes: v.string(),
    /** UTC midnight, or unset. */
    expectedDate: v.optional(v.number()),
    orderedAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    createdByName: v.string(),
    createdAt: v.number(),
  }).index("by_opportunity", ["opportunityId", "createdAt"]),

  /** A project's measurements for the takeoff, by the names a formula uses. One row per project. Written only by crm/takeoff.ts. */
  takeoffs: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    inputs: v.record(v.string(), v.number()),
    updatedAt: v.number(),
    updatedByName: v.string(),
  }).index("by_opportunity", ["opportunityId"]),

  /** One material on a project's takeoff: a labelled snapshot of the material when it was added (so changing the catalogue later changes no takeoff),
   *  the quantity worked out from the measurements, and the person's own quantity if they typed one. */
  takeoffLines: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    materialId: v.optional(v.id("materials")),
    position: v.number(),
    name: v.string(),
    sku: v.string(),
    unit: v.string(),
    formula: v.string(),
    wastagePercent: v.number(),
    rounding: v.union(v.literal("up"), v.literal("nearest"), v.literal("none")),
    /** The worked-out quantity, or why it could not be worked out. */
    calcQty: v.optional(v.number()),
    calcError: v.optional(v.string()),
    qtyOverride: v.optional(v.number()),
    unitCostCents: v.optional(v.number()),
    supplier: v.string(),
    leadTimeDays: v.optional(v.number()),
    inStock: v.optional(v.number()),
    notes: v.string(),
  }).index("by_opportunity", ["opportunityId", "position"]),

  /** The next job number for a business. Written only by crm/lib/jobNumber.ts. */
  jobCounters: defineTable({
    businessId: v.id("businesses"),
    next: v.number(),
  }).index("by_business", ["businessId"]),

  /** Quotes (D-056). The money on a quote is its lines (quoteLineItems); `totalCents` is a labelled copy of their sum, kept by the one
   *  place that writes lines, so the list can sort and add up without reading every line. */
  quotes: defineTable({
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    /** The request (project) this quote came from, if any. */
    opportunityId: v.optional(v.id("opportunities")),
    /** Quote number, unique within the business. */
    number: v.number(),
    title: v.string(),
    status: v.union(
      v.literal("Draft"),
      v.literal("Awaiting response"),
      v.literal("Changes requested"),
      v.literal("Approved"),
      v.literal("Rejected"),
      v.literal("Converted"),
      v.literal("Archived"),
    ),
    salesperson: v.string(),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    viewedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    convertedAt: v.optional(v.number()),
    introHeading: v.string(),
    introText: v.string(),
    introImageId: v.optional(v.id("_storage")),
    clientMessage: v.string(),
    contract: v.string(),
    /** Saved disclaimers attached to this quote (D-075): a copy of each one's title and wording when it was attached, so a quote that was sent keeps
     *  what the client saw even if the library changes later. */
    disclaimers: v.optional(v.array(v.object({ title: v.string(), text: v.string() }))),
    /** Percent of the total required up front; 0 for none. */
    depositPercent: v.number(),
    depositCollectedCents: v.optional(v.number()),
    depositCollectedAt: v.optional(v.number()),
    /** The signature on an approved quote: who signed, the picture of it (a stored file), and when. */
    signedBy: v.optional(v.string()),
    signatureImageId: v.optional(v.id("_storage")),
    signedAt: v.optional(v.number()),
    totalCents: v.number(),
    /** The builder (D-063). A discount is cents for "amount" or a percent; the deposit above (`depositPercent`) stays as it was, and
     *  `depositKind`/`depositValue` say it more fully when set. */
    discountKind: v.optional(v.union(v.literal("amount"), v.literal("percent"))),
    discountValue: v.optional(v.number()),
    taxPercent: v.optional(v.number()),
    depositKind: v.optional(v.union(v.literal("percent"), v.literal("amount"))),
    depositValue: v.optional(v.number()),
    /** What the client sees on the quote (Jobber's "Client view"). */
    clientView: v.optional(v.object({ quantities: v.boolean(), unitPrices: v.boolean(), lineTotals: v.boolean(), totals: v.boolean() })),
    /** Which version was last sent: 1 for the first, one more for each Resubmit. */
    revision: v.optional(v.number()),
    /** The secret in the client's link (/q/<token>). */
    shareToken: v.optional(v.string()),
    rejectedAt: v.optional(v.number()),
    rejectedReason: v.optional(v.string()),
    changesRequestedAt: v.optional(v.number()),
    changesMessage: v.optional(v.string()),
    /** An uploaded PDF or image showing the deposit was received (optional). */
    depositProofId: v.optional(v.id("_storage")),
    depositProofName: v.optional(v.string()),
    /** Search only, a deliberate labelled copy: client name, address, quote number and title. */
    searchText: v.string(),
  })
    .index("by_business_and_createdAt", ["businessId", "createdAt"])
    .index("by_business_and_number", ["businessId", "number"])
    .index("by_clientId", ["clientId"])
    .index("by_shareToken", ["shareToken"])
    .index("by_opportunityId", ["opportunityId"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["businessId"] }),

  quoteLineItems: defineTable({
    quoteId: v.id("quotes"),
    position: v.number(),
    name: v.string(),
    description: v.string(),
    imageId: v.optional(v.id("_storage")),
    quantity: v.number(),
    unitPriceCents: v.number(),
    /** An optional line has a tick box: it only counts toward the total while `selected`. */
    optional: v.boolean(),
    selected: v.boolean(),
    /** "text" is a line of words only (no money). Absent means a priced item. */
    kind: v.optional(v.union(v.literal("item"), v.literal("text"))),
    /** The price-list name this line was picked from, if any. */
    catalogueName: v.optional(v.string()),
  }).index("by_quoteId_and_position", ["quoteId", "position"]),

  /** What happened to a quote, in order (D-063): created, sent, link created, viewed, changes requested, resubmitted, approved, rejected,
   *  signature collected, deposit received. */
  quoteEvents: defineTable({
    quoteId: v.id("quotes"),
    at: v.number(),
    kind: v.string(),
    byName: v.string(),
    detail: v.string(),
  }).index("by_quoteId", ["quoteId", "at"]),

  /** The quote exactly as it was when a version was sent, so an edit after sending never rewrites what the client saw. */
  quoteRevisions: defineTable({
    quoteId: v.id("quotes"),
    revision: v.number(),
    sentAt: v.number(),
    snapshot: v.object({
      title: v.string(),
      totalCents: v.number(),
      lines: v.array(v.object({ name: v.string(), description: v.string(), quantity: v.number(), unitPriceCents: v.number(), optional: v.boolean(), selected: v.boolean(), kind: v.string() })),
    }),
  }).index("by_quoteId", ["quoteId", "revision"]),

  /** Site plans and other files attached to a quote. */
  quoteAttachments: defineTable({
    quoteId: v.id("quotes"),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  }).index("by_quoteId", ["quoteId"]),

  /** A business's default contract text ("Apply to all future quotes"). */
  quoteDefaults: defineTable({
    businessId: v.id("businesses"),
    /** Absent until someone saves one with "Apply to all future quotes"; the builder then uses Jobber's wording. */
    contract: v.optional(v.string()),
    /** When the starter disclaimers were first added to this business's library (D-075), so deleting them all does not bring them back. */
    disclaimersSeededAt: v.optional(v.number()),
  }).index("by_business", ["businessId"]),

  /** A business's library of saved disclaimers (D-075) that a quote can attach. Written only by crm/disclaimers.ts. */
  disclaimers: defineTable({
    businessId: v.id("businesses"),
    title: v.string(),
    text: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedByName: v.string(),
  }).index("by_business", ["businessId"]),

  quoteNotes: defineTable({
    quoteId: v.id("quotes"),
    text: v.string(),
    author: v.string(),
    createdAt: v.number(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    /** Photos and voice notes (same as client and project notes). */
    attachments: noteAttachments,
  }).index("by_quoteId", ["quoteId"]),

  /** Staff who can sign in to the CRM (D-046). Invite-only: a row exists first (invited), and the person claims it on their first
   *  sign-in with the same verified email. Signing up in Clerk alone gives no access. */
  users: defineTable({
    /** Lower-case, and unique among users. */
    email: v.string(),
    name: v.string(),
    /** A user can hold several roles (D-014). Installers log in too (D-090). */
    roles: v.array(v.union(v.literal("admin"), v.literal("sales"), v.literal("office"), v.literal("pm"), v.literal("installer"))),
    /** An Admin's override of the role presets for this person: a level for any module (PRD 5.5, design 2026-11-18-permissions). Absent modules follow the roles. */
    permissions: v.optional(permissionsValidator),
    /** An Admin's switch for "only records assigned to them". Absent: on for someone who is only an Installer, off otherwise. */
    assignedOnly: v.optional(v.boolean()),
    /** The businesses they can work in (D-016, D-031). An Admin sees all of them whatever this says. */
    businessIds: v.array(v.id("businesses")),
    /** "expired": the invitation ran out (7 days) or an Admin cancelled it, and the person has never signed in (D-055). */
    /** "deleted": taken off the team by an Admin (D-057). The row is kept, never removed, so the history stays; they cannot sign in, and an
     *  Admin can restore them by sending a new invitation. */
    status: v.union(v.literal("invited"), v.literal("active"), v.literal("deactivated"), v.literal("expired"), v.literal("deleted")),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.string()),
    /** Clerk's stable identity for this person, set when they first sign in. */
    tokenIdentifier: v.optional(v.string()),
    invitedBy: v.optional(v.string()),
    /** The Clerk invitation that was emailed, and when it was sent and runs out. Absent for people added before invitations existed. */
    clerkInvitationId: v.optional(v.string()),
    invitationSentAt: v.optional(v.number()),
    invitationExpiresAt: v.optional(v.number()),
    lastSignInAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_tokenIdentifier", ["tokenIdentifier"]),

  /** The four pipeline automations (D-065), one row each per business, created on first use. Staff change days, wording and on/off only.
   *  `activeSince` is when it was last turned on: nothing that started before then is acted on. */
  automations: defineTable({
    businessId: v.id("businesses"),
    key: v.union(v.literal("quoteArchive"), v.literal("quoteFollowUp5"), v.literal("quoteFollowUp2"), v.literal("requestArchive")),
    days: v.number(),
    active: v.boolean(),
    activeSince: v.number(),
    /** The follow-ups' email and text wording. Absent on the archive automations. */
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    textBody: v.optional(v.string()),
    updatedAt: v.number(),
    updatedByName: v.string(),
  }).index("by_business_and_key", ["businessId", "key"]),

  /** Sending mode for a business's automations: log only (default, sends nothing and changes nothing), test (email goes to one test
   *  address), or live. */
  automationSettings: defineTable({
    businessId: v.id("businesses"),
    mode: v.union(v.literal("log"), v.literal("test"), v.literal("live")),
    testAddress: v.optional(v.string()),
    /** {{DEFAULT_PHONE}} in the wording. */
    companyPhone: v.string(),
    updatedAt: v.number(),
    updatedByName: v.string(),
  }).index("by_business", ["businessId"]),

  /** What each automation did, one row per quote or request and automation, reused rather than repeated (so nobody is emailed twice). */
  automationRuns: defineTable({
    businessId: v.id("businesses"),
    key: v.union(v.literal("quoteArchive"), v.literal("quoteFollowUp5"), v.literal("quoteFollowUp2"), v.literal("requestArchive")),
    quoteId: v.optional(v.id("quotes")),
    opportunityId: v.optional(v.id("opportunities")),
    clientId: v.optional(v.id("clients")),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("tested"), v.literal("logged"), v.literal("skipped"), v.literal("failed"), v.literal("archived")),
    mode: v.union(v.literal("log"), v.literal("test"), v.literal("live")),
    detail: v.string(),
    toAddress: v.optional(v.string()),
    attempts: v.number(),
    at: v.number(),
  })
    .index("by_business_and_at", ["businessId", "at"])
    .index("by_quote_and_key", ["quoteId", "key"])
    .index("by_opportunity_and_key", ["opportunityId", "key"]),

  /** Files kept on a project itself (D-077): site plans, photos, contract papers. Written only by crm/opportunityPage.ts. The signed contract and a
   *  quote attachments are listed beside these on the opportunity page but stay where they were uploaded. */
  opportunityFiles: defineTable({
    businessId: v.id("businesses"),
    opportunityId: v.id("opportunities"),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    kind: v.union(v.literal("plan"), v.literal("photo"), v.literal("contract"), v.literal("other")),
    uploadedByName: v.string(),
    createdAt: v.number(),
  }).index("by_opportunity", ["opportunityId", "createdAt"]),

  /** A person tagged in a note with @ (D-073): one row per note and tagged person, shown behind the top bar's bell until read. Written only
   *  by crm/lib/mentionNotify.ts. `excerpt` is a deliberate labelled copy of the start of the note, so the bell needs no lookup. */
  noteMentions: defineTable({
    businessId: v.id("businesses"),
    userId: v.id("users"),
    byName: v.string(),
    /** Absent when the system made the stage move (an automation, the client's quote link). */
    byUserId: v.optional(v.id("users")),
    /** "project", "client" and "quote" are a person tagged in a note (D-073); "stage" is a project moving between stages (D-076);
     *  "construction" is a punch item given to someone or a customer's sign-off (D-081). */
    kind: v.union(v.literal("project"), v.literal("client"), v.literal("quote"), v.literal("stage"), v.literal("construction")),
    opportunityId: v.optional(v.id("opportunities")),
    clientId: v.optional(v.id("clients")),
    quoteId: v.optional(v.id("quotes")),
    excerpt: v.string(),
    at: v.number(),
    readAt: v.optional(v.number()),
  }).index("by_user_and_at", ["userId", "at"]),

  /** Automations an Admin builds with Jobber's "New Automation" panel (D-071): a trigger, conditions and one action. Written only by
   *  crm/customAutomations.ts. The four fixed ones (D-065) stay in `automations`. `activeSince` is when it was last turned on: nothing
   *  that happened before then is acted on. */
  customAutomations: defineTable({
    businessId: v.id("businesses"),
    title: v.string(),
    active: v.boolean(),
    activeSince: v.number(),
    trigger: v.object({ kind: v.union(v.literal("datePassed"), v.literal("occurs")), object: v.union(v.literal("quote"), v.literal("project")), event: v.string(), days: v.optional(v.number()) }),
    conditions: v.array(v.object({
      field: v.union(v.literal("quoteStatus"), v.literal("stage"), v.literal("clientTag"), v.literal("lineItem")),
      op: v.union(v.literal("is"), v.literal("isNot")),
      values: v.array(v.string()),
    })),
    action: v.object({
      kind: v.union(v.literal("notify"), v.literal("addTag"), v.literal("updateStatus")),
      method: v.optional(v.union(v.literal("both"), v.literal("email"), v.literal("text"))),
      subject: v.optional(v.string()),
      body: v.optional(v.string()),
      textBody: v.optional(v.string()),
      tag: v.optional(v.string()),
      status: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedByName: v.string(),
  }).index("by_business", ["businessId"]),

  /** What each custom automation did, one row per item (a quote, a project, or one stage move) and automation, reused rather than repeated
   *  so nobody is emailed twice. `itemKey` is "q:<quote id>", "p:<project id>" or "h:<stage history id>". */
  customAutomationRuns: defineTable({
    businessId: v.id("businesses"),
    automationId: v.id("customAutomations"),
    itemKey: v.string(),
    quoteId: v.optional(v.id("quotes")),
    opportunityId: v.optional(v.id("opportunities")),
    clientId: v.optional(v.id("clients")),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("tested"), v.literal("logged"), v.literal("skipped"), v.literal("failed"), v.literal("done")),
    mode: v.union(v.literal("log"), v.literal("test"), v.literal("live")),
    detail: v.string(),
    toAddress: v.optional(v.string()),
    attempts: v.number(),
    at: v.number(),
  })
    .index("by_automation_and_item", ["automationId", "itemKey"])
    .index("by_business_and_at", ["businessId", "at"]),

  /** Every move of a project between stages: who, when, from, to (PRD 3.3). Written only by crm/pipeline.ts. */
  stageHistory: defineTable({
    opportunityId: v.id("opportunities"),
    businessId: v.id("businesses"),
    from: v.string(),
    to: v.string(),
    byName: v.string(),
    /** Absent when the system made the move (the client's quote link, for example). */
    byUserId: v.optional(v.id("users")),
    at: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_opportunity", ["opportunityId", "at"])
    .index("by_business", ["businessId", "at"]),

  /** A business's changes to the board's stages: its own extra stages, and PRD stages it has hidden (custom false). */
  pipelineStages: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    group: v.union(v.literal("Requests"), v.literal("Quotes")),
    order: v.number(),
    hidden: v.boolean(),
    custom: v.boolean(),
  }).index("by_business", ["businessId"]),

  /** Tasks on a project (pipeline card panel and Tasks tab). */
  opportunityTasks: defineTable({
    /** Absent for a task an Admin created that belongs to no project. */
    opportunityId: v.optional(v.id("opportunities")),
    businessId: v.id("businesses"),
    title: v.string(),
    assigneeId: v.optional(v.id("users")),
    dueAt: v.optional(v.number()),
    done: v.boolean(),
    createdAt: v.number(),
    /** When it was ticked off; cleared if it is reopened. Older tasks have none. */
    completedAt: v.optional(v.number()),
    /** A task with a start and end also shows on the Schedule (D-062); without them it is "unscheduled". */
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    /** Last change to its schedule (D-069), for the Zoho mirror. Absent: createdAt. */
    updatedAt: v.optional(v.number()),
  })
    .index("by_opportunity", ["opportunityId"])
    .index("by_business", ["businessId"]),

  /** The Schedule (D-062): consultations, follow-up visits, events and reminders. Tasks are in opportunityTasks. A repeat is one row,
   *  expanded when the calendar is read. Written only by crm/schedule.ts. */
  calendarEvents: defineTable({
    businessId: v.id("businesses"),
    type: v.union(v.literal("consultation"), v.literal("visit"), v.literal("event"), v.literal("reminder")),
    title: v.string(),
    opportunityId: v.optional(v.id("opportunities")),
    clientId: v.optional(v.id("clients")),
    start: v.number(),
    end: v.number(),
    /** Shown in the "Anytime" row rather than at a time of day. */
    anytime: v.boolean(),
    assigneeIds: v.array(v.id("users")),
    status: v.union(v.literal("upcoming"), v.literal("completed"), v.literal("confirmed"), v.literal("lost")),
    notes: v.string(),
    repeat: v.union(v.literal("none"), v.literal("daily"), v.literal("weekdays"), v.literal("weekly"), v.literal("monthly")),
    repeatUntil: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    /** "zoho" for an item that came from someone's Zoho Calendar (D-069). It never blocks a booking: overlapping it is a warning. */
    source: v.optional(v.literal("zoho")),
    /** The place, for an item that came from Zoho. Items made in the CRM send their client's address instead. */
    location: v.optional(v.string()),
    /** Last change by anyone or by the sync; decides who wins when the CRM and Zoho both changed an item. Absent: createdAt. */
    updatedAt: v.optional(v.number()),
    /** A construction visit (D-081): a job walk, an installation day or a reinspection. Only on `type: "visit"`. */
    visitKind: v.optional(v.union(v.literal("jobWalk"), v.literal("install"), v.literal("reinspection"))),
    /** A consultation sent to Jobber (D-085): the assessment on the project's Jobber request. */
    jobberAssessmentId: v.optional(v.string()),
    /** Why the last send to Jobber did not go through; cleared when one does. Shown on the request page with a retry. */
    jobberError: v.optional(v.string()),
    /** Marked done without a booking: the consultation happened offline (D-085). Never sent to Jobber. */
    offline: v.optional(v.boolean()),
  })
    .index("by_business_and_start", ["businessId", "start"])
    .index("by_opportunity", ["opportunityId"]),

  /** One person's Zoho Calendar connection (D-069). Tokens are encrypted and never sent to the browser. */
  calendarConnections: defineTable({
    userId: v.id("users"),
    /** The business whose calendar this person's Zoho events are mirrored into. */
    businessId: v.id("businesses"),
    status: v.union(v.literal("connected"), v.literal("needsReconnect")),
    calendarUid: v.string(),
    calendarName: v.string(),
    timezone: v.string(),
    /** Where this person's Zoho account lives (accounts.zoho.com, .eu, .in...) and its calendar API. */
    accountsUrl: v.string(),
    apiBase: v.string(),
    syncTypes: v.object({ tasks: v.boolean(), reminders: v.boolean(), events: v.boolean(), visits: v.boolean(), consultations: v.boolean() }),
    refreshToken: v.string(),
    accessToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    connectedAt: v.number(),
    lastSyncAt: v.optional(v.number()),
    lastError: v.string(),
  }).index("by_userId", ["userId"]),

  /** Which CRM item is which Zoho event, for one person's calendar. */
  calendarLinks: defineTable({
    connectionId: v.id("calendarConnections"),
    userId: v.id("users"),
    kind: v.union(v.literal("event"), v.literal("task")),
    eventId: v.optional(v.id("calendarEvents")),
    taskId: v.optional(v.id("opportunityTasks")),
    zohoUid: v.string(),
    etag: v.string(),
    /** Fingerprints of the mirrored fields the last time the two sides matched: a side whose fingerprint moved has changed since. */
    crmHash: v.string(),
    zohoHash: v.string(),
    origin: v.union(v.literal("crm"), v.literal("zoho")),
    /** A Zoho repeat the CRM cannot hold (every 2 weeks, ...). It is read as one occurrence and never written back, so the series is not damaged. */
    lossy: v.optional(v.boolean()),
  })
    .index("by_connection", ["connectionId"])
    .index("by_connection_and_zohoUid", ["connectionId", "zohoUid"])
    .index("by_zohoUid", ["zohoUid"])
    .index("by_event", ["eventId"])
    .index("by_task", ["taskId"]),

  /** A pending "Connect Zoho Calendar": the one-use code Zoho sends back with the person. */
  calendarOauthStates: defineTable({
    state: v.string(),
    userId: v.id("users"),
    businessId: v.id("businesses"),
    expiresAt: v.number(),
  }).index("by_state", ["state"]),

  /** A business's working days and hours (default Monday to Friday, 8 to 5), used to grey the Schedule and to warn on bookings. */
  scheduleSettings: defineTable({
    businessId: v.id("businesses"),
    days: v.array(v.number()),
    startMin: v.number(),
    endMin: v.number(),
  }).index("by_business", ["businessId"]),

  /** Internal notes on a project, newest first. */
  /* ---- Construction management (PRD 4.6, D-081). Everything hangs off the project (`opportunities`, D-004). ---- */

  /** Installation crews: records, not logins (D-010). Rates and availability come with PRD 4.4. */
  crews: defineTable({
    businessId: v.id("businesses"),
    name: v.string(),
    leadName: v.string(),
    phone: v.string(),
    notes: v.string(),
    active: v.boolean(),
    /** The agreed hourly rate and when the crew is free (PRD 4.4); both optional, written only by crm/construction.ts saveCrew. */
    rateCents: v.optional(v.number()),
    availability: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_business", ["businessId"]),

  /** Progress updates on site: what was done, with photos, and the construction stage it was at. */
  progressUpdates: defineTable({
    opportunityId: v.id("opportunities"),
    businessId: v.id("businesses"),
    stage: v.string(),
    text: v.string(),
    attachments: noteAttachments,
    author: v.string(),
    byUserId: v.id("users"),
    at: v.number(),
  }).index("by_opportunity_and_at", ["opportunityId", "at"]),

  /** Punch list: a correction to make before the customer signs off. Open → Fixed → Verified; a required item must be Verified before
   *  the project can be signed off or reach the last construction stage. */
  punchItems: defineTable({
    opportunityId: v.id("opportunities"),
    businessId: v.id("businesses"),
    title: v.string(),
    details: v.string(),
    required: v.boolean(),
    status: v.union(v.literal("open"), v.literal("fixed"), v.literal("verified")),
    assigneeUserId: v.optional(v.id("users")),
    assigneeCrewId: v.optional(v.id("crews")),
    /** Photos of the problem, and photos of the fix. */
    attachments: noteAttachments,
    fixAttachments: noteAttachments,
    createdBy: v.string(),
    createdAt: v.number(),
    fixedAt: v.optional(v.number()),
    fixedBy: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.string()),
  }).index("by_opportunity", ["opportunityId"]),

  /** The customer's completion sign-off. Made "pending" (with a secret link) once every required punch item is verified, then signed on
   *  a staff device or through the link. The punch list and summary are kept as they were when it was made (a deliberate snapshot). */
  signoffs: defineTable({
    opportunityId: v.id("opportunities"),
    businessId: v.id("businesses"),
    status: v.union(v.literal("pending"), v.literal("signed"), v.literal("cancelled")),
    summary: v.string(),
    punchSnapshot: v.array(v.object({ title: v.string(), required: v.boolean(), status: v.string() })),
    /** The customer's secret link while it is pending; cleared once signed or cancelled. */
    shareToken: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    signedBy: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    signedVia: v.optional(v.union(v.literal("device"), v.literal("link"))),
    signatureImageId: v.optional(v.id("_storage")),
  })
    .index("by_opportunity", ["opportunityId"])
    .index("by_shareToken", ["shareToken"]),

  opportunityNotes: defineTable({
    opportunityId: v.id("opportunities"),
    text: v.string(),
    author: v.string(),
    createdAt: v.number(),
    attachments: noteAttachments,
  }).index("by_opportunity", ["opportunityId"]),

  /** Internal notes on a client, newest first. */
  clientNotes: defineTable({
    clientId: v.id("clients"),
    text: v.string(),
    author: v.string(),
    attachments: noteAttachments,
  }).index("by_clientId", ["clientId"]),

  /** One office mailbox connection (D-064). The refresh token stays in the Convex environment; this row caches the short-lived
   *  access token and how far the read-only sync has walked. Nothing here is returned to the browser. */
  zohoMailSync: defineTable({
    singleton: v.literal("default"),
    /** The mailbox being read, so a change of ZOHO_MAILBOX starts a fresh connection. */
    mailbox: v.string(),
    accountId: v.string(),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    inboxFolderId: v.string(),
    sentFolderId: v.string(),
    inboxCursor: v.number(),
    sentCursor: v.number(),
    inboxDone: v.boolean(),
    sentDone: v.boolean(),
    backfillStartedAt: v.optional(v.number()),
    running: v.boolean(),
    /** While this is in the future and `running` is set, another sync leaves the run alone. */
    runningUntil: v.number(),
    lastSuccessAt: v.optional(v.number()),
    /** Empty when the last run finished. Never contains a token. */
    lastError: v.string(),
  }).index("by_singleton", ["singleton"]),

  /** A client address the mailbox sync still has to search, or has already covered (D-064). */
  zohoWatchedAddresses: defineTable({
    address: v.string(),
    field: v.union(v.literal("sender"), v.literal("to"), v.literal("cc")),
    nextStart: v.number(),
    done: v.boolean(),
    /** True when this address was already on a client at the moment the Inbox and Sent walk started, so that walk covers its history. */
    inScan: v.boolean(),
    enqueuedAt: v.number(),
  })
    .index("by_address", ["address"])
    .index("by_done_and_inScan", ["done", "inScan"])
    .index("by_inScan_and_done", ["inScan", "done"]),

  /** One Zoho message matched to one client. The same message can be stored twice when two clients share it. Bodies live in clientMailBodies. */
  clientMailMessages: defineTable({
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    zohoAccountId: v.string(),
    zohoMessageId: v.string(),
    folderId: v.string(),
    threadId: v.string(),
    subject: v.string(),
    fromName: v.string(),
    fromAddress: v.string(),
    toAddresses: v.array(v.string()),
    ccAddresses: v.array(v.string()),
    direction: v.union(v.literal("incoming"), v.literal("outgoing")),
    receivedAt: v.number(),
    preview: v.string(),
    hasAttachment: v.boolean(),
    contentStatus: v.union(v.literal("pending"), v.literal("stored"), v.literal("unavailable")),
    imagesHidden: v.boolean(),
    /** Failed body fetches. After three, the body is left out and the preview still shows. */
    contentAttempts: v.optional(v.number()),
  })
    .index("by_client_and_receivedAt", ["clientId", "receivedAt"])
    .index("by_zohoMessage_and_client", ["zohoMessageId", "clientId"])
    .index("by_client_and_thread", ["clientId", "threadId"])
    .index("by_contentStatus", ["contentStatus"]),

  /** The latest message of a Zoho thread for one client, so the Communication tab can page conversations instead of every email. */
  clientMailThreads: defineTable({
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    threadId: v.string(),
    subject: v.string(),
    latestAt: v.number(),
    preview: v.string(),
    fromName: v.string(),
    fromAddress: v.string(),
    toAddresses: v.array(v.string()),
    direction: v.union(v.literal("incoming"), v.literal("outgoing")),
    count: v.number(),
    hasAttachment: v.boolean(),
  })
    .index("by_client_and_latestAt", ["clientId", "latestAt"])
    .index("by_client_and_thread", ["clientId", "threadId"]),

  /** Sanitized HTML for one stored message. Kept off the message row so the thread list does not read every body. */
  clientMailBodies: defineTable({
    messageId: v.id("clientMailMessages"),
    html: v.string(),
  }).index("by_message", ["messageId"]),

  /* ---- Finance (Milestone 5, PRD 5.1 and 5.2; design 2026-11-18-finance). Amounts are whole cents. ---- */

  /** An invoice. `totalCents` and `paidCents` are labelled copies, kept by the one place that writes lines and allocations (crm/lib/billing.ts),
   *  so the lists can sort and add up without reading every line. "Past due" and "Awaiting payment" are never stored (they depend on today). */
  invoices: defineTable({
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    /** The project it bills, if any. */
    opportunityId: v.optional(v.id("opportunities")),
    /** Invoice number, unique within the business. */
    number: v.number(),
    subject: v.string(),
    status: v.union(v.literal("Draft"), v.literal("Sent"), v.literal("Paid"), v.literal("Bad debt"), v.literal("Void")),
    createdAt: v.number(),
    /** Set when it is sent or marked sent. */
    issuedAt: v.optional(v.number()),
    termsKey: v.string(),
    dueAt: v.optional(v.number()),
    /** Only for the "Custom date" term. */
    customDueAt: v.optional(v.number()),
    salesperson: v.string(),
    clientMessage: v.string(),
    contract: v.string(),
    discountKind: v.optional(v.union(v.literal("amount"), v.literal("percent"))),
    discountValue: v.optional(v.number()),
    taxPercent: v.optional(v.number()),
    /** What the client sees (Jobber's "Client view"). */
    clientView: v.object({ quantities: v.boolean(), unitPrices: v.boolean(), lineTotals: v.boolean(), accountBalance: v.boolean(), lateStamp: v.boolean() }),
    /** The payment-schedule row this invoice was made from. */
    scheduleItemId: v.optional(v.id("paymentScheduleItems")),
    totalCents: v.number(),
    paidCents: v.number(),
    shareToken: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    viewedAt: v.optional(v.number()),
    /** Internal notes, never shown to the client. */
    notes: v.optional(v.array(v.object({ text: v.string(), byName: v.string(), at: v.number() }))),
    /** Search only, a deliberate labelled copy: client name, address, invoice number and subject. */
    searchText: v.string(),
  })
    .index("by_business_and_number", ["businessId", "number"])
    .index("by_business_and_createdAt", ["businessId", "createdAt"])
    .index("by_clientId", ["clientId"])
    .index("by_opportunityId", ["opportunityId"])
    .index("by_shareToken", ["shareToken"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["businessId"] }),

  invoiceLines: defineTable({
    invoiceId: v.id("invoices"),
    position: v.number(),
    name: v.string(),
    description: v.string(),
    quantity: v.number(),
    unitPriceCents: v.number(),
    /** This invoice's share of the line, when it was made from a payment-schedule row ("Due this invoice"). */
    dueCents: v.optional(v.number()),
    serviceDate: v.optional(v.number()),
  }).index("by_invoiceId_and_position", ["invoiceId", "position"]),

  /** What happened to an invoice, in order: created, edited, sent, viewed, payment, status changes. */
  invoiceEvents: defineTable({
    invoiceId: v.id("invoices"),
    at: v.number(),
    kind: v.string(),
    byName: v.string(),
    detail: v.string(),
  }).index("by_invoiceId", ["invoiceId", "at"]),

  /** How a project is billed (Jobber's job Billing section): a reminder to invoice at the end, or a payment schedule. `totalCents` is a labelled
   *  snapshot of the approved quote's total when the schedule was made. */
  billingPlans: defineTable({
    opportunityId: v.id("opportunities"),
    businessId: v.id("businesses"),
    mode: v.union(v.literal("remind"), v.literal("schedule")),
    totalCents: v.number(),
  }).index("by_opportunityId", ["opportunityId"]),

  /** One row of a project's payment schedule: a percent or an amount of the billing total, and the invoice made from it. */
  paymentScheduleItems: defineTable({
    opportunityId: v.id("opportunities"),
    position: v.number(),
    description: v.string(),
    kind: v.union(v.literal("percent"), v.literal("amount")),
    /** 0 to 100 for "percent", cents for "amount". */
    value: v.number(),
    invoiceId: v.optional(v.id("invoices")),
  }).index("by_opportunityId_and_position", ["opportunityId", "position"]),

  /** Money received. A payment with cents not yet applied to an invoice is a deposit the invoice form can apply. */
  payments: defineTable({
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    opportunityId: v.optional(v.id("opportunities")),
    /** Set on a payment that came from a quote's deposit. */
    quoteId: v.optional(v.id("quotes")),
    method: v.string(),
    paidAt: v.number(),
    reference: v.string(),
    details: v.string(),
    amountCents: v.number(),
    source: v.union(v.literal("manual"), v.literal("quote deposit")),
    byName: v.string(),
    createdAt: v.number(),
  })
    .index("by_business_and_paidAt", ["businessId", "paidAt"])
    .index("by_clientId", ["clientId"])
    .index("by_opportunityId", ["opportunityId"])
    .index("by_quoteId", ["quoteId"]),

  /** The part of a payment that pays an invoice. An invoice's balance is its total minus its allocations. */
  paymentAllocations: defineTable({
    paymentId: v.id("payments"),
    invoiceId: v.id("invoices"),
    amountCents: v.number(),
    at: v.number(),
  })
    .index("by_paymentId", ["paymentId"])
    .index("by_invoiceId", ["invoiceId"]),

  /** Each business's invoice defaults (Admin edits them). */
  invoiceSettings: defineTable({
    businessId: v.id("businesses"),
    defaultTermsKey: v.string(),
    defaultClientMessage: v.string(),
    defaultContract: v.string(),
    /** Where "Get Client Review" sends the client (for example a Google review link). */
    reviewLink: v.string(),
  }).index("by_business", ["businessId"]),
});
