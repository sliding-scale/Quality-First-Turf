/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { seeded } from "./pipelineSeed";

const NOW = 1_900_000_000_000;
type W = Awaited<ReturnType<typeof seeded>>;
const list = async (w: W, status: "All" | "Archived") =>
  (await w.sales.query(api.crm.requests.list, { businessId: w.qft, status, from: null, to: null, search: "", sortKey: "requestedAt", dir: "desc", today: NOW, page: 1, size: 10 })).rows.map((r) => [r.id, r.status]);

describe("archiving a request", () => {
  it("takes it off the list and shows it under Archived, and Restore brings it back as it was", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.requests.archive, { id: w.project, now: NOW });
    expect((await list(w, "All")).map(([id]) => id)).not.toContain(w.project);
    expect(await list(w, "Archived")).toEqual([[w.project, "Archived"]]);
    expect(await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW })).toMatchObject({ status: "Archived", archivedAt: NOW, stage: "Onsite Consultation" });
    await w.sales.mutation(api.crm.automations.restoreRequest, { id: w.project, now: NOW + 1 });
    expect(await list(w, "Archived")).toEqual([]);
    const back = (await w.base.run((ctx) => ctx.db.get(w.project)))!;
    expect(back).toMatchObject({ stage: "Onsite Consultation" });
    expect(back.archivedAt).toBeUndefined();
    expect(back.outcome).toBeUndefined();
  });

  it("keeps a lost request lost when it is restored", async () => {
    const w = await seeded();
    await w.base.run((ctx) => ctx.db.patch(w.project, { stage: "Closed Lost", outcome: "lost", closedAt: 5 }));
    await w.sales.mutation(api.crm.requests.archive, { id: w.project, now: NOW });
    await w.sales.mutation(api.crm.automations.restoreRequest, { id: w.project, now: NOW + 1 });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ stage: "Closed Lost", outcome: "lost", closedAt: 5 });
  });

  it("takes a quoted or won request off the list only, leaving the project on its board", async () => {
    const w = await seeded();
    await w.base.run((ctx) => ctx.db.patch(w.project, { stage: "Closed Won", outcome: "won" }));
    await w.sales.mutation(api.crm.requests.archive, { id: w.project, now: NOW });
    expect(await list(w, "Archived")).toEqual([[w.project, "Archived"]]);
    expect((await list(w, "All")).map(([id]) => id)).not.toContain(w.project);
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))!.archivedAt).toBeUndefined();
    await w.sales.mutation(api.crm.automations.restoreRequest, { id: w.project, now: NOW + 1 });
    expect(await list(w, "Archived")).toEqual([]);
  });

  it("refuses someone who may not edit requests", async () => {
    const w = await seeded();
    await expect(w.outsider.mutation(api.crm.requests.archive, { id: w.project, now: NOW })).rejects.toThrow();
    await expect(w.pm.mutation(api.crm.requests.archive, { id: w.project, now: NOW })).rejects.toThrow();
  });
});

describe("the Jobs export", () => {
  it("holds the won jobs only", async () => {
    const w = await seeded();
    const ask = () => w.admin.query(api.crm.exports.page, { businessId: w.qft, kind: "jobs", cursor: null });
    expect((await ask()).rows).toEqual([]);
    await w.base.run((ctx) => ctx.db.patch(w.project, { outcome: "won", stage: "Closed Won", jobNumber: 7 }));
    const r = await ask();
    expect(r.headers[0]).toBe("Job number");
    expect(r.rows.map((x) => x.slice(0, 2))).toEqual([[7, "Test turf"]]);
  });
});
