/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { full, item, quoteWorld } from "./quoteSeed";

describe("sending a quote", () => {
  it("makes it Awaiting response with a secret link and revision 1, moves the project, and logs it", async () => {
    const { sales, base, quoteId, project } = await quoteWorld();
    const r = await sales.mutation(api.crm.quoteFlow.send, { id: quoteId, now: 5000 });
    expect(r.revision).toBe(1);
    expect(r.token.length).toBeGreaterThanOrEqual(32);
    const q = await sales.query(api.crm.quotes.get, { id: quoteId });
    expect(q).toMatchObject({ status: "Awaiting response", revision: 1, shareToken: r.token, sentAt: 5000 });
    expect((await base.run((ctx) => ctx.db.get(project)))?.stage).toBe("Proposal Delivered — Awaiting Response");
    const events = await sales.query(api.crm.quoteFlow.events, { id: quoteId });
    expect(events.map((e) => e.kind)).toEqual(["created", "sent", "link"]);
  });

  it("refuses a quote with nothing to charge for, and one that is already approved", async () => {
    const w = await quoteWorld({ lines: [{ kind: "text", name: "Only words", description: "", quantity: 1, unitPriceCents: 0, optional: false, selected: true }] });
    await expect(w.sales.mutation(api.crm.quoteFlow.send, { id: w.quoteId, now: 1 })).rejects.toThrow(/at least one/i);
    const v = await quoteWorld();
    await v.base.run((ctx) => ctx.db.patch(v.quoteId, { status: "Approved" }));
    await expect(v.sales.mutation(api.crm.quoteFlow.send, { id: v.quoteId, now: 1 })).rejects.toThrow(/cannot be sent/i);
  });

  it("resubmits after changes were asked for: same link, revision 2, and the first version is kept as it was sent", async () => {
    const { sales, base, quoteId } = await quoteWorld();
    const first = await sales.mutation(api.crm.quoteFlow.send, { id: quoteId, now: 1000 });
    await base.run((ctx) => ctx.db.patch(quoteId, { status: "Changes requested" }));
    await sales.mutation(api.crm.quoteDraft.save, { id: quoteId, ...full({ lines: [item("Turf", 2, 40000)] }) });
    const second = await sales.mutation(api.crm.quoteFlow.send, { id: quoteId, now: 2000 });
    expect(second).toEqual({ token: first.token, revision: 2 });
    const revisions = await sales.query(api.crm.quoteFlow.revisions, { id: quoteId });
    expect(revisions.map((r) => [r.revision, r.snapshot.totalCents])).toEqual([[2, 80000], [1, 100000]]);
    expect((await sales.query(api.crm.quoteFlow.events, { id: quoteId })).map((e) => e.kind)).toContain("resubmitted");
  });

  it("can be marked as awaiting a response without making a new revision", async () => {
    const { sales, quoteId } = await quoteWorld();
    await sales.mutation(api.crm.quoteFlow.markAwaitingResponse, { id: quoteId, now: 3000 });
    const q = await sales.query(api.crm.quotes.get, { id: quoteId });
    expect(q).toMatchObject({ status: "Awaiting response", sentAt: 3000, revision: 0 });
  });

  it("refuses a Project Manager and a person from another business", async () => {
    const { pm, outsider, quoteId } = await quoteWorld();
    await expect(pm.mutation(api.crm.quoteFlow.send, { id: quoteId, now: 1 })).rejects.toThrow();
    await expect(outsider.mutation(api.crm.quoteFlow.send, { id: quoteId, now: 1 })).rejects.toThrow();
    await expect(outsider.query(api.crm.quoteFlow.events, { id: quoteId })).rejects.toThrow();
  });
});

describe("collecting a signature and a deposit", () => {
  it("collects a signature in person: Approved, signed, and the project moves to Quotes Approved", async () => {
    const { sales, base, quoteId, project, store } = await quoteWorld();
    await sales.mutation(api.crm.quoteFlow.collectSignature, { id: quoteId, signedBy: "  Pat Client ", signatureStorageId: await store(500, "image/png"), now: 7000 });
    const q = await sales.query(api.crm.quotes.get, { id: quoteId });
    expect(q).toMatchObject({ status: "Approved", signedBy: "Pat Client", approvedAt: 7000, signedAt: 7000 });
    expect(q!.signatureUrl).toBeTruthy();
    expect((await base.run((ctx) => ctx.db.get(project)))?.stage).toBe("Quotes Approved — Contract Out for Signature");
  });

  it("refuses a signature that is not an image, a missing name, and signing twice", async () => {
    const { sales, quoteId, store } = await quoteWorld();
    await expect(sales.mutation(api.crm.quoteFlow.collectSignature, { id: quoteId, signedBy: "Pat", signatureStorageId: await store(500, "text/plain"), now: 1 })).rejects.toThrow(/image/i);
    await expect(sales.mutation(api.crm.quoteFlow.collectSignature, { id: quoteId, signedBy: "  ", signatureStorageId: await store(500, "image/png"), now: 1 })).rejects.toThrow(/name/i);
    await sales.mutation(api.crm.quoteFlow.collectSignature, { id: quoteId, signedBy: "Pat", signatureStorageId: await store(500, "image/png"), now: 1 });
    await expect(sales.mutation(api.crm.quoteFlow.collectSignature, { id: quoteId, signedBy: "Pat", signatureStorageId: await store(500, "image/png"), now: 2 })).rejects.toThrow(/already/i);
  });

  it("records a deposit received, with an optional PDF or image as proof", async () => {
    const { sales, quoteId, store } = await quoteWorld({ depositKind: "percent", depositValue: 30 });
    await sales.mutation(api.crm.quoteFlow.collectSignature, { id: quoteId, signedBy: "Pat", signatureStorageId: await store(500, "image/png"), now: 1 });
    await sales.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: 20000, receivedAt: 8000 });
    let q = await sales.query(api.crm.quotes.get, { id: quoteId });
    expect(q!.totals).toMatchObject({ depositCents: 30000, depositCollectedCents: 20000, depositOutstandingCents: 10000 });
    expect(q!.depositProofUrl).toBeNull();
    await sales.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: 10000, receivedAt: 9000, proofStorageId: await store(2000, "application/pdf"), proofName: "receipt.pdf" });
    q = await sales.query(api.crm.quotes.get, { id: quoteId });
    expect(q!.totals.depositOutstandingCents).toBe(0);
    expect(q).toMatchObject({ depositProofName: "receipt.pdf", depositCollectedAt: 9000 });
    expect(q!.depositProofUrl).toBeTruthy();
  });

  it("refuses a deposit of nothing, a negative one, one that is not allowed, and proof that is not a PDF or an image", async () => {
    const { sales, quoteId, store } = await quoteWorld({ depositKind: "percent", depositValue: 30 });
    await expect(sales.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: 100, receivedAt: 1 })).rejects.toThrow(/approved/i);
    await sales.mutation(api.crm.quoteFlow.collectSignature, { id: quoteId, signedBy: "Pat", signatureStorageId: await store(500, "image/png"), now: 1 });
    await expect(sales.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: 0, receivedAt: 1 })).rejects.toThrow(/amount/i);
    await expect(sales.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: -5, receivedAt: 1 })).rejects.toThrow(/amount/i);
    await expect(sales.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: 100, receivedAt: 1, proofStorageId: await store(100, "text/plain"), proofName: "x.txt" })).rejects.toThrow(/PDF or an image/);
  });
});
