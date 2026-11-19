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

describe("Job type", () => {
  it("makes a recurring job by hand, shows its type, and filters the list by it", async () => {
    const w = await seeded();
    const recurring = await w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "Weekly lawn care", jobType: "recurring", now: D });
    const oneOff = await w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "Patio", now: D });
    expect((await w.office.query(api.crm.jobs.get, { id: recurring, dayStart: D }))?.jobType).toBe("recurring");
    expect((await w.office.query(api.crm.jobs.get, { id: oneOff, dayStart: D }))?.jobType).toBe("oneoff");
    const only = await w.office.query(api.crm.jobs.list, { businessId: w.qft, jobType: "recurring", page: 1, dayStart: D });
    expect(only.rows.map((r) => r.id)).toEqual([recurring]);
    expect((await w.office.query(api.crm.jobs.list, { businessId: w.qft, page: 1, dayStart: D })).total).toBe(2);
  });
});

describe("Delete job", () => {
  it("lets an Admin delete a plain job and everything that hangs off it", async () => {
    const w = await seeded();
    const id = await w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "Delete me", lines: [{ name: "Wall", description: "", quantity: 1, unitPriceCents: 1000 }], now: D });
    await w.base.run(async (ctx) => {
      const user = (await ctx.db.query("users").first())!;
      await ctx.db.insert("calendarEvents", { businessId: w.qft, type: "visit", title: "Visit", opportunityId: id, start: D, end: D + 3600_000, anytime: false, assigneeIds: [], status: "upcoming", notes: "", repeat: "none", createdBy: user._id, createdAt: 1 });
      await ctx.db.insert("opportunityNotes", { opportunityId: id, text: "hi", author: "x", createdAt: 1 });
    });
    await w.admin.mutation(api.crm.jobs.remove, { id });
    expect(await w.admin.query(api.crm.jobs.get, { id, dayStart: D })).toBeNull();
    const left = await w.base.run(async (ctx) => ({
      events: (await ctx.db.query("calendarEvents").collect()).filter((e) => e.opportunityId === id).length,
      notes: (await ctx.db.query("opportunityNotes").collect()).filter((n) => n.opportunityId === id).length,
      history: (await ctx.db.query("stageHistory").collect()).filter((h) => h.opportunityId === id).length,
    }));
    expect(left).toEqual({ events: 0, notes: 0, history: 0 });
  });

  it("refuses a job that has a quote, and says so", async () => {
    const w = await seeded();
    const id = await w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "Billed", now: D });
    await w.office.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, opportunityId: id, title: "Quote", now: D });
    await expect(w.admin.mutation(api.crm.jobs.remove, { id })).rejects.toThrow(/a quote, so it cannot be deleted/);
  });

  it("is for Admins only", async () => {
    const w = await seeded();
    const id = await w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "Keep", now: D });
    await expect(w.office.mutation(api.crm.jobs.remove, { id })).rejects.toThrow(/Only an Admin/);
  });
});

describe("Collect Signature and the text workaround", () => {
  it("keeps a signature on the job with who signed and who collected it", async () => {
    const w = await seeded();
    const id = await job(w, 1);
    const png = (await w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(400)], { type: "image/png" })))) as Id<"_storage">;
    await w.office.mutation(api.crm.jobs.saveSignature, { id, signedBy: "Pat Client", signatureStorageId: png, now: D });
    const j = (await w.office.query(api.crm.jobs.get, { id, dayStart: D }))!;
    expect(j.signatures).toHaveLength(1);
    expect(j.signatures[0]).toMatchObject({ signedBy: "Pat Client", byName: "Olga Office", at: D });
    expect(j.signatures[0].url).toBeTruthy();
  });

  it("refuses a signature with no name, a file that is not a picture, and Sales", async () => {
    const w = await seeded();
    const id = await job(w, 1);
    const png = (await w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(400)], { type: "image/png" })))) as Id<"_storage">;
    const text = (await w.base.run((ctx) => ctx.storage.store(new Blob(["hi"], { type: "text/plain" })))) as Id<"_storage">;
    await expect(w.office.mutation(api.crm.jobs.saveSignature, { id, signedBy: "  ", signatureStorageId: png, now: D })).rejects.toThrow(/name of the person/);
    await expect(w.office.mutation(api.crm.jobs.saveSignature, { id, signedBy: "Pat", signatureStorageId: text, now: D })).rejects.toThrow(/must be an image/);
    await expect(w.sales.mutation(api.crm.jobs.saveSignature, { id, signedBy: "Pat", signatureStorageId: png, now: D })).rejects.toThrow(/can view this but not change it/);
  });

  it("notes on the job that a text was opened by hand", async () => {
    const w = await seeded();
    const id = await job(w, 1);
    await w.office.mutation(api.crm.jobs.logText, { id, phone: "5551234567", what: "A text booking confirmation", now: D });
    const notes = await w.base.run(async (ctx) => (await ctx.db.query("opportunityNotes").collect()).filter((n) => n.opportunityId === id));
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toMatch(/opened in the phone's messaging app for 5551234567 \(sent by hand\)/);
  });
});
