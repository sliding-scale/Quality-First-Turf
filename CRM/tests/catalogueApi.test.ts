/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { signedInAs } from "./helpers";
import { seeded } from "./pipelineSeed";

type World = Awaited<ReturnType<typeof seeded>>;
const base = { description: "", kind: "service" as const, taxExempt: false, available: true, customersSelectQuantity: false };
const item = (name: string, over: Record<string, unknown> = {}) => ({ ...base, name, unitPriceCents: 800, ...over });
const row = (line: number, name: string, over: Record<string, unknown> = {}) => ({ line, ...item(name), ...over });
const add = (w: World, name: string, over: Record<string, unknown> = {}) => w.office.mutation(api.crm.catalogue.save, { businessId: w.qft, ...item(name, over) });

describe("Products and services (design 2026-11-19-jobs)", () => {
  it("saves an item, works the markup out from the cost and price, and reads it back", async () => {
    const w = await seeded();
    const id = await add(w, "  99.12  Corona   Path Lights ", { costCents: 11187, unitPriceCents: 20000 });
    const got = await w.office.query(api.crm.catalogue.get, { id });
    expect(got).toMatchObject({ name: "99.12 Corona Path Lights", costCents: 11187, markupPercent: 78.77894, unitPriceCents: 20000, canSeeCosts: true });
  });

  it("refuses a second item with the same name in any capitals, but allows it in another business", async () => {
    const w = await seeded();
    await add(w, "Olive Natural");
    await expect(add(w, "  olive   NATURAL ")).rejects.toThrow(/already exists/);
    const otherOffice = await signedInAs(w.base, { key: "office-2", roles: ["office"], businessIds: [w.other], name: "Other Office" });
    await expect(otherOffice.mutation(api.crm.catalogue.save, { businessId: w.other, ...item("Olive Natural") })).resolves.toBeTruthy();
  });

  it("checks the item", async () => {
    const w = await seeded();
    await expect(add(w, "   ")).rejects.toThrow(/name/);
    await expect(add(w, "X", { unitPriceCents: -5 })).rejects.toThrow(/unit price/);
  });

  it("lists in name order, pages, and searches the name and description", async () => {
    const w = await seeded();
    for (let n = 1; n <= 30; n += 1) await add(w, `Item ${String(n).padStart(2, "0")}`);
    await add(w, "Wall block", { description: "Retaining wall, 8 inch" });
    const first = await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1 });
    expect(first.total).toBe(31);
    expect(first.rows).toHaveLength(25);
    expect(first.rows[0].name).toBe("Item 01");
    expect((await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 2 })).rows).toHaveLength(6);
    const found = await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "retaining", page: 1 });
    expect(found.rows.map((r) => r.name)).toEqual(["Wall block"]);
  });

  it("lets Sales look but not change", async () => {
    const w = await seeded();
    await add(w, "Wall", { costCents: 1000, unitPriceCents: 2000 });
    await expect(w.sales.mutation(api.crm.catalogue.save, { businessId: w.qft, ...item("Other") })).rejects.toThrow(/can view this but not change it/);
    expect((await w.sales.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1 })).total).toBe(1);
  });

  it("keeps costs from someone without price access, and leaves the cost alone when they edit", async () => {
    const w = await seeded();
    const id = await add(w, "Wall", { costCents: 1000, unitPriceCents: 2000 });
    const asBlind = await signedInAs(w.base, { key: "blind", roles: ["office"], businessIds: [w.qft], name: "Blind" });
    await w.base.run(async (ctx) => {
      const u = (await ctx.db.query("users").collect()).find((x) => x.name === "Blind")!;
      await ctx.db.patch(u._id, { permissions: { prices: "none" } });
    });
    const seen = await asBlind.query(api.crm.catalogue.get, { id });
    expect(seen).toMatchObject({ costCents: null, markupPercent: null, canSeeCosts: false });
    await asBlind.mutation(api.crm.catalogue.save, { id, businessId: w.qft, ...item("Wall", { unitPriceCents: 2500 }) });
    expect(await w.office.query(api.crm.catalogue.get, { id })).toMatchObject({ costCents: 1000, unitPriceCents: 2500 });
  });

  it("deletes only for Admin", async () => {
    const w = await seeded();
    const id = await add(w, "Wall");
    await expect(w.office.mutation(api.crm.catalogue.remove, { id })).rejects.toThrow(/Only an Admin/);
    await w.admin.mutation(api.crm.catalogue.remove, { id });
    expect(await w.office.query(api.crm.catalogue.get, { id })).toBeNull();
  });

  it("imports in a batch, creating, skipping known names and reporting each bad row", async () => {
    const w = await seeded();
    await add(w, "Known");
    const rows = [row(2, "New one"), row(3, "Known"), row(4, ""), row(5, "Dup"), row(6, "dup"), row(7, "Bad", { unitPriceCents: -1 })];
    const dry = await w.office.mutation(api.crm.catalogue.importRows, { businessId: w.qft, rows, dryRun: true, update: false });
    expect(dry).toMatchObject({ created: 2, updated: 0 });
    expect((await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1 })).total).toBe(1);
    const real = await w.office.mutation(api.crm.catalogue.importRows, { businessId: w.qft, rows, dryRun: false, update: false });
    expect(real.skipped.map((s) => s.line)).toEqual([3]);
    expect(real.errors.map((e) => [e.line, e.message])).toEqual([[4, "Give the item a name."], [6, "The same name appears twice in this file."], [7, "Check the unit price."]]);
    expect((await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1 })).total).toBe(3);
  });

  it("updates known names when asked to", async () => {
    const w = await seeded();
    const id = await add(w, "Known", { unitPriceCents: 100 });
    const res = await w.office.mutation(api.crm.catalogue.importRows, { businessId: w.qft, rows: [row(2, "known", { unitPriceCents: 999 })], dryRun: false, update: true });
    expect(res).toMatchObject({ created: 0, updated: 1 });
    expect((await w.office.query(api.crm.catalogue.get, { id }))?.unitPriceCents).toBe(999);
  });

  it("refuses an Installer", async () => {
    const w = await seeded();
    await expect(w.installer.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1 })).rejects.toThrow(/do not have access/);
  });
});

