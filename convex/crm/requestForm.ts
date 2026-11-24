import { linesFromForm } from "./lib/formLines";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation } from "../_generated/server";
import { newShortCode } from "../projects/shortCode";
import { answerValidator, measurementValidator } from "../schema";
import { areaBandFor, contactProblems, wantsCallFromAnswers } from "../shared/discovery";
import { US_STATES } from "../shared/usStates";
import { requireModule } from "./lib/access";
import { checkAssignee } from "./lib/assignees";
import { clientSearchText, opportunitySearchText } from "./lib/clientInput";
import { cleanEmail, cleanName, cleanZip, formatPhone } from "./lib/fields";
import { notifyMentions } from "./lib/mentionNotify";
import { checkNoteFiles, noteFilesArg } from "./lib/noteFiles";
import { SALES_STAGES } from "./lib/stages";

/* New Request, filled in by staff with the customer form's own questions (D-079). One save writes both sides:
     1. a forms `projects` row, shaped exactly as the customer form's projects.create writes it, so the sales form lists it and
        can run the on-site visit on it;
     2. the CRM client (the one picked, or else matched by email or phone, or else created, as in D-045) and the request, a
        Sales-pipeline project at "New Request" that points at that row through `sourceProjectId`.
   It is a copy of the forms' insert, not a call to it (D-021), because staff must not use up the public form's rate limit, and
   because the CRM step is done here, in the same save, with the client staff chose. Nothing is sent to Jobber. */

/** The forms store a size with its square feet and its price band worked out (projects/mutations.ts does the same on its side). */
function withSquareFeet<T extends { length: number | null; width: number | null; unmeasured: boolean; squareFeet: number | null }>(m: T) {
  const squareFeet = m.unmeasured
    ? null
    : m.squareFeet !== null && m.squareFeet > 0
      ? m.squareFeet
      : m.length !== null && m.width !== null && m.length > 0 && m.width > 0
        ? m.length * m.width
        : null;
  return { ...m, squareFeet, areaBand: squareFeet === null ? null : areaBandFor(squareFeet) };
}

/** The forms store the state's full name; the CRM stores the two-letter code. */
function stateCode(value: string): string {
  const s = value.trim();
  return US_STATES.find((x) => x.abbr === s.toUpperCase() || x.name.toLowerCase() === s.toLowerCase())?.abbr ?? "";
}

function titleFor(services: string[]): string {
  return services.length <= 2 ? services.join(", ") : `${services[0]} + ${services.length - 1} more`;
}

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    /** The client picked in the form. Without one, the person is matched by email or phone, or becomes a new client. */
    clientId: v.optional(v.id("clients")),
    salespersonId: v.optional(v.id("users")),
    note: v.optional(v.string()),
    noteFiles: noteFilesArg,
    // What the customer form sends (DiscoveryPayload).
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
  },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, "requests", "edit");
    const problem = Object.values(contactProblems(args))[0];
    if (problem !== undefined) throw new ConvexError(problem);
    // A request that asked for a professional to reach out has no services (its answers say so); any other needs at least one.
    if (args.services.length === 0 && !wantsCallFromAnswers(args.answers)) throw new ConvexError("Choose at least one service.");
    if (args.services.length > 40 || args.answers.length > 400 || args.measurements.length > 200 || args.notes.length > 10000) {
      throw new ConvexError("The request is too large.");
    }
    await checkAssignee(ctx, args.salespersonId, args.businessId);
    const now = Date.now();

    // 1. The forms' record.
    const measurements = args.measurements.map(withSquareFeet);
    const answered = {
      firstName: args.firstName, lastName: args.lastName, phone: args.phone, email: args.email,
      street1: args.street1, street2: args.street2, city: args.city, state: args.state, zip: args.zip,
      services: args.services, products: args.products, answers: args.answers, notes: args.notes, measurements,
    };
    const code = await newShortCode(ctx);
    const projectId = await ctx.db.insert("projects", {
      status: "discovery saved",
      ...answered,
      addOns: args.addOns,
      submitted: answered,
      jobberClientId: null,
      jobberRequestId: null,
      jobberQuoteId: null,
      missingMapping: null,
      integrationError: null,
      shortCode: code,
    });

    // 2. The CRM client.
    const email = cleanEmail(args.email).trim().toLowerCase();
    const phone = formatPhone(args.phone);
    let client: Doc<"clients"> | null = null;
    if (args.clientId) {
      client = await ctx.db.get(args.clientId);
      if (client === null || client.businessId !== args.businessId) throw new ConvexError("Pick a client from this business.");
    } else {
      if (email) client = await ctx.db.query("clients").withIndex("by_business_and_email", (q) => q.eq("businessId", args.businessId).eq("email", email)).first();
      if (!client && phone) client = await ctx.db.query("clients").withIndex("by_business_and_phone", (q) => q.eq("businessId", args.businessId).eq("phone", phone)).first();
    }
    let createdClient = false;
    if (client) {
      // Their details stay as staff have them. An archived client is a lead again.
      await ctx.db.patch(client._id, { lastActivityAt: now, ...(client.status === "archived" ? { status: "lead" as const } : {}) });
    } else {
      const contactName = `${cleanName(args.firstName).trim()} ${cleanName(args.lastName).trim()}`.trim();
      const fields = {
        type: args.answers.find((a) => a.question === "Customer type")?.value === "Contractor" ? ("contractor" as const) : ("homeowner" as const),
        name: contactName,
        nameKey: contactName.toLowerCase(),
        contactName,
        company: "",
        phone,
        email,
        street1: args.street1.trim(),
        street2: args.street2.trim(),
        city: cleanName(args.city).trim(),
        state: stateCode(args.state),
        zip: cleanZip(args.zip),
      };
      const id = await ctx.db.insert("clients", { businessId: args.businessId, ...fields, notes: "", status: "lead", createdAt: now, lastActivityAt: now, searchText: clientSearchText(fields) });
      client = (await ctx.db.get(id))!;
      createdClient = true;
    }

    // 3. The request, pointing at the forms' record.
    const title = titleFor(args.services);
    const stage = SALES_STAGES[0]; // New Request
    const formLines = linesFromForm({ services: args.services, products: args.products, answers: args.answers, measurements: args.measurements });
    const opportunityId = await ctx.db.insert("opportunities", {
      ...(formLines.length ? { lines: formLines } : {}),
      businessId: args.businessId,
      clientId: client._id,
      code,
      title,
      pipeline: "Sales",
      stage,
      requestedAt: now,
      stageEnteredAt: now,
      owner: "Unassigned",
      salespersonId: args.salespersonId,
      searchText: opportunitySearchText(client, { title, code, stage }),
      sourceProjectId: projectId,
    });
    const note = (args.note ?? "").trim().slice(0, 5000);
    const attachments = await checkNoteFiles(ctx, args.noteFiles);
    if (note || attachments.length) await ctx.db.insert("opportunityNotes", { opportunityId, text: note, author: staff.name, createdAt: now, ...(attachments.length ? { attachments } : {}) });
    await notifyMentions(ctx, { businessId: args.businessId, staff, text: note, target: { kind: "project", opportunityId }, now });
    return { opportunityId, projectId, clientId: client._id, createdClient };
  },
});
