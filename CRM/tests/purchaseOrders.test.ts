/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { coverage, lineReadiness, nextStatusProblem, readinessOf, remainingToOrder, toOrderQty, type OrderFacts } from "../../convex/crm/lib/purchaseOrders";
import { signedInAs } from "./helpers";
import { seeded } from "./pipelineSeed";

const NOW = Date.UTC(2026, 10, 20);
const D1 = Date.UTC(2026, 11, 1);
const D2 = Date.UTC(2026, 11, 8);

const order = (status: OrderFacts["status"], lines: [string, number][], expectedDate: number | null = null): OrderFacts => ({ status, expectedDate, lines: lines.map(([id, qty]) => ({ takeoffLineId: id, qty })) });

describe("purchase order rules", () => {
  it("works out what is left to buy after stock", () => {
    expect(toOrderQty(3, 1)).toBe(2);
    expect(toOrderQty(3, 5)).toBe(0);
    expect(toOrderQty(3, null)).toBe(3);
    expect(toOrderQty(2.555, 0.1)).toBe(2.46);
  });
  it("lets orders move forward only", () => {
    expect(nextStatusProblem("draft", "ordered")).toBeNull();
    expect(nextStatusProblem("ordered", "delivered")).toBeNull();
    expect(nextStatusProblem("ordered", "cancelled")).toBeNull();
    expect(nextStatusProblem("draft", "delivered")).toMatch(/cannot go from Draft to Delivered/);
    expect(nextStatusProblem("delivered", "cancelled")).toMatch(/delivered order cannot change/);
    expect(nextStatusProblem("cancelled", "ordered")).toMatch(/new order/);
  });
  it("counts only live orders as coverage, and the latest expected date of ones still on the way", () => {
    const c = coverage("a", [order("ordered", [["a", 2]], D1), order("delivered", [["a", 1]], D1), order("cancelled", [["a", 9]]), order("ordered", [["a", 1]], D2), order("ordered", [["b", 7]])]);
    expect(c).toEqual({ covered: 4, delivered: 1, expected: D2 });
  });
  it("gives a line its readiness: stock, open (a draft is not bought), ordered, delivered", () => {
    const line = { id: "a", qty: 3, inStock: 1 };
    expect(lineReadiness({ id: "a", qty: 3, inStock: 3 }, []).state).toBe("stock");
    expect(lineReadiness(line, []).state).toBe("open");
    expect(lineReadiness(line, [order("draft", [["a", 2]])]).state).toBe("open");
    expect(lineReadiness(line, [order("ordered", [["a", 1]], D1)]).state).toBe("open");
    expect(lineReadiness(line, [order("ordered", [["a", 2]], D1)])).toMatchObject({ state: "ordered", expected: D1 });
    expect(lineReadiness(line, [order("ordered", [["a", 1]], D1), order("delivered", [["a", 1]])]).state).toBe("ordered");
    expect(lineReadiness(line, [order("delivered", [["a", 2]])]).state).toBe("delivered");
  });
  it("is ready only when every line is in stock or delivered, and says what is left", () => {
    const lines = [{ id: "a", qty: 3, inStock: 1 }, { id: "b", qty: 1, inStock: 1 }, { id: "c", qty: 5, inStock: null }];
    const none = readinessOf(lines, []);
    expect(none).toMatchObject({ ready: false, open: 2, onTheWay: 0 });
    const mid = readinessOf(lines, [order("delivered", [["a", 2]]), order("ordered", [["c", 5]], D2)]);
    expect(mid).toMatchObject({ ready: false, open: 0, onTheWay: 1, latestExpected: D2 });
    expect(readinessOf(lines, [order("delivered", [["a", 2], ["c", 5]])]).ready).toBe(true);
    expect(readinessOf([], []).ready).toBe(false);
  });
  it("leaves covered lines out of a new order, drafts included, cancelled ones not", () => {
    const lines = [{ id: "a", qty: 3, inStock: 1 }, { id: "b", qty: 4, inStock: null }];
    expect([...remainingToOrder(lines, [order("draft", [["a", 2]]), order("cancelled", [["b", 4]])])]).toEqual([["b", 4]]);
    expect([...remainingToOrder(lines, [order("ordered", [["a", 1]])])]).toEqual([["a", 1], ["b", 4]]);
  });
});

