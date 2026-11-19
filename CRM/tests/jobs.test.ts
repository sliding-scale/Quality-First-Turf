/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seeded } from "./pipelineSeed";

const DAY = 86_400_000;
const D = Date.UTC(2026, 10, 19);
type World = Awaited<ReturnType<typeof seeded>>;

/** A won project with a job number, made directly so the test controls its lines and visits. */
async function job(w: World, n: number, over: { businessId?: Id<"businesses">; clientId?: Id<"clients">; lines?: { name: string; description: string; quantity: number; unitPriceCents: number }[]; outcome?: "won" | undefined; visits?: { start: number; status?: "upcoming" | "completed" | "confirmed" | "lost" }[]; title?: string } = {}) {
  return w.base.run(async (ctx) => {
    const user = (await ctx.db.query("users").first())!;
    const businessId = over.businessId ?? w.qft;
    const clientId = over.clientId ?? w.clientId;
    const outcome = "outcome" in over ? over.outcome : "won";
    const id = await ctx.db.insert("opportunities", {
      businessId, clientId, code: `JB-${n}`, title: over.title ?? `Job ${n}`, pipeline: "Preplanning", stage: "Ready for Preplanning", requestedAt: n, owner: "x",
      searchText: `JB-${n}`, jobNumber: n, outcome, closedAt: n, ...(over.lines ? { lines: over.lines } : {}),
    });
    for (const v of over.visits ?? []) {
      await ctx.db.insert("calendarEvents", {
        businessId, type: "visit", title: "Visit", opportunityId: id, clientId, start: v.start, end: v.start + 3600_000, anytime: false, assigneeIds: [],
        status: v.status ?? "upcoming", notes: "", repeat: "none", createdBy: user._id, createdAt: 1,
      });
    }
    return id;
  });
}
const lines = (cents: number) => [{ name: "Turf", description: "", quantity: 1, unitPriceCents: cents }];

