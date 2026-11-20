/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { STARTER_KITS, STARTER_MATERIALS } from "../../convex/crm/lib/materialStarter";
import { seeded } from "./pipelineSeed";

const NOW = Date.UTC(2026, 10, 20);
type World = Awaited<ReturnType<typeof seeded>>;

const wonProject = (w: World) =>
  w.base.run((ctx) =>
    ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "TK-1", title: "Turf", pipeline: "Preplanning", stage: "Material Takeoff & Availability", requestedAt: 1, owner: "x", searchText: "TK-1", outcome: "won", jobNumber: 1, closedAt: 1 }),
  );
const kits = (w: World) => w.pm.query(api.crm.materialKits.list, { businessId: w.qft });
const material = (w: World, name: string, formula = "area / 100") =>
  w.office.mutation(api.crm.materials.save, { businessId: w.qft, name, sku: "", category: "", unit: "bag", supplier: "", sizeDetails: "", formula, wastagePercent: 0, rounding: "up" as const, now: NOW });
const kit = (w: World, name: string, materialIds: Id<"materials">[], over: Record<string, unknown> = {}) =>
  w.office.mutation(api.crm.materialKits.save, { businessId: w.qft, name, group: "Test", description: "", materialIds, now: NOW, ...over });

describe("Loading the client's calculator (D-104)", () => {
  it("loads every starter material and kit, Admin only, and a second run adds nothing", async () => {
    const w = await seeded();
    await expect(w.pm.mutation(api.crm.materialKits.loadStarter, { businessId: w.qft, now: NOW })).rejects.toThrow(/Only an Admin/);
    const first = await w.admin.mutation(api.crm.materialKits.loadStarter, { businessId: w.qft, now: NOW });
    expect(first).toEqual({ materialsAdded: STARTER_MATERIALS.length, kitsAdded: STARTER_KITS.length, materialsKept: 0, kitsKept: 0 });
    const list = await kits(w);
    expect(list).toHaveLength(STARTER_KITS.length);
    const standard = list.find((k) => k.name === "Turf: Standard install")!;
    expect(standard.items.map((i) => i.name)).toContain("Artificial Grass Roll");
    expect(standard.uses).toEqual(["area"]);
    expect(list.find((k) => k.name === "Turf: Strip install")!.uses).toEqual(["length", "width"]);
    const second = await w.admin.mutation(api.crm.materialKits.loadStarter, { businessId: w.qft, now: NOW });
    expect(second).toEqual({ materialsAdded: 0, kitsAdded: 0, materialsKept: STARTER_MATERIALS.length, kitsKept: STARTER_KITS.length });
    expect((await w.pm.query(api.crm.materials.list, { businessId: w.qft, search: "", page: 1 })).total).toBe(STARTER_MATERIALS.length);
  });

  it("leaves a material the team already edited as they made it", async () => {
    const w = await seeded();
    await w.office.mutation(api.crm.materials.save, { businessId: w.qft, name: "Mulch", sku: "", category: "", unit: "yard", supplier: "Mine", sizeDetails: "", formula: "area / 50", wastagePercent: 5, rounding: "up", now: NOW });
    const r = await w.admin.mutation(api.crm.materialKits.loadStarter, { businessId: w.qft, now: NOW });
    expect(r.materialsKept).toBe(1);
    const mulch = (await w.pm.query(api.crm.materials.list, { businessId: w.qft, search: "mulch", page: 1 })).rows.find((x) => x.name === "Mulch")!;
    expect(mulch).toMatchObject({ formula: "area / 50", supplier: "Mine" });
    // The kit that lists Mulch still has it.
    expect((await kits(w)).find((k) => k.name === "Mulch up to 3 in.")!.items.map((i) => i.name)).toContain("Mulch");
  });

  it("loads into one business only", async () => {
    const w = await seeded();
    await w.admin.mutation(api.crm.materialKits.loadStarter, { businessId: w.qft, now: NOW });
    expect(await w.admin.query(api.crm.materialKits.list, { businessId: w.other })).toHaveLength(0);
  });
});

