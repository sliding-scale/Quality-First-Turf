/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { billingWorld, body, line } from "./billingSeed";
import { NOW } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

const DAY = 86_400_000;
describe("Creating, editing and sending invoices (PRD 5.2)", () => {
  it("numbers invoices per business, starts as a Draft, and keeps the total as a labelled copy", async () => {
    const w = await billingWorld();
    const a = await w.make();
    const b = await w.make({ lines: [line("Edging", 2, 25_000)], discountKind: "percent", discountValue: 10, taxPercent: 10 });
    const one = await w.office.query(api.crm.invoices.get, { id: a, now: NOW });
    const two = await w.office.query(api.crm.invoices.get, { id: b, now: NOW });
    expect(one?.invoice).toMatchObject({ number: 1, status: "Draft", totalCents: 100_000, balanceCents: 100_000 });
    // 2 x $250 = $500, 10% off = $450, 10% tax = $495.
    expect(two?.invoice).toMatchObject({ number: 2, subtotalCents: 50_000, discountCents: 5_000, taxCents: 4_500, totalCents: 49_500 });
    expect(await w.office.query(api.crm.invoices.nextNumber, { businessId: w.qft })).toBe(3);
  });

  it("refuses an invoice with no lines, bad terms, a custom date left empty, or a client from another business", async () => {
    const w = await billingWorld();
    await expect(w.make({ lines: [] })).rejects.toThrow(/at least one line/);
    await expect(w.make({ termsKey: "net_99" })).rejects.toThrow(/payment terms/);
    await expect(w.make({ termsKey: "custom" })).rejects.toThrow(/due date/);
    await expect(w.make({ subject: "  " })).rejects.toThrow(/subject/);
    await expect(w.make({ lines: [line("Turf", 0)] })).rejects.toThrow(/more than zero/);
    await expect(w.office.mutation(api.crm.invoices.create, { businessId: w.other, clientId: w.clientId, now: NOW, ...body() })).rejects.toThrow(/No access/);
  });

  it("lets Admin and Office handle invoices; Sales, Project Managers and other businesses can look but not change", async () => {
    const w = await billingWorld();
    const id = await w.make();
    await expect(w.make({}, w.sales)).rejects.toThrow(/view invoices and payments but not change/);
    await expect(w.make({}, w.pm)).rejects.toThrow(/view invoices/);
    await expect(w.make({}, w.outsider)).rejects.toThrow(/No access/);
    expect((await w.sales.query(api.crm.invoices.get, { id, now: NOW }))?.canBill).toBe(false);
    await expect(w.outsider.query(api.crm.invoices.get, { id, now: NOW })).rejects.toThrow(/No access/);
    await expect(w.sales.mutation(api.crm.invoices.send, { id, now: NOW })).rejects.toThrow(/not change/);
    await w.admin.mutation(api.crm.invoices.send, { id, now: NOW });
  });

  it("sending sets the issued and due dates and the secret link; sending again keeps the link; Mark as Sent works once", async () => {
    const w = await billingWorld();
    const id = await w.make();
    const sent = await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    expect(sent.token.length).toBeGreaterThan(32);
    const day = Math.floor(NOW / DAY) * DAY;
    expect((await w.office.query(api.crm.invoices.get, { id, now: NOW }))?.invoice).toMatchObject({ storedStatus: "Sent", status: "Awaiting payment", issuedAt: day, dueAt: day + 30 * DAY });
    expect((await w.office.mutation(api.crm.invoices.send, { id, now: NOW + 5 })).token).toBe(sent.token);
    await expect(w.office.mutation(api.crm.invoices.markSent, { id, now: NOW })).rejects.toThrow(/already sent/);
    const other = await w.make();
    await w.office.mutation(api.crm.invoices.markSent, { id: other, now: NOW });
    const events = (await w.office.query(api.crm.invoices.get, { id: other, now: NOW }))!.events.map((e) => e.kind);
    expect(events).toEqual(["created", "marked_sent"]);
  });

  it("shows Past due once the due day has ended", async () => {
    const w = await billingWorld();
    const id = await w.make({ termsKey: "net_7" });
    await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    expect((await w.office.query(api.crm.invoices.get, { id, now: NOW + 7 * DAY }))?.invoice.status).toBe("Awaiting payment");
    expect((await w.office.query(api.crm.invoices.get, { id, now: NOW + 9 * DAY }))?.invoice.status).toBe("Past due");
  });

  it("will not edit the total below what was already paid", async () => {
    const w = await billingWorld();
    const id = await w.make();
    await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    await w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Cash", paidAt: NOW, reference: "", details: "", amountCents: 60_000, allocations: [{ invoiceId: id, amountCents: 60_000 }], now: NOW });
    await expect(w.office.mutation(api.crm.invoices.update, { id, ...body({ lines: [line("Turf", 1, 50_000)] }), now: NOW + 1 })).rejects.toThrow(/lower than the payments/);
    await w.office.mutation(api.crm.invoices.update, { id, ...body({ subject: "Edited", lines: [line("Turf", 1, 80_000)] }), now: NOW + 1 });
    expect((await w.office.query(api.crm.invoices.get, { id, now: NOW }))?.invoice).toMatchObject({ subject: "Edited", totalCents: 80_000, balanceCents: 20_000, storedStatus: "Sent" });
  });

  it("lets only an Admin void, write off, reopen or delete; a void gives its payments back as deposits", async () => {
    const w = await billingWorld();
    const id = await w.make();
    await w.office.mutation(api.crm.invoices.send, { id, now: NOW });
    await w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Check", paidAt: NOW, reference: "1042", details: "", amountCents: 40_000, allocations: [{ invoiceId: id, amountCents: 40_000 }], now: NOW });
    await expect(w.office.mutation(api.crm.invoices.setStatus, { id, status: "Void", now: NOW })).rejects.toThrow(/Only an Admin/);
    await expect(w.office.mutation(api.crm.invoices.remove, { id })).rejects.toThrow(/Only an Admin/);
    await expect(w.admin.mutation(api.crm.invoices.remove, { id })).rejects.toThrow(/Only a draft/);

    await w.admin.mutation(api.crm.invoices.setStatus, { id, status: "Void", now: NOW + 1 });
    expect((await w.office.query(api.crm.invoices.get, { id, now: NOW }))?.invoice).toMatchObject({ status: "Void", paidCents: 0, balanceCents: 0 });
    const left = await w.office.query(api.crm.payments.deposits, { clientId: w.clientId });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ amountCents: 40_000, unappliedCents: 40_000 });
    await expect(w.office.mutation(api.crm.invoices.update, { id, ...body(), now: NOW })).rejects.toThrow(/Ask an Admin to reopen/);

    await w.admin.mutation(api.crm.invoices.setStatus, { id, status: "Reopen", now: NOW + 2 });
    await w.admin.mutation(api.crm.invoices.setStatus, { id, status: "Bad debt", now: NOW + 3 });
    expect((await w.office.query(api.crm.invoices.get, { id, now: NOW }))?.invoice).toMatchObject({ status: "Bad debt", balanceCents: 0 });
  });

  it("deletes a draft, with its lines, and refuses to pay a draft", async () => {
    const w = await billingWorld();
    const id = await w.make();
    await expect(w.office.mutation(api.crm.payments.create, { clientId: w.clientId, method: "Cash", paidAt: NOW, reference: "", details: "", amountCents: 100, allocations: [{ invoiceId: id, amountCents: 100 }], now: NOW })).rejects.toThrow(/Send invoice #1 before/);
    await w.admin.mutation(api.crm.invoices.remove, { id });
    expect(await w.office.query(api.crm.invoices.get, { id, now: NOW })).toBeNull();
    expect(await w.base.run((ctx) => ctx.db.query("invoiceLines").collect())).toHaveLength(0);
  });

  it("lists with a status filter, search, sorting and paging, and counts the cards", async () => {
    const w = await billingWorld();
    const a = await w.make({ subject: "Front lawn" });
    const b = await w.make({ subject: "Back patio", lines: [line("Pavers", 1, 250_000)] });
    await w.make({ subject: "Draft only" });
    await w.office.mutation(api.crm.invoices.send, { id: a, now: NOW });
    await w.office.mutation(api.crm.invoices.send, { id: b, now: NOW });
    const q = { businessId: w.qft, status: "All", search: "", sortKey: "number" as const, dir: "asc" as const, page: 0, size: 2, now: NOW + 40 * DAY };
    const first = await w.office.query(api.crm.invoices.list, q);
    expect(first).toMatchObject({ total: 3, page: 0, size: 2 });
    expect(first.rows.map((r) => r.number)).toEqual([1, 2]);
    expect((await w.office.query(api.crm.invoices.list, { ...q, page: 1 })).rows.map((r) => r.number)).toEqual([3]);
    expect((await w.office.query(api.crm.invoices.list, { ...q, status: "Awaiting payment: past due" })).rows.map((r) => r.status)).toEqual(["Past due", "Past due"]);
    expect((await w.office.query(api.crm.invoices.list, { ...q, status: "Draft" })).total).toBe(1);
    expect((await w.office.query(api.crm.invoices.list, { ...q, search: "patio" })).rows.map((r) => r.number)).toEqual([2]);
    expect((await w.office.query(api.crm.invoices.list, { ...q, sortKey: "total", dir: "desc" })).rows[0].number).toBe(2);
    const stats = await w.office.query(api.crm.invoices.stats, { businessId: w.qft, now: NOW + 40 * DAY });
    expect(stats).toMatchObject({ pastDue: { count: 2, cents: 350_000 }, draft: { count: 1, cents: 100_000 }, notDue: { count: 0 } });
    expect(stats.filterCounts["Awaiting payment: all"]).toBe(2);
    await expect(w.office.query(api.crm.invoices.list, { ...q, status: "Nonsense" })).rejects.toThrow(/status from the list/);
  });
});

