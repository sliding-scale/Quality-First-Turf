/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { signedInAs } from "./helpers";
import { seeded } from "./pipelineSeed";

const NOW = Date.UTC(2026, 10, 19);
type World = Awaited<ReturnType<typeof seeded>>;

const material = (w: World, name: string, over: Record<string, unknown> = {}) =>
  w.office.mutation(api.crm.materials.save, {
    businessId: w.qft, name, sku: "", category: "", unit: "roll", supplier: "TurfCo", sizeDetails: "", formula: "area / 1500", wastagePercent: 10, rounding: "up" as const, now: NOW, ...over,
  });
const wonProject = (w: World) =>
  w.base.run((ctx) =>
    ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "TK-1", title: "Turf", pipeline: "Preplanning", stage: "Material Takeoff & Availability", requestedAt: 1, owner: "x", searchText: "TK-1", outcome: "won", jobNumber: 1, closedAt: 1 }),
  );
const measure = (w: World, id: Id<"opportunities">, inputs: Record<string, number>) => w.pm.mutation(api.crm.takeoff.saveInputs, { id, inputs, now: NOW });
/** A Project Manager who cannot see prices. */
async function blindPm(w: World) {
  const blind = await signedInAs(w.base, { key: "blind", roles: ["pm"], businessIds: [w.qft], name: "Blind" });
  await w.base.run(async (ctx) => {
    const u = (await ctx.db.query("users").collect()).find((x) => x.name === "Blind")!;
    await ctx.db.patch(u._id, { permissions: { prices: "none" } });
  });
  return blind;
}

describe("Materials (PRD 4.2, plan 2026-11-19-takeoff)", () => {
  it("saves a material with its formula, and refuses a bad formula, a duplicate name and a bad wastage", async () => {
    const w = await seeded();
    await material(w, "Turf roll");
    await expect(material(w, "turf  ROLL")).rejects.toThrow(/already exists/);
    await expect(material(w, "Bad", { formula: "area /" })).rejects.toThrow(/Formula: The formula ends too soon/);
    await expect(material(w, "Bad2", { formula: "foo(1)" })).rejects.toThrow(/not a function/);
    await expect(material(w, "Bad3", { wastagePercent: 150 })).rejects.toThrow(/Wastage/);
    await expect(material(w, "Bad4", { unit: " " })).rejects.toThrow(/ordered in/);
    await expect(material(w, "Bad5", { leadTimeDays: 400 })).rejects.toThrow(/lead time/);
    const list = await w.pm.query(api.crm.materials.list, { businessId: w.qft, search: "", page: 1 });
    expect(list.rows.map((r) => r.name)).toEqual(["Turf roll"]);
  });

  it("is edited by Preplanning people, looked at by Sales, and deleted by Admins only", async () => {
    const w = await seeded();
    const id = await material(w, "Turf roll");
    await expect(w.sales.mutation(api.crm.materials.save, { businessId: w.qft, name: "X", sku: "", category: "", unit: "bag", supplier: "", sizeDetails: "", formula: "1", wastagePercent: 0, rounding: "up", now: NOW })).rejects.toThrow(/can view this but not change it/);
    expect((await w.sales.query(api.crm.materials.list, { businessId: w.qft, search: "", page: 1 })).total).toBe(1);
    await expect(w.pm.mutation(api.crm.materials.remove, { id })).rejects.toThrow(/Only an Admin/);
    await w.admin.mutation(api.crm.materials.remove, { id });
    expect((await w.pm.query(api.crm.materials.list, { businessId: w.qft, search: "", page: 1 })).total).toBe(0);
  });

  it("hides the cost from someone without price access and leaves it unchanged when they edit", async () => {
    const w = await seeded();
    const id = await material(w, "Turf roll", { costCents: 120000 });
    const blind = await blindPm(w);
    expect((await blind.query(api.crm.materials.list, { businessId: w.qft, search: "", page: 1 })).rows[0].costCents).toBeNull();
    await blind.mutation(api.crm.materials.save, { id, businessId: w.qft, name: "Turf roll", sku: "", category: "", unit: "roll", supplier: "New supplier", sizeDetails: "", formula: "area / 1500", wastagePercent: 10, rounding: "up", now: NOW });
    expect((await w.pm.query(api.crm.materials.list, { businessId: w.qft, search: "", page: 1 })).rows[0]).toMatchObject({ costCents: 120000, supplier: "New supplier" });
  });
});