describe("The quote builder's price list", () => {
  it("uses the business's own list once it has one, and the shared list before that", async () => {
    const w = await seeded();
    const shared = await w.sales.query(api.crm.quotePrices.search, { businessId: w.qft, search: "" });
    expect(shared.length).toBeGreaterThan(0);
    await add(w, "10.01 Olive Natural install", { description: "2 inches of road base", unitPriceCents: 800 });
    await add(w, "Hidden item", { available: false });
    const own = await w.sales.query(api.crm.quotePrices.search, { businessId: w.qft, search: "olive" });
    expect(own).toEqual([{ name: "10.01 Olive Natural install", unit: "each", priceCents: 800, priced: true, description: "2 inches of road base" }]);
    expect((await w.sales.query(api.crm.quotePrices.search, { businessId: w.qft, search: "" })).map((r) => r.name)).toEqual(["10.01 Olive Natural install"]);
  });
});

describe("The list as Jobber shows it: sorting and page size", () => {
  it("sorts by name either way and by type, and honours 25, 50 and 100 to a page", async () => {
    const w = await seeded();
    for (let n = 1; n <= 60; n += 1) await add(w, `Item ${String(n).padStart(2, "0")}`, n === 60 ? { kind: "product" } : {});
    const asc = await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1, sortKey: "name", dir: "asc" });
    const desc = await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1, sortKey: "name", dir: "desc" });
    expect([asc.rows[0].name, desc.rows[0].name]).toEqual(["Item 01", "Item 60"]);
    const byType = await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1, sortKey: "type", dir: "asc" });
    expect(byType.rows[0]).toMatchObject({ name: "Item 60", kind: "product" });
    for (const size of [25, 50, 100]) {
      const r = await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1, size });
      expect([r.rows.length, r.pageSize]).toEqual([Math.min(size, 60), size]);
    }
    expect((await w.office.query(api.crm.catalogue.list, { businessId: w.qft, search: "", page: 1, size: 7 })).pageSize).toBe(25);
  });
});

describe("The Product & Services costs switch", () => {
  it("is on to start with, hides costs everywhere when turned off, and keeps what was saved", async () => {
    const w = await seeded();
    expect(await w.office.query(api.crm.catalogue.settings, { businessId: w.qft })).toEqual({ costsOn: true });
    const id = await add(w, "Wall", { costCents: 1000, unitPriceCents: 2000 });
    await w.office.mutation(api.crm.catalogue.setCostsOn, { businessId: w.qft, on: false });
    expect(await w.office.query(api.crm.catalogue.get, { id })).toMatchObject({ costCents: null, markupPercent: null, canSeeCosts: false });
    expect((await w.office.query(api.crm.catalogue.all, { businessId: w.qft }))[0]).not.toHaveProperty("costCents");
    await w.office.mutation(api.crm.catalogue.save, { id, businessId: w.qft, ...item("Wall", { unitPriceCents: 2500 }) });
    await w.office.mutation(api.crm.catalogue.setCostsOn, { businessId: w.qft, on: true });
    expect(await w.office.query(api.crm.catalogue.get, { id })).toMatchObject({ costCents: 1000, unitPriceCents: 2500 });
  });
  it("can be changed only by someone who can edit", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.catalogue.setCostsOn, { businessId: w.qft, on: false })).rejects.toThrow(/can view this but not change it/);
  });
});
