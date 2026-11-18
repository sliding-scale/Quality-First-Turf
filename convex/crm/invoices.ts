import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireAdmin, requireBusiness, type Staff, requireModule } from "./lib/access";
import {
  allocationsOfInvoice, applyAllocation, billingTotalOf, DAY_MS, DEFAULT_INVOICE_CONTRACT, DEFAULT_INVOICE_SUBJECT, financeAfterChange, invoiceSearchText, linesOf, logInvoiceEvent,
  MAX_LINES, nextInvoiceNumber, scheduleAmounts, settleInvoice, spreadDue, startOfDay,
} from "./lib/billing";
import { FINANCE_ENTRY } from "./lib/stages";
import {
  balanceOf, derivedStatus, dueDateFor, INVOICE_STATUS_FILTERS, invoiceTotals, matchesInvoiceFilter, PAYMENT_TERMS_KEYS, type InvoiceStatus,
} from "./lib/invoiceMath";

/** Invoices (PRD 5.2, design 2026-11-18-finance): the list and its cards, one invoice, building one (alone or from a project's payment schedule),
 *  sending, and the Admin's void, bad debt and delete. Payments are in payments.ts; both go through lib/billing.ts. */

const MAX_INVOICES = 2000;

const lineV = v.object({ name: v.string(), description: v.string(), quantity: v.number(), unitPriceCents: v.number(), serviceDate: v.optional(v.number()) });
const clientViewV = v.object({ quantities: v.boolean(), unitPrices: v.boolean(), lineTotals: v.boolean(), accountBalance: v.boolean(), lateStamp: v.boolean() });
const discountKindV = v.union(v.literal("amount"), v.literal("percent"));

const bodyArgs = {
  subject: v.string(),
  termsKey: v.string(),
  customDueAt: v.optional(v.number()),
  salesperson: v.string(),
  clientMessage: v.string(),
  contract: v.string(),
  discountKind: v.optional(discountKindV),
  discountValue: v.optional(v.number()),
  taxPercent: v.optional(v.number()),
  clientView: clientViewV,
  lines: v.array(lineV),
};

type Body = {
  subject: string; termsKey: string; customDueAt?: number; salesperson: string; clientMessage: string; contract: string;
  discountKind?: "amount" | "percent"; discountValue?: number; taxPercent?: number;
  clientView: Doc<"invoices">["clientView"];
  lines: { name: string; description: string; quantity: number; unitPriceCents: number; serviceDate?: number }[];
};

function checkBody(a: Body) {
  const subject = a.subject.trim();
  if (subject.length < 1 || subject.length > 200) throw new ConvexError("An invoice subject needs 1 to 200 characters.");
  if (!PAYMENT_TERMS_KEYS.includes(a.termsKey)) throw new ConvexError("Pick the payment terms from the list.");
  if (a.termsKey === "custom" && a.customDueAt === undefined) throw new ConvexError("Pick the due date.");
  if (a.lines.length < 1) throw new ConvexError("Add at least one line item.");
  if (a.lines.length > MAX_LINES) throw new ConvexError(`An invoice can have at most ${MAX_LINES} lines.`);
  for (const l of a.lines) {
    if (l.name.trim().length < 1 || l.name.length > 200) throw new ConvexError("Each line item needs a name of 1 to 200 characters.");
    if (l.description.length > 2000) throw new ConvexError("A line description can be at most 2,000 characters.");
    if (!Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 1_000_000) throw new ConvexError("A quantity must be more than zero.");
    if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0 || l.unitPriceCents > 100_000_000_00) throw new ConvexError("A unit price must be zero or more.");
  }
  if (a.clientMessage.length > 5000 || a.contract.length > 5000) throw new ConvexError("The message and the contract text can each be at most 5,000 characters.");
  if (a.discountKind === "percent" && !((a.discountValue ?? 0) >= 0 && (a.discountValue ?? 0) <= 100)) throw new ConvexError("A discount percent is 0 to 100.");
  if (a.discountKind === "amount" && !(Number.isInteger(a.discountValue ?? 0) && (a.discountValue ?? 0) >= 0)) throw new ConvexError("A discount amount must be zero or more.");
  if (a.taxPercent !== undefined && !(a.taxPercent >= 0 && a.taxPercent <= 100)) throw new ConvexError("Tax is 0 to 100 percent.");
  return subject;
}

