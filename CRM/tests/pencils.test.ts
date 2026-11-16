/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOW, seeded } from "./pipelineSeed";
import { quoteWorld, signedQuote } from "./quoteSeed";

describe("editing a signed quote (Jobber's Signature will be removed)", () => {
  it("takes off the signature, puts the quote back to Draft, and leaves the deposit alone", async () => {
    const w = await seeded();
    const id = await signedQuote(w);
    await w.base.run((ctx) => ctx.db.patch(id, { depositCollectedCents: 5000, depositCollectedAt: 50 }));
    expect((await w.sales.query(api.crm.quotes.get, { id }))?.status).toBe("Approved");
    await w.sales.mutation(api.crm.quoteFlow.reopenForEdit, { id, now: 300 });
    const q = await w.sales.query(api.crm.quotes.get, { id });
    expect(q).toMatchObject({ status: "Draft", signedBy: null, signedAt: null });
    expect(await w.base.run(async (ctx) => (await ctx.db.get(id))?.depositCollectedCents)).toBe(5000);
    // and it can be edited again
    await w.sales.mutation(api.crm.quoteDraft.save, { id, title: "Back yard turf (changed)", salesperson: "Sam Sales", introHeading: "", introText: "", lines: [{ kind: "item", name: "Turf", description: "", quantity: 1, unitPriceCents: 100000, optional: false, selected: true }], clientView: { quantities: true, unitPrices: true, lineTotals: true, totals: true }, clientMessage: "", contract: "x", applyContractToFuture: false });
  });

  it("only reopens approved quotes, and not when the project is already Closed Won", async () => {
    const w = await quoteWorld();
    await expect(w.sales.mutation(api.crm.quoteFlow.reopenForEdit, { id: w.quoteId, now: 1 })).rejects.toThrow(/approved/);
    const s = await seeded();
    const id = await signedQuote(s);
    await s.base.run((ctx) => ctx.db.patch(s.project, { outcome: "won", stage: "Closed Won" }));
    await expect(s.sales.mutation(api.crm.quoteFlow.reopenForEdit, { id, now: 1 })).rejects.toThrow(/closed as won/);
    await expect(s.pm.mutation(api.crm.quoteFlow.reopenForEdit, { id, now: 1 })).rejects.toThrow();
  });
});

describe("pencils on a quote's notes and a request's assessment", () => {
  it("changes the words of a quote note and keeps its author", async () => {
    const w = await quoteWorld();
    await w.sales.mutation(api.crm.quoteDraft.addNote, { quoteId: w.quoteId, text: "Call before delivery" });
    const [note] = (await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))!.notes;
    await w.sales.mutation(api.crm.quoteDraft.editNote, { noteId: note.id as never, text: "  Call the day before  " });
    const [after] = (await w.sales.query(api.crm.quotes.get, { id: w.quoteId }))!.notes;
    expect(after).toMatchObject({ text: "Call the day before", author: "Sam Sales" });
    await expect(w.sales.mutation(api.crm.quoteDraft.editNote, { noteId: note.id as never, text: " " })).rejects.toThrow();
    await expect(w.pm.mutation(api.crm.quoteDraft.editNote, { noteId: note.id as never, text: "x" })).rejects.toThrow();
  });

  it("keeps the assessment instructions with no date, shows them with a booking, and clears them", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.requests.update, { id: w.project, assessmentInstructions: "  Dog in the yard  " });
    let r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r).toMatchObject({ assessment: null, assessmentInstructions: "Dog in the yard" });
    await w.sales.mutation(api.crm.schedule.book, { businessId: w.qft, type: "consultation", title: "Test turf", start: NOW + 86_400_000, end: NOW + 90_000_000, assigneeIds: [], opportunityId: w.project, notes: "Dog in the yard", now: NOW });
    r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r?.assessment).toMatchObject({ instructions: "Dog in the yard" });
    await w.sales.mutation(api.crm.requests.update, { id: w.project, assessmentInstructions: "" });
    expect((await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW }))?.assessmentInstructions).toBe("Dog in the yard"); // falls back to the booking's own notes
  });
});

describe("the request Overview as labelled answers", () => {
  it("starts as Jobber's categories built from the client and request, keeps edited answers, and mirrors Service details to the request", async () => {
    const w = await seeded();
    let r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r?.overview).toMatchObject({ heading: "Submitted by the customer", edited: false });
    expect(r?.overview.source).toMatch(/^Details from /);
    expect(r?.overview.fields.map((f) => f.label)).toEqual(["Name", "Phone", "Email", "Property address", "Services", "Customer type", "Service details", "How did you hear about us?"]);
    expect(r?.overview.fields.find((f) => f.label === "Services")?.value).toBe("Test turf");
    await w.sales.mutation(api.crm.requests.update, { id: w.project, overviewFields: [{ label: "Service details", value: "  Replace the lawn  " }, { label: "How did you hear about us?", value: "A friend" }] });
    r = await w.sales.query(api.crm.requests.get, { id: w.project, today: NOW });
    expect(r?.overview.edited).toBe(true);
    expect(r?.overview.fields).toEqual([{ label: "Service details", value: "Replace the lawn" }, { label: "How did you hear about us?", value: "A friend" }]);
    expect(r?.details).toBe("Replace the lawn");
  });

  it("refuses an answer with no label, too many answers, or someone who cannot edit", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.requests.update, { id: w.project, overviewFields: [{ label: " ", value: "x" }] })).rejects.toThrow(/label/);
    await expect(w.sales.mutation(api.crm.requests.update, { id: w.project, overviewFields: Array.from({ length: 41 }, (_, i) => ({ label: `Q${i}`, value: "x" })) })).rejects.toThrow(/up to 40/);
    await expect(w.pm.mutation(api.crm.requests.update, { id: w.project, overviewFields: [{ label: "A", value: "b" }] })).rejects.toThrow();
  });
});

