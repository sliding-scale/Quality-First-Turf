/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FINANCE_STAGES, PREPLANNING_STAGES } from "../../convex/crm/lib/stages";
import { billingWorld, body, line } from "./billingSeed";
import { NOW } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const LATER = NOW + 100; // after the sign-off, so the history reads in order
const [SEND, PENDING, RECEIVED, REVIEW, FILES, ARCHIVE] = FINANCE_STAGES;
const FINAL = "100% Completed & Sign-off";

type W = Awaited<ReturnType<typeof billingWorld>>;
const pic = (w: W) => w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(300)], { type: "image/png" }))) as Promise<Id<"_storage">>;

/** Signs off a project that is in Construction (from Closed Won, through Preplanning), so it lands in Finance. */
async function signOff(w: W, at = NOW) {
  await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: at });
  await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1], now: at + 1 });
  const { signoffId } = await w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "Done", now: at + 2 });
  await w.pm.mutation(api.crm.construction.signOnDevice, { signoffId, signedBy: "Maya Patel", signatureStorageId: await pic(w), now: at + 3 });
}

/** A project with a signed $1,000 quote, already in Finance at "Send Final Invoice". */
async function inFinance() {
  const w = await billingWorld();
  await signedQuote(w);
  await signOff(w);
  const stage = async () => (await w.base.run((ctx) => ctx.db.get(w.project)))!;
  const invoice = async (cents: number, send = true) => {
    const id = await w.office.mutation(api.crm.invoices.create, { businessId: w.qft, clientId: w.clientId, opportunityId: w.project, now: LATER, ...body({ lines: [line("Work", 1, cents)] }) });
    if (send) await w.office.mutation(api.crm.invoices.send, { id, now: LATER });
    return id;
  };
  const pay = (id: Id<"invoices">, cents: number) =>
    w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Check", paidAt: LATER, reference: "", details: "", amountCents: cents, allocations: [{ invoiceId: id, amountCents: cents }], now: LATER });
  const history = async () => (await w.admin.query(api.crm.pipeline.history, { id: w.project })).map((h) => `${h.to}:${h.note ?? ""}`);
  return { ...w, stage, invoice, pay, history };
}

