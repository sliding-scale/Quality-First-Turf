/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { billingWorld, line } from "./billingSeed";
import { NOW } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const DAY = 86_400_000;

describe("The client's invoice link (/i/<token>)", () => {
  it("shows the invoice by its secret link, only what the Client view allows, and nothing about staff", async () => {
    const w = await billingWorld();
    const id = await w.make({ lines: [line("Turf", 2, 25_000)], clientView: { quantities: false, unitPrices: false, lineTotals: true, accountBalance: false, lateStamp: true } });
    await w.office.mutation(api.crm.invoices.addNote, { id, text: "Internal only", now: NOW });
    const { token } = await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    await w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Check", paidAt: NOW, reference: "9001", details: "", amountCents: 10_000, allocations: [{ invoiceId: id, amountCents: 10_000 }], now: NOW });

    const seen = await w.base.query(api.crm.clientInvoice.get, { token, now: NOW });
    expect(seen).toMatchObject({ number: 1, subject: "Test", status: "Awaiting payment", late: false, balanceCents: 40_000, accountBalanceCents: null });
    expect(seen?.lines[0]).toMatchObject({ name: "Turf", quantity: null, unitPriceCents: null, totalCents: 50_000 });
    expect(seen?.payments).toEqual([{ paidAt: NOW, method: "Check", amountCents: 10_000 }]);
    expect(JSON.stringify(seen)).not.toContain("Internal only");
    expect(JSON.stringify(seen)).not.toContain("office-1");
    const late = await w.base.query(api.crm.clientInvoice.get, { token, now: NOW + 40 * DAY });
    expect(late).toMatchObject({ status: "Past due", late: true });
  });

  it("treats a wrong, short, draft or voided link as not valid, and records the first view once", async () => {
    const w = await billingWorld();
    const draft = await w.make();
    expect(await w.base.query(api.crm.clientInvoice.get, { token: "x".repeat(64), now: NOW })).toBeNull();
    expect(await w.base.query(api.crm.clientInvoice.get, { token: "short", now: NOW })).toBeNull();
    const { token } = await w.office.mutation(api.crm.invoices.send, { id: draft, now: NOW });
    expect(await w.base.query(api.crm.clientInvoice.get, { token, now: NOW })).not.toBeNull();

    await w.base.mutation(api.crm.clientInvoice.markViewed, { token });
    await w.base.mutation(api.crm.clientInvoice.markViewed, { token });
    const got = await w.office.query(api.crm.invoices.get, { id: draft, now: NOW });
    expect(got?.invoice.viewedAt).toBeGreaterThan(0);
    expect(got?.events.filter((e) => e.kind === "viewed")).toHaveLength(1);

    await w.admin.mutation(api.crm.invoices.setStatus, { id: draft, status: "Void", now: NOW });
    expect(await w.base.query(api.crm.clientInvoice.get, { token, now: NOW })).toBeNull();
  });
});

describe("Money records stay with the books", () => {
  it("will not delete a client who has invoices or payments, and shows their real billing on the client page", async () => {
    const w = await billingWorld();
    await expect(w.office.mutation(api.crm.clients.remove, { ids: [w.otherClient] })).resolves.toBe(1); // no money: deletable
    const id = await w.make();
    await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    await w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Cash", paidAt: NOW + 1, reference: "", details: "", amountCents: 30_000, allocations: [{ invoiceId: id, amountCents: 30_000 }], now: NOW });
    await expect(w.office.mutation(api.crm.clients.remove, { ids: [w.clientId] })).rejects.toThrow(/invoices or payments, which are kept/);
    const client = await w.office.query(api.crm.clients.get, { id: w.clientId });
    expect(client).toMatchObject({ balanceCents: 70_000, lifetimeValueCents: 30_000 });
    expect(client?.billing?.map((b) => [b.kind, b.appliedTo, b.cents])).toEqual([["Payment (Cash)", "Invoice #1", -30_000], ["Invoice", "#1 Test", 100_000]]);
  });

  it("keeps Finance moves for Admin and Office, and counts projects awaiting invoicing on the dashboard", async () => {
    const w = await billingWorld();
    await signedQuote(w);
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
    await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Ready for Construction / Installs Scheduled", now: NOW + 1 });
    const { signoffId } = await w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "", now: NOW + 2 });
    const sig = await w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(300)], { type: "image/png" })));
    await w.pm.mutation(api.crm.construction.signOnDevice, { signoffId, signedBy: "Maya", signatureStorageId: sig, now: NOW + 3 });
    await expect(w.sales.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Pending Final Payment", now: NOW + 4 })).rejects.toThrow(/view invoices and payments but not change/);
    await expect(w.pm.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Pending Final Payment", now: NOW + 4 })).rejects.toThrow(/not change/);
    await w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Pending Final Payment", now: NOW + 4 });
    expect((await w.office.query(api.crm.invoices.stats, { businessId: w.qft, now: NOW + 5 })).awaitingInvoicing).toBe(0);
    await w.office.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Send Final Invoice", now: NOW + 6 });
    expect((await w.office.query(api.crm.invoices.stats, { businessId: w.qft, now: NOW + 7 })).awaitingInvoicing).toBe(1);
  });
});