describe("Jobs list, counts and page (design 2026-11-19-jobs)", () => {
  it("lists a won project with its number, client and total", async () => {
    const w = await seeded();
    const id = await job(w, 1, { lines: lines(100000) });
    const res = await w.office.query(api.crm.jobs.list, { businessId: w.qft, page: 1, dayStart: D });
    expect(res.total).toBe(1);
    expect(res.rows[0]).toMatchObject({ id, jobNumber: 1, totalCents: 100000, status: "Unscheduled" });
    expect(res.rows[0].clientName.length).toBeGreaterThan(0);
  });

  it("leaves out a project that is not won, and another business's jobs", async () => {
    const w = await seeded();
    await job(w, 1, { lines: lines(1) });
    await job(w, 2, { outcome: undefined });
    const client = await w.base.run(async (ctx) => (await ctx.db.query("clients").collect()).find((c) => c.businessId === w.other)!._id);
    await job(w, 1, { businessId: w.other, clientId: client });
    const res = await w.office.query(api.crm.jobs.list, { businessId: w.qft, page: 1, dayStart: D });
    expect(res.rows.map((r) => r.jobNumber)).toEqual([1]);
  });

  it("shows $0.00 for a job with no quote and no lines", async () => {
    const w = await seeded();
    await job(w, 1);
    const res = await w.office.query(api.crm.jobs.list, { businessId: w.qft, page: 1, dayStart: D });
    expect(res.rows[0].totalCents).toBe(0);
  });

  it("filters by status, searches, and pages", async () => {
    const w = await seeded();
    await job(w, 1, { visits: [{ start: D - DAY }] });
    await job(w, 2, { visits: [{ start: D + DAY }], title: "Backyard turf" });
    for (let n = 3; n <= 30; n += 1) await job(w, n, { visits: [{ start: D + 2 * DAY }] });
    const late = await w.office.query(api.crm.jobs.list, { businessId: w.qft, status: "Late", page: 1, dayStart: D });
    expect(late.rows.map((r) => r.jobNumber)).toEqual([1]);
    const found = await w.office.query(api.crm.jobs.list, { businessId: w.qft, search: "backyard", page: 1, dayStart: D });
    expect(found.rows.map((r) => r.jobNumber)).toEqual([2]);
    const first = await w.office.query(api.crm.jobs.list, { businessId: w.qft, page: 1, dayStart: D });
    const second = await w.office.query(api.crm.jobs.list, { businessId: w.qft, page: 2, dayStart: D });
    expect(first.total).toBe(30);
    expect(first.rows).toHaveLength(25);
    expect(second.rows.map((r) => r.jobNumber)).toEqual([5, 4, 3, 2, 1]);
  });

  it("counts every job once in the cards and the filter", async () => {
    const w = await seeded();
    await job(w, 1, { visits: [{ start: D - DAY }], lines: lines(50000) });
    await job(w, 2, { visits: [{ start: D + 5 * DAY }], lines: lines(70000) });
    await job(w, 3);
    const c = await w.office.query(api.crm.jobs.counts, { businessId: w.qft, dayStart: D });
    expect(c.all).toBe(3);
    expect(Object.values(c.byStatus).reduce((a, b) => a + b, 0)).toBe(3);
    expect(c.byStatus).toMatchObject({ Late: 1, Upcoming: 1, Unscheduled: 1 });
    expect(c.visitsPast30).toEqual({ count: 1, cents: 50000 });
    expect(c.visitsNext30).toEqual({ count: 1, cents: 70000 });
  });

  it("refuses an Installer, who has no Jobs access", async () => {
    const w = await seeded();
    await expect(w.installer.query(api.crm.jobs.list, { businessId: w.qft, page: 1, dayStart: D })).rejects.toThrow(/do not have access/);
  });

  it("lets Sales look at the list", async () => {
    const w = await seeded();
    await job(w, 1);
    expect((await w.sales.query(api.crm.jobs.list, { businessId: w.qft, page: 1, dayStart: D })).total).toBe(1);
  });

  it("returns one job with its lines, client and visits", async () => {
    const w = await seeded();
    const id = await job(w, 7, { lines: [{ name: "Turf", description: "Roll", quantity: 2, unitPriceCents: 25000 }], visits: [{ start: D + DAY }] });
    const j = (await w.office.query(api.crm.jobs.get, { id, dayStart: D }))!;
    expect(j).toMatchObject({ jobNumber: 7, subtotalCents: 50000, totalCents: 50000, quoteId: null, pipeline: "Preplanning", status: "Upcoming" });
    expect(j.lines).toHaveLength(1);
    expect(j.visits).toHaveLength(1);
    expect(j.client.name.length).toBeGreaterThan(0);
  });

  it("reads a project that is not a job as missing", async () => {
    const w = await seeded();
    expect(await w.office.query(api.crm.jobs.get, { id: w.project, dayStart: D })).toBeNull();
  });
});

describe("Close Job", () => {
  it("closes and reopens a job, showing Archived while closed, and keeps its pipeline", async () => {
    const w = await seeded();
    const id = await job(w, 1, { visits: [{ start: D - DAY }] });
    await w.office.mutation(api.crm.jobs.close, { id, now: D });
    const closed = (await w.office.query(api.crm.jobs.get, { id, dayStart: D }))!;
    expect(closed).toMatchObject({ status: "Archived", closedAt: D, pipeline: "Preplanning", stage: "Ready for Preplanning" });
    expect(closed.closedByName).toBe("Olga Office");
    const history = await w.office.query(api.crm.pipeline.history, { id });
    expect(history.some((h) => h.note === "Job closed")).toBe(true);
    await w.office.mutation(api.crm.jobs.reopen, { id, now: D + 1 });
    expect((await w.office.query(api.crm.jobs.get, { id, dayStart: D }))?.status).toBe("Late");
  });

  it("does nothing when a job is closed twice", async () => {
    const w = await seeded();
    const id = await job(w, 1);
    await w.office.mutation(api.crm.jobs.close, { id, now: D });
    await w.office.mutation(api.crm.jobs.close, { id, now: D + 5 });
    expect((await w.office.query(api.crm.jobs.get, { id, dayStart: D }))?.closedAt).toBe(D);
    expect((await w.office.query(api.crm.pipeline.history, { id })).filter((h) => h.note === "Job closed")).toHaveLength(1);
  });

  it("refuses Sales, who can only look, and a project that is not a job", async () => {
    const w = await seeded();
    const id = await job(w, 1);
    await expect(w.sales.mutation(api.crm.jobs.close, { id, now: D })).rejects.toThrow(/can view this but not change it/);
    await expect(w.office.mutation(api.crm.jobs.close, { id: w.project, now: D })).rejects.toThrow(/no longer exists/);
  });
});

