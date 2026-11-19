import { v } from "convex/values";
import { query } from "../_generated/server";
import { catalogue } from "../shared/catalogue";
import { retailPrice, priceUnit } from "../shared/priceList";
import { planQuoteLines } from "../shared/quoteLines";
import { requireModule } from "./lib/access";
import { searchOwn } from "./catalogue";

/** The price list for the quote builder (D-063): the shared catalogue (the same names and 2026 prices the customer form uses), priced for
 *  the client's type, and "Fill from the site visit", which proposes lines from a project that came from the customer form. Prices the
 *  list does not cover (contractor rates, services quoted by hand) come back as null, to be typed in. */

const toCents = (dollars: number | null) => (dollars === null ? null : Math.round(dollars * 100));

export const search = query({
  args: { businessId: v.id("businesses"), clientId: v.optional(v.id("clients")), search: v.string() },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "quotes", "view");
    // A business with its own products and services list (Settings > Products & Services) is priced from it; one without uses the shared list below.
    const own = await searchOwn(ctx, a.businessId, a.search, 20);
    if (own !== null) return own.map((d) => ({ name: d.name, unit: "each", priceCents: d.unitPriceCents as number | null, priced: true, description: d.description }));
    const client = a.clientId ? await ctx.db.get(a.clientId) : null;
    const type = client?.type === "contractor" ? "Contractor" : "Homeowner";
    const words = a.search.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const item of catalogue) {
      if (item.customerType !== type) continue;
      const name = item.name.toLowerCase();
      if (!words.every((w) => name.includes(w))) continue;
      out.push({ name: item.name, unit: priceUnit(item), priceCents: toCents(retailPrice(item)), priced: retailPrice(item) !== null, description: "" });
      if (out.length >= 20) break;
    }
    return out;
  },
});

/** Lines proposed from the visit behind a project (the customer form's answers, measurements and work areas), with prices where the
 *  list has them. `missing` says why nothing could be proposed. */
export const fromVisit = query({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, a) => {
    const opportunity = await ctx.db.get(a.opportunityId);
    if (opportunity === null) return { lines: [], missing: "That project no longer exists." };
    await requireModule(ctx, opportunity.businessId, "quotes", "view");
    if (!opportunity.sourceProjectId) return { lines: [], missing: "This project was not made from the customer form, so there is no visit to read." };
    const project = await ctx.db.get(opportunity.sourceProjectId);
    if (project === null) return { lines: [], missing: "The customer form behind this project is gone." };
    const workAreas = await ctx.db.query("workAreas").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).take(100);
    const planned = planQuoteLines({ services: project.services, products: project.products, answers: project.answers, measurements: project.measurements, workAreas });
    const lines = planned.lines.map((l) => {
      const item = catalogue.find((c) => c.name === l.name);
      return { name: l.name, quantity: l.quantity, unit: item ? priceUnit(item) : "EA", priceCents: item ? toCents(retailPrice(item)) : null };
    });
    return { lines, missing: planned.missing };
  },
});
