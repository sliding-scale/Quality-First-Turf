import { v } from "convex/values";
import { query } from "../_generated/server";
import { budgetTotalCents, lineTotalCents, shareState } from "./lib/workPackage";

/* The installer's work package page (PRD 4.3), at /w/<secret link>: no sign-in, the 64-character link is the key (like the quote's, clientQuote.ts).
   It shows what an installer needs to do the job: the site address, scope, schedule, access, the crew, the materials to be delivered, the
   installer budget and the chosen drawings and photos. It never shows the customer's prices, the customer's phone or email, or material costs.
   A link that is revoked, replaced or past its date shows nothing. */

export const get = query({
  args: { token: v.string() },
  handler: async (ctx, a) => {
    if (a.token.length < 32) return null;
    const w = await ctx.db.query("workPackages").withIndex("by_shareToken", (q) => q.eq("shareToken", a.token)).first();
    if (w === null || shareState(w, Date.now()) !== "live") return null;
    const p = await ctx.db.get(w.opportunityId);
    if (p === null) return null;
    const client = await ctx.db.get(p.clientId);
    const business = await ctx.db.get(p.businessId);
    const crews = await Promise.all((p.crewIds ?? []).map((id) => ctx.db.get(id)));
    const installers = await Promise.all((p.installerIds ?? []).map((id) => ctx.db.get(id)));
    const files = [];
    for (const id of w.fileIds) {
      const f = await ctx.db.get(id);
      if (f === null || f.opportunityId !== p._id) continue; // a file deleted from the project drops out
      const url = await ctx.storage.getUrl(f.storageId);
      if (url !== null) files.push({ name: f.name, kind: f.kind, contentType: f.contentType, url });
    }
    const lines = w.includeMaterials ? await ctx.db.query("takeoffLines").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(500) : [];
    return {
      businessName: business?.name ?? "",
      title: p.title,
      code: p.code,
      address: client ? [client.street1, client.street2, [client.city, client.state].filter(Boolean).join(", "), client.zip].filter(Boolean).join(", ") : "",
      scope: w.scope,
      targetStartDate: w.targetStartDate ?? null,
      startDate: w.startDate ?? null,
      endDate: w.endDate ?? null,
      scheduleNotes: w.scheduleNotes,
      siteAccess: w.siteAccess,
      customerAvailability: w.customerAvailability,
      installerNotes: w.installerNotes,
      crews: crews.flatMap((c) => (c === null ? [] : [{ name: c.name, leadName: c.leadName, phone: c.phone }])),
      installers: installers.flatMap((u) => (u === null ? [] : [u.name])),
      materials: lines.map((l) => ({ name: l.name, unit: l.unit, qty: l.qtyOverride ?? l.calcQty ?? 0 })),
      budget: w.budgetLines.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, rateCents: l.rateCents, totalCents: lineTotalCents(l) })),
      budgetTotalCents: budgetTotalCents(w.budgetLines),
      files,
      expiresAt: w.shareExpiresAt ?? null,
      updatedAt: w.updatedAt,
    };
  },
});