type World = Awaited<ReturnType<typeof seeded>>;
const wonProject = (w: World, over: Record<string, unknown> = {}) =>
  w.base.run((ctx) =>
    ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "PO-1", title: "Yard", pipeline: "Preplanning", stage: "Material Takeoff & Availability", requestedAt: 1, owner: "x", searchText: "PO-1", outcome: "won", jobNumber: 1, closedAt: 1, ...over }),
  );
/** A takeoff line with its material; `inStock` is what the material has in the yard (absent: not tracked). */
const tline = (w: World, id: Id<"opportunities">, over: Record<string, unknown> = {}) =>
  w.base.run(async (ctx) => {
    const { inStock, ...line } = { inStock: 1 as number | undefined, name: "Turf roll", unit: "roll", supplier: "TurfCo", ...over } as { inStock?: number; name: string; unit: string; supplier: string };
    const materialId = await ctx.db.insert("materials", { businessId: w.qft, name: line.name, nameKey: line.name.toLowerCase(), sku: "", category: "", unit: line.unit, supplier: line.supplier, sizeDetails: "", formula: "1", wastagePercent: 0, rounding: "up", createdAt: 1, updatedAt: 1, ...(inStock === undefined ? {} : { inStock }) });
    return ctx.db.insert("takeoffLines", { businessId: w.qft, opportunityId: id, materialId, position: 0, sku: "", formula: "1", wastagePercent: 0, rounding: "up", calcQty: 3, notes: "", unitCostCents: 120000, ...line });
  });
async function blindPm(w: World) {
  const blind = await signedInAs(w.base, { key: "blind", roles: ["pm"], businessIds: [w.qft], name: "Blind" });
  await w.base.run(async (ctx) => {
    const u = (await ctx.db.query("users").collect()).find((x) => x.name === "Blind")!;
    await ctx.db.patch(u._id, { permissions: { prices: "none" } });
  });
  return blind;
}