async function writeLines(ctx: MutationCtx, invoiceId: Id<"invoices">, lines: Body["lines"], dues: number[] | null) {
  for (const [i, l] of lines.entries()) {
    await ctx.db.insert("invoiceLines", {
      invoiceId, position: i, name: l.name.trim(), description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents,
      ...(dues ? { dueCents: dues[i] } : {}), ...(l.serviceDate !== undefined ? { serviceDate: l.serviceDate } : {}),
    });
  }
}

const totalsOf = (lines: Body["lines"], dues: number[] | null, o: Pick<Body, "discountKind" | "discountValue" | "taxPercent">) =>
  invoiceTotals(lines.map((l, i) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, ...(dues ? { dueCents: dues[i] } : {}) })), o);

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

const by = (staff: Staff) => ({ name: staff.name, userId: staff.userId });

/* ---------------------------------- reading ---------------------------------- */

export const nextNumber = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "invoices", "view");
    return nextInvoiceNumber(ctx, a.businessId);
  },
});

type Row = {
  id: Id<"invoices">; number: number; clientId: Id<"clients">; clientName: string; subject: string; status: InvoiceStatus; dueAt: number | undefined;
  issuedAt: number | undefined; createdAt: number; totalCents: number; balanceCents: number; opportunityId: Id<"opportunities"> | undefined;
};

async function rowsFor(ctx: Parameters<typeof requireBusiness>[0], businessId: Id<"businesses">, search: string, now: number): Promise<Row[]> {
  const text = search.trim();
  const docs = text
    ? await ctx.db.query("invoices").withSearchIndex("search_text", (q) => q.search("searchText", text).eq("businessId", businessId)).take(MAX_INVOICES)
    : await ctx.db.query("invoices").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", businessId)).order("desc").take(MAX_INVOICES);
  const names = new Map<Id<"clients">, string>();
  const out: Row[] = [];
  for (const i of docs) {
    if (!names.has(i.clientId)) names.set(i.clientId, (await ctx.db.get(i.clientId))?.name ?? "");
    const balanceCents = balanceOf(i.totalCents, i.paidCents);
    out.push({
      id: i._id, number: i.number, clientId: i.clientId, clientName: names.get(i.clientId) ?? "", subject: i.subject, status: derivedStatus(i.status, i.dueAt, balanceCents, now),
      dueAt: i.dueAt, issuedAt: i.issuedAt, createdAt: i.createdAt, totalCents: i.totalCents, balanceCents: i.status === "Void" || i.status === "Bad debt" ? 0 : balanceCents, opportunityId: i.opportunityId,
    });
  }
  return out;
}

const sortKey = v.union(v.literal("client"), v.literal("number"), v.literal("dueAt"), v.literal("status"), v.literal("total"), v.literal("balance"));

export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.string(),
    search: v.string(),
    sortKey,
    dir: v.union(v.literal("asc"), v.literal("desc")),
    /** Created-date range. */
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    page: v.number(),
    size: v.number(),
    now: v.number(),
  },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "invoices", "view");
    if (!(INVOICE_STATUS_FILTERS as readonly string[]).includes(a.status)) throw new ConvexError("Pick a status from the list.");
    const size = Math.min(100, Math.max(1, Math.floor(a.size)));
    const all = (await rowsFor(ctx, a.businessId, a.search, a.now)).filter(
      (r) => matchesInvoiceFilter(r.status, a.status) && (a.from === undefined || r.createdAt >= a.from) && (a.to === undefined || r.createdAt <= a.to),
    );
    const sign = a.dir === "asc" ? 1 : -1;
    const rank: Record<InvoiceStatus, number> = { "Past due": 0, "Awaiting payment": 1, Draft: 2, Paid: 3, "Bad debt": 4, Void: 5 };
    const key = (r: Row): number | string =>
      a.sortKey === "client" ? r.clientName.toLowerCase() : a.sortKey === "number" ? r.number : a.sortKey === "dueAt" ? (r.dueAt ?? 0) : a.sortKey === "status" ? rank[r.status] : a.sortKey === "total" ? r.totalCents : r.balanceCents;
    all.sort((x, y) => {
      const kx = key(x), ky = key(y);
      return (kx < ky ? -1 : kx > ky ? 1 : 0) * sign || x.number - y.number;
    });
    const page = Math.max(0, Math.floor(a.page));
    return { rows: all.slice(page * size, page * size + size), total: all.length, page, size, capped: all.length >= MAX_INVOICES };
  },
});

