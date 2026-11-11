/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seeded } from "./pipelineSeed";

async function world() {
  const w = await seeded();
  return w;
}

const item = (name: string, quantity: number, unitPriceCents: number, over: Record<string, unknown> = {}) => ({ kind: "item" as const, name, description: "", quantity, unitPriceCents, optional: false, selected: true, ...over });
const content = (over: Record<string, unknown> = {}) => ({
  title: "Back yard turf", salesperson: "Sam Sales", introHeading: "Hello", introText: "Thanks for having us.", lines: [item("Turf", 2, 10000)], clientView: { quantities: true, unitPrices: true, lineTotals: true, totals: true },
  clientMessage: "", contract: "Valid for 30 days.", applyContractToFuture: false, ...over,
});

describe("creating and saving a quote", () => {
  it("numbers quotes per business, names the salesperson, and starts as a Draft with the default contract", async () => {
    const { sales, qft, clientId } = await world();
    const a = await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "First" });
    const b = await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "Second" });
    const qa = await sales.query(api.crm.quotes.get, { id: a });
    const qb = await sales.query(api.crm.quotes.get, { id: b });
    expect(qb!.number).toBe(qa!.number + 1);
    expect(qa).toMatchObject({ status: "Draft", salesperson: "Sam Sales" });
    expect(qa!.clientView).toEqual({ quantities: true, unitPrices: true, lineTotals: true, totals: true });
  });

  it("moves the project to Quote Draft when a quote is made for it, and writes the history", async () => {
    const { sales, base, qft, clientId, project } = await world();
    await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, opportunityId: project, title: "Turf" });
    expect((await base.run((ctx) => ctx.db.get(project)))?.stage).toBe("Quote Draft & Site Plan / Design");
    const history = await sales.query(api.crm.pipeline.history, { id: project });
    expect(history[0]).toMatchObject({ from: "New Request", to: "Quote Draft & Site Plan / Design" });
  });

  it("saves the lines in order and works the total out from them: optional, text lines, discount and tax", async () => {
    const { sales, qft, clientId } = await world();
    const id = await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "T" });
    await sales.mutation(api.crm.quoteDraft.save, {
      id,
      ...content({
        lines: [item("Turf", 2, 10000), { kind: "text", name: "Includes haul-away", description: "", quantity: 1, unitPriceCents: 0, optional: false, selected: true }, item("Border", 1, 5000, { optional: true, selected: false })],
        discountKind: "percent", discountValue: 10, taxPercent: 8.75, depositKind: "percent", depositValue: 30,
      }),
    });
    const q = await sales.query(api.crm.quotes.get, { id });
    expect(q!.lines.map((l) => l.name)).toEqual(["Turf", "Includes haul-away", "Border"]);
    expect(q!.totals).toMatchObject({ subtotalCents: 20000, discountCents: 2000, taxCents: 1575, totalCents: 19575, depositCents: 5873 });
    const list = await sales.query(api.crm.quotes.list, { businessId: qft, status: "All", from: null, to: null, salesperson: null, search: "", sortKey: "number", dir: "asc", page: 1, size: 50 });
    expect(list.rows.find((r) => r.id === id)?.totalCents).toBe(19575);
  });

  it("refuses an empty or long title, a negative price or quantity, and too many lines", async () => {
    const { sales, qft, clientId } = await world();
    const id = await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "T" });
    const save = (over: Record<string, unknown>) => sales.mutation(api.crm.quoteDraft.save, { id, ...content(over) } as never);
    await expect(save({ title: "   " })).rejects.toThrow(/title/i);
    await expect(save({ title: "x".repeat(201) })).rejects.toThrow(/title/i);
    await expect(save({ lines: [item("Turf", -1, 100)] })).rejects.toThrow(/quantity/i);
    await expect(save({ lines: [item("Turf", 1, -5)] })).rejects.toThrow(/price/i);
    await expect(save({ lines: [item("", 1, 100)] })).rejects.toThrow(/name/i);
    await expect(save({ lines: Array.from({ length: 201 }, (_, i) => item(`L${i}`, 1, 1)) })).rejects.toThrow(/200/);
  });

  it("keeps a contract as the default for future quotes when asked", async () => {
    const { sales, qft, clientId } = await world();
    const id = await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "T" });
    await sales.mutation(api.crm.quoteDraft.save, { id, ...content({ contract: "Net 15, no refunds.", applyContractToFuture: true }) });
    const next = await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "U" });
    expect((await sales.query(api.crm.quotes.get, { id: next }))!.contract).toBe("Net 15, no refunds.");
  });

  it("will not change a quote that is approved, rejected, converted or archived", async () => {
    const { sales, base, qft, clientId } = await world();
    const id = await sales.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "T" });
    for (const status of ["Approved", "Rejected", "Converted", "Archived"] as const) {
      await base.run((ctx) => ctx.db.patch(id, { status }));
      await expect(sales.mutation(api.crm.quoteDraft.save, { id, ...content() })).rejects.toThrow(/can no longer be edited/);
    }
  });

  it("refuses a Project Manager and a person from another business", async () => {
    const { pm, outsider, qft, clientId } = await world();
    await expect(pm.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "T" })).rejects.toThrow();
    await expect(outsider.mutation(api.crm.quoteDraft.create, { businessId: qft, clientId, title: "T" })).rejects.toThrow();
  });
});

