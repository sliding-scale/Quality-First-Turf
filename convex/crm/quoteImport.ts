import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { quoteTotals } from "./lib/quoteMath";

/* Putting an existing quote into the CRM, such as one made in Jobber before the CRM had a quote builder (D-056). Internal: it can only
   be run from a terminal against the deployment you choose, so the dev/production choice is the deployment, not a flag.
     npx convex run crm/quoteImport:uploadUrls '{"count":7}'     one upload address per photo or file (POST the file's bytes to it)
     npx convex run crm/quoteImport:importQuote '{ ... }'        adds the quote, its lines and its notes
   It refuses a number the business already has, so running it twice cannot make a second copy. */

export const uploadUrls = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, args) => {
    if (args.count < 1 || args.count > 25) throw new ConvexError("Ask for between 1 and 25 upload addresses.");
    const urls: string[] = [];
    for (let i = 0; i < args.count; i++) urls.push(await ctx.storage.generateUploadUrl());
    return urls;
  },
});

const status = v.union(
  v.literal("Draft"),
  v.literal("Awaiting response"),
  v.literal("Changes requested"),
  v.literal("Approved"),
  v.literal("Converted"),
  v.literal("Archived"),
);

export const importQuote = internalMutation({
  args: {
    businessSlug: v.string(),
    clientName: v.string(),
    /** The short code of the request this quote came from, if it has one. */
    requestCode: v.optional(v.string()),
    number: v.number(),
    title: v.string(),
    status,
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
    depositPercent: v.number(),
    depositCollectedCents: v.optional(v.number()),
    depositCollectedAt: v.optional(v.number()),
    signedBy: v.optional(v.string()),
    signatureImageId: v.optional(v.id("_storage")),
    signedAt: v.optional(v.number()),
    lines: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        imageId: v.optional(v.id("_storage")),
        quantity: v.number(),
        unitPriceCents: v.number(),
        optional: v.boolean(),
        selected: v.boolean(),
      }),
    ),
    notes: v.array(
      v.object({
        text: v.string(),
        author: v.string(),
        createdAt: v.number(),
        attachmentId: v.optional(v.id("_storage")),
        attachmentName: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.query("businesses").filter((q) => q.eq(q.field("slug"), args.businessSlug)).first();
    if (!business) throw new ConvexError(`No business with the slug "${args.businessSlug}".`);

    const clients = await ctx.db.query("clients").take(5000);
    const matches = clients.filter((c) => c.businessId === business._id && c.name === args.clientName);
    if (matches.length !== 1) throw new ConvexError(`Expected exactly one client named "${args.clientName}" in that business, found ${matches.length}.`);
    const client = matches[0];

    let opportunityId: Id<"opportunities"> | undefined;
    if (args.requestCode) {
      const projects = await ctx.db.query("opportunities").withIndex("by_clientId", (q) => q.eq("clientId", client._id)).take(200);
      const request = projects.find((p) => p.code === args.requestCode);
      if (!request) throw new ConvexError(`That client has no request with the code "${args.requestCode}".`);
      opportunityId = request._id;
    }

    const taken = await ctx.db.query("quotes").withIndex("by_business_and_number", (q) => q.eq("businessId", business._id).eq("number", args.number)).first();
    if (taken) throw new ConvexError(`Quote #${args.number} already exists in that business.`);
    if (args.lines.length === 0) throw new ConvexError("A quote needs at least one line.");

    const { totalCents } = quoteTotals(args.lines, args.depositPercent, args.depositCollectedCents ?? 0);
    const address = client.street1 ? `${client.street1} ${client.city} ${client.state} ${client.zip}` : "";
    const { lines, notes, businessSlug: _slug, clientName: _name, requestCode: _code, ...fields } = args;
    void _slug; void _name; void _code;

    const quoteId = await ctx.db.insert("quotes", {
      ...fields,
      businessId: business._id,
      clientId: client._id,
      opportunityId,
      totalCents,
      searchText: [client.name, address, `#${args.number}`, args.title, args.salesperson].filter(Boolean).join(" "),
    });
    for (const [position, line] of lines.entries()) await ctx.db.insert("quoteLineItems", { quoteId, position, ...line });
    for (const note of notes) await ctx.db.insert("quoteNotes", { quoteId, ...note });
    await ctx.db.patch(client._id, { lastActivityAt: Math.max(client.lastActivityAt, args.createdAt) });
    return { quoteId, totalCents, lines: lines.length, notes: notes.length };
  },
});

/** Adds a signature picture (an uploaded file) to a quote that is already in, such as one imported before the picture was to hand. */
export const attachSignature = internalMutation({
  args: { businessSlug: v.string(), number: v.number(), signatureImageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const business = await ctx.db.query("businesses").filter((q) => q.eq(q.field("slug"), args.businessSlug)).first();
    if (!business) throw new ConvexError(`No business with the slug "${args.businessSlug}".`);
    const quote = await ctx.db.query("quotes").withIndex("by_business_and_number", (q) => q.eq("businessId", business._id).eq("number", args.number)).first();
    if (!quote) throw new ConvexError(`Quote #${args.number} does not exist in that business.`);
    // A picture that was there before is replaced, so its file does not stay behind.
    if (quote.signatureImageId && quote.signatureImageId !== args.signatureImageId) await ctx.storage.delete(quote.signatureImageId);
    await ctx.db.patch(quote._id, { signatureImageId: args.signatureImageId });
    return quote._id;
  },
});
