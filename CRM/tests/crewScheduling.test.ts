/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PREPLANNING_STAGES } from "../../convex/crm/lib/stages";
import { installDays } from "../../convex/crm/lib/workPackage";
import { seeded } from "./pipelineSeed";

/* Crew and material scheduling (PRD 4.4, D-136): the team while planning, install dates on the Schedule, the materials warning. */

const FRI = Date.UTC(2026, 10, 20);
const DAY = 86_400_000;
const LAST = PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1];
type World = Awaited<ReturnType<typeof seeded>>;

async function planning() {
  const w = await seeded();
  await w.base.run((ctx) => ctx.db.patch(w.project, { pipeline: "Preplanning", stage: "Crew Alignment & Hold", outcome: "won", jobNumber: 1, closedAt: 1 }));
  const installer = (await w.base.run((ctx) => ctx.db.query("users").collect())).find((u) => u.name === "Ivan Installer")!._id;
  const crew = await w.admin.mutation(api.crm.construction.saveCrew, { businessId: w.qft, name: "Crew A", leadName: "Leo", phone: "", notes: "", active: true, availability: "Mon to Fri", now: 1 });
  const team = (over: { crewIds?: Id<"crews">[]; installerIds?: Id<"users">[] } = {}) =>
    w.office.mutation(api.crm.construction.setTeam, { id: w.project, projectManagerId: null, crewIds: over.crewIds ?? [crew], installerIds: over.installerIds ?? [installer], now: 2 });
  const save = (startDate?: number, endDate?: number) =>
    w.office.mutation(api.crm.workPackages.save, { id: w.project, scope: "Lay turf", startDate, endDate, scheduleNotes: "", siteAccess: "", customerAvailability: "", installerNotes: "", includeMaterials: true, fileIds: [], now: 3 });
  return { ...w, installer, crew, team, save };
}
const installs = async (w: World) => (await w.base.run((ctx) => ctx.db.query("calendarEvents").collect())).filter((e) => e.visitKind === "install").sort((a, b) => a.start - b.start);
const days = async (w: World) => (await installs(w)).map((e) => new Date(e.start).toISOString().slice(0, 10));

describe("the days an installation covers", () => {
  it("takes the first and last day and the working days between", () => {
    expect(installDays(FRI, FRI + 4 * DAY, [1, 2, 3, 4, 5])).toEqual(["2026-11-20", "2026-11-23", "2026-11-24"]);
    expect(installDays(FRI + DAY, undefined, [1, 2, 3, 4, 5])).toEqual(["2026-11-21"]); // a Saturday chosen on purpose
    expect(installDays(undefined, FRI, [1])).toEqual([]);
  });
});

describe("the team while a job is being planned", () => {
  it("can be chosen in Preplanning and shows on the work package", async () => {
    const w = await planning();
    await w.team();
    const t = await w.office.query(api.crm.construction.team, { id: w.project });
    expect(t).toMatchObject({ canEdit: true, crews: [{ name: "Crew A", availability: "Mon to Fri" }], installers: [{ name: "Ivan Installer" }] });
    expect((await w.office.query(api.crm.workPackages.get, { id: w.project }))?.crews.map((c) => c.name)).toEqual(["Crew A"]);
    expect((await w.sales.query(api.crm.construction.team, { id: w.project }))?.canEdit).toBe(false);
    await expect(w.sales.mutation(api.crm.construction.setTeam, { id: w.project, projectManagerId: null, crewIds: [], now: 4 })).rejects.toThrow();
  });

  it("is refused while the project is still in Sales", async () => {
    const w = await planning();
    await w.base.run((ctx) => ctx.db.patch(w.project, { pipeline: "Sales", stage: "Closed Won" }));
    await expect(w.team()).rejects.toThrow(/Construction/);
  });
});

