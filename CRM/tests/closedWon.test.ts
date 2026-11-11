/// <reference types="vite/client" />
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOW, seeded } from "./pipelineSeed";
import { item, quoteWorld, signedQuote } from "./quoteSeed";

/** What a refused move says, as the screen reads it. */
async function refusal(p: Promise<unknown>): Promise<{ code: string; message: string; quoteId?: string }> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ConvexError && typeof e.data === "object") return e.data as { code: string; message: string; quoteId?: string };
    throw e;
  }
  throw new Error("The move was not refused.");
}

describe("Closed Won needs the signed quote, for everyone", () => {
  it("refuses an Admin when the project has no quote at all", async () => {
    const { admin, project } = await seeded();
    const r = await refusal(admin.mutation(api.crm.pipeline.moveStage, { id: project, to: "Closed Won", now: NOW }));
    expect(r.code).toBe("needs_quote");
    expect(r.quoteId).toBeUndefined();
  });

  it("refuses an Admin when the quote is not signed, and names the quote to open", async () => {
    const w = await quoteWorld();
    await w.sales.mutation(api.crm.quoteFlow.send, { id: w.quoteId, now: 1000 });
    const r = await refusal(w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW }));
    expect(r).toMatchObject({ code: "needs_signature", quoteId: w.quoteId });
    expect(r.message).toMatch(/signature/);
    const viaMenu = await refusal(w.admin.mutation(api.crm.pipeline.markOutcome, { id: w.project, outcome: "won", now: NOW }));
    expect(viaMenu.code).toBe("needs_signature");
  });

  it("refuses when the quote is signed but its deposit has not been received, and allows it once it has", async () => {
    const w = await seeded();
    const quoteId = await signedQuote(w, { depositKind: "percent", depositValue: 30 });
    const r = await refusal(w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW }));
    expect(r).toMatchObject({ code: "needs_deposit", quoteId });
    await w.sales.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: 30000, receivedAt: 5 });
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))?.outcome).toBe("won");
  });

  it("lets Sales close as won when the quote is signed and no deposit was asked for", async () => {
    const w = await seeded();
    await signedQuote(w);
    await w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    expect((await w.base.run((ctx) => ctx.db.get(w.project)))?.stage).toBe("Closed Won");
  });

  it("does not count a quote that is Approved without a signature picture", async () => {
    const w = await quoteWorld();
    await w.base.run((ctx) => ctx.db.patch(w.quoteId, { status: "Approved", approvedAt: 1 }));
    const r = await refusal(w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW }));
    expect(r.code).toBe("needs_signature");
  });

  it("does not count an archived or rejected quote as the one to open", async () => {
    const w = await quoteWorld({ lines: [item("Turf", 1, 100)] });
    await w.sales.mutation(api.crm.quoteDraft.archive, { id: w.quoteId });
    const r = await refusal(w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW }));
    expect(r.code).toBe("needs_quote");
    expect(r.quoteId).toBeUndefined();
  });
});

describe("an uploaded signed contract, and an optional invoice", () => {
  const file = (w: Awaited<ReturnType<typeof seeded>>, bytes: number, type: string) => w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));

  it("starts with the contract missing, and says what else is needed", async () => {
    const w = await seeded();
    const r = await w.sales.query(api.crm.pipeline.wonRequirements, { id: w.project });
    expect(r.contract).toMatchObject({ ok: false, via: null });
    expect(r.deposit).toMatchObject({ required: false });
    expect(r.invoice).toBeNull();
    expect(r.canClose).toBe(false);
  });

  it("closes as won, for Sales and for an Admin, once a signed contract is uploaded; the invoice is not needed", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.pipeline.attachContract, { id: w.project, storageId: await file(w, 800, "application/pdf"), name: "signed-contract.pdf", now: NOW });
    const r = await w.pm.query(api.crm.pipeline.wonRequirements, { id: w.project });
    expect(r).toMatchObject({ canClose: true, contract: { ok: true, via: "upload", name: "signed-contract.pdf" }, invoice: null });
    expect(r.contract.url).toBeTruthy();
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    const history = await w.sales.query(api.crm.pipeline.history, { id: w.project });
    expect(history[0].note).toMatch(/signed contract uploaded/i);
    const v = await seeded();
    await v.sales.mutation(api.crm.pipeline.attachContract, { id: v.project, storageId: await file(v, 800, "image/png"), name: "photo-of-contract.png", now: NOW });
    await v.sales.mutation(api.crm.pipeline.moveStage, { id: v.project, to: "Closed Won", now: NOW });
    expect((await v.base.run((ctx) => ctx.db.get(v.project)))?.outcome).toBe("won");
  });

  it("refuses a contract that is not a PDF or an image, or over 15 MB, and a Project Manager or outsider", async () => {
    const w = await seeded();
    await expect(w.sales.mutation(api.crm.pipeline.attachContract, { id: w.project, storageId: await file(w, 100, "text/plain"), name: "x.txt", now: NOW })).rejects.toThrow(/PDF or an image/);
    await expect(w.sales.mutation(api.crm.pipeline.attachContract, { id: w.project, storageId: await file(w, 16 * 1024 * 1024, "application/pdf"), name: "big.pdf", now: NOW })).rejects.toThrow(/15 MB/);
    await expect(w.pm.mutation(api.crm.pipeline.attachContract, { id: w.project, storageId: await file(w, 100, "application/pdf"), name: "a.pdf", now: NOW })).rejects.toThrow();
    await expect(w.outsider.mutation(api.crm.pipeline.attachContract, { id: w.project, storageId: await file(w, 100, "application/pdf"), name: "a.pdf", now: NOW })).rejects.toThrow();
  });

  it("keeps an invoice on the project when one is uploaded, and refuses other files", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.pipeline.attachInvoice, { id: w.project, storageId: await file(w, 500, "application/pdf"), name: "invoice-1042.pdf" });
    const r = await w.sales.query(api.crm.pipeline.wonRequirements, { id: w.project });
    expect(r.invoice).toMatchObject({ name: "invoice-1042.pdf" });
    expect(r.invoice!.url).toBeTruthy();
    await expect(w.sales.mutation(api.crm.pipeline.attachInvoice, { id: w.project, storageId: await file(w, 100, "text/plain"), name: "x.txt" })).rejects.toThrow(/PDF or an image/);
  });

  it("still asks for the deposit when the project has a signed quote that asked for one", async () => {
    const w = await seeded();
    const quoteId = await signedQuote(w, { depositKind: "percent", depositValue: 30 });
    await w.sales.mutation(api.crm.pipeline.attachContract, { id: w.project, storageId: await file(w, 800, "application/pdf"), name: "c.pdf", now: NOW });
    const r = await w.sales.query(api.crm.pipeline.wonRequirements, { id: w.project });
    expect(r).toMatchObject({ canClose: false, contract: { ok: true }, deposit: { required: true, ok: false, quoteId } });
    expect((await refusal(w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW }))).code).toBe("needs_deposit");
  });

  it("counts a signed quote as the contract too", async () => {
    const w = await seeded();
    await signedQuote(w);
    const r = await w.sales.query(api.crm.pipeline.wonRequirements, { id: w.project });
    expect(r).toMatchObject({ canClose: true, contract: { ok: true, via: "quote" } });
  });
});
