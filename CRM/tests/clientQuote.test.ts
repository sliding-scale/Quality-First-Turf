/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { item, quoteWorld } from "./quoteSeed";

/** A quote that has been sent, with one fixed line ($1,000) and one optional line ($500, ticked). */
async function sent(over: Record<string, unknown> = {}) {
  const w = await quoteWorld({ lines: [item("Turf", 2, 50000), { ...item("Border", 1, 50000), optional: true, selected: true }], ...over });
  const r = await w.sales.mutation(api.crm.quoteFlow.send, { id: w.quoteId, now: 1000 });
  const q = await w.sales.query(api.crm.quotes.get, { id: w.quoteId });
  return { ...w, token: r.token, optionalId: q!.lines.find((l) => l.optional)!.id };
}

describe("the client's view of a quote", () => {
  it("is null for an unknown, short or archived link, and leaks no staff notes", async () => {
    const w = await sent();
    expect(await w.base.query(api.crm.clientQuote.get, { token: "nope" })).toBeNull();
    expect(await w.base.query(api.crm.clientQuote.get, { token: "x".repeat(64) })).toBeNull();
    await w.sales.mutation(api.crm.quoteDraft.addNote, { quoteId: w.quoteId, text: "Internal: they are tight on budget" });
    const view = await w.base.query(api.crm.clientQuote.get, { token: w.token });
    expect(view).toBeTruthy();
    expect(JSON.stringify(view)).not.toContain("tight on budget");
    expect(view).toMatchObject({ title: "Back yard turf", status: "Awaiting response", canAnswer: true });
    await w.sales.mutation(api.crm.quoteDraft.archive, { id: w.quoteId });
    expect(await w.base.query(api.crm.clientQuote.get, { token: w.token })).toBeNull();
  });

  it("hides quantities, unit prices, line totals and totals when the client view says so", async () => {
    const w = await sent({ clientView: { quantities: false, unitPrices: false, lineTotals: false, totals: false } });
    const view = await w.base.query(api.crm.clientQuote.get, { token: w.token });
    expect(view!.lines[0]).toMatchObject({ quantity: null, unitPriceCents: null, totalCents: null });
    expect(view!.totals).toBeNull();
  });

  it("records the first view only, with an event", async () => {
    const w = await sent();
    await w.base.mutation(api.crm.clientQuote.markViewed, { token: w.token });
    await w.base.mutation(api.crm.clientQuote.markViewed, { token: w.token });
    const q = await w.sales.query(api.crm.quotes.get, { id: w.quoteId });
    expect(q!.viewedAt).not.toBeNull();
    expect((await w.sales.query(api.crm.quoteFlow.events, { id: w.quoteId })).filter((e) => e.kind === "viewed")).toHaveLength(1);
  });
});

