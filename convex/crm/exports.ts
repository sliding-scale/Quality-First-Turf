import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { requireModule } from "./lib/access";
import { dollars, isoDay, type Cell } from "./lib/exportCsv";
import type { Module } from "./lib/permissions";

/** The data export (plan 2026-11-20-export): a page of a business's clients, projects, quotes, invoices or payments as ready-to-write rows with names
 *  instead of ids. The Settings > Export data page asks page after page and builds the CSV in the browser. Each kind needs the view level of its own
 *  module, and a person limited to records assigned to them cannot take the whole business's data out. Prices of the catalogue are not exported here. */

export const KINDS = ["clients", "projects", "quotes", "invoices", "payments"] as const;
export type Kind = (typeof KINDS)[number];
const MODULE: Record<Kind, Module> = { clients: "clients", projects: "requests", quotes: "quotes", invoices: "invoices", payments: "payments" };
const PAGE = 300;

const HEADERS: Record<Kind, string[]> = {
  clients: ["Client", "Type", "Status", "Company", "Contact", "First name", "Last name", "Phone", "Email", "Street 1", "Street 2", "City", "State", "ZIP", "Tags", "Balance", "Lifetime value", "Created", "Notes"],
  projects: ["Code", "Title", "Client", "Pipeline", "Stage", "Outcome", "Job number", "Job closed", "Owner", "Lead source", "Requested", "Closed", "Lost reason", "Request lines total"],
  quotes: ["Number", "Title", "Client", "Project", "Status", "Salesperson", "Total", "Deposit percent", "Created", "Sent", "Approved", "Rejected reason"],
  invoices: ["Number", "Subject", "Client", "Project", "Status", "Salesperson", "Created", "Issued", "Due", "Total", "Paid", "Balance"],
  payments: ["Date", "Client", "Project", "Method", "Amount", "Reference", "Source", "Recorded by", "Details"],
};

async function lookups(ctx: QueryCtx, clientIds: Id<"clients">[], projectIds: (Id<"opportunities"> | undefined)[], businessId: Id<"businesses">) {
  const clients = new Map<string, string>();
  for (const id of new Set(clientIds)) {
    const c = await ctx.db.get(id);
    if (c !== null && c.businessId === businessId) clients.set(id, c.name);
  }
  const projects = new Map<string, string>();
  for (const id of new Set(projectIds.filter((x): x is Id<"opportunities"> => x !== undefined))) {
    const p = await ctx.db.get(id);
    if (p !== null && p.businessId === businessId) projects.set(id, p.code);
  }
  return { client: (id: Id<"clients">) => clients.get(id) ?? "", project: (id: Id<"opportunities"> | undefined) => (id ? projects.get(id) ?? "" : "") };
}

const OUTCOME = { won: "Won", lost: "Lost" } as const;
const sumLines = (p: Doc<"opportunities">) => (p.lines ?? []).reduce((s, l) => s + Math.round(l.quantity * l.unitPriceCents), 0);

export const page = query({
  args: { businessId: v.id("businesses"), kind: v.union(v.literal("clients"), v.literal("projects"), v.literal("quotes"), v.literal("invoices"), v.literal("payments")), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const staff = await requireModule(ctx, args.businessId, MODULE[args.kind], "view");
    if (staff.assignedOnly) throw new ConvexError("Your role is limited to the records assigned to you, so it cannot export everything.");
    const opts = { numItems: PAGE, cursor: args.cursor };
    const b = args.businessId;
    let rows: Cell[][] = [];
    let next: string | null = null;

    if (args.kind === "clients") {
      const r = await ctx.db.query("clients").withIndex("by_business_and_nameKey", (q) => q.eq("businessId", b)).paginate(opts);
      rows = r.page.map((c) => [c.name, c.type === "homeowner" ? "Homeowner" : "Contractor", c.status, c.company, c.contactName, c.firstName, c.lastName, c.phone, c.email, c.street1, c.street2, c.city, c.state, c.zip, (c.tags ?? []).join("; "), dollars(c.balanceCents), dollars(c.lifetimeValueCents), isoDay(c.createdAt), c.notes]);
      next = r.isDone ? null : r.continueCursor;
    } else if (args.kind === "projects") {
      const r = await ctx.db.query("opportunities").withIndex("by_business_and_requestedAt", (q) => q.eq("businessId", b)).paginate(opts);
      const l = await lookups(ctx, r.page.map((p) => p.clientId), [], b);
      rows = r.page.map((p) => [p.code, p.title, l.client(p.clientId), p.pipeline, p.stage, p.outcome ? OUTCOME[p.outcome] : "Open", p.jobNumber, isoDay(p.jobClosedAt), p.owner, p.leadSource, isoDay(p.requestedAt), isoDay(p.closedAt), p.lostReason, dollars(sumLines(p))]);
      next = r.isDone ? null : r.continueCursor;
    } else if (args.kind === "quotes") {
      const r = await ctx.db.query("quotes").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", b)).paginate(opts);
      const l = await lookups(ctx, r.page.map((q) => q.clientId), r.page.map((q) => q.opportunityId), b);
      rows = r.page.map((q) => [q.number, q.title, l.client(q.clientId), l.project(q.opportunityId), q.status, q.salesperson, dollars(q.totalCents), q.depositPercent, isoDay(q.createdAt), isoDay(q.sentAt), isoDay(q.approvedAt), q.rejectedReason]);
      next = r.isDone ? null : r.continueCursor;
    } else if (args.kind === "invoices") {
      const r = await ctx.db.query("invoices").withIndex("by_business_and_createdAt", (q) => q.eq("businessId", b)).paginate(opts);
      const l = await lookups(ctx, r.page.map((i) => i.clientId), r.page.map((i) => i.opportunityId), b);
      rows = r.page.map((i) => [i.number, i.subject, l.client(i.clientId), l.project(i.opportunityId), i.status, i.salesperson, isoDay(i.createdAt), isoDay(i.issuedAt), isoDay(i.dueAt), dollars(i.totalCents), dollars(i.paidCents), dollars(i.totalCents - i.paidCents)]);
      next = r.isDone ? null : r.continueCursor;
    } else {
      const r = await ctx.db.query("payments").withIndex("by_business_and_paidAt", (q) => q.eq("businessId", b)).paginate(opts);
      const l = await lookups(ctx, r.page.map((p) => p.clientId), r.page.map((p) => p.opportunityId), b);
      rows = r.page.map((p) => [isoDay(p.paidAt), l.client(p.clientId), l.project(p.opportunityId), p.method, dollars(p.amountCents), p.reference, p.source === "manual" ? "Recorded by hand" : "Quote deposit", p.byName, p.details]);
      next = r.isDone ? null : r.continueCursor;
    }
    // A missing value is null: Convex cannot return undefined.
    return { headers: HEADERS[args.kind], rows: rows.map((r) => r.map((c) => c ?? null)), next };
  },
});

/** Which kinds this person may export, for the page. */
export const allowed = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const out: Kind[] = [];
    for (const k of KINDS) {
      try {
        const staff = await requireModule(ctx, args.businessId, MODULE[k], "view");
        if (!staff.assignedOnly) out.push(k);
      } catch {
        // No access to that module: it is simply not offered.
      }
    }
    return out;
  },
});
