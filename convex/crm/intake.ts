import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { US_STATES } from "../shared/usStates";
import { clientSearchText, opportunitySearchText } from "./lib/clientInput";
import { cleanEmail, cleanName, cleanZip, formatPhone } from "./lib/fields";
import { TURF_NAME, TURF_SLUG } from "./lib/businessNames";
import { SALES_STAGES } from "./lib/stages";

/* What happens when someone fills in the customer form (D-040):
     1. If they are not already a client of the business, a client is created. Already a client means the same email, or the
        same phone number, in that business. A match is reused, never duplicated.
     2. A request is created either way: a project in the Sales pipeline at its first stage, "New Request".
   The forms backend schedules recordSubmission right after it saves a submission. It is a separate step on purpose, so a
   problem here can never stop the form or the Jobber push, which stay as they were. Everything here is safe to repeat. */

/** The customer form belongs to Quality First Turf Landscape (D-066). Found by its slug, and created if this deployment does not have it yet. */
const FORM_BUSINESS = { name: TURF_NAME, slug: TURF_SLUG };

async function formBusiness(ctx: MutationCtx): Promise<Id<"businesses">> {
  const found = await ctx.db.query("businesses").withIndex("by_slug", (q) => q.eq("slug", FORM_BUSINESS.slug)).first();
  if (!found) return await ctx.db.insert("businesses", FORM_BUSINESS);
  if (found.name !== FORM_BUSINESS.name) await ctx.db.patch(found._id, { name: FORM_BUSINESS.name });
  return found._id;
}

/** The forms store the state's full name; the CRM stores the two-letter code. */
function stateCode(value: string): string {
  const v = value.trim();
  const hit = US_STATES.find((s) => s.abbr === v.toUpperCase() || s.name.toLowerCase() === v.toLowerCase());
  return hit ? hit.abbr : "";
}

/** The projects' title: the services asked for, shortened if there are several. */
function titleFor(services: string[]): string {
  if (services.length === 0) return "Customer enquiry";
  return services.length <= 2 ? services.join(", ") : `${services[0]} + ${services.length - 1} more`;
}

async function record(ctx: MutationCtx, project: Doc<"projects">) {
  // Repeating a submission, or running the catch-up twice, must not create a second request.
  const existing = await ctx.db.query("opportunities").withIndex("by_sourceProjectId", (q) => q.eq("sourceProjectId", project._id)).first();
  if (existing) return { clientId: existing.clientId, opportunityId: existing._id, createdClient: false };

  const businessId = await formBusiness(ctx);
  // What the customer typed, as it was when they sent it (later edits by a salesperson do not change it).
  const s = project.submitted ?? project;
  const first = cleanName(s.firstName).trim();
  const last = cleanName(s.lastName).trim();
  const phone = formatPhone(s.phone);
  const email = cleanEmail(s.email).trim().toLowerCase();
  const now = Date.now();

  // Is this person already a client of the business? Same email first, then same phone.
  let client: Doc<"clients"> | null = null;
  if (email) client = await ctx.db.query("clients").withIndex("by_business_and_email", (q) => q.eq("businessId", businessId).eq("email", email)).first();
  if (!client && phone) client = await ctx.db.query("clients").withIndex("by_business_and_phone", (q) => q.eq("businessId", businessId).eq("phone", phone)).first();

  let createdClient = false;
  if (client) {
    // Their details stay as staff have them. They are active again, and a client who had been archived is a lead once more.
    await ctx.db.patch(client._id, { lastActivityAt: now, ...(client.status === "archived" ? { status: "lead" as const } : {}) });
  } else {
    const contactName = [first, last].filter(Boolean).join(" ") || email || phone || "New customer";
    const customerType = project.answers.find((a) => a.question === "Customer type")?.value;
    const fields = {
      type: customerType === "Contractor" ? ("contractor" as const) : ("homeowner" as const),
      name: contactName,
      nameKey: contactName.toLowerCase(),
      contactName,
      company: "",
      phone,
      email,
      street1: s.street1.trim(),
      street2: s.street2.trim(),
      city: cleanName(s.city).trim(),
      state: stateCode(s.state),
      zip: cleanZip(s.zip),
    };
    const clientId = await ctx.db.insert("clients", {
      businessId,
      ...fields,
      notes: "",
      status: "lead",
      createdAt: now,
      lastActivityAt: now,
      searchText: clientSearchText(fields),
    });
    client = (await ctx.db.get(clientId))!;
    createdClient = true;
  }

  const title = titleFor(s.services);
  const code = project.shortCode ?? "";
  const stage = SALES_STAGES[0]; // New Request
  const opportunityId = await ctx.db.insert("opportunities", {
    businessId: client.businessId,
    clientId: client._id,
    code,
    title,
    pipeline: "Sales",
    stage,
    requestedAt: project._creationTime,
    owner: "Unassigned",
    searchText: opportunitySearchText(client, { title, code, stage }),
    sourceProjectId: project._id,
  });
  return { clientId: client._id, opportunityId, createdClient };
}

/** Scheduled by the forms backend right after a customer-form submission is saved. */
export const recordSubmission = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    return project ? await record(ctx, project) : null;
  },
});

/**
 * Catch-up for submissions that were made before this existed: gives each one its client and request. Run once when this
 * first goes live, oldest first, and safe to run again:  npx convex run crm/intake:backfill
 * It works through the submissions in small batches and schedules itself until it is done.
 */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<{ handled: number; done: boolean }> => {
    const page = await ctx.db.query("projects").order("asc").paginate({ numItems: 25, cursor: args.cursor ?? null });
    for (const project of page.page) await record(ctx, project);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.crm.intake.backfill, { cursor: page.continueCursor });
    return { handled: page.page.length, done: page.isDone };
  },
});
