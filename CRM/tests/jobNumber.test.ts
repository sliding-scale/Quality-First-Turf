/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOW, seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

type World = Awaited<ReturnType<typeof seeded>>;
const numberOf = (w: World, id: Id<"opportunities">) => w.base.run(async (ctx) => (await ctx.db.get(id))?.jobNumber);

/** A second project in the same business, with its own signed quote. */
async function otherProject(w: World, businessId: Id<"businesses">, clientId: Id<"clients">, code: string) {
  return w.base.run((ctx) =>
    ctx.db.insert("opportunities", { businessId, clientId, code, title: "More turf", pipeline: "Sales", stage: "New Request", requestedAt: NOW, owner: "Unassigned", searchText: `${code} More turf New Request` }),
  );
}

describe("Job numbers (design 2026-11-19-jobs)", () => {
  it("numbers a project when it is won, and counts up within the business", async () => {
    const w = await seeded();
    await signedQuote(w);
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    expect(await numberOf(w, w.project)).toBe(1);

    const second = await otherProject(w, w.qft, w.clientId, "TST-002");
    const q = await w.sales.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, opportunityId: second, title: "More", now: 100 });
    await w.sales.mutation(api.crm.quoteDraft.save, {
      id: q, title: "More", salesperson: "Sam Sales", introHeading: "", introText: "", clientMessage: "", contract: "", applyContractToFuture: false,
      lines: [{ kind: "item", name: "Turf", description: "", quantity: 1, unitPriceCents: 1000, optional: false, selected: true }],
      clientView: { quantities: true, unitPrices: true, lineTotals: true, totals: true },
    });
    const sig = (await w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(500)], { type: "image/png" })))) as Id<"_storage">;
    await w.sales.mutation(api.crm.quoteFlow.collectSignature, { id: q, signedBy: "Pat Client", signatureStorageId: sig, now: 200 });
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: second, to: "Closed Won", now: NOW });
    expect(await numberOf(w, second)).toBe(2);
  });

  it("starts each business at 1", async () => {
    const w = await seeded();
    await w.base.run(async (ctx) => {
      await ctx.db.insert("jobCounters", { businessId: w.qft, next: 5 });
    });
    const client = await w.base.run(async (ctx) => (await ctx.db.query("clients").collect()).find((c) => c.businessId === w.other)!._id);
    const there = await otherProject(w, w.other, client, "OTH-001");
    await w.base.run(async (ctx) => {
      const { assignJobNumber } = await import("../../convex/crm/lib/jobNumber");
      await assignJobNumber(ctx, (await ctx.db.get(there))!);
    });
    expect(await numberOf(w, there)).toBe(1);
  });

  it("keeps the first number when a project is won again", async () => {
    const w = await seeded();
    await signedQuote(w);
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    const first = await numberOf(w, w.project);
    await w.base.run(async (ctx) => {
      const { assignJobNumber } = await import("../../convex/crm/lib/jobNumber");
      await assignJobNumber(ctx, (await ctx.db.get(w.project))!);
    });
    expect(await numberOf(w, w.project)).toBe(first);
    const counter = await w.base.run((ctx) => ctx.db.query("jobCounters").collect());
    expect(counter.find((c) => c.businessId === w.qft)?.next).toBe(2);
  });

  it("gives a refused Closed Won no number", async () => {
    const w = await seeded();
    await expect(w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW })).rejects.toBeTruthy();
    expect(await numberOf(w, w.project)).toBeNull(); // base.run hands back null for a missing field
  });

  it("backfills won projects oldest first, and only once", async () => {
    const w = await seeded();
    const wonProjects = await w.base.run((ctx) => ctx.db.query("opportunities").collect());
    // Make the business's existing won projects unnumbered and give two known closing times.
    const ids = await w.base.run(async (ctx) => {
      const a = await ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "B-1", title: "A", pipeline: "Preplanning", stage: "Ready for Preplanning", requestedAt: 1, owner: "x", searchText: "B-1", outcome: "won", closedAt: 200 });
      const b = await ctx.db.insert("opportunities", { businessId: w.qft, clientId: w.clientId, code: "B-2", title: "B", pipeline: "Preplanning", stage: "Ready for Preplanning", requestedAt: 2, owner: "x", searchText: "B-2", outcome: "won", closedAt: 100 });
      return { a, b };
    });
    const already = wonProjects.filter((p) => p.outcome === "won" && p.businessId === w.qft).length;
    const count = await w.base.mutation(internal.crm.jobs.backfillNumbers, { businessId: w.qft });
    expect(count).toBe(already + 2);
    const nb = await numberOf(w, ids.b);
    const na = await numberOf(w, ids.a);
    expect(nb!).toBeLessThan(na!);
    expect(await w.base.mutation(internal.crm.jobs.backfillNumbers, { businessId: w.qft })).toBe(0);
  });
});