/** The figures on the Invoices page's cards, and the count behind each Status filter. */
export const stats = query({
  args: { businessId: v.id("businesses"), now: v.number() },
  handler: async (ctx, a) => {
    await requireModule(ctx, a.businessId, "invoices", "view");
    const rows = await rowsFor(ctx, a.businessId, "", a.now);
    const sum = (f: (r: Row) => boolean) => {
      const m = rows.filter(f);
      return { count: m.length, cents: m.reduce((n, r) => n + r.balanceCents, 0) };
    };
    const pastDue = sum((r) => r.status === "Past due");
    const notDue = sum((r) => r.status === "Awaiting payment");
    const draft = { count: rows.filter((r) => r.status === "Draft").length, cents: rows.filter((r) => r.status === "Draft").reduce((n, r) => n + r.totalCents, 0) };
    const sentAt = (r: Row) => r.issuedAt ?? r.createdAt;
    const real = (r: Row) => r.status !== "Draft" && r.status !== "Void";
    const last30 = rows.filter((r) => real(r) && sentAt(r) > a.now - 30 * DAY_MS && sentAt(r) <= a.now);
    const prev30 = rows.filter((r) => real(r) && sentAt(r) > a.now - 60 * DAY_MS && sentAt(r) <= a.now - 30 * DAY_MS);
    const issuedCents = last30.reduce((n, r) => n + r.totalCents, 0);
    const filterCounts: Record<string, number> = {};
    for (const f of INVOICE_STATUS_FILTERS) filterCounts[f] = rows.filter((r) => matchesInvoiceFilter(r.status, f)).length;
    // "Jobs awaiting invoicing" (PRD): projects signed off but with no final invoice sent yet, so still at Send Final Invoice.
    const projects = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", a.businessId)).order("desc").take(MAX_INVOICES);
    const awaitingInvoicing = projects.filter((p) => p.pipeline === "Finance" && p.stage === FINANCE_ENTRY && p.archivedAt === undefined).length;
    return {
      awaitingInvoicing, pastDue, notDue, draft,
      issued: { count: last30.length, cents: issuedCents, previousCount: prev30.length },
      averageCents: last30.length === 0 ? 0 : Math.round(issuedCents / last30.length),
      previousAverageCents: prev30.length === 0 ? 0 : Math.round(prev30.reduce((n, r) => n + r.totalCents, 0) / prev30.length),
      filterCounts,
    };
  },
});