describe("the client answering", () => {
  it("approves with a signature: the optional ticks decide the approved total, the project moves, and it cannot be done twice", async () => {
    const w = await sent();
    const sig = await w.store(800, "image/png");
    await w.base.mutation(api.crm.clientQuote.approve, { token: w.token, signedBy: " Pat Client ", signatureStorageId: sig, selectedLineIds: [] });
    const q = await w.sales.query(api.crm.quotes.get, { id: w.quoteId });
    expect(q).toMatchObject({ status: "Approved", signedBy: "Pat Client" });
    expect(q!.totals.totalCents).toBe(100000); // the optional border was left unticked
    expect(q!.lines.find((l) => l.optional)!.selected).toBe(false);
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))?.stage).toBe("Quotes Approved — Contract Out for Signature");
    await expect(w.base.mutation(api.crm.clientQuote.approve, { token: w.token, signedBy: "Pat", signatureStorageId: await w.store(800, "image/png"), selectedLineIds: [] })).rejects.toThrow(/no longer waiting/i);
  });

  it("keeps an optional line the client ticks, and ignores ids that are not optional lines of this quote", async () => {
    const w = await sent();
    await w.base.mutation(api.crm.clientQuote.approve, { token: w.token, signedBy: "Pat", signatureStorageId: await w.store(800, "image/png"), selectedLineIds: [w.optionalId] });
    expect((await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))!.totals.totalCents).toBe(150000);
    const v = await sent();
    const other = (await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))!.lines[0].id;
    await expect(v.base.mutation(api.crm.clientQuote.approve, { token: v.token, signedBy: "Pat", signatureStorageId: await v.store(800, "image/png"), selectedLineIds: [other] })).rejects.toThrow(/line/i);
  });

  it("refuses a signature that is not an image, and a blank name", async () => {
    const w = await sent();
    await expect(w.base.mutation(api.crm.clientQuote.approve, { token: w.token, signedBy: "Pat", signatureStorageId: await w.store(100, "text/plain"), selectedLineIds: [] })).rejects.toThrow(/image/i);
    await expect(w.base.mutation(api.crm.clientQuote.approve, { token: w.token, signedBy: "   ", signatureStorageId: await w.store(100, "image/png"), selectedLineIds: [] })).rejects.toThrow(/name/i);
  });

  it("asks for changes with a message: status, message and the project's stage follow, and staff can resubmit", async () => {
    const w = await sent();
    await expect(w.base.mutation(api.crm.clientQuote.requestChanges, { token: w.token, message: "   " })).rejects.toThrow(/message/i);
    await w.base.mutation(api.crm.clientQuote.requestChanges, { token: w.token, message: "Can the border be stone instead?" });
    const q = await w.sales.query(api.crm.quotes.get, { id: w.quoteId });
    expect(q).toMatchObject({ status: "Changes requested", changesMessage: "Can the border be stone instead?" });
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))?.stage).toBe("Changes Requested");
    const again = await w.sales.mutation(api.crm.quoteFlow.send, { id: w.quoteId, now: 3000 });
    expect(again).toEqual({ token: w.token, revision: 2 });
    expect((await w.base.query(api.crm.clientQuote.get, { token: w.token }))!.canAnswer).toBe(true);
  });

  it("declines with a reason: Rejected, and the project is closed as lost with that reason", async () => {
    const w = await sent();
    await expect(w.base.mutation(api.crm.clientQuote.decline, { token: w.token, reason: " " })).rejects.toThrow(/reason/i);
    await w.base.mutation(api.crm.clientQuote.decline, { token: w.token, reason: "Went with someone else" });
    expect(await w.sales.query(api.crm.quotes.get, { id: w.quoteId })).toMatchObject({ status: "Rejected", rejectedReason: "Went with someone else" });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ stage: "Closed Lost", outcome: "lost", lostReason: "Went with someone else" });
  });

  it("will not answer a quote that is not waiting for an answer, or take a signature upload for it", async () => {
    const w = await quoteWorld();
    await expect(w.base.mutation(api.crm.clientQuote.requestChanges, { token: "z".repeat(64), message: "hi" })).rejects.toThrow(/link/i);
    const s = await sent();
    await s.base.mutation(api.crm.clientQuote.decline, { token: s.token, reason: "No" });
    await expect(s.base.mutation(api.crm.clientQuote.uploadUrl, { token: s.token })).rejects.toThrow(/no longer waiting/i);
  });
});

describe("totals as the client ticks", () => {
  it("shows the total for the ticks chosen, and nothing when the quote hides totals", async () => {
    const w = await sent();
    expect((await w.base.query(api.crm.clientQuote.totalsFor, { token: w.token, selectedLineIds: [] }))!.totalCents).toBe(100000);
    expect((await w.base.query(api.crm.clientQuote.totalsFor, { token: w.token, selectedLineIds: [w.optionalId] }))!.totalCents).toBe(150000);
    expect(await w.base.query(api.crm.clientQuote.totalsFor, { token: "nope", selectedLineIds: [] })).toBeNull();
    const h = await sent({ clientView: { quantities: true, unitPrices: true, lineTotals: true, totals: false } });
    expect(await h.base.query(api.crm.clientQuote.totalsFor, { token: h.token, selectedLineIds: [] })).toBeNull();
  });
});
