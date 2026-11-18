/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { CONSTRUCTION_STAGES, PREPLANNING_STAGES } from "../../convex/crm/lib/stages";
import { signedInAs } from "./helpers";
import { NOW, seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const boardArgs = { sortKey: "timeInStage" as const, dir: "desc" as const, leadSources: [] as string[], search: "", now: NOW };
const names = (b: { columns: { name: string }[] }) => b.columns.map((c) => c.name);
const idsIn = (b: { columns: { name: string; cards: { id: string }[] }[] }, stage: string) => b.columns.find((c) => c.name === stage)?.cards.map((c) => c.id) ?? [];

describe("Preplanning and Construction", () => {
  it("Closed Won sends the project into Preplanning by itself, on the same record, tells the office once, and it can be sent back", async () => {
    const w = await seeded();
    const office = await signedInAs(w.base, { key: "office-4", roles: ["office"], businessIds: [w.qft], name: "Olga Office" });
    await expect(w.office.mutation(api.crm.pipeline.startPreplanning, { id: w.project, now: NOW })).rejects.toThrow(/Closed Won/);
    await signedQuote(w);
    const moved = await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    expect(moved).toMatchObject({ to: "Closed Won", handedOff: true });
    // Already in Preplanning, so the manual button has nothing to do.
    await expect(w.office.mutation(api.crm.pipeline.startPreplanning, { id: w.project, now: NOW + 1 })).rejects.toThrow(/Closed Won/);

    const doc = await w.base.run((ctx) => ctx.db.get(w.project));
    expect(doc).toMatchObject({ pipeline: "Preplanning", stage: "Ready for Preplanning", outcome: "won", closedAt: NOW });
    const sales = await w.admin.query(api.crm.pipeline.board, { businessId: w.qft, ...boardArgs });
    // It stays in the Sales board's Closed Won column (D-088), marked with where it is now, and cannot be moved from there.
    const stays = sales.columns.find((c) => c.name === "Closed Won")!.cards.find((c) => c.id === w.project);
    expect(stays).toMatchObject({ stage: "Closed Won", movedTo: "Preplanning: Ready for Preplanning" });
    await expect(w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Quote Draft & Site Plan / Design", now: NOW + 1 })).rejects.toThrow();
    const pre = await w.admin.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Preplanning", ...boardArgs });
    expect(names(pre)).toEqual([...PREPLANNING_STAGES]);
    expect(idsIn(pre, "Ready for Preplanning")).toContain(w.project);
    expect(pre.columns.every((c) => c.count === c.cards.length && c.totalCents === c.cards.reduce((n, k) => n + k.valueCents, 0))).toBe(true);
    const history = await w.admin.query(api.crm.pipeline.history, { id: w.project });
    // Two history rows: the sale, then the handoff.
    expect(history[0]).toMatchObject({ from: "Closed Won", to: "Ready for Preplanning", note: "Sent to Preplanning automatically", byName: "Sam Sales" });
    expect(history[1]).toMatchObject({ to: "Closed Won" });
    const told = await office.query(api.crm.mentions.mine, {});
    expect(told.items.map((i) => i.excerpt).filter((e) => /Ready for Preplanning/.test(e))).toHaveLength(1);
    const won = await w.admin.query(api.crm.pipeline.outcomes, { businessId: w.qft, outcome: "won", from: 0, to: NOW + 10, sortKey: "closedOn", dir: "desc", page: 1, size: 50 });
    expect(won.rows.some((r) => r.id === w.project)).toBe(true);

    await w.admin.mutation(api.crm.pipeline.returnToSales, { id: w.project, now: NOW + 2 });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ pipeline: "Sales", stage: "Closed Won", outcome: "won" });
    const back = await w.admin.query(api.crm.pipeline.board, { businessId: w.qft, ...boardArgs });
    expect(back.columns.find((c) => c.name === "Closed Won")!.cards.map((c) => c.id)).toContain(w.project);
    // Sent back, it can be started again by hand.
    await w.admin.mutation(api.crm.pipeline.startPreplanning, { id: w.project, now: NOW + 3 });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ pipeline: "Preplanning", stage: "Ready for Preplanning" });
  });

  it("moves inside Preplanning, then into Construction, and refuses the sign-off stage", async () => {
    const w = await seeded();
    await signedQuote(w);
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    await expect(w.office.mutation(api.crm.pipeline.startConstruction, { id: w.project, now: NOW + 2 })).rejects.toThrow(/Ready for Construction/);
    await w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Material Takeoff & Availability", now: NOW + 2 });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ pipeline: "Preplanning", stage: "Material Takeoff & Availability", outcome: "won" });
    await expect(w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW + 3 })).rejects.toThrow(/not a Preplanning stage/);
    // The last Preplanning stage hands the same project to Construction by itself (D-088): both moves are in the history, and the manual button has nothing to do.
    const moved = await w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1], now: NOW + 4 });
    expect(moved).toMatchObject({ handedOff: true });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ pipeline: "Construction", stage: "Ready to Start", outcome: "won" });
    const trail = await w.admin.query(api.crm.pipeline.history, { id: w.project });
    expect(trail.slice(0, 2).map((h) => [h.to, h.note])).toEqual([["Ready to Start", "Sent to Construction automatically"], [PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1], undefined]]);
    await expect(w.office.mutation(api.crm.pipeline.startConstruction, { id: w.project, now: NOW + 5 })).rejects.toThrow(/Ready for Construction/);
    // It stays in the last Preplanning column too (D-089), marked with where it is now, and cannot be moved from there.
    const prep = await w.admin.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Preplanning", ...boardArgs });
    const last = prep.columns.find((c) => c.name === PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1])!;
    expect(last.cards.find((c) => c.id === w.project)).toMatchObject({ movedTo: "Construction: Ready to Start" });
    await expect(w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Material Takeoff & Availability", now: NOW + 6 })).rejects.toThrow();

    const site = await w.admin.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Construction", ...boardArgs });
    expect(names(site)).toEqual([...CONSTRUCTION_STAGES]);
    expect(idsIn(site, "Ready to Start")).toContain(w.project);
    const found = await w.admin.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Construction", ...boardArgs, search: "TST-001" });
    expect(found.columns.flatMap((c) => c.cards).map((c) => c.id)).toEqual([w.project]);

    await w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "80% Completed", now: NOW + 6 });
    await expect(w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "100% Completed & Sign-off", now: NOW + 7 })).rejects.toThrow(/sign-off/);
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ stage: "80% Completed" });
    await expect(w.office.mutation(api.crm.pipeline.returnToPreplanning, { id: w.project, now: NOW + 8 })).rejects.toThrow(/Ready to Start/);

    const page = await w.admin.query(api.crm.opportunityPage.overview, { id: w.project });
    expect(page?.pipeline).toBe("Construction");
    expect(page?.stages).toEqual([...CONSTRUCTION_STAGES]);
  });

  it("refuses Sales in Preplanning, which they only look at, and someone from another business", async () => {
    const w = await seeded();
    await signedQuote(w);
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    await expect(w.sales.mutation(api.crm.pipeline.startPreplanning, { id: w.project, now: NOW })).rejects.toThrow(/not change/);
    await expect(w.outsider.mutation(api.crm.pipeline.startPreplanning, { id: w.project, now: NOW })).rejects.toThrow();
    await expect(w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Installer Work Package", now: NOW + 2 })).rejects.toThrow(/not change/);
    await expect(w.outsider.query(api.crm.pipeline.workBoard, { businessId: w.qft, pipeline: "Preplanning", ...boardArgs })).rejects.toThrow();
    await expect(w.admin.mutation(api.crm.pipeline.addStage, { businessId: w.qft, group: "Quotes", name: "Ready for Preplanning" })).rejects.toThrow(/already/i);
  });

  it("lets a Project Manager move a project inside Construction, and Sales not at all", async () => {
    const w = await seeded();
    await signedQuote(w);
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1], now: NOW + 1 });

    await w.pm.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "PM Job Walk & Mark-up", now: NOW + 3 });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ pipeline: "Construction", stage: "PM Job Walk & Mark-up" });
    const history = await w.admin.query(api.crm.pipeline.history, { id: w.project });
    expect(history[0]).toMatchObject({ to: "PM Job Walk & Mark-up" });
    // Still the sign-off rule, for everyone.
    await expect(w.pm.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "100% Completed & Sign-off", now: NOW + 4 })).rejects.toThrow(/sign-off/);
    // Not leaving the pipeline, not other changes, and not another business.
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Ready to Start", now: NOW + 5 });
    await expect(w.sales.mutation(api.crm.pipeline.returnToPreplanning, { id: w.project, now: NOW + 6 })).rejects.toThrow(/not change/);
    await expect(w.pm.mutation(api.crm.pipeline.setSalesperson, { id: w.project, salespersonId: null })).rejects.toThrow(/not change/);
    await expect(w.outsider.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "20% Completed", now: NOW + 7 })).rejects.toThrow();
  });

  it("keeps a won project in Requests as Converted, and its request page opens, after it has moved on", async () => {
    const w = await seeded();
    const today = new Date(NOW).setHours(0, 0, 0, 0);
    const list = { businessId: w.qft, status: "All", from: null, to: null, search: "", sortKey: "requestedAt", dir: "desc", today, page: 1, size: 100 } as const;
    await signedQuote(w);
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    await w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Material Takeoff & Availability", now: NOW + 1 });

    const rows = await w.admin.query(api.crm.requests.list, list);
    expect(rows.rows.find((r) => r.id === w.project)).toMatchObject({ status: "Converted", stage: "Material Takeoff & Availability", code: "TST-001" });
    expect((await w.admin.query(api.crm.requests.list, { ...list, status: "Converted" })).rows.map((r) => r.id)).toContain(w.project);
    expect((await w.admin.query(api.crm.requests.list, { ...list, search: "TST-001" })).rows.map((r) => r.id)).toContain(w.project);
    expect(await w.admin.query(api.crm.requests.get, { id: w.project, today })).toMatchObject({ status: "Converted", code: "TST-001" });
    // It can still be edited there.
    await w.sales.mutation(api.crm.requests.update, { id: w.project, details: "Gate code 4411" });
    expect((await w.admin.query(api.crm.requests.get, { id: w.project, today }))?.details).toBe("Gate code 4411");
    // A project in Preplanning that was never won is not a request.
    await w.base.run((ctx) => ctx.db.patch(w.project, { outcome: undefined }));
    expect((await w.admin.query(api.crm.requests.list, list)).rows.map((r) => r.id)).not.toContain(w.project);
    expect(await w.admin.query(api.crm.requests.get, { id: w.project, today })).toBeNull();
  });
});