export const get = query({
  args: { id: v.id("invoices"), now: v.number() },
  handler: async (ctx, a) => {
    const inv = await ctx.db.get(a.id);
    if (inv === null) return null;
    const staff = await requireModule(ctx, inv.businessId, "invoices", "view");
    const client = await ctx.db.get(inv.clientId);
    const project = inv.opportunityId ? await ctx.db.get(inv.opportunityId) : null;
    const lines = await linesOf(ctx, inv._id);
    const dues = lines.every((l) => l.dueCents !== undefined) && lines.length > 0 ? lines.map((l) => l.dueCents as number) : null;
    const totals = totalsOf(lines, dues, inv);
    const allocations = await allocationsOfInvoice(ctx, inv._id);
    const payments = [];
    for (const al of allocations) {
      const p = await ctx.db.get(al.paymentId);
      if (p) payments.push({ id: p._id, paidAt: p.paidAt, method: p.method, reference: p.reference, amountCents: al.amountCents });
    }
    payments.sort((x, y) => x.paidAt - y.paidAt);
    const events = (await ctx.db.query("invoiceEvents").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).take(500)).sort((x, y) => x.at - y.at || x._creationTime - y._creationTime);
    let schedule = null;
    if (inv.scheduleItemId && project) {
      const total = await billingTotalOf(ctx, project);
      const { rows, amounts } = await scheduleAmounts(ctx, project._id, total);
      const out = [];
      for (const [i, r] of rows.entries()) {
        const other = r.invoiceId ? await ctx.db.get(r.invoiceId) : null;
        out.push({
          id: r._id, description: r.description, kind: r.kind, value: r.value, amountCents: amounts[i], thisInvoice: r._id === inv.scheduleItemId,
          invoice: other ? { id: other._id, number: other.number, status: derivedStatus(other.status, other.dueAt, balanceOf(other.totalCents, other.paidCents), a.now) } : null,
        });
      }
      schedule = { rows: out, totalCents: total, portionCents: amounts[rows.findIndex((r) => r._id === inv.scheduleItemId)] ?? 0 };
    }
    const balanceCents = inv.status === "Void" || inv.status === "Bad debt" ? 0 : balanceOf(inv.totalCents, inv.paidCents);
    const accountBalanceCents = await accountBalance(ctx, inv.clientId);
    return {
      invoice: {
        id: inv._id, businessId: inv.businessId, number: inv.number, subject: inv.subject, status: derivedStatus(inv.status, inv.dueAt, balanceOf(inv.totalCents, inv.paidCents), a.now), storedStatus: inv.status,
        issuedAt: inv.issuedAt, dueAt: inv.dueAt, termsKey: inv.termsKey, customDueAt: inv.customDueAt, createdAt: inv.createdAt, salesperson: inv.salesperson,
        clientMessage: inv.clientMessage, contract: inv.contract, discountKind: inv.discountKind, discountValue: inv.discountValue, taxPercent: inv.taxPercent, clientView: inv.clientView,
        ...totals, totalCents: inv.totalCents, paidCents: inv.paidCents, balanceCents, token: inv.shareToken ?? null, sentAt: inv.sentAt, viewedAt: inv.viewedAt,
        notes: inv.notes ?? [], scheduleItemId: inv.scheduleItemId,
      },
      client: client ? { id: client._id, name: client.name, email: client.email, phone: client.phone, street1: client.street1, street2: client.street2, city: client.city, state: client.state, zip: client.zip } : null,
      project: project ? { id: project._id, code: project.code, title: project.title, pipeline: project.pipeline, stage: project.stage } : null,
      lines: lines.map((l) => ({ id: l._id, position: l.position, name: l.name, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, dueCents: l.dueCents, serviceDate: l.serviceDate, totalCents: Math.round(l.quantity * l.unitPriceCents) })),
      payments, events, schedule, accountBalanceCents,
      canBill: staff.levels.invoices === "edit" || staff.levels.invoices === "full", isAdmin: staff.isAdmin,
    };
  },
});

/** What a client owes across all their sent invoices. */
async function accountBalance(ctx: Parameters<typeof requireBusiness>[0], clientId: Id<"clients">): Promise<number> {
  const all = await ctx.db.query("invoices").withIndex("by_clientId", (q) => q.eq("clientId", clientId)).take(MAX_INVOICES);
  return all.filter((i) => i.status === "Sent").reduce((n, i) => n + balanceOf(i.totalCents, i.paidCents), 0);
}

