/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { billingWorld, body, line } from "./billingSeed";
import { NOW } from "./pipelineSeed";

const DAY = 86_400_000;

type W = Awaited<ReturnType<typeof billingWorld>>;
const pay = (w: W, amountCents: number, allocations: { invoiceId: Id<"invoices">; amountCents: number }[], over: Record<string, unknown> = {}) =>
  w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Cash", paidAt: NOW, reference: "Test", details: "Test", amountCents, allocations, now: NOW, ...over });
const sentInvoice = async (w: W, over: Record<string, unknown> = {}, clientId: Id<"clients"> = w.clientId) => {
  const id = await w.office.mutation(api.crm.invoices.create, { businessId: w.qft, clientId, now: NOW, ...body(over) });
  await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
  return id;
};
const inv = (w: W, id: Id<"invoices">) => w.office.query(api.crm.invoices.get, { id, now: NOW }).then((r) => r!.invoice);

describe("Collecting payments (Jobber's Collect Payment)", () => {
  it("takes a part payment, then the rest, and the invoice becomes Paid", async () => {
    const w = await billingWorld();
    const id = await sentInvoice(w);
    await pay(w, 30_000, [{ invoiceId: id, amountCents: 30_000 }]);
    expect(await inv(w, id)).toMatchObject({ paidCents: 30_000, balanceCents: 70_000, storedStatus: "Sent" });
    await pay(w, 70_000, [{ invoiceId: id, amountCents: 70_000 }], { method: "Zelle" });
    expect(await inv(w, id)).toMatchObject({ paidCents: 100_000, balanceCents: 0, storedStatus: "Paid", status: "Paid" });
    const got = await w.office.query(api.crm.invoices.get, { id, now: NOW });
    expect(got?.payments.map((p) => [p.method, p.amountCents])).toEqual([["Cash", 30_000], ["Zelle", 70_000]]);
    expect(got?.events.map((e) => e.kind)).toEqual(["created", "sent", "payment", "payment"]);
  });

  it("spreads one payment over several invoices and keeps what is left as a deposit", async () => {
    const w = await billingWorld();
    const a = await sentInvoice(w, { lines: [line("A", 1, 10_000)] });
    const b = await sentInvoice(w, { lines: [line("B", 1, 20_000)] });
    await pay(w, 40_000, [{ invoiceId: a, amountCents: 10_000 }, { invoiceId: b, amountCents: 20_000 }]);
    expect((await inv(w, a)).status).toBe("Paid");
    expect((await inv(w, b)).status).toBe("Paid");
    const [dep] = await w.office.query(api.crm.payments.deposits, { clientId: w.clientId });
    expect(dep).toMatchObject({ amountCents: 40_000, unappliedCents: 10_000 });
  });

  it("refuses more than the payment, more than the invoice owes, a draft, a repeated invoice, or another client's invoice", async () => {
    const w = await billingWorld();
    const id = await sentInvoice(w, { lines: [line("A", 1, 10_000)] });
    const theirs = await sentInvoice(w, { lines: [line("B", 1, 10_000)] }, w.otherClient);
    await expect(pay(w, 5_000, [{ invoiceId: id, amountCents: 6_000 }])).rejects.toThrow(/more than the payment/);
    await expect(pay(w, 20_000, [{ invoiceId: id, amountCents: 12_000 }])).rejects.toThrow(/more than invoice #1 still owes/);
    await expect(pay(w, 10_000, [{ invoiceId: id, amountCents: 5_000 }, { invoiceId: id, amountCents: 5_000 }])).rejects.toThrow(/only be listed once/);
    await expect(pay(w, 10_000, [{ invoiceId: theirs, amountCents: 10_000 }])).rejects.toThrow(/different clients/);
    await expect(pay(w, 0, [])).rejects.toThrow(/more than zero/);
    await expect(pay(w, 1.5, [])).rejects.toThrow(/more than zero/);
    await expect(pay(w, 100, [], { method: "Bitcoin" })).rejects.toThrow(/payment method/);
    expect(await inv(w, id)).toMatchObject({ paidCents: 0 });
    expect(await w.base.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(0);
  });

  it("applies a deposit paid before the invoice, once, and never more than is left", async () => {
    const w = await billingWorld();
    await pay(w, 25_000, []);
    const [dep] = await w.office.query(api.crm.payments.deposits, { clientId: w.clientId });
    const id = await sentInvoice(w, { lines: [line("A", 1, 100_000)] });
    await expect(w.office.mutation(api.crm.payments.applyDeposit, { paymentId: dep.id, invoiceId: id, amountCents: 30_000, now: NOW })).rejects.toThrow(/more than is left/);
    await w.office.mutation(api.crm.payments.applyDeposit, { paymentId: dep.id, invoiceId: id, amountCents: 25_000, now: NOW });
    expect(await inv(w, id)).toMatchObject({ paidCents: 25_000, balanceCents: 75_000 });
    expect(await w.office.query(api.crm.payments.deposits, { clientId: w.clientId })).toEqual([]);
  });

  it("applies a deposit while the invoice is made, and a deleted draft gives it back", async () => {
    const w = await billingWorld();
    await pay(w, 25_000, []);
    const [dep] = await w.office.query(api.crm.payments.deposits, { clientId: w.clientId });
    const id = await w.office.mutation(api.crm.invoices.create, { businessId: w.qft, clientId: w.clientId, now: NOW, ...body(), deposits: [{ paymentId: dep.id, amountCents: 25_000 }] });
    expect(await inv(w, id)).toMatchObject({ status: "Draft", paidCents: 25_000, balanceCents: 75_000 });
    await w.admin.mutation(api.crm.invoices.remove, { id });
    expect(await w.office.query(api.crm.payments.deposits, { clientId: w.clientId })).toHaveLength(1);
  });

  it("lists payments with their method filter, search and paging, and lists outstanding invoices soonest due first", async () => {
    const w = await billingWorld();
    const later = await sentInvoice(w, { termsKey: "net_30", lines: [line("A", 1, 10_000)] });
    const sooner = await sentInvoice(w, { termsKey: "net_7", lines: [line("B", 1, 20_000)] });
    await pay(w, 5_000, [{ invoiceId: later, amountCents: 5_000 }], { method: "Check", reference: "1042", paidAt: NOW - DAY });
    await pay(w, 20_000, [{ invoiceId: sooner, amountCents: 20_000 }], { method: "Venmo", paidAt: NOW });
    const q = { businessId: w.qft, method: "All", search: "", sortKey: "paidAt" as const, dir: "desc" as const, page: 0, size: 1 };
    const page = await w.office.query(api.crm.payments.list, q);
    expect(page).toMatchObject({ total: 2, size: 1 });
    expect(page.rows[0]).toMatchObject({ method: "Venmo", amountCents: 20_000, invoice: { number: 2 } });
    expect((await w.office.query(api.crm.payments.list, { ...q, method: "Check" })).rows.map((r) => r.reference)).toEqual(["1042"]);
    expect((await w.office.query(api.crm.payments.list, { ...q, search: "1042" })).total).toBe(1);
    const out = await w.office.query(api.crm.payments.outstanding, { clientId: w.clientId, now: NOW });
    expect(out?.invoices.map((i) => i.number)).toEqual([1]); // #2 is paid; #1 still owes $50
    expect(out).toMatchObject({ accountBalanceCents: 5_000 });
  });

  it("works out how long invoices take to be paid", async () => {
    const w = await billingWorld();
    const id = await sentInvoice(w, { termsKey: "net_7", lines: [line("A", 1, 10_000)] });
    await pay(w, 10_000, [{ invoiceId: id, amountCents: 10_000 }], { paidAt: NOW + 3 * DAY });
    expect(await w.office.query(api.crm.payments.stats, { businessId: w.qft, now: NOW + 4 * DAY })).toMatchObject({ averageDays: 3.8, paidOnTimePercent: 100 });
  });

  it("lets Office record payments, and Sales, Project Managers and other businesses only look", async () => {
    const w = await billingWorld();
    const id = await sentInvoice(w);
    const attempt = (who: typeof w.sales) =>
      who.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Cash", paidAt: NOW, reference: "", details: "", amountCents: 100, allocations: [{ invoiceId: id, amountCents: 100 }], now: NOW });
    await expect(attempt(w.sales)).rejects.toThrow(/not change/);
    await expect(attempt(w.pm)).rejects.toThrow(/not change/);
    await expect(attempt(w.outsider)).rejects.toThrow(/No access/);
    await attempt(w.admin);
    expect((await w.sales.query(api.crm.payments.list, { businessId: w.qft, method: "All", search: "", sortKey: "paidAt", dir: "desc", page: 0, size: 10 })).total).toBe(1);
    await expect(w.outsider.query(api.crm.payments.list, { businessId: w.qft, method: "All", search: "", sortKey: "paidAt", dir: "desc", page: 0, size: 10 })).rejects.toThrow(/No access/);
  });
});