describe("attachments, notes, duplicate and archive", () => {
  const file = (w: Awaited<ReturnType<typeof world>>, bytes: number, type: string) => w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));

  it("accepts a PDF and an image and refuses other files and anything over 15 MB", async () => {
    const w = await world();
    const id = await w.sales.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, title: "T" });
    const add = async (bytes: number, type: string, name: string) => w.sales.mutation(api.crm.quoteDraft.addAttachment, { quoteId: id, storageId: await file(w, bytes, type) as Id<"_storage">, name });
    await add(1000, "application/pdf", "site-plan.pdf");
    await add(1000, "image/png", "photo.png");
    await expect(add(1000, "text/plain", "notes.txt")).rejects.toThrow(/PDF or an image/);
    await expect(add(16 * 1024 * 1024, "application/pdf", "huge.pdf")).rejects.toThrow(/15 MB/);
    const q = await w.sales.query(api.crm.quotes.get, { id });
    expect(q!.attachments.map((a) => a.name)).toEqual(["site-plan.pdf", "photo.png"]);
    await w.sales.mutation(api.crm.quoteDraft.removeAttachment, { id: q!.attachments[0].id });
    expect((await w.sales.query(api.crm.quotes.get, { id }))!.attachments).toHaveLength(1);
  });

  it("adds an internal note with the author's name", async () => {
    const w = await world();
    const id = await w.sales.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, title: "T" });
    await w.sales.mutation(api.crm.quoteDraft.addNote, { quoteId: id, text: "  Call before delivery  " });
    await expect(w.sales.mutation(api.crm.quoteDraft.addNote, { quoteId: id, text: "  " })).rejects.toThrow();
    expect((await w.sales.query(api.crm.quotes.get, { id }))!.notes.map((n) => [n.text, n.author])).toEqual([["Call before delivery", "Sam Sales"]]);
  });

  it("duplicates a quote as a new Draft with the same lines, and archives one", async () => {
    const w = await world();
    const id = await w.sales.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, title: "T" });
    await w.sales.mutation(api.crm.quoteDraft.save, { id, ...content() });
    const copy = await w.sales.mutation(api.crm.quoteDraft.duplicate, { id });
    const a = await w.sales.query(api.crm.quotes.get, { id });
    const b = await w.sales.query(api.crm.quotes.get, { id: copy });
    expect(b!.number).toBeGreaterThan(a!.number);
    expect(b!.status).toBe("Draft");
    expect(b!.lines.map((l) => l.name)).toEqual(a!.lines.map((l) => l.name));
    await w.sales.mutation(api.crm.quoteDraft.archive, { id });
    expect((await w.sales.query(api.crm.quotes.get, { id }))!.status).toBe("Archived");
  });
});