/* ---------------------------------- writing ---------------------------------- */

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    clientId: v.id("clients"),
    opportunityId: v.optional(v.id("opportunities")),
    scheduleItemId: v.optional(v.id("paymentScheduleItems")),
    ...bodyArgs,
    /** Deposits (payments with money left) to apply as the invoice is made. */
    deposits: v.optional(v.array(v.object({ paymentId: v.id("payments"), amountCents: v.number() }))),
    now: v.number(),
  },
  handler: async (ctx, a) => {
    const staff = await requireModule(ctx, a.businessId, "invoices", "edit");
    const subject = checkBody(a);
    const client = await ctx.db.get(a.clientId);
    if (client === null || client.businessId !== a.businessId) throw new ConvexError("That client is not in this business.");
    let project: Doc<"opportunities"> | null = null;
    if (a.opportunityId) {
      project = await ctx.db.get(a.opportunityId);
      if (project === null || project.businessId !== a.businessId || project.clientId !== a.clientId) throw new ConvexError("That project does not belong to this client.");
    }
    let dues: number[] | null = null;
    if (a.scheduleItemId) {
      if (project === null) throw new ConvexError("A payment-schedule invoice needs its project.");
      const row = await ctx.db.get(a.scheduleItemId);
      if (row === null || row.opportunityId !== project._id) throw new ConvexError("That payment is not on this project's schedule.");
      if (row.invoiceId !== undefined) throw new ConvexError("An invoice was already made for that payment.");
      const { rows, amounts } = await scheduleAmounts(ctx, project._id, await billingTotalOf(ctx, project));
      const rowCents = amounts[rows.findIndex((r) => r._id === row._id)] ?? 0;
      if (rowCents <= 0) throw new ConvexError("That payment is worth $0, so there is nothing to invoice.");
      dues = spreadDue(a.lines, rowCents);
    }
    const number = await nextInvoiceNumber(ctx, a.businessId);
    const totals = totalsOf(a.lines, dues, a);
    const id = await ctx.db.insert("invoices", {
      businessId: a.businessId, clientId: a.clientId, ...(a.opportunityId ? { opportunityId: a.opportunityId } : {}), number, subject, status: "Draft", createdAt: a.now,
      termsKey: a.termsKey, ...(a.customDueAt !== undefined ? { customDueAt: a.customDueAt } : {}), salesperson: a.salesperson.trim(), clientMessage: a.clientMessage, contract: a.contract,
      ...(a.discountKind ? { discountKind: a.discountKind, discountValue: a.discountValue ?? 0 } : {}), ...(a.taxPercent !== undefined ? { taxPercent: a.taxPercent } : {}),
      clientView: a.clientView, ...(a.scheduleItemId ? { scheduleItemId: a.scheduleItemId } : {}), totalCents: totals.totalCents, paidCents: 0,
      searchText: await invoiceSearchText(ctx, a.clientId, number, subject),
    });
    await writeLines(ctx, id, a.lines, dues);
    if (a.scheduleItemId) await ctx.db.patch(a.scheduleItemId, { invoiceId: id });
    await logInvoiceEvent(ctx, id, "created", staff.name, "Invoice created", a.now);
    for (const d of a.deposits ?? []) {
      const payment = await ctx.db.get(d.paymentId);
      if (payment === null) throw new ConvexError("That deposit no longer exists.");
      await applyAllocation(ctx, payment, id, d.amountCents, a.now);
      await logInvoiceEvent(ctx, id, "deposit", staff.name, `Deposit applied: $${(d.amountCents / 100).toFixed(2)}`, a.now);
    }
    return id;
  },
});

async function loadForBilling(ctx: MutationCtx, id: Id<"invoices">) {
  const inv = await ctx.db.get(id);
  if (inv === null) throw new ConvexError("That invoice no longer exists.");
  const staff = await requireModule(ctx, inv.businessId, "invoices", "edit");
  return { inv, staff };
}

