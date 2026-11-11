/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { catalogue } from "../../convex/shared/catalogue";
import { retailPrice } from "../../convex/shared/priceList";
import { seeded } from "./pipelineSeed";

describe("the price list in the builder", () => {
  it("finds catalogue items by words in their name and prices them for a homeowner", async () => {
    const w = await seeded();
    await w.base.run((ctx) => ctx.db.patch(w.clientId, { type: "homeowner" }));
    const known = catalogue.find((c) => c.customerType === "Homeowner" && retailPrice(c) !== null)!;
    const firstWords = known.name.split(" ").slice(0, 2).join(" ");
    const found = await w.sales.query(api.crm.quotePrices.search, { businessId: w.qft, clientId: w.clientId, search: firstWords });
    const hit = found.find((f) => f.name === known.name);
    expect(hit).toBeTruthy();
    expect(hit!.priced).toBe(true);
    expect(hit!.priceCents).toBe(Math.round(retailPrice(known)! * 100));
  });

  it("shows contractor items without a price (the list has no contractor rates yet) and finds nothing for nonsense", async () => {
    const w = await seeded();
    await w.base.run((ctx) => ctx.db.patch(w.clientId, { type: "contractor" }));
    const contractorItem = catalogue.find((c) => c.customerType === "Contractor")!;
    const any = await w.sales.query(api.crm.quotePrices.search, { businessId: w.qft, clientId: w.clientId, search: contractorItem.name.split(" ")[0] });
    expect(any.length).toBeGreaterThan(0);
    expect(any.every((i) => i.priceCents === null)).toBe(true);
    expect(await w.sales.query(api.crm.quotePrices.search, { businessId: w.qft, clientId: w.clientId, search: "zzzzqqq" })).toEqual([]);
  });

  it("says why there is nothing to fill from when the project did not come from the customer form", async () => {
    const w = await seeded();
    const r = await w.sales.query(api.crm.quotePrices.fromVisit, { opportunityId: w.project });
    expect(r.lines).toEqual([]);
    expect(r.missing).toMatch(/customer form/);
  });

  it("is closed to a person from another business", async () => {
    const w = await seeded();
    await expect(w.outsider.query(api.crm.quotePrices.search, { businessId: w.qft, search: "grass" })).rejects.toThrow();
    await expect(w.outsider.query(api.crm.quotePrices.fromVisit, { opportunityId: w.project })).rejects.toThrow();
  });
});
