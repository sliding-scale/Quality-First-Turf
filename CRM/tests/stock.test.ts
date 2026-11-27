/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { lineReadiness, readinessOf } from "../../convex/crm/lib/purchaseOrders";
import { planFill, serviceOf, sharedService, suggestMeasure } from "../../convex/crm/lib/takeoffLinks";
import { seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

/* Filling the takeoff from the quote (D-137), and stock and supplier orders (D-138). */

const NOW = Date.UTC(2026, 10, 27);
type World = Awaited<ReturnType<typeof seeded>>;

describe("a quantity of nothing", () => {
  it("says there is no quantity, not that it is in stock", () => {
    expect(lineReadiness({ id: "a", qty: 0, inStock: null }, []).state).toBe("none");
    expect(lineReadiness({ id: "a", qty: 0, inStock: 5 }, []).state).toBe("none");
    expect(readinessOf([{ id: "a", qty: 0, inStock: null }], []).ready).toBe(false);
    expect(readinessOf([{ id: "a", qty: 0, inStock: null }, { id: "b", qty: 1, inStock: 2 }], []).ready).toBe(true);
  });
});

describe("linking quoted services", () => {
  it("reads the service out of a price list name", () => {
    expect(serviceOf("10.01 RP - AG Budget Friendly Install - Olive Natural [299 SF & UNDER]")).toBe("AG Budget Friendly Install - Olive Natural");
    expect(serviceOf("1.01 RP - DEMO [300 - 699 SF]")).toBe("DEMO");
    expect(serviceOf("Paver Patio")).toBe("Paver Patio");
    expect(sharedService("AG Standard Install - Malibu")).toBe("AG Standard Install");
    expect(sharedService("Add Ons - Golf Cup")).toBeNull();
    expect(sharedService("DEMO")).toBeNull();
    expect(suggestMeasure("1.01 RP - DEMO [300 - 699 SF]")).toBe("area");
    expect(suggestMeasure("Bender board per linear ft")).toBe("perimeter");
    expect(suggestMeasure("Paver Patio")).toBe("none");
  });
  it("adds each material up over the services that use it", () => {
    const plan = planFill([
      { quantity: 500, measure: "area", kitMaterials: [["turf", "cloth"]] },
      { quantity: 100, measure: "area", kitMaterials: [["rock", "cloth"], ["cloth"]] },
      { quantity: 1, measure: "none", kitMaterials: [["lights"]] },
    ]);
    expect(Object.fromEntries(plan.totals)).toEqual({ area: 600 });
    expect([...plan.needs].map(([id, m]) => [id, Object.fromEntries(m)])).toEqual([["turf", { area: 500 }], ["cloth", { area: 600 }], ["rock", { area: 100 }], ["lights", {}]]);
  });
});

const material = (w: World, name: string, formula: string, inStock?: number) =>
  w.admin.mutation(api.crm.materials.save, { businessId: w.qft, name, sku: "", category: "", unit: "bag", supplier: "SandCo", sizeDetails: "", formula, wastagePercent: 0, rounding: "up", ...(inStock === undefined ? {} : { inStock }), now: NOW });
const kit = (w: World, name: string, materialIds: Id<"materials">[]) => w.admin.mutation(api.crm.materialKits.save, { businessId: w.qft, name, group: "", description: "", materialIds, now: NOW });
const item = (name: string, quantity: number) => ({ kind: "item" as const, name, description: "", quantity, unitPriceCents: 100, optional: false, selected: true });

describe("filling the takeoff from the approved quote", () => {
  async function sold() {
    const w = await seeded();
    const turf = await material(w, "Turf", "area / 100");
    const cloth = await material(w, "Cloth", "area / 100");
    const rock = await material(w, "Rock", "area / 50");
    const turfKit = await kit(w, "Turf kit", [turf, cloth]);
    const rockKit = await kit(w, "Rock kit", [rock, cloth]);
    await signedQuote(w, { lines: [item("10.01 RP - AG Standard Install - Malibu [300 - 699 SF]", 500), item("Decorative Rock [299 SF & UNDER]", 100), item("Haul away", 1)] });
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    return { ...w, turf, cloth, rock, turfKit, rockKit };
  }
  const lines = async (w: World) => (await w.office.query(api.crm.takeoff.get, { id: w.project }))!.lines.map((l) => [l.name, l.qty, l.measures]);

  it("lists the quoted services, links them once, and adds their materials sized from the quote", async () => {
    const w = await sold();
    const before = (await w.office.query(api.crm.takeoff.fromQuote, { id: w.project }))!;
    expect(before.quote?.number).toBe(1);
    expect(before.lines.map((l) => [l.service, l.quantity, l.suggested, l.link])).toEqual([
      ["AG Standard Install - Malibu", 500, "area", null], ["Decorative Rock", 100, "area", null], ["Haul away", 1, "none", null],
    ]);
    await w.office.mutation(api.crm.takeoff.linkService, { id: w.project, name: "AG Standard Install - Malibu", kitIds: [w.turfKit], measure: "area", now: NOW });
    await w.office.mutation(api.crm.takeoff.linkService, { id: w.project, name: "Decorative Rock", kitIds: [w.rockKit], measure: "area", now: NOW });
    const r = await w.office.mutation(api.crm.takeoff.fill, { id: w.project, now: NOW });
    expect(r).toMatchObject({ added: 3, quoteNumber: 1, unlinked: ["Haul away"] });
    // The job's area is both services together; turf and rock keep their own sizes, cloth (in both) uses the whole.
    expect((await w.office.query(api.crm.takeoff.get, { id: w.project }))!.inputs.area).toBe(600);
    expect(await lines(w)).toEqual([["Turf", 5, { area: 500 }], ["Cloth", 6, null], ["Rock", 2, { area: 100 }]]);
    expect((await w.office.mutation(api.crm.takeoff.fill, { id: w.project, now: NOW })).added).toBe(0);
  });

  it("lets another product of the same installation use the same link, and removes both when unlinked", async () => {
    const w = await sold();
    await w.office.mutation(api.crm.takeoff.linkService, { id: w.project, name: "AG Standard Install - Malibu", kitIds: [w.turfKit], measure: "area", now: NOW });
    await signedQuote(w, { lines: [item("10.05 RP - AG Standard Install - Pasadena [2000 + SF]", 2500)] });
    const got = (await w.office.query(api.crm.takeoff.fromQuote, { id: w.project }))!;
    expect(got.lines[0].link).toMatchObject({ kitIds: [w.turfKit], measure: "area", shared: "AG Standard Install" });
    await w.office.mutation(api.crm.takeoff.linkService, { id: w.project, name: "AG Standard Install - Pasadena", kitIds: [], measure: "none", now: NOW });
    expect((await w.office.query(api.crm.takeoff.fromQuote, { id: w.project }))!.lines[0].link).toBeNull();
  });

  it("fills a takeoff by itself when a sale is won and the services are already linked", async () => {
    const w = await seeded();
    const turf = await material(w, "Turf", "area / 100");
    const turfKit = await kit(w, "Turf kit", [turf]);
    await w.base.run((ctx) => ctx.db.insert("serviceKits", { businessId: w.qft, key: "turf install", service: "Turf install", kitIds: [turfKit], measure: "area", updatedAt: 1, updatedByName: "x" }));
    await signedQuote(w, { lines: [item("Turf install", 450)] });
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    expect(await lines(w)).toEqual([["Turf", 5, null]]);
  });

  it("refuses someone who may only look", async () => {
    const w = await sold();
    await expect(w.sales.mutation(api.crm.takeoff.fill, { id: w.project, now: NOW })).rejects.toThrow();
    await expect(w.sales.mutation(api.crm.takeoff.linkService, { id: w.project, name: "x", kitIds: [], measure: "none", now: NOW })).rejects.toThrow();
  });
});

describe("stock in the yard", () => {
  const job = (w: World, code: string, closedAt: number) =>
    w.base.run((ctx) => ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code, title: code, pipeline: "Preplanning", stage: "Material Takeoff & Availability", requestedAt: 1, owner: "x", searchText: code, outcome: "won", jobNumber: closedAt, closedAt }));
  async function yard() {
    const w = await seeded();
    const infill = await material(w, "Infill", "quantity", 10);
    const first = await job(w, "JOB-1", 1);
    const second = await job(w, "JOB-2", 2);
    for (const [id, qty] of [[first, 7], [second, 6]] as const) {
      await w.office.mutation(api.crm.takeoff.addLine, { id, materialId: infill });
      await w.office.mutation(api.crm.takeoff.saveInputs, { id, inputs: { quantity: qty }, now: NOW });
    }
    const line = async (id: Id<"opportunities">) => (await w.office.query(api.crm.takeoff.get, { id }))!.lines[0];
    const stock = async () => (await w.office.query(api.crm.stock.list, { businessId: w.qft })).items[0];
    return { ...w, infill, first, second, line, stock };
  }

  it("gives the earlier job the stock first, so two jobs never count the same bags", async () => {
    const w = await yard();
    expect(await w.line(w.first)).toMatchObject({ onHand: 10, inStock: 10 });
    expect(await w.line(w.second)).toMatchObject({ onHand: 10, inStock: 3 });
    expect(await w.stock()).toMatchObject({ inStock: 10, needed: 13, jobs: 2, countedBy: "Sal" });
    // The later job orders only what is short for it.
    await w.office.mutation(api.crm.purchaseOrders.createFromTakeoff, { id: w.second, now: NOW });
    expect((await w.office.query(api.crm.purchaseOrders.list, { id: w.second }))!.orders[0].lines[0]).toMatchObject({ qty: 3, materialId: w.infill });
  });

  it("is corrected by counting, and says when and by whom", async () => {
    const w = await yard();
    await w.office.mutation(api.crm.stock.count, { businessId: w.qft, counts: [{ materialId: w.infill, qty: 4 }], now: NOW + 5 });
    expect(await w.stock()).toMatchObject({ inStock: 4, countedAt: NOW + 5, countedBy: "Olga Office" });
    const history = await w.office.query(api.crm.stock.history, { materialId: w.infill });
    expect(history.map((h) => [h.reason, h.change, h.after])).toEqual([["count", -6, 4], ["count", 10, 10]]);
    await expect(w.sales.mutation(api.crm.stock.count, { businessId: w.qft, counts: [{ materialId: w.infill, qty: 1 }], now: NOW })).rejects.toThrow();
  });

  it("tracks every material, counting nothing recorded as none in the yard, with what is short first", async () => {
    const w = await yard();
    const sand = await material(w, "Sand", "quantity");
    await w.office.mutation(api.crm.takeoff.addLine, { id: w.first, materialId: sand });
    await w.office.mutation(api.crm.takeoff.saveInputs, { id: w.first, inputs: { quantity: 7 }, now: NOW });
    await material(w, "Unused", "quantity");
    const items = (await w.office.query(api.crm.stock.list, { businessId: w.qft })).items;
    expect(items.map((i) => [i.name, i.inStock, i.needed])).toEqual([["Infill", 10, 13], ["Sand", 0, 7], ["Unused", 0, 0]]);
    const lines = (await w.office.query(api.crm.takeoff.get, { id: w.first }))!.lines;
    expect(lines.find((l) => l.name === "Sand")).toMatchObject({ onHand: 0, inStock: 0 });
    // Nothing is suggested from the yard for a material the yard does not hold.
    expect((await w.office.query(api.crm.stock.usage, { id: w.first }))!.rows.find((r) => r.name === "Sand")?.suggested).toBe(0);
  });

  it("takes what a finished job used out of the yard once, and frees the others", async () => {
    const w = await yard();
    await w.base.run((ctx) => ctx.db.patch(w.first, { pipeline: "Finance", stage: "Send Final Invoice" }));
    expect((await w.office.query(api.crm.stock.list, { businessId: w.qft })).toRecord.map((j) => j.code)).toEqual(["JOB-1"]);
    expect((await w.office.query(api.crm.stock.usage, { id: w.first }))!.rows).toMatchObject([{ name: "Infill", inStock: 10, suggested: 7 }]);
    await w.office.mutation(api.crm.stock.recordUse, { id: w.first, rows: [{ materialId: w.infill, used: 8, returned: 1 }], now: NOW });
    expect(await w.stock()).toMatchObject({ inStock: 3, needed: 6, jobs: 1 });
    expect((await w.office.query(api.crm.stock.list, { businessId: w.qft })).toRecord).toEqual([]);
    await expect(w.office.mutation(api.crm.stock.recordUse, { id: w.first, rows: [], now: NOW })).rejects.toThrow(/already recorded/);
  });

  it("adds a delivery to the yard only as far as it is listed", async () => {
    const w = await yard();
    await w.office.mutation(api.crm.purchaseOrders.createFromTakeoff, { id: w.second, now: NOW });
    const po = (await w.office.query(api.crm.purchaseOrders.list, { id: w.second }))!.orders[0].id;
    await w.office.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "ordered", now: NOW });
    expect((await w.line(w.second)).inStock).toBe(3);
    await w.office.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "delivered", now: NOW, toStock: [{ materialId: w.infill, qty: 1 }] });
    expect(await w.stock()).toMatchObject({ inStock: 11 });
    expect((await w.office.query(api.crm.purchaseOrders.list, { id: w.second }))!.readiness.ready).toBe(true);
  });

  it("orders for the yard or a job from the Orders tab, and logs what was already bought", async () => {
    const w = await yard();
    const draft = await w.office.mutation(api.crm.purchaseOrders.create, { businessId: w.qft, supplier: "SandCo", notes: "", state: "draft", lines: [{ materialId: w.infill, qty: 5 }], now: NOW });
    expect(await w.stock()).toMatchObject({ inStock: 10 });
    await w.office.mutation(api.crm.purchaseOrders.setStatus, { id: draft, status: "ordered", now: NOW });
    await w.office.mutation(api.crm.purchaseOrders.setStatus, { id: draft, status: "delivered", now: NOW, toStock: [{ materialId: w.infill, qty: 5 }] });
    await w.office.mutation(api.crm.purchaseOrders.create, { businessId: w.qft, supplier: "Home Depot", notes: "", lines: [{ materialId: w.infill, qty: 2 }], state: "received", date: NOW, now: NOW });
    expect(await w.stock()).toMatchObject({ inStock: 17 });
    // Bought for a job: it counts toward the job, not the yard.
    await w.office.mutation(api.crm.purchaseOrders.create, { businessId: w.qft, opportunityId: w.second, supplier: "SandCo", notes: "", lines: [{ materialId: w.infill, qty: 6 }], state: "received", date: NOW, now: NOW });
    expect(await w.stock()).toMatchObject({ inStock: 17, needed: 7, jobs: 1 });
    const all = await w.office.query(api.crm.purchaseOrders.all, { businessId: w.qft });
    expect(all.orders.map((o) => [o.number, o.status, o.job?.code ?? "stock"]).sort()).toEqual([["PO-JOB-2-1", "delivered", "JOB-2"], ["PO-STOCK-1", "delivered", "stock"], ["PO-STOCK-2", "delivered", "stock"]]);
    await expect(w.office.mutation(api.crm.purchaseOrders.create, { businessId: w.qft, supplier: "x", notes: "", state: "draft", lines: [], now: NOW })).rejects.toThrow(/at least one/);
    await expect(w.office.mutation(api.crm.purchaseOrders.create, { businessId: w.qft, supplier: "x", notes: "", state: "received", lines: [{ materialId: w.infill, qty: 1 }], now: NOW })).rejects.toThrow(/day it was bought/);
    const onWay = await w.office.mutation(api.crm.purchaseOrders.create, { businessId: w.qft, supplier: "x", notes: "", state: "ordered", date: NOW + 1, lines: [{ materialId: w.infill, qty: 1 }], now: NOW });
    expect(await w.base.run((ctx) => ctx.db.get(onWay))).toMatchObject({ status: "ordered", orderedAt: NOW, expectedDate: NOW + 1 });
    expect(await w.stock()).toMatchObject({ inStock: 17 });
    await expect(w.sales.mutation(api.crm.purchaseOrders.create, { businessId: w.qft, supplier: "x", notes: "", state: "draft", lines: [{ materialId: w.infill, qty: 1 }], now: NOW })).rejects.toThrow();
  });
});