export const update = mutation({
  args: { id: v.id("invoices"), ...bodyArgs, now: v.number() },
  handler: async (ctx, a) => {
    const { inv, staff } = await loadForBilling(ctx, a.id);
    if (inv.status === "Void" || inv.status === "Bad debt") throw new ConvexError("This invoice can no longer be edited. Ask an Admin to reopen it.");
    const subject = checkBody(a);
    let dues: number[] | null = null;
    if (inv.scheduleItemId && inv.opportunityId) {
      const project = await ctx.db.get(inv.opportunityId);
      if (project) {
        const { rows, amounts } = await scheduleAmounts(ctx, project._id, await billingTotalOf(ctx, project));
        const at = rows.findIndex((r) => r._id === inv.scheduleItemId);
        if (at >= 0) dues = spreadDue(a.lines, amounts[at]);
      }
    }
    const totals = totalsOf(a.lines, dues, a);
    if (totals.totalCents < inv.paidCents) throw new ConvexError("The total cannot be lower than the payments already received.");
    for (const old of await linesOf(ctx, inv._id)) await ctx.db.delete(old._id);
    await writeLines(ctx, inv._id, a.lines, dues);
    await ctx.db.patch(inv._id, {
      subject, termsKey: a.termsKey, customDueAt: a.termsKey === "custom" ? a.customDueAt : undefined, salesperson: a.salesperson.trim(), clientMessage: a.clientMessage, contract: a.contract,
      discountKind: a.discountKind, discountValue: a.discountKind ? (a.discountValue ?? 0) : undefined, taxPercent: a.taxPercent, clientView: a.clientView, totalCents: totals.totalCents,
      searchText: await invoiceSearchText(ctx, inv.clientId, inv.number, subject),
      ...(inv.issuedAt !== undefined ? { dueAt: dueDateFor(startOfDay(inv.issuedAt), a.termsKey, a.customDueAt) } : {}),
    });
    await logInvoiceEvent(ctx, inv._id, "edited", staff.name, "Invoice edited", a.now);
    await settleInvoice(ctx, inv._id);
    await financeAfterChange(ctx, inv.opportunityId, by(staff), a.now);
  },
});

/** Sending an invoice: a Draft becomes Sent, gets its issued and due dates and its secret link. Sending again only returns the link.
 *  `how` is for the activity: the email itself is sent from the screen with the existing Zoho sender. */
async function sendInvoice(ctx: MutationCtx, inv: Doc<"invoices">, staff: Staff, now: number, how: "sent" | "marked", today?: number) {
  if (inv.status === "Void" || inv.status === "Bad debt") throw new ConvexError("This invoice cannot be sent.");
  let token = inv.shareToken;
  if (inv.status === "Draft") {
    token = token ?? newToken();
    const issuedAt = today ?? startOfDay(now);
    await ctx.db.patch(inv._id, { status: "Sent", issuedAt, dueAt: dueDateFor(issuedAt, inv.termsKey, inv.customDueAt), sentAt: now, shareToken: token });
    await logInvoiceEvent(ctx, inv._id, how === "sent" ? "sent" : "marked_sent", staff.name, how === "sent" ? "Invoice sent" : "Marked as sent", now);
    await settleInvoice(ctx, inv._id);
    await financeAfterChange(ctx, inv.opportunityId, by(staff), now);
  } else if (token === undefined) {
    token = newToken();
    await ctx.db.patch(inv._id, { shareToken: token });
  }
  return { token: token as string };
}

/** `today` is the business's own date as UTC midnight (the screen knows the time zone); without it the date is the UTC day of `now`. */
export const send = mutation({
  args: { id: v.id("invoices"), now: v.number(), today: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const { inv, staff } = await loadForBilling(ctx, a.id);
    return sendInvoice(ctx, inv, staff, a.now, "sent", a.today);
  },
});

/** Jobber's "Mark as Sent": the client was given the invoice some other way. */
export const markSent = mutation({
  args: { id: v.id("invoices"), now: v.number(), today: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const { inv, staff } = await loadForBilling(ctx, a.id);
    if (inv.status !== "Draft") throw new ConvexError("This invoice was already sent.");
    return sendInvoice(ctx, inv, staff, a.now, "marked", a.today);
  },
});

/** Admin only. Void takes the invoice out of the books and gives its payments back as deposits; Bad debt writes off what is still owed; Reopen
 *  puts a voided or written-off invoice back to Sent (or Draft if it was never sent). */
