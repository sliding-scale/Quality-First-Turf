/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { signedInAs } from "./helpers";
import { seeded } from "./pipelineSeed";

const H = 3_600_000;
const D = Date.UTC(2026, 10, 19);
type World = Awaited<ReturnType<typeof seeded>>;

async function job(w: World, lines: { name: string; description: string; quantity: number; unitPriceCents: number }[] = []) {
  return w.base.run((ctx) =>
    ctx.db.insert("opportunities", {
      businessId: w.qft, clientId: w.clientId, code: "JC-1", title: "Costed job", pipeline: "Preplanning", stage: "Ready for Preplanning", requestedAt: 1, owner: "x",
      searchText: "JC-1", jobNumber: 1, outcome: "won", closedAt: 1, ...(lines.length ? { lines } : {}),
    }),
  );
}
const userId = (w: World, name: string) => w.base.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === name)!._id);
const entry = (w: World, opportunityId: Id<"opportunities">, over: Record<string, unknown> = {}) =>
  userId(w, "Pat PM").then((employeeId) => ({ opportunityId, employeeId, costPerHourCents: 2500, startAt: D + 9 * H, endAt: D + 17 * H, notes: "", now: D, ...over }));
const expense = (opportunityId: Id<"opportunities">, over: Record<string, unknown> = {}) => ({ opportunityId, date: D, name: "Gravel", description: "", totalCents: 4000, accountingCode: "", now: D, ...over });
const catalogue = (w: World, name: string, costCents?: number) =>
  w.office.mutation(api.crm.catalogue.save, { businessId: w.qft, name, description: "", kind: "service", unitPriceCents: 1000, taxExempt: false, available: true, customersSelectQuantity: false, ...(costCents !== undefined ? { costCents } : {}) });

describe("What a job costs (plan 2026-11-19-jobs-costs)", () => {
  it("adds the catalogue cost of the lines, the labor and the expenses", async () => {
    const w = await seeded();
    await catalogue(w, "Turf", 380);
    const id = await job(w, [{ name: "turf", description: "", quantity: 100, unitPriceCents: 800 }, { name: "Hand typed", description: "", quantity: 2, unitPriceCents: 5000 }]);
    await w.office.mutation(api.crm.jobCosts.saveTime, await entry(w, id));
    await w.office.mutation(api.crm.jobCosts.saveExpense, expense(id));
    const c = (await w.office.query(api.crm.jobCosts.get, { id }))!;
    expect(c.unitCosts).toEqual([380, null]); // a line that is not in the catalogue has no cost, and does not stop the total
    expect(c).toMatchObject({ linesCostCents: 38000, laborCents: 20000, expensesCents: 4000, costCents: 62000 });
    expect(c.time[0]).toMatchObject({ employeeName: "Pat PM", minutes: 480, costCents: 20000 });
    expect(Object.values(c.lastRates)).toEqual([2500]);
  });

  it("leaves line costs out while the catalogue costs switch is off, and keeps labor and expenses", async () => {
    const w = await seeded();
    await catalogue(w, "Turf", 380);
    const id = await job(w, [{ name: "Turf", description: "", quantity: 10, unitPriceCents: 800 }]);
    await w.office.mutation(api.crm.jobCosts.saveExpense, expense(id));
    await w.office.mutation(api.crm.catalogue.setCostsOn, { businessId: w.qft, on: false });
    const c = (await w.office.query(api.crm.jobCosts.get, { id }))!;
    expect(c).toMatchObject({ unitCosts: [null], linesCostCents: 0, expensesCents: 4000, costCents: 4000 });
  });

  it("refuses an end that is not after the start, a stranger as the employee, and an hour rate that is not money", async () => {
    const w = await seeded();
    const id = await job(w);
    await expect(w.office.mutation(api.crm.jobCosts.saveTime, await entry(w, id, { endAt: D + 9 * H }))).rejects.toThrow(/end time/);
    await expect(w.office.mutation(api.crm.jobCosts.saveTime, await entry(w, id, { endAt: D + 40 * H }))).rejects.toThrow(/24 hours/);
    await expect(w.office.mutation(api.crm.jobCosts.saveTime, await entry(w, id, { costPerHourCents: -1 }))).rejects.toThrow(/cost per hour/);
    const outsider = await userId(w, "Olive Outsider");
    await expect(w.office.mutation(api.crm.jobCosts.saveTime, await entry(w, id, { employeeId: outsider }))).rejects.toThrow(/not on this business/);
  });

  it("changes and removes a time entry and an expense", async () => {
    const w = await seeded();
    const id = await job(w);
    const t = await w.office.mutation(api.crm.jobCosts.saveTime, await entry(w, id));
    await w.office.mutation(api.crm.jobCosts.saveTime, { ...(await entry(w, id, { endAt: D + 10 * H })), id: t });
    const x = await w.office.mutation(api.crm.jobCosts.saveExpense, expense(id));
    await w.office.mutation(api.crm.jobCosts.saveExpense, { ...expense(id, { totalCents: 5000 }), id: x });
    expect(await w.office.query(api.crm.jobCosts.get, { id })).toMatchObject({ laborCents: 2500, expensesCents: 5000 });
    await w.office.mutation(api.crm.jobCosts.removeTime, { id: t });
    await w.office.mutation(api.crm.jobCosts.removeExpense, { id: x });
    expect(await w.office.query(api.crm.jobCosts.get, { id })).toMatchObject({ costCents: 0, time: [], expenses: [] });
  });

  it("deletes the receipt with its expense", async () => {
    const w = await seeded();
    const id = await job(w);
    const receipt = (await w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(50)], { type: "image/png" })))) as Id<"_storage">;
    const x = await w.office.mutation(api.crm.jobCosts.saveExpense, expense(id, { receiptId: receipt }));
    expect((await w.office.query(api.crm.jobCosts.get, { id }))?.expenses[0].receiptUrl).toBeTruthy();
    await w.office.mutation(api.crm.jobCosts.removeExpense, { id: x });
    expect(await w.base.run((ctx) => ctx.storage.getUrl(receipt))).toBeNull();
  });

  it("shows no cost to someone without the prices module, and refuses them", async () => {
    const w = await seeded();
    const id = await job(w);
    const blind = await signedInAs(w.base, { key: "blind", roles: ["office"], businessIds: [w.qft], name: "Blind" });
    await w.base.run(async (ctx) => {
      const u = (await ctx.db.query("users").collect()).find((x) => x.name === "Blind")!;
      await ctx.db.patch(u._id, { permissions: { prices: "none" } });
    });
    expect(await blind.query(api.crm.jobCosts.get, { id })).toBeNull();
    await expect(blind.mutation(api.crm.jobCosts.saveExpense, expense(id))).rejects.toThrow(/do not have access/);
  });

  it("lets Sales look at jobs but not change what they cost", async () => {
    const w = await seeded();
    const id = await job(w);
    expect(await w.sales.query(api.crm.jobCosts.get, { id })).toMatchObject({ costCents: 0 });
    await expect(w.sales.mutation(api.crm.jobCosts.saveExpense, expense(id))).rejects.toThrow(/can view this but not change it/);
  });
});