describe("The Finance pipeline (PRD 5.1)", () => {
  it("is entered by sign-off, at Send Final Invoice, and every move is in the history", async () => {
    const w = await inFinance();
    expect(await w.stage()).toMatchObject({ pipeline: "Finance", stage: SEND });
    expect((await w.history()).slice(0, 2)).toEqual([`${SEND}:Sent to Backend automatically`, `${FINAL}:Customer signed off`]);
  });

  it("moves to Pending Final Payment when the sent invoices cover the total, and to Final Payment Received when they are paid", async () => {
    const w = await inFinance();
    const first = await w.invoice(40_000, false);
    await w.office.mutation(api.crm.invoices.send, { id: first, now: LATER });
    expect(await w.stage()).toMatchObject({ stage: SEND }); // $400 of $1,000 sent
    const second = await w.invoice(60_000);
    expect(await w.stage()).toMatchObject({ stage: PENDING });
    expect((await w.history())[0]).toBe(`${PENDING}:All invoices sent`);

    await w.pay(first, 40_000);
    expect(await w.stage()).toMatchObject({ stage: PENDING });
    await expect(w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: RECEIVED, now: LATER })).rejects.toThrow(/\$600\.00 is still owed/);
    await w.pay(second, 60_000);
    expect(await w.stage()).toMatchObject({ stage: RECEIVED });
    expect((await w.history())[0]).toBe(`${RECEIVED}:Paid in full`);
  });

  it("leaves Get Client Review, Consolidate Files and Archive to a person, and Archive is just the last column", async () => {
    const w = await inFinance();
    await w.pay(await w.invoice(100_000), 100_000);
    expect(await w.stage()).toMatchObject({ stage: RECEIVED });
    for (const [i, to] of [REVIEW, FILES, ARCHIVE].entries()) {
      await w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to, now: LATER + 10 + i });
      expect(await w.stage()).toMatchObject({ pipeline: "Finance", stage: to });
      expect((await w.stage()).archivedAt).toBeUndefined();
    }
    await expect(w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Not a stage", now: NOW })).rejects.toThrow(/not a Backend stage/);
  });

  it("still bills a project that has no quote and no schedule: any sent invoice covers it", async () => {
    const w = await billingWorld();
    // No quote: the sale is closed on an uploaded signed contract.
    await w.base.run(async (ctx) => ctx.db.patch(w.project, { signedContractId: await ctx.storage.store(new Blob([new Uint8Array(100)], { type: "application/pdf" })), signedContractName: "contract.pdf" }));
    await signOff(w);
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ pipeline: "Finance", stage: SEND });
    const id = await w.office.mutation(api.crm.invoices.create, { businessId: w.qft, clientId: w.clientId, opportunityId: w.project, now: NOW, ...body({ lines: [line("Work", 1, 12_345)] }) });
    await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ stage: PENDING });
    await w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Cash", paidAt: NOW, reference: "", details: "", amountCents: 12_345, allocations: [{ invoiceId: id, amountCents: 12_345 }], now: NOW });
    expect(await w.base.run((ctx) => ctx.db.get(w.project))).toMatchObject({ stage: RECEIVED });
  });

  it("does not count a voided invoice as billed, and a written-off one still counts as billed but not as owed", async () => {
    const w = await inFinance();
    const a = await w.invoice(100_000);
    expect(await w.stage()).toMatchObject({ stage: PENDING });
    await w.admin.mutation(api.crm.invoices.setStatus, { id: a, status: "Bad debt", now: NOW + 1 });
    expect(await w.stage()).toMatchObject({ stage: RECEIVED }); // nothing is owed any more
    const w2 = await inFinance();
    const b = await w2.invoice(100_000, false);
    await w2.office.mutation(api.crm.invoices.send, { id: b, now: NOW });
    await w2.admin.mutation(api.crm.invoices.setStatus, { id: b, status: "Void", now: NOW + 1 });
    const money = await w2.office.query(api.crm.billing.get, { opportunityId: w2.project, now: NOW });
    expect(money?.invoices.map((i) => i.status)).toEqual(["Void"]);
  });

  it("can go back to Construction only before an invoice is sent, and can be sent to Finance again", async () => {
    const w = await inFinance();
    const id = await w.invoice(10_000, false);
    await expect(w.pm.mutation(api.crm.pipeline.returnToConstruction, { id: w.project, now: NOW })).rejects.toThrow(/not change/);
    await w.office.mutation(api.crm.pipeline.returnToConstruction, { id: w.project, now: NOW + 1 });
    expect(await w.stage()).toMatchObject({ pipeline: "Construction", stage: FINAL });
    await expect(w.pm.mutation(api.crm.pipeline.startFinance, { id: w.project, now: NOW + 2 })).rejects.toThrow(/not change/);
    await w.office.mutation(api.crm.pipeline.startFinance, { id: w.project, now: NOW + 2 });
    expect(await w.stage()).toMatchObject({ pipeline: "Finance", stage: SEND });
    await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    await expect(w.office.mutation(api.crm.pipeline.returnToConstruction, { id: w.project, now: NOW + 3 })).rejects.toThrow(/already sent/);
  });

  it("shows on the Finance board with what is owed, and stays visible in the last Construction column", async () => {
    const w = await inFinance();
    await w.invoice(70_000);
    const args = { businessId: w.qft, sortKey: "timeInStage" as const, dir: "desc" as const, leadSources: [], search: "", now: NOW + 5 };
    const board = await w.office.query(api.crm.pipeline.workBoard, { ...args, pipeline: "Finance" });
    expect(board.columns.map((c) => c.name)).toEqual([...FINANCE_STAGES]);
    expect(board.columns.find((c) => c.name === SEND)?.cards[0]).toMatchObject({ code: "TST-001", balanceCents: 70_000 });
    const construction = await w.office.query(api.crm.pipeline.workBoard, { ...args, pipeline: "Construction" });
    expect(construction.columns.find((c) => c.name === FINAL)?.cards[0]).toMatchObject({ code: "TST-001", movedTo: `Backend: ${SEND}` });
  });
});

describe("A quote's deposit is a payment (PRD 5.2: deposits and final payments)", () => {
  it("writes a payment when the deposit is recorded, which the first invoice can use", async () => {
    const w = await billingWorld();
    const quoteId = await signedQuote(w);
    await w.office.mutation(api.crm.quoteFlow.recordDeposit, { id: quoteId, amountCents: 25_000, receivedAt: NOW });
    const [dep] = await w.office.query(api.crm.payments.deposits, { clientId: w.clientId, opportunityId: w.project });
    expect(dep).toMatchObject({ amountCents: 25_000, unappliedCents: 25_000, source: "quote deposit", quoteId });
    const list = await w.office.query(api.crm.payments.list, { businessId: w.qft, method: "All", search: "", sortKey: "paidAt", dir: "desc", page: 0, size: 10 });
    expect(list.rows[0]).toMatchObject({ amountCents: 25_000, quote: { number: 1 }, invoice: null });
    const invoice = await w.office.mutation(api.crm.invoices.create, { businessId: w.qft, clientId: w.clientId, opportunityId: w.project, now: NOW, ...body(), deposits: [{ paymentId: dep.id, amountCents: 25_000 }] });
    expect((await w.office.query(api.crm.invoices.get, { id: invoice, now: NOW }))?.invoice).toMatchObject({ paidCents: 25_000, balanceCents: 75_000 });
  });

  it("backfills a deposit recorded before payments existed, once", async () => {
    const w = await billingWorld();
    const quoteId = await signedQuote(w);
    await w.base.run((ctx) => ctx.db.patch(quoteId, { depositCollectedCents: 81_000, depositCollectedAt: NOW - 1000 }));
    expect(await w.base.mutation(internal.crm.billing.backfillQuoteDeposits, {})).toEqual({ added: 1 });
    expect(await w.base.mutation(internal.crm.billing.backfillQuoteDeposits, {})).toEqual({ added: 0 });
    const [dep] = await w.office.query(api.crm.payments.deposits, { clientId: w.clientId });
    expect(dep).toMatchObject({ amountCents: 81_000, paidAt: NOW - 1000 });
  });
});
