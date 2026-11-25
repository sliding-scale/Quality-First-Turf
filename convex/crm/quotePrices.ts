import { v } from "convex/values";
import { query } from "../_generated/server";
import { catalogue } from "../shared/catalogue";
import { retailPrice, priceUnit } from "../shared/priceList";
import { planQuoteLines } from "../shared/quoteLines";
import { photoIdsForLine, photosOf } from "./lib/linePhotos";
import { productPhotoPath } from "../shared/productPhotos";
import { requireModule } from "./lib/access";
import { workAreasOf } from "./lib/visitData";
import { searchOwn } from "./catalogue";

/** The price list for the quote builder (D-063): the shared catalogue (the same names and 2026 prices the customer form uses), priced for
 *  the client's type, and "Fill from the site visit", which proposes lines from a project that came from the customer form. Prices the
 *  list does not cover (contractor rates, services quoted by hand) come back as null, to be typed in. */

/** How many price-list matches the picker shows; typing narrows them. */
const MAX_RESULTS = 100;

const toCents = (dollars: number | null) => (dollars === null ? null : Math.round(dollars * 100));

export const search = query({
  args: { businessId: v.id("businesses"), clientId: v.optional(v.id("clients")), search: v.string() },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "quotes", "view");
    // A business with its own products and services list (Settings > Products & Services) is priced from it; one without uses the shared list below.
    const own = await searchOwn(ctx, a.businessId, a.search, MAX_RESULTS);
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
      if (out.length >= MAX_RESULTS) break;
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
    const workAreas = await workAreasOf(ctx, opportunity);
    const project = opportunity.sourceProjectId ? await ctx.db.get(opportunity.sourceProjectId) : null;
    // A visit saved in the CRM works without the customer form behind it, but the services and answers still come from that form.
    if (workAreas === null && !opportunity.sourceProjectId) return { lines: [], missing: "This project was not made from the customer form, so there is no visit to read." };
    if (workAreas === null || (project === null && workAreas.length === 0)) return { lines: [], missing: "The customer form behind this project is gone." };
    const planned = planQuoteLines({ services: project?.services ?? [], products: project?.products ?? [], answers: project?.answers ?? [], measurements: project?.measurements ?? [], workAreas });
    const lines = await Promise.all(planned.lines.map(async (l) => {
      const item = catalogue.find((c) => c.name === l.name);
      return { name: l.name, quantity: l.quantity, unit: item ? priceUnit(item) : "EA", priceCents: item ? toCents(retailPrice(item)) : null, imagePath: productPhotoPath(item?.product), photos: await photosOf(ctx, photoIdsForLine(item, workAreas)) };
    }));
    return { lines, missing: planned.missing };
  },
});