describe("Purchase orders (PRD 4.4, plan 2026-11-20-purchase-orders)", () => {
  it("makes one draft per supplier from the takeoff, for what is short of stock", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await tline(w, id);
    await tline(w, id, { name: "Infill", unit: "bag", calcQty: 10, supplier: "SandCo", inStock: undefined, unitCostCents: 800, position: 1 });
    await tline(w, id, { name: "Pins", unit: "box", calcQty: 2, supplier: "TurfCo", inStock: 5, position: 2 });
    expect(await w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW })).toBe(2);
    const got = await w.pm.query(api.crm.purchaseOrders.list, { id });
    expect(got!.orders.map((o) => [o.number, o.supplier, o.status, o.lines.map((l) => `${l.name} ${l.qty}`)]).sort()).toEqual([
      ["PO-PO-1-1", "SandCo", "draft", ["Infill 10"]],
      ["PO-PO-1-2", "TurfCo", "draft", ["Turf roll 2"]],
    ].sort());
    expect(got!.orders.find((o) => o.supplier === "TurfCo")?.totalCents).toBe(240000);
    // Nothing left to order: a second try is refused rather than doubling the orders.
    await expect(w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW })).rejects.toThrow(/in stock or already on an order/);
    expect(got!.toOrderCount).toBe(0);
  });

  it("refuses with an empty takeoff and for a project that is not Closed Won", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await expect(w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW })).rejects.toThrow(/Add materials/);
    const open = await wonProject(w, { outcome: undefined, code: "PO-2", searchText: "PO-2", jobNumber: 2 });
    expect(await w.pm.query(api.crm.purchaseOrders.list, { id: open })).toBeNull();
    await expect(w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id: open, now: NOW })).rejects.toThrow(/Closed Won/);
  });

  it("walks an order through ordered and delivered, and the project becomes ready", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await tline(w, id);
    await w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW });
    const po = (await w.pm.query(api.crm.purchaseOrders.list, { id }))!.orders[0].id;
    expect((await w.pm.query(api.crm.purchaseOrders.list, { id }))!.readiness).toMatchObject({ ready: false, open: 1 });
    await expect(w.pm.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "delivered", now: NOW })).rejects.toThrow(/cannot go from Draft to Delivered/);
    await w.pm.mutation(api.crm.purchaseOrders.save, { id: po, supplier: "TurfCo", expectedDate: D1, notes: "Call first" });
    await w.pm.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "ordered", now: NOW });
    const ordered = (await w.pm.query(api.crm.purchaseOrders.list, { id }))!;
    expect(ordered.orders[0]).toMatchObject({ status: "ordered", orderedAt: NOW, expectedDate: D1, notes: "Call first" });
    expect(ordered.readiness).toMatchObject({ ready: false, onTheWay: 1, latestExpected: D1 });
    await expect(w.pm.mutation(api.crm.purchaseOrders.save, { id: po, supplier: "TurfCo", notes: "", qtys: [5] })).rejects.toThrow(/only while the order is a draft/);
    await w.pm.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "delivered", now: NOW + 1 });
    expect((await w.pm.query(api.crm.purchaseOrders.list, { id }))!.readiness.ready).toBe(true);
    await expect(w.pm.mutation(api.crm.purchaseOrders.remove, { id: po })).rejects.toThrow(/cannot be deleted/);
    await expect(w.pm.mutation(api.crm.purchaseOrders.save, { id: po, supplier: "x", notes: "" })).rejects.toThrow(/cannot change/);
  });

  it("edits a draft's quantities, and cancelling frees the line to be ordered again", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await tline(w, id);
    await w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW });
    const po = (await w.pm.query(api.crm.purchaseOrders.list, { id }))!.orders[0].id;
    await expect(w.pm.mutation(api.crm.purchaseOrders.save, { id: po, supplier: "TurfCo", notes: "", qtys: [0] })).rejects.toThrow(/more than zero/);
    await expect(w.pm.mutation(api.crm.purchaseOrders.save, { id: po, supplier: "TurfCo", notes: "", qtys: [1, 2] })).rejects.toThrow(/do not match/);
    await w.pm.mutation(api.crm.purchaseOrders.save, { id: po, supplier: "TurfCo", notes: "", qtys: [4] });
    expect((await w.pm.query(api.crm.purchaseOrders.list, { id }))!.orders[0].lines[0].qty).toBe(4);
    await w.pm.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "ordered", now: NOW });
    await w.pm.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "cancelled", now: NOW });
    await expect(w.pm.mutation(api.crm.purchaseOrders.setStatus, { id: po, status: "ordered", now: NOW })).rejects.toThrow(/new order/);
    expect(await w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW })).toBe(1);
    await w.pm.mutation(api.crm.purchaseOrders.remove, { id: po });
    expect((await w.pm.query(api.crm.purchaseOrders.list, { id }))!.orders).toHaveLength(1);
  });

  it("copes with a takeoff line deleted after it was ordered", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    const line = await tline(w, id);
    await tline(w, id, { name: "Pins", unit: "box", calcQty: 2, supplier: "TurfCo", inStock: undefined, position: 1 });
    await w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW });
    await w.base.run((ctx) => ctx.db.delete(line));
    const got = (await w.pm.query(api.crm.purchaseOrders.list, { id }))!;
    expect(got.orders[0].lines.map((l) => l.name).sort()).toEqual(["Pins", "Turf roll"]);
    expect(got.readiness.lines.map((l) => l.name)).toEqual(["Pins"]);
  });

  it("is looked at by Sales and changed by Preplanning people only, and hides costs from people without price access", async () => {
    const w = await seeded();
    const id = await wonProject(w);
    await tline(w, id);
    await w.pm.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW });
    await expect(w.sales.mutation(api.crm.purchaseOrders.createFromTakeoff, { id, now: NOW })).rejects.toThrow(/can view this but not change it/);
    expect((await w.sales.query(api.crm.purchaseOrders.list, { id }))!.orders).toHaveLength(1);
    const blind = await blindPm(w);
    const seen = (await blind.query(api.crm.purchaseOrders.list, { id }))!;
    expect(seen).toMatchObject({ canSeeCosts: false });
    expect(seen.orders[0]).toMatchObject({ totalCents: null });
    expect(seen.orders[0].lines[0].unitCostCents).toBeNull();
  });
});