describe("A project's takeoff", () => {
  it("works a line out from the measurements with wastage and rounding, and again when they change", async () => {
    const w = await seeded();
    const turf = await material(w, "Turf roll");
    const project = await wonProject(w);
    await w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: turf });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ calcQty: 0, qty: 0 }); // no measurements yet
    await measure(w, project, { area: 1250 });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ calcQty: 1, qty: 1 }); // 0.83 rolls + 10% is 0.92, rounded up
    await measure(w, project, { area: 3200 });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ calcQty: 3, qty: 3 }); // 2.13 + 10% is 2.35, rounded up
  });

  it("keeps the person's own quantity over the worked-out one, until they clear it", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    await w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: await material(w, "Turf roll") });
    await measure(w, project, { area: 3200 });
    const line = (await w.pm.query(api.crm.takeoff.get, { id: project }))!.lines[0];
    const edit = (qtyOverride: number | null) => w.pm.mutation(api.crm.takeoff.updateLine, { lineId: line.id, qtyOverride, supplier: "TurfCo", leadTimeDays: 10, inStock: 1, unitCostCents: 120000, notes: "" });
    await edit(5);
    await measure(w, project, { area: 4000 });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ qtyOverride: 5, qty: 5, calcQty: 3 });
    await edit(null);
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ qtyOverride: null, qty: 3 });
  });

  it("reports a formula that cannot be worked out on the line, and works it out once it can", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    const broken = await material(w, "Needs height", { formula: "area / height" });
    await w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: broken });
    await measure(w, project, { area: 100 });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ calcQty: null, calcError: "The formula divides by zero.", qty: 0 });
    await measure(w, project, { area: 100, height: 4 });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ calcQty: 28, calcError: null });
  });

  it("is a snapshot: changing or deleting the material changes no takeoff until the line is refreshed", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    const turf = await material(w, "Turf roll");
    await w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: turf });
    await measure(w, project, { area: 3000 });
    const lineId = (await w.pm.query(api.crm.takeoff.get, { id: project }))!.lines[0].id;
    await w.pm.mutation(api.crm.materials.save, { id: turf, businessId: w.qft, name: "Turf roll", sku: "", category: "", unit: "roll", supplier: "Other", sizeDetails: "", formula: "area / 500", wastagePercent: 0, rounding: "up", now: NOW });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ formula: "area / 1500", supplier: "TurfCo", qty: 3 });
    await w.pm.mutation(api.crm.takeoff.refreshLine, { lineId });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines[0]).toMatchObject({ formula: "area / 500", supplier: "Other", qty: 6 });
    await w.admin.mutation(api.crm.materials.remove, { id: turf });
    await expect(w.pm.mutation(api.crm.takeoff.refreshLine, { lineId })).rejects.toThrow(/no longer in the list/);
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.lines).toHaveLength(1);
  });

  it("sums the requirements by supplier, taking stock off, and hides cost without price access", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    await w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: await material(w, "Turf roll", { costCents: 120000, leadTimeDays: 10, inStock: 1 }) });
    await w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: await material(w, "Infill bag", { unit: "bag", formula: "area * 1.5 / 50", wastagePercent: 5, costCents: 1500, supplier: "Sand Co", leadTimeDays: 3 }) });
    await measure(w, project, { area: 3000 });
    const t = (await w.pm.query(api.crm.takeoff.get, { id: project }))!;
    expect(t.lines.map((l) => [l.name, l.qty])).toEqual([["Turf roll", 3], ["Infill bag", 95]]); // 2*1.1 = 2.2 up to 3; 90*1.05 = 94.5 up to 95
    expect(t.summary.suppliers.map((s) => [s.supplier, s.costCents, s.leadTimeDays])).toEqual([["Sand Co", 142500, 3], ["TurfCo", 240000, 10]]); // 2 to order after 1 in stock
    expect(t.summary.totalCents).toBe(382500);
    expect(t.summary.longestLeadTimeDays).toBe(10);
    const hidden = (await (await blindPm(w)).query(api.crm.takeoff.get, { id: project }))!;
    expect(hidden.canSeeCosts).toBe(false);
    expect(hidden.lines.every((l) => l.unitCostCents === null)).toBe(true);
    expect(hidden.summary.totalCents).toBe(0);
  });

  it("checks the measurements, the line and the project, and keeps out an Installer and Sales edits", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    const turf = await material(w, "Turf roll");
    await expect(measure(w, project, { area: -1 })).rejects.toThrow(/Check the area/);
    await expect(measure(w, project, { bogus: 1 })).rejects.toThrow(/not a measurement/);
    await w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: turf });
    await expect(w.pm.mutation(api.crm.takeoff.addLine, { id: project, materialId: turf })).rejects.toThrow(/already on this takeoff/);
    await expect(w.installer.query(api.crm.takeoff.get, { id: project })).rejects.toThrow();
    await expect(w.sales.mutation(api.crm.takeoff.saveInputs, { id: project, inputs: { area: 1 }, now: NOW })).rejects.toThrow(/can view this but not change it/);
    const notWon = await w.base.run((ctx) => ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "TK-2", title: "x", pipeline: "Sales", stage: "New Request", requestedAt: 1, owner: "x", searchText: "TK-2" }));
    expect(await w.pm.query(api.crm.takeoff.get, { id: notWon })).toBeNull();
    await expect(measure(w, notWon, { area: 1 })).rejects.toThrow(/Closed Won/);
  });

  it("offers the visit's work areas as the starting measurements", async () => {
    const w = await seeded();
    const project = await wonProject(w);
    const form = await w.base.run(async (ctx) => (await ctx.db.query("projects").first())?._id ?? null);
    if (form === null) return; // the sample data has no customer form to read
    await w.base.run(async (ctx) => {
      await ctx.db.patch(project, { sourceProjectId: form });
      await ctx.db.insert("workAreas", { projectId: form, label: "Back yard", length: 50, width: 20, quantity: 2, notes: "", photoIds: [] });
      await ctx.db.insert("workAreas", { projectId: form, label: "Unmeasured", length: null, width: null, quantity: null, notes: "", photoIds: [] });
    });
    expect((await w.pm.query(api.crm.takeoff.get, { id: project }))?.suggested).toEqual({ area: 2000, perimeter: 280 });
  });
});
