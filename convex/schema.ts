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
    pipeline: v.union(v.literal("Sales"), v.literal("Preplanning")),
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
    outcome: v.optional(v.union(v.literal("won"), v.literal("lost"))),
    closedAt: v.optional(v.number()),
    lostReason: v.optional(v.string()),
    /** The signed contract, uploaded as a PDF or an image (one way to meet the Closed Won rule), and an optional invoice (D-063). */
    signedContractId: v.optional(v.id("_storage")),
    signedContractName: v.optional(v.string()),
    signedContractAt: v.optional(v.number()),
    invoiceId: v.optional(v.id("_storage")),
    invoiceName: v.optional(v.string()),
  })
    .index("by_business_and_requestedAt", ["businessId", "requestedAt"])
    .index("by_clientId", ["clientId"])
    .index("by_sourceProjectId", ["sourceProjectId"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["businessId", "pipeline"] }),

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
    contract: v.string(),
  }).index("by_business", ["businessId"]),

  quoteNotes: defineTable({
    quoteId: v.id("quotes"),
    text: v.string(),
    author: v.string(),
    createdAt: v.number(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
  }).index("by_quoteId", ["quoteId"]),

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

  /** Every move of a project between Sales stages: who, when, from, to (PRD 3.3). Written only by crm/pipeline.ts moveStage. */
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
    status: v.union(v.literal("upcoming"), v.literal("completed"), v.literal("confirmed")),
    notes: v.string(),
    repeat: v.union(v.literal("none"), v.literal("daily"), v.literal("weekdays"), v.literal("weekly"), v.literal("monthly")),
    repeatUntil: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_business_and_start", ["businessId", "start"])
    .index("by_opportunity", ["opportunityId"]),

  /** A business's working days and hours (default Monday to Friday, 8 to 5), used to grey the Schedule and to warn on bookings. */
  scheduleSettings: defineTable({
    businessId: v.id("businesses"),
    days: v.array(v.number()),
    startMin: v.number(),
    endMin: v.number(),
  }).index("by_business", ["businessId"]),

  /** Internal notes on a project, newest first. */
  opportunityNotes: defineTable({
    opportunityId: v.id("opportunities"),
    text: v.string(),
    author: v.string(),
    createdAt: v.number(),
  }).index("by_opportunity", ["opportunityId"]),

  /** Internal notes on a client, newest first. */
  clientNotes: defineTable({
    clientId: v.id("clients"),
    text: v.string(),
    author: v.string(),
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
});