export const setStatus = mutation({
  args: { id: v.id("invoices"), status: v.union(v.literal("Void"), v.literal("Bad debt"), v.literal("Reopen")), now: v.number() },
  handler: async (ctx, a) => {
    const inv = await ctx.db.get(a.id);
    if (inv === null) throw new ConvexError("That invoice no longer exists.");
    const staff = await requireAdmin(ctx);
    await requireModule(ctx, inv.businessId, "invoices", "view");
    if (a.status === "Reopen") {
      if (inv.status !== "Void" && inv.status !== "Bad debt") throw new ConvexError("Only a voided or written-off invoice can be reopened.");
      await ctx.db.patch(inv._id, { status: inv.issuedAt === undefined ? "Draft" : "Sent" });
      await logInvoiceEvent(ctx, inv._id, "reopened", staff.name, "Invoice reopened", a.now);
      if (inv.scheduleItemId) {
        const row = await ctx.db.get(inv.scheduleItemId);
        if (row && row.invoiceId === undefined) await ctx.db.patch(row._id, { invoiceId: inv._id });
      }
    } else if (a.status === "Void") {
      if (inv.status === "Void") throw new ConvexError("This invoice is already voided.");
      for (const al of await allocationsOfInvoice(ctx, inv._id)) await ctx.db.delete(al._id);
      await ctx.db.patch(inv._id, { status: "Void", paidCents: 0 });
      await logInvoiceEvent(ctx, inv._id, "void", staff.name, "Invoice voided", a.now);
      if (inv.scheduleItemId) {
        const row = await ctx.db.get(inv.scheduleItemId);
        if (row && row.invoiceId === inv._id) await ctx.db.patch(row._id, { invoiceId: undefined });
      }
    } else {
      if (inv.status !== "Sent") throw new ConvexError("Only an invoice that was sent and is still owed can be written off.");
      await ctx.db.patch(inv._id, { status: "Bad debt" });
      await logInvoiceEvent(ctx, inv._id, "bad_debt", staff.name, "Marked as bad debt", a.now);
    }
    await settleInvoice(ctx, inv._id);
    await financeAfterChange(ctx, inv.opportunityId, by(staff), a.now);
  },
});

/** Admin only, and only a Draft: removes it and gives any deposit applied to it back. A payment-schedule row becomes available again. */
export const remove = mutation({
  args: { id: v.id("invoices") },
  handler: async (ctx, a) => {
    const inv = await ctx.db.get(a.id);
    if (inv === null) return;
    await requireAdmin(ctx);
    await requireModule(ctx, inv.businessId, "invoices", "view");
    if (inv.status !== "Draft") throw new ConvexError("Only a draft can be deleted. Void a sent invoice instead.");
    for (const l of await linesOf(ctx, inv._id)) await ctx.db.delete(l._id);
    for (const al of await allocationsOfInvoice(ctx, inv._id)) await ctx.db.delete(al._id);
    for (const e of await ctx.db.query("invoiceEvents").withIndex("by_invoiceId", (q) => q.eq("invoiceId", inv._id)).take(500)) await ctx.db.delete(e._id);
    if (inv.scheduleItemId) {
      const row = await ctx.db.get(inv.scheduleItemId);
      if (row && row.invoiceId === inv._id) await ctx.db.patch(row._id, { invoiceId: undefined });
    }
    await ctx.db.delete(inv._id);
  },
});

export const addNote = mutation({
  args: { id: v.id("invoices"), text: v.string(), now: v.number() },
  handler: async (ctx, a) => {
    const { inv, staff } = await loadForBilling(ctx, a.id);
    const text = a.text.trim();
    if (text.length < 1 || text.length > 2000) throw new ConvexError("A note needs 1 to 2,000 characters.");
    const notes = [...(inv.notes ?? []), { text, byName: staff.name, at: a.now }];
    if (notes.length > 100) throw new ConvexError("An invoice can have at most 100 notes.");
    await ctx.db.patch(inv._id, { notes });
  },
});

/** The values a New Invoice form starts with: the business's defaults. */
export const defaults = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, a) => {
    const staff = await requireModule(ctx, a.businessId, "invoices", "view");
    const s = await ctx.db.query("invoiceSettings").withIndex("by_business", (q) => q.eq("businessId", a.businessId)).first();
    return {
      subject: DEFAULT_INVOICE_SUBJECT, termsKey: s?.defaultTermsKey ?? "due_on_receipt", clientMessage: s?.defaultClientMessage ?? "", contract: s?.defaultContract ?? DEFAULT_INVOICE_CONTRACT,
      salesperson: staff.name, number: await nextInvoiceNumber(ctx, a.businessId),
    };
  },
});