describe("install dates on the Schedule", () => {
  it("books each working day for the team's installers, named for the crew", async () => {
    const w = await planning();
    await w.team();
    await w.save(FRI, FRI + 4 * DAY);
    expect(await days(w)).toEqual(["2026-11-20", "2026-11-23", "2026-11-24"]);
    expect((await installs(w))[0]).toMatchObject({ type: "visit", anytime: true, fromWorkPackage: true, assigneeIds: [w.installer], opportunityId: w.project });
    expect((await installs(w))[0].title).toMatch(/^Installation: .+ · Crew A$/);
    expect((await w.office.query(api.crm.workPackages.get, { id: w.project }))?.installVisits.count).toBe(3);
  });

  it("leaves a deleted day alone until the dates change, then follows them but keeps completed days", async () => {
    const w = await planning();
    await w.save(FRI, FRI + 4 * DAY);
    const [first, second] = await installs(w);
    await w.base.run((ctx) => ctx.db.delete(second._id));
    await w.save(FRI, FRI + 4 * DAY);
    expect(await days(w)).toEqual(["2026-11-20", "2026-11-24"]);
    await w.base.run((ctx) => ctx.db.patch(first._id, { status: "completed" }));
    await w.save(FRI + 4 * DAY, FRI + 5 * DAY);
    expect(await days(w)).toEqual(["2026-11-20", "2026-11-24", "2026-11-25"]);
    await w.save(undefined, undefined);
    expect(await days(w)).toEqual(["2026-11-20"]);
  });

  it("follows a change of team, and does not book a day someone already booked by hand", async () => {
    const w = await planning();
    await w.base.run(async (ctx) => {
      const o = (await ctx.db.get(w.project))!;
      const by = (await ctx.db.query("users").collect())[0]._id;
      await ctx.db.insert("calendarEvents", { businessId: o.businessId, type: "visit", visitKind: "install", title: "By hand", opportunityId: o._id, start: Date.UTC(2026, 10, 20, 18), end: Date.UTC(2026, 10, 20, 20), anytime: false, assigneeIds: [], status: "upcoming", notes: "", repeat: "none", createdBy: by, createdAt: 1 });
    });
    await w.save(FRI, FRI + 3 * DAY);
    expect((await installs(w)).map((e) => e.title.startsWith("By hand"))).toEqual([true, false]);
    await w.team();
    const [hand, booked] = await installs(w);
    expect(hand.title).toBe("By hand");
    expect(booked).toMatchObject({ assigneeIds: [w.installer] });
    expect(booked.title).toMatch(/Crew A/);
  });

  it("refuses a range too long to be meant, and takes the days off when the project goes back to Sales", async () => {
    const w = await planning();
    await expect(w.save(FRI, FRI + 200 * DAY)).rejects.toThrow(/60 working days/);
    await w.save(FRI, FRI);
    await w.base.run((ctx) => ctx.db.patch(w.project, { stage: PREPLANNING_STAGES[0] }));
    await w.admin.mutation(api.crm.pipeline.returnToSales, { id: w.project, now: 5 });
    expect(await installs(w)).toEqual([]);
  });
});

describe("the warning before Construction", () => {
  const line = (w: World, name: string, inStock?: number) =>
    w.base.run((ctx) => ctx.db.insert("takeoffLines", { businessId: w.qft, opportunityId: w.project, position: 1, name, sku: "", unit: "roll", formula: "1", wastagePercent: 0, rounding: "up", calcQty: 2, supplier: "S", notes: "", ...(inStock === undefined ? {} : { inStock }) }));

  it("has nothing to say without a takeoff or when everything is in stock", async () => {
    const w = await planning();
    expect(await w.office.query(api.crm.purchaseOrders.handoffWarning, { id: w.project })).toBeNull();
    await line(w, "Turf", 5);
    expect(await w.office.query(api.crm.purchaseOrders.handoffWarning, { id: w.project })).toBeNull();
  });

  it("names what is missing, still lets the project move, and writes it in the history", async () => {
    const w = await planning();
    await line(w, "Turf");
    expect(await w.office.query(api.crm.purchaseOrders.handoffWarning, { id: w.project })).toMatchObject({ notOrdered: ["Turf"], onTheWay: [] });
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: LAST, now: 10 });
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))?.pipeline).toBe("Construction");
    const history = await w.admin.query(api.crm.pipeline.history, { id: w.project });
    expect(history[0].note).toBe("Sent to Construction automatically. Materials not ready: 1 not ordered");
  });
});