describe("A project's payment schedule (Jobber's Billing section)", () => {
  async function scheduled(rows: { description: string; kind: "percent" | "amount"; value: number }[], mode: "schedule" | "remind" = "schedule") {
    const w = await billingWorld();
    await signedQuote(w); // $1,000.00
    await w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode, rows });
    const view = () => w.office.query(api.crm.billing.get, { opportunityId: w.project, now: NOW });
    return { ...w, view };
  }
  const fromRow = (w: Awaited<ReturnType<typeof scheduled>>, scheduleItemId: Id<"paymentScheduleItems">) =>
    w.office.mutation(api.crm.invoices.create, { businessId: w.qft, clientId: w.clientId, opportunityId: w.project, scheduleItemId, now: NOW, ...body({ subject: "Test - 1 of 2" }) });

  it("uses the approved quote's total, shows each row's amount and what is left", async () => {
    const w = await scheduled([{ description: "Test", kind: "percent", value: 30 }, { description: "Test", kind: "percent", value: 70 }]);
    const v = await w.view();
    expect(v).toMatchObject({ plan: { mode: "schedule", totalCents: 100_000 }, billingTotalCents: 100_000, quoteTotalCents: 100_000 });
    expect(v?.rows.map((r) => r.amountCents)).toEqual([30_000, 70_000]);
    expect(v?.summary).toMatchObject({ paidCents: 0, awaitingCents: 0, draftCents: 0, remainingCents: 100_000 });
  });

  it("makes an invoice from a row for just that share, and a row can be used once", async () => {
    const w = await scheduled([{ description: "Deposit", kind: "percent", value: 30 }, { description: "Final", kind: "percent", value: 70 }]);
    const [first] = (await w.view())!.rows;
    const id = await fromRow(w, first.id);
    const got = await w.office.query(api.crm.invoices.get, { id, now: NOW });
    expect(got?.invoice).toMatchObject({ subtotalCents: 30_000, totalCents: 30_000 });
    expect(got?.lines[0]).toMatchObject({ totalCents: 100_000, dueCents: 30_000 });
    expect(got?.schedule).toMatchObject({ totalCents: 100_000, portionCents: 30_000 });
    expect(got?.schedule?.rows.map((r) => r.thisInvoice)).toEqual([true, false]);
    await expect(fromRow(w, first.id)).rejects.toThrow(/already made/);
    expect((await w.view())!.rows[0].invoice).toMatchObject({ number: 1, totalCents: 30_000 });
  });

  it("frees the row again when its draft is deleted or its invoice is voided", async () => {
    const w = await scheduled([{ description: "A", kind: "percent", value: 50 }, { description: "B", kind: "percent", value: 50 }]);
    const [first, second] = (await w.view())!.rows;
    const draft = await fromRow(w, first.id);
    await w.admin.mutation(api.crm.invoices.remove, { id: draft });
    expect((await w.view())!.rows[0].invoice).toBeNull();
    const again = await fromRow(w, second.id);
    await w.office.mutation(api.crm.invoices.send, { id: again, now: NOW });
    await w.admin.mutation(api.crm.invoices.setStatus, { id: again, status: "Void", now: NOW });
    expect((await w.view())!.rows[1].invoice).toBeNull();
  });

  it("makes three equal rows add up to the total to the cent", async () => {
    const w = await scheduled([{ description: "1", kind: "percent", value: 33.33 }, { description: "2", kind: "percent", value: 33.33 }, { description: "3", kind: "percent", value: 33.34 }]);
    const amounts = (await w.view())!.rows.map((r) => r.amountCents);
    expect(amounts).toEqual([33_330, 33_330, 33_340]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it("refuses a schedule that adds up to more than the total, or that edits a row that already has an invoice", async () => {
    const w = await scheduled([{ description: "A", kind: "percent", value: 40 }, { description: "B", kind: "percent", value: 60 }]);
    await expect(w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "schedule", rows: [{ description: "A", kind: "percent", value: 60 }, { description: "B", kind: "percent", value: 60 }] })).rejects.toThrow(/more than the project total/);
    await expect(w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "schedule", rows: [{ description: "A", kind: "amount", value: 90_000 }, { description: "B", kind: "amount", value: 20_000 }] })).rejects.toThrow(/more than the project total/);
    const [first, second] = (await w.view())!.rows;
    await fromRow(w, first.id);
    await expect(w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "schedule", rows: [{ id: first.id, description: "A", kind: "percent", value: 50 }, { id: second.id, description: "B", kind: "percent", value: 50 }] })).rejects.toThrow(/already has an invoice/);
    await expect(w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "schedule", rows: [{ id: second.id, description: "B", kind: "percent", value: 60 }] })).rejects.toThrow(/cannot be removed/);
    await expect(w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "remind", rows: [] })).rejects.toThrow(/cannot be switched off/);
    // A description can change on an invoiced row; its amount cannot.
    await w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "schedule", rows: [{ id: first.id, description: "Renamed", kind: "percent", value: 40 }, { id: second.id, description: "B", kind: "percent", value: 60 }] });
    expect((await w.view())!.rows[0].description).toBe("Renamed");
  });

  it("needs a total: a project with no quote must be given one, then can be scheduled", async () => {
    const w = await billingWorld();
    await expect(w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "schedule", rows: [{ description: "All", kind: "percent", value: 100 }] })).rejects.toThrow(/needs a project total/);
    await w.office.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "schedule", totalCents: 50_000, rows: [{ description: "All", kind: "percent", value: 100 }] });
    expect((await w.office.query(api.crm.billing.get, { opportunityId: w.project, now: NOW }))?.rows[0].amountCents).toBe(50_000);
    // Sales can look at it, not change it.
    await expect(w.sales.mutation(api.crm.billing.save, { opportunityId: w.project, mode: "remind", rows: [] })).rejects.toThrow(/not change/);
    expect((await w.sales.query(api.crm.billing.get, { opportunityId: w.project, now: NOW }))?.canBill).toBe(false);
  });
});
