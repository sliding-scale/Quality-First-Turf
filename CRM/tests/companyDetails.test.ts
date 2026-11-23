/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { checkCompanyDetails } from "../../convex/crm/lib/companyDetails";
import { seeded } from "./pipelineSeed";

const blank = { phone: "", email: "", website: "" };

describe("company details rules", () => {
  it("accepts all three empty", () => {
    expect(checkCompanyDetails(blank)).toEqual({ ok: true, value: blank });
  });

  it("needs a full 10-digit phone and formats it", () => {
    const short = checkCompanyDetails({ ...blank, phone: "555123" });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.problems.phone).toMatch(/10-digit/);
    expect(checkCompanyDetails({ ...blank, phone: "5551234567" })).toMatchObject({ ok: true, value: { phone: "(555) 123-4567" } });
  });

  it("rejects an email with a space or no domain", () => {
    for (const email of ["a b@c.com", "a@b", "nope"]) {
      const r = checkCompanyDetails({ ...blank, email });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problems.email).toBeTruthy();
    }
    expect(checkCompanyDetails({ ...blank, email: " Office@Example.com " })).toMatchObject({ ok: true, value: { email: "Office@Example.com" } });
  });

  it("adds https:// to a bare website, and refuses other schemes and very long ones", () => {
    expect(checkCompanyDetails({ ...blank, website: "example.com" })).toMatchObject({ ok: true, value: { website: "https://example.com" } });
    expect(checkCompanyDetails({ ...blank, website: "http://example.com/x" })).toMatchObject({ ok: true, value: { website: "http://example.com/x" } });
    for (const website of ["javascript:alert(1)", "ftp://x.com", "https://" + "a".repeat(200) + ".com", "not a site"]) {
      const r = checkCompanyDetails({ ...blank, website });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problems.website).toBeTruthy();
    }
  });
});

describe("saving company details", () => {
  it("lets an Admin save any business, leaves the name alone, and clearing a field removes it", async () => {
    const w = await seeded();
    const before = (await w.admin.query(api.crm.businesses.list, {})).find((b) => b._id === w.other)!;
    await w.admin.mutation(api.crm.businesses.saveDetails, { businessId: w.qft, phone: "5551234567", email: "hi@qft.com", website: "qft.com" });
    await w.admin.mutation(api.crm.businesses.saveDetails, { businessId: w.other, phone: "", email: "x@y.com", website: "" });
    const rows = await w.admin.query(api.crm.businesses.list, {});
    expect(rows.find((b) => b._id === w.qft)).toMatchObject({ phone: "(555) 123-4567", email: "hi@qft.com", website: "https://qft.com" });
    const other = rows.find((b) => b._id === w.other)!;
    expect(other.name).toBe(before.name);
    expect(other.phone).toBeUndefined();
    expect(other.email).toBe("x@y.com");
    await w.admin.mutation(api.crm.businesses.saveDetails, { businessId: w.qft, phone: "", email: "", website: "" });
    const cleared = (await w.admin.query(api.crm.businesses.list, {})).find((b) => b._id === w.qft)!;
    expect(cleared.phone).toBeUndefined();
    expect(cleared.website).toBeUndefined();
  });

  it("refuses everyone but an Admin, and bad input", async () => {
    const w = await seeded();
    const ok = { businessId: w.qft, phone: "", email: "", website: "" };
    await expect(w.sales.mutation(api.crm.businesses.saveDetails, ok)).rejects.toThrow(/Only an Admin/);
    await expect(w.outsider.mutation(api.crm.businesses.saveDetails, { ...ok, businessId: w.other })).rejects.toThrow(/Only an Admin/);
    await expect(w.admin.mutation(api.crm.businesses.saveDetails, { ...ok, phone: "555" })).rejects.toThrow(/10-digit/);
  });
});