describe("Convert to Job", () => {
  it("makes a signed project a job with a number, and returns the same job when asked again", async () => {
    const { signedQuote } = await import("./quoteSeed");
    const w = await seeded();
    await signedQuote(w);
    await w.office.mutation(api.crm.jobs.convert, { id: w.project, now: D });
    const j = await w.office.query(api.crm.jobs.get, { id: w.project, dayStart: D });
    expect(j).toMatchObject({ jobNumber: 1, pipeline: "Preplanning" });
    await w.office.mutation(api.crm.jobs.convert, { id: w.project, now: D + 5 });
    expect((await w.office.query(api.crm.jobs.get, { id: w.project, dayStart: D }))?.jobNumber).toBe(1);
  });

  it("is refused with the Closed Won reason when the quote is not signed, and gives no number", async () => {
    const w = await seeded();
    await expect(w.office.mutation(api.crm.jobs.convert, { id: w.project, now: D })).rejects.toBeTruthy();
    expect(await w.office.query(api.crm.jobs.get, { id: w.project, dayStart: D })).toBeNull();
  });

  it("is refused for Sales, who can only look at jobs", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.jobs.convert, { id: w.project, now: D })).rejects.toThrow(/can view this but not change it/);
  });
});

describe("Booking a visit for a job", () => {
  it("offers jobs to the Job tab and keeps them out of the default list", async () => {
    const w = await seeded();
    const id = await job(w, 1, { title: "Patio pavers" });
    const jobs = await w.office.query(api.crm.schedule.projectOptions, { businessId: w.qft, search: "", jobs: true });
    expect(jobs.map((o) => o.id)).toContain(id);
    expect((await w.office.query(api.crm.schedule.projectOptions, { businessId: w.qft, search: "" })).map((o) => o.id)).not.toContain(id);
    expect((await w.office.query(api.crm.schedule.projectOptions, { businessId: w.qft, search: "", id })).map((o) => o.title)).toEqual(["Patio pavers"]);
  });
});

describe("New Job by hand", () => {
  const typed = [{ name: "Patio pavers", description: "", quantity: 2, unitPriceCents: 150000 }, { name: "", description: "", quantity: 1, unitPriceCents: 0 }];

  it("makes a won project with the next job number, in Preplanning, and no quote", async () => {
    const w = await seeded();
    const id = await w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "  Patio  ", lines: typed, now: D });
    const j = (await w.office.query(api.crm.jobs.get, { id, dayStart: D }))!;
    expect(j).toMatchObject({ title: "Patio", jobNumber: 1, pipeline: "Preplanning", stage: "Ready for Preplanning", quoteId: null, subtotalCents: 300000, totalCents: 300000 });
    expect(j.lines).toHaveLength(1);
    const history = await w.office.query(api.crm.pipeline.history, { id });
    expect(history.map((h) => h.note)).toEqual(expect.arrayContaining(["Job created by hand", "Sent to Preplanning automatically"]));
    const again = await w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "Second", now: D });
    expect((await w.office.query(api.crm.jobs.get, { id: again, dayStart: D }))?.jobNumber).toBe(2);
  });

  it("refuses Sales, an empty title, and a client from another business", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "X", now: D })).rejects.toThrow(/can view this but not change it/);
    await expect(w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "   ", now: D })).rejects.toThrow(/Give the job a title/);
    const other = await w.base.run(async (ctx) => (await ctx.db.query("clients").collect()).find((c) => c.businessId === w.other)!._id);
    await expect(w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: other, title: "X", now: D })).rejects.toThrow(/Pick a client from this business/);
  });
});