describe("Kits (D-104)", () => {
  it("saves a kit, and refuses no name, no materials, a repeat name, a repeated material and another business's material", async () => {
    const w = await seeded();
    const a = await material(w, "Sand");
    const b = await material(w, "Rock");
    const id = await kit(w, "Back yard", [a, b]);
    expect((await kits(w))[0]).toMatchObject({ id, name: "Back yard", group: "Test" });
    await expect(kit(w, " ", [a])).rejects.toThrow(/name/);
    await expect(kit(w, "Empty", [])).rejects.toThrow(/at least one material/);
    await expect(kit(w, "back  YARD", [a])).rejects.toThrow(/already exists/);
    await expect(kit(w, "Twice", [a, a])).rejects.toThrow(/once/);
    const foreign = await w.base.run((ctx) =>
      ctx.db.insert("materials", { businessId: w.other, name: "Theirs", nameKey: "theirs", sku: "", category: "", unit: "bag", supplier: "", sizeDetails: "", formula: "1", wastagePercent: 0, rounding: "up", createdAt: 1, updatedAt: 1 }),
    );
    await expect(kit(w, "Mixed", [a, foreign])).rejects.toThrow(/no longer exists/);
    await expect(kit(w, "Edited", [b], { id })).resolves.toBe(id);
    expect((await kits(w))[0].items.map((i) => i.name)).toEqual(["Rock"]);
  });

  it("is edited by Preplanning people, looked at by Sales, and deleted by Admins only", async () => {
    const w = await seeded();
    const a = await material(w, "Sand");
    const id = await kit(w, "Back yard", [a]);
    await expect(w.sales.mutation(api.crm.materialKits.save, { businessId: w.qft, name: "X", group: "", description: "", materialIds: [a], now: NOW })).rejects.toThrow(/can view this but not change it/);
    expect(await w.sales.query(api.crm.materialKits.list, { businessId: w.qft })).toHaveLength(1);
    await expect(w.pm.mutation(api.crm.materialKits.remove, { id })).rejects.toThrow(/Only an Admin/);
    await w.admin.mutation(api.crm.materialKits.remove, { id });
    expect(await kits(w)).toHaveLength(0);
  });

  it("shows only the materials that still exist when one is deleted", async () => {
    const w = await seeded();
    const a = await material(w, "Sand");
    const b = await material(w, "Rock");
    await kit(w, "Back yard", [a, b]);
    await w.admin.mutation(api.crm.materials.remove, { id: a });
    const k = (await kits(w))[0];
    expect(k.items.map((i) => i.name)).toEqual(["Rock"]);
    expect(k.missing).toBe(1);
  });
});

describe("Adding a kit to a takeoff (D-104)", () => {
  it("adds every material of the kit with its quantity worked out, and skips what is already there", async () => {
    const w = await seeded();
    await w.admin.mutation(api.crm.materialKits.loadStarter, { businessId: w.qft, now: NOW });
    const id = await wonProject(w);
    await w.pm.mutation(api.crm.takeoff.saveInputs, { id, inputs: { area: 1000 }, now: NOW });
    const standard = (await kits(w)).find((k) => k.name === "Turf: Standard install")!;
    expect(await w.pm.mutation(api.crm.takeoff.addKit, { id, kitId: standard.id })).toEqual({ added: 6, skipped: 0, missing: 0 });
    const t = await w.pm.query(api.crm.takeoff.get, { id });
    const q = Object.fromEntries(t!.lines.map((l) => [l.name, l.qty]));
    expect(q).toMatchObject({ "Artificial Grass Roll": 77, "2 in. Class 2 Road Base": 7, "5 in. 4D Nails non galvanized": 2, "6 in. Sod Staple Flat Top": 4, "Site pro pre emergent": 1, "#16 OR #20 Silica Infill": 30 });
    // The pet kit shares the roll, nails, staples and pre-emergent, so only its own two are new.
    const pet = (await kits(w)).find((k) => k.name === "Turf: Pet install, basic")!;
    expect(await w.pm.mutation(api.crm.takeoff.addKit, { id, kitId: pet.id })).toEqual({ added: 2, skipped: 4, missing: 0 });
    // Adding the same kit again changes nothing.
    expect(await w.pm.mutation(api.crm.takeoff.addKit, { id, kitId: standard.id })).toEqual({ added: 0, skipped: 6, missing: 0 });
    expect((await w.pm.query(api.crm.takeoff.get, { id }))!.lines).toHaveLength(8);
  });

  it("works out the demo's cubic yards of dirt from length, width and depth", async () => {
    const w = await seeded();
    await w.admin.mutation(api.crm.materialKits.loadStarter, { businessId: w.qft, now: NOW });
    const id = await wonProject(w);
    await w.pm.mutation(api.crm.takeoff.saveInputs, { id, inputs: { length: 20, width: 10, depth: 6 }, now: NOW });
    const demo = (await kits(w)).find((k) => k.name === "Demo: dirt to haul away")!;
    await w.pm.mutation(api.crm.takeoff.addKit, { id, kitId: demo.id });
    const line = (await w.pm.query(api.crm.takeoff.get, { id }))!.lines[0];
    expect(line).toMatchObject({ name: "Dirt to haul away (demo)", unit: "cubic yard", qty: 3.7 });
    // Changing the measurements works it out again.
    await w.pm.mutation(api.crm.takeoff.saveInputs, { id, inputs: { length: 27, width: 12, depth: 12 }, now: NOW });
    expect((await w.pm.query(api.crm.takeoff.get, { id }))!.lines[0].qty).toBe(12);
  });

  it("counts a deleted material as missing, and is refused for Sales, another business and a project that is not won", async () => {
    const w = await seeded();
    const a = await material(w, "Sand");
    const b = await material(w, "Rock");
    const kitId = await kit(w, "Back yard", [a, b]);
    const id = await wonProject(w);
    await expect(w.sales.mutation(api.crm.takeoff.addKit, { id, kitId })).rejects.toThrow(/can view this but not change it/);
    await expect(w.outsider.mutation(api.crm.takeoff.addKit, { id, kitId })).rejects.toThrow();
    await expect(w.pm.mutation(api.crm.takeoff.addKit, { id: w.project, kitId })).rejects.toThrow(/Closed Won/);
    await w.admin.mutation(api.crm.materials.remove, { id: a });
    expect(await w.pm.mutation(api.crm.takeoff.addKit, { id, kitId })).toEqual({ added: 1, skipped: 0, missing: 1 });
  });
});
