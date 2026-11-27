/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seeded } from "./pipelineSeed";

type World = Awaited<ReturnType<typeof seeded>>;
type Kind = "clients" | "projects" | "quotes" | "invoices" | "payments" | "jobs";
type Who = World["admin"];

async function all(who: Who, businessId: Id<"businesses">, kind: Kind) {
  const rows: (string | number | null | undefined)[][] = [];
  let cursor: string | null = null;
  let headers: string[] = [];
  let pages = 0;
  do {
    const r: { headers: string[]; rows: (string | number | null | undefined)[][]; next: string | null } = await who.query(api.crm.exports.page, { businessId, kind, cursor });
    headers = r.headers;
    rows.push(...r.rows);
    cursor = r.next;
    pages++;
  } while (cursor !== null && pages < 50);
  return { headers, rows, pages };
}

const count = (w: World, table: "clients" | "opportunities" | "quotes" | "invoices" | "payments", businessId: Id<"businesses">) =>
  w.base.run(async (ctx) => (await ctx.db.query(table).collect()).filter((r) => r.businessId === businessId).length);

describe("Export data (plan 2026-11-20-export)", () => {
  it("gives every row of every kind for the business, each row as wide as its header", async () => {
    const w = await seeded({ stage: "New Request" });
    await w.base.run(async (ctx) => {
      const base = { businessId: w.qft, clientId: w.clientId, createdAt: 1 };
      await ctx.db.insert("payments", { ...base, opportunityId: w.project, method: "Cash", paidAt: Date.UTC(2026, 10, 2), reference: "R1", details: "", amountCents: 12345, source: "manual", byName: "Olga" });
      await ctx.db.insert("invoices", {
        ...base, opportunityId: w.project, number: 9001, subject: "Deposit", status: "Sent", termsKey: "due-on-receipt", salesperson: "Sam", clientMessage: "", contract: "", searchText: "x",
        clientView: { quantities: true, unitPrices: true, lineTotals: true, accountBalance: true, lateStamp: true }, totalCents: 50000, paidCents: 12345,
      });
    });
    const pairs: [Kind, "clients" | "opportunities" | "quotes" | "invoices" | "payments"][] = [["clients", "clients"], ["projects", "opportunities"], ["quotes", "quotes"], ["invoices", "invoices"], ["payments", "payments"]];
    for (const [kind, table] of pairs) {
      const got = await all(w.admin, w.qft, kind);
      expect(got.rows.length, kind).toBe(await count(w, table, w.qft));
      for (const r of got.rows) expect(r.length, kind).toBe(got.headers.length);
    }
    const inv = (await all(w.admin, w.qft, "invoices")).rows.find((r) => r[0] === 9001)!;
    expect(inv).toEqual([9001, "Deposit", expect.any(String), "TST-001", "Sent", "Sam", "1970-01-01", "", "", "500.00", "123.45", "376.55"]);
    const pay = (await all(w.admin, w.qft, "payments")).rows.find((r) => r[3] === "Cash")!;
    expect(pay).toEqual(["2026-11-02", expect.any(String), "TST-001", "Cash", "123.45", "R1", "Recorded by hand", "Olga", ""]);
    const proj = (await all(w.admin, w.qft, "projects")).rows.find((r) => r[0] === "TST-001")!;
    expect(proj.slice(0, 7)).toEqual(["TST-001", "Test turf", expect.any(String), "Sales", "New Request", "Open", null]);
  });

  it("pages through more than one page without losing or repeating a row", async () => {
    const w = await seeded();
    const before = await count(w, "clients", w.qft);
    await w.base.run(async (ctx) => {
      for (let i = 0; i < 320; i++) {
        const name = `Bulk client ${String(i).padStart(4, "0")}`;
        await ctx.db.insert("clients", { businessId: w.qft, type: "homeowner", name, contactName: name, company: "", phone: "", email: "", street1: "", street2: "", city: "", state: "", zip: "", notes: "", status: "lead", createdAt: 1, lastActivityAt: 1, nameKey: name.toLowerCase(), searchText: name });
      }
    });
    const got = await all(w.admin, w.qft, "clients");
    expect(got.pages).toBeGreaterThan(1);
    expect(got.rows.length).toBe(before + 320);
    const bulk = got.rows.map((r) => String(r[0])).filter((n) => n.startsWith("Bulk client "));
    expect(new Set(bulk).size).toBe(320); // each exactly once
    expect(got.rows.filter((r) => String(r[0]).startsWith("Bulk client ")).length).toBe(320);
  });

  it("never includes another business's rows, and refuses someone from the other business", async () => {
    const w = await seeded();
    const mine = (await all(w.admin, w.qft, "clients")).rows.map((r) => r[0]);
    const theirs = (await all(w.admin, w.other, "clients")).rows.map((r) => r[0]);
    expect(theirs.length).toBeGreaterThan(0);
    for (const n of theirs) if (!mine.includes(n)) expect(mine).not.toContain(n);
    expect(theirs.length).toBe(await count(w, "clients", w.other));
    await expect(w.outsider.query(api.crm.exports.page, { businessId: w.qft, kind: "clients", cursor: null })).rejects.toThrow();
  });

  it("is refused to a person with no access to the kind, or limited to assigned records", async () => {
    const w = await seeded();
    await expect(w.installer.query(api.crm.exports.page, { businessId: w.qft, kind: "invoices", cursor: null })).rejects.toThrow();
    expect(await w.installer.query(api.crm.exports.allowed, { businessId: w.qft })).toEqual([]);
    expect(await w.admin.query(api.crm.exports.allowed, { businessId: w.qft })).toEqual(["clients", "projects", "quotes", "invoices", "payments"]);
    await w.base.run(async (ctx) => {
      const u = (await ctx.db.query("users").collect()).find((x) => x.name === "Sam Sales")!;
      await ctx.db.patch(u._id, { assignedOnly: true });
    });
    await expect(w.sales.query(api.crm.exports.page, { businessId: w.qft, kind: "clients", cursor: null })).rejects.toThrow(/limited to the records assigned/);
    expect(await w.sales.query(api.crm.exports.allowed, { businessId: w.qft })).toEqual([]);
  });

  it("copes with a client deleted after it was billed", async () => {
    const w = await seeded();
    const gone = await w.base.run(async (ctx) => {
      const name = "Gone client";
      const id = await ctx.db.insert("clients", { businessId: w.qft, type: "homeowner", name, contactName: name, company: "", phone: "", email: "", street1: "", street2: "", city: "", state: "", zip: "", notes: "", status: "lead", createdAt: 1, lastActivityAt: 1, nameKey: "gone client", searchText: name });
      await ctx.db.insert("payments", { businessId: w.qft, clientId: id, method: "Cheque", paidAt: 1, reference: "", details: "", amountCents: 100, source: "manual", byName: "x", createdAt: 1 });
      await ctx.db.delete(id);
      return id;
    });
    expect(gone).toBeTruthy();
    const pay = (await all(w.admin, w.qft, "payments")).rows.find((r) => r[3] === "Cheque")!;
    expect(pay[1]).toBe("");
  });
});
