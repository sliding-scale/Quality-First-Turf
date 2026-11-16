import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { rateLimiter } from "../rateLimits";
import { recordSignature } from "./construction";

/* The customer's completion sign-off page (D-081), like the quote's (clientQuote.ts): no sign-in, the secret link (`token`, 64 characters)
   is the key. It shows only this project's summary, its punch list as it was when the sign-off was made, the business and the address.
   Answers share the quote link's rate limit. */

async function byToken(ctx: QueryCtx, token: string): Promise<Doc<"signoffs"> | null> {
  if (token.length < 32) return null;
  return await ctx.db.query("signoffs").withIndex("by_shareToken", (q) => q.eq("shareToken", token)).first();
}

async function waiting(ctx: MutationCtx, token: string): Promise<Doc<"signoffs">> {
  await rateLimiter.limit(ctx, "clientQuoteAnswer", { key: token.slice(0, 16), throws: true });
  const signoff = await byToken(ctx, token);
  if (signoff === null || signoff.status !== "pending") throw new ConvexError("This sign-off link is no longer open. Ask the team for a new one.");
  return signoff;
}

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, a) => {
    const signoff = await byToken(ctx, a.token);
    if (signoff === null || signoff.status !== "pending") return null;
    const project = await ctx.db.get(signoff.opportunityId);
    if (project === null) return null;
    const client = await ctx.db.get(project.clientId);
    const business = await ctx.db.get(project.businessId);
    return {
      businessName: business?.name ?? "",
      title: project.title,
      code: project.code,
      clientName: client?.contactName || client?.name || "",
      address: client ? [client.street1, client.street2, [client.city, client.state].filter(Boolean).join(", "), client.zip].filter(Boolean).join(", ") : "",
      summary: signoff.summary,
      punch: signoff.punchSnapshot,
      createdAt: signoff.createdAt,
    };
  },
});

/** A place to upload the signature picture to, only while the sign-off is waiting. */
export const uploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, a) => {
    await waiting(ctx, a.token);
    return await ctx.storage.generateUploadUrl();
  },
});

export const sign = mutation({
  args: { token: v.string(), signedBy: v.string(), signatureStorageId: v.id("_storage") },
  handler: async (ctx, a) => {
    const signoff = await waiting(ctx, a.token);
    const name = a.signedBy.trim();
    await recordSignature(ctx, signoff, { signedBy: name, signatureStorageId: a.signatureStorageId, via: "link", by: { name }, now: Date.now() });
  },
});
