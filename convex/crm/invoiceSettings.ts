import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireModule } from "./lib/access";
import { DEFAULT_INVOICE_CONTRACT } from "./lib/billing";
import { PAYMENT_TERMS_KEYS } from "./lib/invoiceMath";

/** Each business's invoice defaults and the review link (design 2026-11-18-finance). Any member of the business can read them; an Admin edits them. */

export const get = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "templates", "view");
    const s = await ctx.db.query("invoiceSettings").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    return {
      defaultTermsKey: s?.defaultTermsKey ?? "due_on_receipt",
      defaultClientMessage: s?.defaultClientMessage ?? "",
      defaultContract: s?.defaultContract ?? DEFAULT_INVOICE_CONTRACT,
      reviewLink: s?.reviewLink ?? "",
    };
  },
});

export const save = mutation({
  args: { businessId: v.id("businesses"), defaultTermsKey: v.string(), defaultClientMessage: v.string(), defaultContract: v.string(), reviewLink: v.string() },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "templates", "edit");
    if (!PAYMENT_TERMS_KEYS.includes(a.defaultTermsKey) || a.defaultTermsKey === "custom") throw new ConvexError("Pick the default payment terms from the list.");
    if (a.defaultClientMessage.length > 5000 || a.defaultContract.length > 5000) throw new ConvexError("The message and the contract text can each be at most 5,000 characters.");
    const link = a.reviewLink.trim();
    if (link.length > 500 || (link !== "" && !/^https?:\/\/\S+$/i.test(link))) throw new ConvexError("The review link must be a web address starting with http:// or https://.");
    const fields = { businessId: a.businessId, defaultTermsKey: a.defaultTermsKey, defaultClientMessage: a.defaultClientMessage, defaultContract: a.defaultContract, reviewLink: link };
    const have = await ctx.db.query("invoiceSettings").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    if (have) await ctx.db.replace(have._id, fields);
    else await ctx.db.insert("invoiceSettings", fields);
  },
});
